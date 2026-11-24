/** Website CMS: dynamic pages (about/contact/careers/policies/SEO pages) + header/footer navigation. */
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import sanitizeHtml from "sanitize-html";
import { db } from "../db";
import { cmsPages, cmsNavItems, cmsSiteItems } from "@shared/schema";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware";

// Slugs that belong to the app itself. A CMS page can never take these.
const RESERVED = new Set([
  "api", "login", "signup", "dashboard", "settings", "account", "admin", "inbox", "contacts", "campaigns", "templates",
  "template-library", "users", "plans", "team", "analytics", "widget-chat", "widget-builder", "demo", "pay", "accept-invite",
  "verify-email", "demo-requests", "channels-management", "payment-success", "sitemap.xml", "robots.txt", "assets", "uploads",
  "websites", "store", "billing", "reseller", "resellers", "partner", "gateway", "languages", "automation", "workflows",
  "chatbot-builder", "bot-builder", "ai-assistant", "auto-responses", "waba-connection", "multi-number", "webhooks",
  "qr-codes", "crm-systems", "notifications", "user-notifications", "chat-hub", "master-subscriptions", "app-update",
  "appointments", "whatsapp-flows", "app-integrations", "green-tick", "team", "logs", "cms",
]);

export const NAV_LOCATIONS = [
  "header_main", "header_about", "header_resources",
  "footer_product", "footer_company", "footer_resources", "footer_legal", "footer_bottom",
] as const;

const clean = (html: string) =>
  sanitizeHtml(html || "", {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img", "h1", "h2", "figure", "figcaption", "iframe", "u", "s", "span", "hr", "table", "thead", "tbody", "tr", "th", "td", "video", "source",
    ]),
    allowedAttributes: {
      "*": ["style", "class", "id", "align"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allowfullscreen", "frameborder"],
      video: ["src", "controls", "width", "height", "poster"],
      source: ["src", "type"],
      td: ["colspan", "rowspan"], th: ["colspan", "rowspan"],
    },
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb/i], "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb/i],
        "text-align": [/^(left|right|center|justify)$/], "font-size": [/^\d+(px|em|rem|%)$/], "font-weight": [/^\w+$/],
        "text-decoration": [/^[\w\s-]+$/], width: [/^\d+(px|%)$/], height: [/^\d+(px|%)$/],
      },
    },
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com", "www.google.com"],
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    transformTags: {
      a: (tag, attribs) => (attribs.target === "_blank" ? { tagName: tag, attribs: { ...attribs, rel: "noopener noreferrer" } } : { tagName: tag, attribs }),
    },
  });

// Editable content groups (kind decides which fields the website reads)
export const CONTENT_GROUPS: Record<string, "stat" | "faq" | "testimonial"> = {
  hero: "stat",
  testimonials_grid: "stat",
  cta: "stat",
  about_mission: "stat",
  testimonials: "testimonial",
  pricing: "faq",
  contact: "faq",
};

const itemSchema = z.object({
  kind: z.enum(["stat", "faq", "testimonial"]),
  groupKey: z.string().trim().max(32),
  title: z.string().trim().min(1).max(300),
  body: z.string().trim().max(4000).optional().nullable(),
  value: z.string().trim().max(40).optional().nullable(),
  suffix: z.string().trim().max(12).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
  company: z.string().trim().max(120).optional().nullable(),
  image: z.string().trim().max(500).optional().nullable(),
  rating: z.number().int().min(1).max(5).default(5),
  results: z.string().trim().max(200).optional().nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isVisible: z.boolean().default(true),
}).refine((v) => CONTENT_GROUPS[v.groupKey] === v.kind, { message: "Invalid group for this content type" });

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().toLowerCase().min(1).max(120).regex(slugRe, "Slug: lowercase letters, numbers, hyphens only (no slashes)"),
  pageType: z.enum(["page", "policy", "seo"]).default("page"),
  status: z.enum(["draft", "published"]).default("draft"),
  content: z.string().max(500_000).default(""),
  excerpt: z.string().max(500).optional().nullable(),
  template: z.enum(["default", "full", "legal"]).default("default"),
  showTitle: z.boolean().default(true),
  metaTitle: z.string().trim().max(120).optional().nullable(),
  metaDescription: z.string().trim().max(320).optional().nullable(),
  metaKeywords: z.string().trim().max(400).optional().nullable(),
  ogImage: z.string().trim().max(500).optional().nullable(),
  canonicalUrl: z.string().trim().max(500).optional().nullable(),
  noindex: z.boolean().default(false),
  schemaJson: z.string().max(20_000).optional().nullable(),
});

const navSchema = z.object({
  label: z.string().trim().min(1).max(80),
  path: z.string().trim().min(1).max(300),
  location: z.enum(NAV_LOCATIONS),
  description: z.string().trim().max(200).optional().nullable(),
  icon: z.string().trim().max(40).optional().nullable(),
  image: z.string().trim().max(500).optional().nullable(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
  isVisible: z.boolean().default(true),
  openInNewTab: z.boolean().default(false),
});

const DEFAULT_NAV: Array<z.infer<typeof navSchema>> = [
  { label: "About Us", path: "/about", location: "header_about", description: "Learn about our mission and team", icon: "Users", sortOrder: 1, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/3184360/pexels-photo-3184360.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "Contact", path: "/contact", location: "header_about", description: "Get in touch with our team", icon: "Mail", sortOrder: 2, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/4386466/pexels-photo-4386466.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "Careers", path: "/careers", location: "header_about", description: "Join our growing team", icon: "Briefcase", sortOrder: 3, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/1181675/pexels-photo-1181675.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "Case Studies", path: "/case-studies", location: "header_resources", description: "Real results from real customers", icon: "TrendingUp", sortOrder: 1, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/1005638/pexels-photo-1005638.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "WhatsApp Guide", path: "/whatsapp-guide", location: "header_resources", description: "Learn WhatsApp marketing", icon: "BookOpen", sortOrder: 2, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/1181686/pexels-photo-1181686.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "Best Practices", path: "/best-practices", location: "header_resources", description: "Tips to get more from campaigns", icon: "BookOpen", sortOrder: 3, isVisible: true, openInNewTab: false, image: "https://images.pexels.com/photos/1043471/pexels-photo-1043471.jpeg?auto=compress&cs=tinysrgb&w=300&h=200&fit=crop" },
  { label: "About Us", path: "/about", location: "footer_company", sortOrder: 1, isVisible: true, openInNewTab: false },
  { label: "Contact", path: "/contact", location: "footer_company", sortOrder: 2, isVisible: true, openInNewTab: false },
  { label: "Careers", path: "/careers", location: "footer_company", sortOrder: 3, isVisible: true, openInNewTab: false },
  { label: "Case Studies", path: "/case-studies", location: "footer_resources", sortOrder: 1, isVisible: true, openInNewTab: false },
  { label: "WhatsApp Guide", path: "/whatsapp-guide", location: "footer_resources", sortOrder: 2, isVisible: true, openInNewTab: false },
  { label: "Best Practices", path: "/best-practices", location: "footer_resources", sortOrder: 3, isVisible: true, openInNewTab: false },
  { label: "Privacy Policy", path: "/privacy-policy", location: "footer_legal", sortOrder: 1, isVisible: true, openInNewTab: false },
  { label: "Terms of Service", path: "/terms", location: "footer_legal", sortOrder: 2, isVisible: true, openInNewTab: false },
  { label: "Cookie Policy", path: "/cookie-policy", location: "footer_legal", sortOrder: 3, isVisible: true, openInNewTab: false },
  { label: "Data Deletion", path: "/data-deletion", location: "footer_legal", sortOrder: 4, isVisible: true, openInNewTab: false },
];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function zerr(res: Response, e: unknown) {
  if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
  console.error("[CMS]", e);
  return res.status(500).json({ error: "Server error" });
}

export function registerCmsRoutes(app: Express) {
  // ───────────── Public ─────────────
  app.get("/api/cms/nav", async (_req, res) => {
    try {
      const items = await db.select().from(cmsNavItems).where(eq(cmsNavItems.isVisible, true)).orderBy(asc(cmsNavItems.sortOrder), asc(cmsNavItems.createdAt));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ items });
    } catch (e) { zerr(res, e); }
  });

  app.get("/api/cms/slugs", async (_req, res) => {
    try {
      const rows = await db.select({ slug: cmsPages.slug }).from(cmsPages).where(eq(cmsPages.status, "published"));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ slugs: rows.map((r) => r.slug) });
    } catch (e) { zerr(res, e); }
  });

  app.get("/api/cms/pages/:slug", async (req, res) => {
    try {
      const [row] = await db.select().from(cmsPages).where(and(eq(cmsPages.slug, req.params.slug.toLowerCase()), eq(cmsPages.status, "published"))).limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.get("/api/cms/content", async (_req, res) => {
    try {
      const items = await db.select().from(cmsSiteItems).where(eq(cmsSiteItems.isVisible, true)).orderBy(asc(cmsSiteItems.sortOrder), asc(cmsSiteItems.createdAt));
      res.set("Cache-Control", "public, max-age=60");
      res.json({ items });
    } catch (e) { zerr(res, e); }
  });

  app.get("/sitemap.xml", async (req, res) => {
    try {
      const base = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
      const rows = await db.select({ slug: cmsPages.slug, updatedAt: cmsPages.updatedAt }).from(cmsPages)
        .where(and(eq(cmsPages.status, "published"), eq(cmsPages.noindex, false)));
      const urls = [`<url><loc>${esc(base)}/</loc></url>`, ...rows.map((r) => `<url><loc>${esc(base)}/${esc(r.slug)}</loc><lastmod>${new Date(r.updatedAt as any).toISOString()}</lastmod></url>`)];
      res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
    } catch (e) { zerr(res, e); }
  });

  // ───────────── Admin: pages ─────────────
  const guard = [requireAuth, requireSuperadmin] as const;

  app.get("/api/admin/cms/pages", ...guard, async (req, res) => {
    try {
      const type = String(req.query.type || "all");
      const rows = await db.select({
        id: cmsPages.id, title: cmsPages.title, slug: cmsPages.slug, pageType: cmsPages.pageType, status: cmsPages.status,
        noindex: cmsPages.noindex, updatedAt: cmsPages.updatedAt,
      }).from(cmsPages).where(type === "all" ? sql`true` : eq(cmsPages.pageType, type)).orderBy(desc(cmsPages.updatedAt));
      res.json({ data: rows });
    } catch (e) { zerr(res, e); }
  });

  app.get("/api/admin/cms/pages/:id", ...guard, async (req, res) => {
    try {
      const [row] = await db.select().from(cmsPages).where(eq(cmsPages.id, req.params.id)).limit(1);
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.post("/api/admin/cms/pages", ...guard, async (req, res) => {
    try {
      const b = pageSchema.parse(req.body);
      if (RESERVED.has(b.slug)) return res.status(400).json({ error: `"${b.slug}" is reserved by the app` });
      if (b.schemaJson) JSON.parse(b.schemaJson);
      const [dup] = await db.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, b.slug)).limit(1);
      if (dup) return res.status(409).json({ error: "Slug already in use" });
      const [row] = await db.insert(cmsPages).values({ ...b, content: clean(b.content) } as any).returning();
      res.status(201).json({ data: row });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(400).json({ error: "Schema JSON-LD is not valid JSON" });
      zerr(res, e);
    }
  });

  app.put("/api/admin/cms/pages/:id", ...guard, async (req, res) => {
    try {
      const b = pageSchema.parse(req.body);
      if (RESERVED.has(b.slug)) return res.status(400).json({ error: `"${b.slug}" is reserved by the app` });
      if (b.schemaJson) JSON.parse(b.schemaJson);
      const [dup] = await db.select({ id: cmsPages.id }).from(cmsPages).where(eq(cmsPages.slug, b.slug)).limit(1);
      if (dup && dup.id !== req.params.id) return res.status(409).json({ error: "Slug already in use" });
      const [row] = await db.update(cmsPages).set({ ...b, content: clean(b.content), updatedAt: new Date() } as any).where(eq(cmsPages.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ data: row });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(400).json({ error: "Schema JSON-LD is not valid JSON" });
      zerr(res, e);
    }
  });

  app.delete("/api/admin/cms/pages/:id", ...guard, async (req, res) => {
    try {
      await db.delete(cmsPages).where(eq(cmsPages.id, req.params.id));
      res.json({ success: true });
    } catch (e) { zerr(res, e); }
  });

  // ───────────── Admin: navigation ─────────────
  app.get("/api/admin/cms/nav", ...guard, async (_req, res) => {
    try {
      const items = await db.select().from(cmsNavItems).orderBy(asc(cmsNavItems.location), asc(cmsNavItems.sortOrder));
      res.json({ data: items });
    } catch (e) { zerr(res, e); }
  });

  app.post("/api/admin/cms/nav", ...guard, async (req, res) => {
    try {
      const [row] = await db.insert(cmsNavItems).values(navSchema.parse(req.body) as any).returning();
      res.status(201).json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.put("/api/admin/cms/nav/:id", ...guard, async (req, res) => {
    try {
      const [row] = await db.update(cmsNavItems).set({ ...navSchema.parse(req.body), updatedAt: new Date() } as any).where(eq(cmsNavItems.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.delete("/api/admin/cms/nav/:id", ...guard, async (req, res) => {
    try {
      await db.delete(cmsNavItems).where(eq(cmsNavItems.id, req.params.id));
      res.json({ success: true });
    } catch (e) { zerr(res, e); }
  });

  // Import the current hardcoded menus into the DB (only when the table is empty).
  app.post("/api/admin/cms/nav/seed-defaults", ...guard, async (_req, res) => {
    try {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(cmsNavItems);
      if (n > 0) return res.status(409).json({ error: "Navigation already has items" });
      await db.insert(cmsNavItems).values(DEFAULT_NAV as any);
      res.json({ success: true, count: DEFAULT_NAV.length });
    } catch (e) { zerr(res, e); }
  });

  // ───────────── Admin: site content (stats / FAQs / testimonials) ─────────────
  app.get("/api/admin/cms/content", ...guard, async (req, res) => {
    try {
      const g = String(req.query.group || "");
      const rows = await db.select().from(cmsSiteItems)
        .where(g ? eq(cmsSiteItems.groupKey, g) : sql`true`)
        .orderBy(asc(cmsSiteItems.groupKey), asc(cmsSiteItems.sortOrder), asc(cmsSiteItems.createdAt));
      res.json({ data: rows });
    } catch (e) { zerr(res, e); }
  });

  app.post("/api/admin/cms/content", ...guard, async (req, res) => {
    try {
      const [row] = await db.insert(cmsSiteItems).values(itemSchema.parse(req.body) as any).returning();
      res.status(201).json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.put("/api/admin/cms/content/:id", ...guard, async (req, res) => {
    try {
      const [row] = await db.update(cmsSiteItems).set({ ...itemSchema.parse(req.body), updatedAt: new Date() } as any).where(eq(cmsSiteItems.id, req.params.id)).returning();
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ data: row });
    } catch (e) { zerr(res, e); }
  });

  app.delete("/api/admin/cms/content/:id", ...guard, async (req, res) => {
    try {
      await db.delete(cmsSiteItems).where(eq(cmsSiteItems.id, req.params.id));
      res.json({ success: true });
    } catch (e) { zerr(res, e); }
  });

  // Import the site's current built-in content for one group (only when that group is empty).
  app.post("/api/admin/cms/content/import", ...guard, async (req, res) => {
    try {
      const body = z.object({ groupKey: z.string(), items: z.array(z.record(z.any())).min(1).max(50) }).parse(req.body);
      const kind = CONTENT_GROUPS[body.groupKey];
      if (!kind) return res.status(400).json({ error: "Unknown group" });
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(cmsSiteItems).where(eq(cmsSiteItems.groupKey, body.groupKey));
      if (n > 0) return res.status(409).json({ error: "This group already has items" });
      const rows = body.items.map((it, i) => itemSchema.parse({ ...it, kind, groupKey: body.groupKey, sortOrder: i + 1, isVisible: true }));
      await db.insert(cmsSiteItems).values(rows as any);
      res.json({ success: true, count: rows.length });
    } catch (e) { zerr(res, e); }
  });
}
