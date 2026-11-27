/** Short links (yourdomain/l/abc123) with click counts — use them in campaigns, drips, bios. */
import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { linkClicks, shortLinks } from "@shared/schema";
import { sha256 } from "../../utils/secret-box";

const ALPHA = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => ALPHA[b % ALPHA.length]).join("");
}

export function normaliseUrl(raw: string) {
  const u = String(raw || "").trim();
  const withProto = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  const parsed = new URL(withProto); // throws on garbage
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http(s) links");
  return parsed.toString();
}

export async function createLink(ownerId: string, input: { url: string; title?: string | null; code?: string | null }) {
  const targetUrl = normaliseUrl(input.url);
  const wanted = String(input.code || "").trim();
  if (wanted && !/^[A-Za-z0-9_-]{3,24}$/.test(wanted)) throw Object.assign(new Error("Custom code: 3-24 letters, numbers, - or _"), { status: 400 });
  for (let i = 0; i < 5; i++) {
    const code = wanted || randomCode();
    const [row] = await db.insert(shortLinks).values({ ownerId, code, targetUrl, title: input.title?.trim() || null })
      .onConflictDoNothing().returning();
    if (row) return row;
    if (wanted) throw Object.assign(new Error("That custom code is taken"), { status: 409 });
  }
  throw new Error("Couldn't create a link, try again");
}

export async function listLinks(ownerId: string) {
  return db.select().from(shortLinks).where(eq(shortLinks.ownerId, ownerId)).orderBy(desc(shortLinks.createdAt)).limit(500);
}

/** Last 14 days of clicks per day + device split. */
export async function linkStats(ownerId: string, id: string) {
  const [link] = await db.select().from(shortLinks).where(and(eq(shortLinks.id, id), eq(shortLinks.ownerId, ownerId))).limit(1);
  if (!link) return null;
  const daily = await db.execute(sql`
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Kolkata'), 'YYYY-MM-DD') AS day, count(*)::int AS clicks
    FROM link_clicks WHERE link_id = ${id} AND created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`);
  const devices = await db.execute(sql`SELECT coalesce(device,'other') AS device, count(*)::int AS clicks FROM link_clicks WHERE link_id = ${id} GROUP BY 1 ORDER BY 2 DESC`);
  const refs = await db.execute(sql`SELECT ref, count(*)::int AS clicks FROM link_clicks WHERE link_id = ${id} AND ref IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
  const rows = (r: any) => (r.rows || r) as any[];
  return { link, daily: rows(daily), devices: rows(devices), refs: rows(refs) };
}

function device(ua: string) {
  if (/bot|crawl|spider|preview|facebookexternalhit|whatsapp/i.test(ua)) return "bot";
  if (/iphone|ipad|ios/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/windows|macintosh|linux/i.test(ua)) return "desktop";
  return "other";
}

/** Records a click and returns where to send the visitor (null = unknown/inactive). */
export async function recordClick(code: string, meta: { ip?: string; ua?: string; referer?: string; ref?: string }) {
  const [link] = await db.select().from(shortLinks).where(eq(shortLinks.code, code)).limit(1);
  if (!link || !link.isActive) return null;
  const ua = String(meta.ua || "");
  const dev = device(ua);
  if (dev !== "bot") { // link previews (WhatsApp, Facebook) are not real clicks
    const visitorHash = sha256(`${meta.ip || ""}|${ua}|${link.id}`);
    const [seen] = await db.select({ id: linkClicks.id }).from(linkClicks)
      .where(and(eq(linkClicks.linkId, link.id), eq(linkClicks.visitorHash, visitorHash))).limit(1);
    await db.insert(linkClicks).values({
      linkId: link.id, visitorHash, device: dev, referer: meta.referer?.slice(0, 500) || null,
      ref: meta.ref ? String(meta.ref).replace(/[^\w.-]/g, "").slice(0, 40) || null : null,
    });
    await db.update(shortLinks).set({
      clicks: sql`${shortLinks.clicks} + 1`,
      uniqueClicks: seen ? shortLinks.uniqueClicks : sql`${shortLinks.uniqueClicks} + 1`,
      lastClickAt: new Date(),
    } as any).where(eq(shortLinks.id, link.id));
  }
  return link.targetUrl;
}
