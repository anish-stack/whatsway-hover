/**
 * Landing page builder (platform website): drag-and-drop section pages for industries
 * (Healthcare, E-commerce…) and Google/Meta ad campaigns, lead capture, and "website editor"
 * team accounts that only the superadmin can create.
 *
 * Pages live in cms_pages with editor = 'builder', so they share slugs, sitemap and the
 * public catch-all route with normal CMS pages.
 */
import type { Express, NextFunction, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import sharp from "sharp";
import bcrypt from "bcryptjs";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cmsPages, landingLeads, users } from "@shared/schema";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware";
import { RESERVED, clean } from "./cms.routes";
import { clearCmsSeoCache } from "../cms-seo";
import { LANDING_CATEGORIES, TEMPLATES, normaliseBlocks, normaliseSettings, safeUrl } from "@shared/landing";
import { FULL_TEMPLATES, type FullTemplate } from "@shared/landing-seeds";
import { appOrigin, emailLayout, escapeHtml, notifyUsers, sendEmailTo } from "../services/reseller/common";
import { getStorageTarget, safeStorageKey } from "../config/storageConfig";

const WEBSITE_PERM = "website:edit";
const me = (req: Request) => (req.session as any)?.user as { id: string; role: string; createdBy?: string; permissions?: Record<string, boolean> };

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e?.status) return res.status(e.status).json({ error: e.message });
    if (e?.code === "23505" || e?.cause?.code === "23505") return res.status(409).json({ error: "That address is already used by another page" });
    console.error("[Landing]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
const httpErr = (status: number, message: string) => Object.assign(new Error(message), { status });

// superadmin ids, cached for a minute (used to check who created a website editor)
let saCache: { at: number; ids: Set<string> } | null = null;
async function superadminIds(): Promise<Set<string>> {
  if (saCache && Date.now() - saCache.at < 60_000) return saCache.ids;
  const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "superadmin"));
  saCache = { at: Date.now(), ids: new Set(rows.map((r) => r.id)) };
  return saCache.ids;
}

/** Superadmin, or a team member created by a superadmin with the website permission. Tenant admins never pass. */
export async function canEditWebsite(u: ReturnType<typeof me> | undefined): Promise<boolean> {
  if (!u) return false;
  if (u.role === "superadmin") return true;
  if (u.role !== "team" || !u.createdBy) return false;
  const p = u.permissions || {};
  if (!p[WEBSITE_PERM] && !(p as any)["website.edit"]) return false;
  return (await superadminIds()).has(u.createdBy);
}
const requireWebsiteEditor = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await canEditWebsite(me(req)))) return res.status(403).json({ error: "You don't have access to the website builder" });
    next();
  } catch (e) { next(e); }
};
const guard = [requireAuth, requireWebsiteEditor] as const;

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const slug = z.string().trim().toLowerCase().min(2, "Page address is too short").max(80)
  .regex(slugRe, "Page address can use small letters, numbers and dashes only")
  .refine((s) => !RESERVED.has(s), "That address is used by the app — choose another");
const category = z.string().max(40).refine((c) => !c || (LANDING_CATEGORIES as readonly string[]).includes(c), "Unknown category").nullable().optional();

const createSchema = z.object({
  title: z.string().trim().min(2, "Add a page name").max(200),
  slug,
  category,
  template: z.string().max(40).default("blank"),
});
const saveSchema = z.object({
  title: z.string().trim().min(2, "Add a page name").max(200),
  slug,
  category,
  status: z.enum(["draft", "published"]),
  blocks: z.array(z.any()).max(40, "A page can have up to 40 sections"),
  settings: z.record(z.any()).default({}),
  metaTitle: z.string().max(120).nullable().optional(),
  metaDescription: z.string().max(320).nullable().optional(),
  metaKeywords: z.string().max(400).nullable().optional(),
  ogImage: z.string().max(500).nullable().optional(),
  noindex: z.boolean().default(false),
  canonicalUrl: z.string().max(500).nullable().optional(),
  schemaJson: z.string().max(20000).nullable().optional()
    .refine((v) => { if (!v || !v.trim()) return true; try { const j = JSON.parse(v); return !!j && typeof j === "object"; } catch { return false; } }, "Custom schema must be valid JSON-LD"),
});

const LIST_COLS = {
  id: cmsPages.id, title: cmsPages.title, slug: cmsPages.slug, status: cmsPages.status, category: cmsPages.category,
  views: cmsPages.views, leads: cmsPages.leads, updatedAt: cmsPages.updatedAt, createdAt: cmsPages.createdAt,
  updatedBy: cmsPages.updatedBy, settings: cmsPages.settings, ogImage: cmsPages.ogImage,
};

async function loadPage(id: string) {
  const [row] = await db.select().from(cmsPages).where(and(eq(cmsPages.id, id), eq(cmsPages.editor, "builder"))).limit(1);
  if (!row) throw httpErr(404, "Page not found");
  return row;
}
async function assertSlugFree(s: string, exceptId?: string) {
  const [dup] = await db.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, s)).limit(1);
  if (dup && dup.id !== exceptId) throw httpErr(409, "That address is already used by another page");
}

// ───────────── image uploads ─────────────
const uploader = multer({
  storage: multer.diskStorage({
    destination: (_r, _f, cb) => { const dir = path.join("uploads", "landing"); fs.mkdirSync(dir, { recursive: true }); cb(null, dir); },
    filename: (_r, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname).toLowerCase().slice(0, 6) || ".bin"}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_r, f, cb) => cb(null, /^image\/(jpeg|png|webp|gif|svg\+xml)$/i.test(f.mimetype)),
});
async function storeImage(file: Express.Multer.File): Promise<string> {
  let out = file.path;
  let mime = file.mimetype;
  if (/svg/i.test(file.mimetype)) {
    // SVG can carry scripts — rasterise it instead of serving it as-is
    out = file.path.replace(/\.[^./\\]+$/, "") + "-r.png";
    await sharp(file.path).png().toFile(out);
    mime = "image/png";
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
  } else if (!/gif/i.test(file.mimetype)) {
    out = file.path.replace(/\.[^./\\]+$/, "") + "-o.webp";
    await sharp(file.path, { failOn: "none" }).rotate().resize({ width: 1920, withoutEnlargement: true }).webp({ quality: 84 }).toFile(out);
    mime = "image/webp";
    try { fs.unlinkSync(file.path); } catch { /* ignore */ }
  }
  const target = await getStorageTarget().catch(() => null);
  if (target) {
    try {
      const url = await target.upload(fs.readFileSync(out), safeStorageKey("uploads/landing", path.basename(out)), mime);
      if (url) { try { fs.unlinkSync(out); } catch { /* ignore */ } return url; }
    } catch (e) { console.warn("[Landing] cloud upload failed, keeping local file:", (e as Error).message); }
  }
  return "/" + out.split(path.sep).join("/");
}

// ───────────── public lead rate limit ─────────────
const hits = new Map<string, number[]>();
function limited(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return arr.length > max;
}

const leadSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  phone: z.string().trim().transform((v) => v.replace(/[^\d+]/g, "")).pipe(z.string().regex(/^\+?\d{8,15}$/, "Enter a valid phone number")),
  email: z.string().trim().max(160).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email").optional(),
  company: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  service: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
  utm: z.record(z.string().max(300)).optional(),
  website: z.string().optional(), // honeypot
});
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "wbraid", "gbraid"];

function csvCell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Creates the complete E-commerce and Doctors pages once per install (deleting them later won't bring them back). */
export async function seedLandingPages() {
  try {
    await db.execute(sql`CREATE TABLE IF NOT EXISTS landing_seed_log (key VARCHAR(40) PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
    const r: any = await db.execute(sql`INSERT INTO landing_seed_log (key) VALUES ('full-pages-v1') ON CONFLICT DO NOTHING RETURNING key`);
    const rows = r?.rows ?? r;
    if (!rows?.length) return;
    for (const t of FULL_TEMPLATES as FullTemplate[]) {
      const [dup] = await db.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, t.seo.slug)).limit(1);
      if (dup) continue;
      await db.insert(cmsPages).values({
        title: t.seo.title, slug: t.seo.slug, pageType: "page", status: "published", content: "", template: "full", showTitle: false,
        editor: "builder", blocks: normaliseBlocks(t.blocks(), clean) as any, category: t.category, settings: normaliseSettings(t.settings || {}) as any,
        metaTitle: t.seo.metaTitle, metaDescription: t.seo.metaDescription, metaKeywords: t.seo.metaKeywords || null, ogImage: t.seo.ogImage || null, noindex: false,
      } as any);
      console.log(`[Landing] created sample page /${t.seo.slug}`);
    }
  } catch (e) { console.warn("[Landing] sample pages not created:", (e as Error).message); }
}

export function registerLandingRoutes(app: Express) {
  seedLandingPages();
  // ───────────── Public ─────────────
  // Cards for the "industry pages grid" section
  app.get("/api/landing/index", wrap(async (req, res) => {
    const cat = String(req.query.category || "");
    const conds = [eq(cmsPages.editor, "builder"), eq(cmsPages.status, "published"), eq(cmsPages.noindex, false)];
    if (cat) conds.push(eq(cmsPages.category, cat));
    const rows = await db.select({ title: cmsPages.title, slug: cmsPages.slug, category: cmsPages.category, metaDescription: cmsPages.metaDescription, ogImage: cmsPages.ogImage })
      .from(cmsPages).where(and(...conds)).orderBy(cmsPages.category, cmsPages.title).limit(60);
    res.set("Cache-Control", "public, max-age=60");
    res.json({ data: rows.filter((r) => r.category && r.category !== "Ads campaign") });
  }));

  app.post("/api/landing/:slug/view", wrap(async (req, res) => {
    const ip = req.ip || "x";
    if (limited(`v:${ip}:${req.params.slug}`, 1, 30 * 60_000)) return res.json({ ok: true }); // one view per visitor per 30 min
    await db.update(cmsPages).set({ views: sql`${cmsPages.views} + 1` })
      .where(and(eq(cmsPages.slug, String(req.params.slug).toLowerCase()), eq(cmsPages.editor, "builder"), eq(cmsPages.status, "published")));
    res.json({ ok: true });
  }));

  app.post("/api/landing/:slug/lead", wrap(async (req, res) => {
    const ip = req.ip || "x";
    if (limited(`l:${ip}`, 5, 10 * 60_000)) return res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
    const b = leadSchema.parse(req.body);
    const [page] = await db.select().from(cmsPages)
      .where(and(eq(cmsPages.slug, String(req.params.slug).toLowerCase()), eq(cmsPages.editor, "builder"), eq(cmsPages.status, "published"))).limit(1);
    if (!page) return res.status(404).json({ error: "Page not found" });
    if (b.website) return res.json({ ok: true }); // bot filled the hidden field
    const utm: Record<string, string> = {};
    for (const k of UTM_KEYS) if (b.utm?.[k]) utm[k] = String(b.utm[k]).slice(0, 300);
    if (b.utm?.referrer) utm.referrer = String(b.utm.referrer).slice(0, 300);
    const [lead] = await db.insert(landingLeads).values({
      pageId: page.id, slug: page.slug, name: b.name, phone: b.phone, email: b.email || null, company: b.company || null,
      city: b.city || null, service: b.service || null, message: b.message || null, utm: Object.keys(utm).length ? utm : null, ip: ip.slice(0, 64),
    }).returning();
    await db.update(cmsPages).set({ leads: sql`${cmsPages.leads} + 1` }).where(eq(cmsPages.id, page.id));

    // notify the platform team (in-app + email); never block the visitor on this
    (async () => {
      const origin = await appOrigin().catch(() => "");
      const rows: Array<[string, string | null | undefined]> = [["Name", b.name], ["Phone", b.phone], ["Email", b.email], ["Company", b.company], ["City", b.city], ["Service", b.service], ["Message", b.message], ["Source", utm.utm_source ? `${utm.utm_source} / ${utm.utm_campaign || "-"}` : utm.gclid ? "Google Ads" : ""]];
      const html = `<p>New enquiry from <b>${escapeHtml(page.title)}</b> (/${escapeHtml(page.slug)}).</p><table style="border-collapse:collapse">${rows.filter((r) => r[1]).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${k}</td><td style="padding:4px 0">${escapeHtml(v)}</td></tr>`).join("")}</table>`;
      const mail = emailLayout("New website lead", html, origin ? { label: "Open leads", url: `${origin}/admin/landing-pages?tab=leads` } : undefined);
      const editors = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.status, "active"), or(eq(users.role, "superadmin"), and(eq(users.role, "team"), sql`${WEBSITE_PERM} = ANY(${users.permissions})`, inArray(users.createdBy, [...(await superadminIds())].concat("__none__"))))));
      await notifyUsers(editors.map((e) => e.id), { title: "New website lead", message: `${b.name} (${b.phone}) on ${page.title}`, type: "landing_lead", email: { subject: `New lead: ${b.name} — ${page.title}`, html: mail } });
      const extra = normaliseSettings(page.settings).notifyEmails;
      if (extra) for (const to of extra.split(",")) await sendEmailTo(to, `New lead: ${b.name} — ${page.title}`, mail).catch(() => {});
    })().catch((e) => console.warn("[Landing] lead notify failed:", e?.message));

    res.status(201).json({ ok: true, id: lead.id });
  }));

  // ───────────── Builder: pages ─────────────
  app.get("/api/admin/landing/me", ...guard, wrap(async (req, res) => {
    res.json({ data: { canManageEditors: me(req).role === "superadmin" } });
  }));

  app.get("/api/admin/landing/templates", ...guard, wrap(async (_req, res) => {
    const full = FULL_TEMPLATES.map((t) => ({ key: t.key, name: t.name, category: t.category, description: t.description, sections: t.blocks().length, title: t.seo.title, slug: t.seo.slug, complete: true }));
    const basic = TEMPLATES.map((t) => ({ key: t.key, name: t.name, category: t.category, description: t.description, sections: t.blocks().length }));
    res.json({ data: [basic[0], ...full, ...basic.slice(1)] });
  }));

  app.get("/api/admin/landing/pages", ...guard, wrap(async (req, res) => {
    const conds = [eq(cmsPages.editor, "builder")];
    if (req.query.category) conds.push(eq(cmsPages.category, String(req.query.category)));
    if (req.query.status === "draft" || req.query.status === "published") conds.push(eq(cmsPages.status, String(req.query.status)));
    if (req.query.q) conds.push(or(ilike(cmsPages.title, `%${String(req.query.q).slice(0, 80)}%`), ilike(cmsPages.slug, `%${String(req.query.q).slice(0, 80)}%`))!);
    const rows = await db.select(LIST_COLS).from(cmsPages).where(and(...conds)).orderBy(desc(cmsPages.updatedAt));
    const ids = [...new Set(rows.map((r) => r.updatedBy).filter(Boolean))] as string[];
    const names = ids.length ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, username: users.username }).from(users).where(inArray(users.id, ids)) : [];
    const nm = new Map(names.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username]));
    res.json({ data: rows.map((r) => ({ ...r, hideChrome: !!(r.settings as any)?.hideChrome, settings: undefined, updatedByName: r.updatedBy ? nm.get(r.updatedBy) || null : null })) });
  }));

  app.get("/api/admin/landing/pages/:id", ...guard, wrap(async (req, res) => {
    res.json({ data: await loadPage(req.params.id) });
  }));

  app.post("/api/admin/landing/pages", ...guard, wrap(async (req, res) => {
    const b = createSchema.parse(req.body);
    await assertSlugFree(b.slug);
    const full = FULL_TEMPLATES.find((t) => t.key === b.template);
    const tpl = full || TEMPLATES.find((t) => t.key === b.template) || TEMPLATES[0];
    const [row] = await db.insert(cmsPages).values({
      title: b.title, slug: b.slug, pageType: "page", status: "draft", content: "", template: "full", showTitle: false,
      editor: "builder", blocks: tpl.blocks() as any, category: b.category || (tpl.category !== "Other" ? tpl.category : null),
      settings: { ...(tpl.settings || {}) } as any, noindex: tpl.key === "ads-lead",
      metaTitle: (full?.seo.metaTitle || b.title).slice(0, 120), metaDescription: full?.seo.metaDescription || null,
      metaKeywords: full?.seo.metaKeywords || null, ogImage: full?.seo.ogImage || null,
      createdBy: me(req).id, updatedBy: me(req).id,
    } as any).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/admin/landing/pages/:id", ...guard, wrap(async (req, res) => {
    const b = saveSchema.parse(req.body);
    await loadPage(req.params.id);
    await assertSlugFree(b.slug, req.params.id);
    const blocks = normaliseBlocks(b.blocks, clean);
    if (b.status === "published" && !blocks.filter((x) => !x.hidden).length) throw httpErr(400, "Add at least one visible section before publishing");
    const [row] = await db.update(cmsPages).set({
      title: b.title, slug: b.slug, category: b.category || null, status: b.status, blocks: blocks as any,
      settings: normaliseSettings(b.settings) as any, metaTitle: b.metaTitle || null, metaDescription: b.metaDescription || null,
      metaKeywords: b.metaKeywords || null, ogImage: safeUrl(b.ogImage) || null, noindex: b.noindex,
      canonicalUrl: /^https?:\/\//.test(b.canonicalUrl || "") ? b.canonicalUrl : null, schemaJson: b.schemaJson?.trim() || null,
      updatedBy: me(req).id, updatedAt: new Date(),
    } as any).where(eq(cmsPages.id, req.params.id)).returning();
    clearCmsSeoCache();
    res.json({ data: row });
  }));

  app.post("/api/admin/landing/pages/:id/duplicate", ...guard, wrap(async (req, res) => {
    const src = await loadPage(req.params.id);
    let s = `${src.slug}-copy`.slice(0, 76);
    for (let i = 2; i < 50; i++) {
      const [d] = await db.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, s)).limit(1);
      if (!d) break;
      s = `${src.slug.slice(0, 70)}-copy-${i}`;
    }
    const { id: _id, createdAt: _c, updatedAt: _u, views: _v, leads: _l, ...rest } = src as any;
    const [row] = await db.insert(cmsPages).values({ ...rest, title: `${src.title} (copy)`.slice(0, 200), slug: s, status: "draft", createdBy: me(req).id, updatedBy: me(req).id }).returning();
    res.status(201).json({ data: row });
  }));

  app.delete("/api/admin/landing/pages/:id", ...guard, wrap(async (req, res) => {
    await loadPage(req.params.id);
    await db.delete(cmsPages).where(eq(cmsPages.id, req.params.id));
    clearCmsSeoCache();
    res.json({ success: true });
  }));

  app.post("/api/admin/landing/upload", ...guard, uploader.single("file"), wrap(async (req, res) => {
    const f = (req as any).file as Express.Multer.File | undefined;
    if (!f) return res.status(400).json({ error: "Choose a JPG, PNG, WebP, GIF or SVG image (max 15 MB)" });
    try { res.json({ data: { url: await storeImage(f) } }); }
    catch { try { fs.unlinkSync(f.path); } catch { /* ignore */ } throw httpErr(400, "That image could not be read"); }
  }));

  // ───────────── Builder: leads ─────────────
  const leadConds = (req: Request) => {
    const c: any[] = [];
    if (req.query.pageId) c.push(eq(landingLeads.pageId, String(req.query.pageId)));
    if (req.query.status) c.push(eq(landingLeads.status, String(req.query.status)));
    if (req.query.q) { const q = `%${String(req.query.q).slice(0, 80)}%`; c.push(or(ilike(landingLeads.name, q), ilike(landingLeads.phone, q), ilike(landingLeads.email, q), ilike(landingLeads.company, q))); }
    return c.length ? and(...c) : sql`true`;
  };
  app.get("/api/admin/landing/leads", ...guard, wrap(async (req, res) => {
    const rows = await db.select({ lead: landingLeads, pageTitle: cmsPages.title }).from(landingLeads)
      .leftJoin(cmsPages, eq(cmsPages.id, landingLeads.pageId)).where(leadConds(req)).orderBy(desc(landingLeads.createdAt)).limit(500);
    res.json({ data: rows.map((r) => ({ ...r.lead, ip: undefined, pageTitle: r.pageTitle })) });
  }));
  app.get("/api/admin/landing/leads.csv", ...guard, wrap(async (req, res) => {
    const rows = await db.select({ lead: landingLeads, pageTitle: cmsPages.title }).from(landingLeads)
      .leftJoin(cmsPages, eq(cmsPages.id, landingLeads.pageId)).where(leadConds(req)).orderBy(desc(landingLeads.createdAt)).limit(20000);
    const head = ["Date", "Page", "Name", "Phone", "Email", "Company", "City", "Service", "Message", "Status", "utm_source", "utm_medium", "utm_campaign", "utm_term", "gclid"];
    const lines = [head.join(",")].concat(rows.map(({ lead: l, pageTitle }) => {
      const u = (l.utm || {}) as Record<string, string>;
      return [new Date(l.createdAt).toISOString(), pageTitle || l.slug, l.name, l.phone, l.email, l.company, l.city, l.service, l.message, l.status, u.utm_source, u.utm_medium, u.utm_campaign, u.utm_term, u.gclid].map(csvCell).join(",");
    }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="website-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send("﻿" + lines.join("\n"));
  }));
  app.patch("/api/admin/landing/leads/:id", ...guard, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(["new", "contacted", "won", "lost"]) }).parse(req.body);
    const [row] = await db.update(landingLeads).set({ status }).where(eq(landingLeads.id, req.params.id)).returning();
    if (!row) throw httpErr(404, "Lead not found");
    res.json({ data: row });
  }));
  app.delete("/api/admin/landing/leads/:id", ...guard, wrap(async (req, res) => {
    await db.delete(landingLeads).where(eq(landingLeads.id, req.params.id));
    res.json({ success: true });
  }));

  // ───────────── Website editors (superadmin only) ─────────────
  const sa = [requireAuth, requireSuperadmin] as const;
  const editorCols = { id: users.id, username: users.username, email: users.email, firstName: users.firstName, lastName: users.lastName, status: users.status, lastLogin: users.lastLogin, createdAt: users.createdAt };
  const editorWhere = async () => and(eq(users.role, "team"), sql`${WEBSITE_PERM} = ANY(${users.permissions})`, inArray(users.createdBy, [...(await superadminIds())].concat("__none__")));

  app.get("/api/admin/landing/editors", ...sa, wrap(async (_req, res) => {
    res.json({ data: await db.select(editorCols).from(users).where(await editorWhere()).orderBy(desc(users.createdAt)) });
  }));
  app.post("/api/admin/landing/editors", ...sa, wrap(async (req, res) => {
    const b = z.object({
      firstName: z.string().trim().min(1, "Enter a first name").max(60),
      lastName: z.string().trim().max(60).optional(),
      email: z.string().trim().toLowerCase().email("Enter a valid email"),
      username: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,40}$/, "Username: 3–40 letters, numbers, dot, dash"),
      password: z.string().min(8, "Password needs at least 8 characters").max(100).regex(/[A-Za-z]/, "Password needs a letter").regex(/\d/, "Password needs a number"),
    }).parse(req.body);
    const [exists] = await db.select({ id: users.id }).from(users).where(or(eq(users.email, b.email), eq(users.username, b.username))).limit(1);
    if (exists) throw httpErr(409, "That email or username is already taken");
    const [row] = await db.insert(users).values({
      username: b.username, email: b.email, firstName: b.firstName, lastName: b.lastName || null, password: await bcrypt.hash(b.password, 10),
      role: "team", permissions: [WEBSITE_PERM], status: "active", isEmailVerified: true, createdBy: me(req).id,
    } as any).returning(editorCols);
    res.status(201).json({ data: row });
  }));
  app.patch("/api/admin/landing/editors/:id", ...sa, wrap(async (req, res) => {
    const b = z.object({ status: z.enum(["active", "inactive"]).optional(), password: z.string().min(8).max(100).regex(/[A-Za-z]/).regex(/\d/, "Password needs a letter and a number").optional() }).parse(req.body);
    const set: any = { updatedAt: new Date() };
    if (b.status) set.status = b.status;
    if (b.password) set.password = await bcrypt.hash(b.password, 10);
    const [row] = await db.update(users).set(set).where(and(eq(users.id, req.params.id), await editorWhere())).returning(editorCols);
    if (!row) throw httpErr(404, "Editor not found");
    res.json({ data: row });
  }));
  app.delete("/api/admin/landing/editors/:id", ...sa, wrap(async (req, res) => {
    const where = and(eq(users.id, req.params.id), await editorWhere());
    try {
      const [row] = await db.delete(users).where(where).returning({ id: users.id });
      if (!row) throw httpErr(404, "Editor not found");
      res.json({ success: true });
    } catch (e: any) {
      if (e?.code !== "23503" && e?.cause?.code !== "23503") throw e;
      // has history rows → deactivate instead of deleting
      await db.update(users).set({ status: "inactive", updatedAt: new Date() } as any).where(where);
      res.json({ success: true, deactivated: true });
    }
  }));
}
