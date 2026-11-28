/**
 * Server-side SEO for published CMS / landing pages: puts the title, description, Open Graph,
 * Twitter, canonical and JSON-LD tags into index.html so Google, WhatsApp and Facebook link
 * previews see them without running JavaScript.
 */
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { cmsPages } from "@shared/schema";
import { autoDescription, buildJsonLd, firstImage } from "@shared/landing";
import { appOrigin } from "./services/reseller/common";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cache = new Map<string, { at: number; html: string | null }>();

export function cmsSeoMiddleware(distPath: string) {
  let template: string | null = null;
  const readTemplate = () => (template ??= fs.readFileSync(path.resolve(distPath, "index.html"), "utf8"));
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET") return next();
    const m = req.path.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
    if (!m) return next();
    const slug = m[1];
    try {
      const hit = cache.get(slug);
      let html: string | null;
      if (hit && Date.now() - hit.at < 60_000) html = hit.html;
      else {
        const [p] = await db.select().from(cmsPages).where(and(eq(cmsPages.slug, slug), eq(cmsPages.status, "published"))).limit(1);
        html = p ? render(readTemplate(), p, (await appOrigin().catch(() => "")) || `${req.protocol}://${req.get("host")}`) : null;
        cache.set(slug, { at: Date.now(), html });
        if (cache.size > 500) cache.clear();
      }
      if (!html) return next();
      res.set("Content-Type", "text/html; charset=utf-8").set("Cache-Control", "no-cache").send(html);
    } catch { next(); }
  };
}

function render(tpl: string, p: any, origin: string): string {
  const builder = p.editor === "builder";
  const blocks = builder ? (p.blocks || []) : [];
  const abs = (u?: string | null) => (!u ? "" : /^https?:/.test(u) ? u : `${origin}${u.startsWith("/") ? "" : "/"}${u}`);
  const title = p.metaTitle || p.title;
  const desc = p.metaDescription || p.excerpt || (builder ? autoDescription(blocks) : "");
  const image = abs(p.ogImage || (builder ? firstImage(blocks) : ""));
  const url = `${origin}/${p.slug}`;
  const canonical = p.canonicalUrl || url;
  const tags = [
    `<title>${esc(title)}</title>`,
    desc && `<meta name="description" content="${esc(desc)}">`,
    p.metaKeywords && `<meta name="keywords" content="${esc(p.metaKeywords)}">`,
    `<meta name="robots" content="${p.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    desc && `<meta property="og:description" content="${esc(desc)}">`,
    image && `<meta property="og:image" content="${esc(image)}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    desc && `<meta name="twitter:description" content="${esc(desc)}">`,
    image && `<meta name="twitter:image" content="${esc(image)}">`,
    builder ? `<script type="application/ld+json">${buildJsonLd(p, origin).replace(/</g, "\\u003c")}</script>`
      : p.schemaJson ? `<script type="application/ld+json">${String(p.schemaJson).replace(/</g, "\\u003c")}</script>` : "",
    image && builder ? `<link rel="preload" as="image" href="${esc(abs(firstImage(blocks)) || image)}">` : "",
  ].filter(Boolean).map((t) => `  ${String(t).replace(/^<(\w+)/, "<$1 data-ssr-seo")}`).join("\n");
  return tpl.replace(/<title>[\s\S]*?<\/title>/i, "").replace("</head>", `${tags}\n</head>`);
}

/** Drop cached HTML after a page is saved. */
export function clearCmsSeoCache(slug?: string) { if (slug) cache.delete(slug); else cache.clear(); }
