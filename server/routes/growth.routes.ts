/**
 * Growth tools: drip sequences, short links (+ public /l/:code redirect), abandoned-cart reminders.
 */
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { dripEnrollments, dripSequences, shortLinks, storeSettings, templates } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import { enroll, enrollContacts, sequenceStats } from "../services/growth/drip.service";
import { createLink, linkStats, listLinks, recordClick } from "../services/growth/links.service";
import { DEFAULT_CART_TEXT, abandonedCartsList, getGrowth, saveCartRecovery } from "../services/growth/cart-recovery.service";
import { appOrigin } from "../services/reseller/common";

const originOf = async (req: Request) => (await appOrigin()) || `${req.protocol}://${req.get("host")}`;

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e?.status) return res.status(e.status).json({ error: e.message });
    if (e instanceof TypeError && /Invalid URL/.test(e.message)) return res.status(400).json({ error: "Enter a valid link" });
    console.error("[Growth]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
function ch(req: Request, res: Response): string | null {
  const id = String(req.query.channelId || req.body?.channelId || "");
  if (!id) { res.status(400).json({ error: "channelId is required" }); return null; }
  if (!verifyChannelOwnership(req, id)) { res.status(403).json({ error: "WhatsApp number not accessible" }); return null; }
  return id;
}

const stepSchema = z.object({
  delayMinutes: z.coerce.number().int().min(0).max(60 * 24 * 90),
  kind: z.enum(["text", "template"]),
  text: z.string().trim().max(4000).optional(),
  templateName: z.string().trim().max(512).optional(),
  language: z.string().trim().max(16).optional(),
  params: z.array(z.string().max(500)).max(20).optional(),
}).refine((s) => (s.kind === "text" ? !!s.text : !!s.templateName), { message: "Each step needs a message or a template" });

const seqSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  isActive: z.boolean().optional(),
  trigger: z.enum(["manual", "keyword", "flow_submit", "new_contact"]),
  triggerValue: z.string().trim().max(500).optional().nullable(),
  stopOnReply: z.boolean().optional(),
  steps: z.array(stepSchema).min(1, "Add at least one message").max(20),
}).refine((s) => s.trigger !== "keyword" || !!s.triggerValue?.trim(), { message: "Add at least one keyword" });

export function registerGrowthRoutes(app: Express) {
  const auth = [requireAuth, resolveTenantChannels];

  // ── public short-link redirect ──
  app.get("/l/:code", async (req, res) => {
    try {
      const to = await recordClick(String(req.params.code), {
        ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip,
        ua: req.get("user-agent") || "", referer: req.get("referer") || "", ref: req.query.r as string | undefined,
      });
      if (!to) return res.status(404).send("Link not found");
      res.set("Cache-Control", "no-store");
      res.redirect(302, to);
    } catch (e) {
      console.error("[ShortLink]", e);
      res.status(500).send("Something went wrong");
    }
  });

  // ── drip sequences ──
  app.get("/api/growth/drips", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const rows = await db.select().from(dripSequences).where(eq(dripSequences.channelId, id)).orderBy(desc(dripSequences.createdAt));
    const stats = await sequenceStats(rows.map((r) => r.id));
    res.json({ data: rows.map((r) => ({ ...r, stats: stats[r.id] || {} })) });
  }));

  app.post("/api/growth/drips", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = seqSchema.parse(req.body);
    const [row] = await db.insert(dripSequences).values({
      channelId: id, ownerId: owner(req), name: b.name, isActive: b.isActive ?? true, trigger: b.trigger,
      triggerValue: b.triggerValue || null, stopOnReply: b.stopOnReply ?? true, steps: b.steps as any,
    }).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/growth/drips/:id", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = seqSchema.parse(req.body);
    const [row] = await db.update(dripSequences).set({
      name: b.name, isActive: b.isActive ?? true, trigger: b.trigger, triggerValue: b.triggerValue || null,
      stopOnReply: b.stopOnReply ?? true, steps: b.steps as any, updatedAt: new Date(),
    }).where(and(eq(dripSequences.id, req.params.id), eq(dripSequences.channelId, id))).returning();
    if (!row) return res.status(404).json({ error: "Sequence not found" });
    res.json({ data: row });
  }));

  app.patch("/api/growth/drips/:id/active", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [row] = await db.update(dripSequences).set({ isActive: !!req.body?.isActive, updatedAt: new Date() })
      .where(and(eq(dripSequences.id, req.params.id), eq(dripSequences.channelId, id))).returning();
    if (!row) return res.status(404).json({ error: "Sequence not found" });
    res.json({ data: row });
  }));

  app.delete("/api/growth/drips/:id", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    await db.delete(dripSequences).where(and(eq(dripSequences.id, req.params.id), eq(dripSequences.channelId, id)));
    res.json({ success: true });
  }));

  app.post("/api/growth/drips/:id/enroll", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [seq] = await db.select().from(dripSequences).where(and(eq(dripSequences.id, req.params.id), eq(dripSequences.channelId, id))).limit(1);
    if (!seq) return res.status(404).json({ error: "Sequence not found" });
    if (!seq.isActive) return res.status(400).json({ error: "Turn the sequence on first" });
    const b = z.object({ contactIds: z.array(z.string()).max(5000).optional(), phones: z.array(z.string().max(20)).max(1000).optional() }).parse(req.body);
    const a = await enrollContacts(seq, b.contactIds || []);
    const p = b.phones?.length ? await enroll(seq, b.phones.map((phone) => ({ phone })), "manual") : { added: 0, skipped: 0 };
    res.json({ added: a.added + p.added, skipped: a.skipped + p.skipped });
  }));

  app.get("/api/growth/drips/:id/enrollments", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const rows = await db.select().from(dripEnrollments)
      .where(and(eq(dripEnrollments.sequenceId, req.params.id), eq(dripEnrollments.channelId, id)))
      .orderBy(desc(dripEnrollments.createdAt)).limit(300);
    res.json({ data: rows });
  }));

  app.post("/api/growth/enrollments/:id/stop", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [row] = await db.update(dripEnrollments).set({ status: "stopped", stopReason: "Stopped by team", updatedAt: new Date() })
      .where(and(eq(dripEnrollments.id, req.params.id), eq(dripEnrollments.channelId, id), eq(dripEnrollments.status, "active"))).returning();
    res.json({ data: row || null });
  }));

  // approved templates for step pickers
  app.get("/api/growth/templates", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const rows = await db.select({ name: templates.name, language: templates.language, body: templates.body, status: templates.status, category: templates.category })
      .from(templates).where(eq(templates.channelId, id));
    res.json({ data: rows.filter((t) => String(t.status).toLowerCase() === "approved") });
  }));

  // ── short links ──
  app.get("/api/growth/links", requireAuth, wrap(async (req, res) => {
    const base = await originOf(req);
    const rows = await listLinks(owner(req));
    res.json({ base: `${base}/l/`, data: rows });
  }));

  app.post("/api/growth/links", requireAuth, wrap(async (req, res) => {
    const b = z.object({ url: z.string().trim().min(3).max(2000), title: z.string().trim().max(120).optional().nullable(), code: z.string().trim().max(24).optional().nullable() }).parse(req.body);
    const row = await createLink(owner(req), b);
    res.status(201).json({ data: row, shortUrl: `${await originOf(req)}/l/${row.code}` });
  }));

  app.patch("/api/growth/links/:id", requireAuth, wrap(async (req, res) => {
    const b = z.object({ isActive: z.boolean().optional(), title: z.string().trim().max(120).optional().nullable() }).parse(req.body);
    const [row] = await db.update(shortLinks).set(b as any).where(and(eq(shortLinks.id, req.params.id), eq(shortLinks.ownerId, owner(req)))).returning();
    if (!row) return res.status(404).json({ error: "Link not found" });
    res.json({ data: row });
  }));

  app.delete("/api/growth/links/:id", requireAuth, wrap(async (req, res) => {
    await db.delete(shortLinks).where(and(eq(shortLinks.id, req.params.id), eq(shortLinks.ownerId, owner(req))));
    res.json({ success: true });
  }));

  app.get("/api/growth/links/:id/stats", requireAuth, wrap(async (req, res) => {
    const s = await linkStats(owner(req), req.params.id);
    if (!s) return res.status(404).json({ error: "Link not found" });
    res.json(s);
  }));

  // ── abandoned cart ──
  app.get("/api/growth/cart-recovery", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const g = await getGrowth(id);
    const [store] = await db.select({ enabled: storeSettings.enabled }).from(storeSettings).where(eq(storeSettings.channelId, id)).limit(1);
    const carts = await abandonedCartsList(id);
    res.json({
      config: { enabled: false, delayMinutes: 60, text: DEFAULT_CART_TEXT, templateName: "", language: "en_US", ...(g?.cartRecovery || {}) },
      stats: { remindersSent: g?.cartRemindersSent || 0, recovered: g?.cartRecovered || 0 },
      storeEnabled: !!store?.enabled,
      carts: carts.map((c) => ({ phone: c.phone, items: Array.isArray(c.items) ? (c.items as any[]).length : 0, state: c.state, updatedAt: c.updatedAt, reminderSentAt: (c as any).reminderSentAt })),
    });
  }));

  app.put("/api/growth/cart-recovery", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = z.object({
      enabled: z.boolean(),
      delayMinutes: z.coerce.number().int().min(15).max(10080),
      text: z.string().trim().max(1000).optional(),
      templateName: z.string().trim().max(512).optional().nullable(),
      language: z.string().trim().max(16).optional().nullable(),
    }).parse(req.body);
    const row = await saveCartRecovery(id, owner(req), { ...b, templateName: b.templateName || "", language: b.language || "en_US" });
    res.json({ data: row });
  }));
}


