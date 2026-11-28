/**
 * Facebook Pages: connect (Facebook Login → page tokens), list, disconnect, publish.
 * Page tokens issued from a long-lived user token don't expire (until the user changes
 * password / removes the app), so we store them and mark the page "expired" on error 190.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { fbPages, type FbPage, type SocialMedia } from "@shared/schema";
import { open, seal } from "../../utils/secret-box";
import { readState, signState } from "../instagram/instagram.service";
import { fbApp, FB_API } from "../ads/ads.service";

const GRAPH = `https://graph.facebook.com/${FB_API}`;
export const PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "business_management"];

export class FbError extends Error {
  constructor(message: string, public status = 400, public code?: number) { super(message); }
}

async function graph(path: string, token: string, init: { method?: string; query?: Record<string, string>; form?: Record<string, any>; headers?: Record<string, string> } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(init.query || {})) url.searchParams.set(k, v);
  if (token) url.searchParams.set("access_token", token);
  let body: any;
  if (init.form) {
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(init.form)) if (v !== undefined && v !== null) f.set(k, typeof v === "string" ? v : JSON.stringify(v));
    body = f;
  }
  const r = await fetch(url, { method: init.method || (init.form ? "POST" : "GET"), body, headers: init.headers });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    const e = j?.error || {};
    throw new FbError(e.error_user_msg || e.error_user_title || e.message || `Facebook error (${r.status})`, e.code === 190 ? 401 : 400, e.code);
  }
  return j;
}

export function pageToken(p: FbPage) {
  const t = open(p.accessTokenEnc);
  if (!t) throw new FbError("Reconnect this Facebook Page.", 401);
  return t;
}

async function pageCall(p: FbPage, path: string, init?: Parameters<typeof graph>[2]) {
  try { return await graph(path, pageToken(p), init); } catch (e) {
    if (e instanceof FbError && e.status === 401) {
      await db.update(fbPages).set({ status: "expired", lastError: e.message, updatedAt: new Date() }).where(eq(fbPages.id, p.id));
    }
    throw e;
  }
}

// ───────────── connect ─────────────

export async function authorizeUrl(ownerId: string, redirectUri: string) {
  const { appId, secret } = await fbApp();
  const u = new URL(`https://www.facebook.com/${FB_API}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", PAGE_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", signState(ownerId, secret));
  return u.toString();
}

/** Exchanges the code and saves every Page the user can post to. Returns saved pages. */
export async function completeOAuth(code: string, state: string, redirectUri: string) {
  const { appId, secret } = await fbApp();
  const ownerId = readState(state, secret);
  if (!ownerId) throw new FbError("This Facebook login link expired. Try connecting again.");
  const short = await graph("/oauth/access_token", "", { query: { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code } });
  const long = await graph("/oauth/access_token", "", { query: { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token } });
  const userToken = long.access_token || short.access_token;
  const me = await graph("/me", userToken, { query: { fields: "id" } });
  const list = await graph("/me/accounts", userToken, { query: { fields: "id,name,category,access_token,picture{url},followers_count,tasks", limit: "100" } });
  const usable = (list.data || []).filter((p: any) => !p.tasks || p.tasks.includes("CREATE_CONTENT") || p.tasks.includes("MANAGE"));
  if (!usable.length) throw new FbError("No Pages found where you can create posts. Make sure you picked your Pages in the Facebook popup.");
  // plan cap: pages already connected always refresh; new pages only up to the plan's remaining slots
  const { remaining } = await import("../plan-gate");
  const have = new Set((await db.select({ pageId: fbPages.pageId }).from(fbPages).where(eq(fbPages.ownerId, ownerId))).map((r) => r.pageId));
  let room = await remaining(ownerId, "facebookPages");
  const saved: FbPage[] = [];
  const skipped: string[] = [];
  for (const p of usable) {
    if (!have.has(p.id)) {
      if (room <= 0) { skipped.push(p.name); continue; }
      room--;
    }
    const values = {
      ownerId, pageId: p.id, name: p.name, category: p.category || null, picture: p.picture?.data?.url || null,
      followers: p.followers_count ?? null, accessTokenEnc: seal(p.access_token), fbUserId: me.id,
      status: "active", lastError: null, updatedAt: new Date(),
    };
    const [row] = await db.insert(fbPages).values(values)
      .onConflictDoUpdate({ target: [fbPages.ownerId, fbPages.pageId], set: values }).returning();
    saved.push(row);
  }
  if (!saved.length && skipped.length) throw new FbError(`Your plan's Facebook Page limit is reached, so ${skipped.length} Page(s) weren't added. Remove a Page or upgrade your plan.`, 403);
  return Object.assign(saved, { skipped });
}

export async function listPages(ownerId: string) {
  const rows = await db.select().from(fbPages).where(eq(fbPages.ownerId, ownerId)).orderBy(desc(fbPages.connectedAt));
  return rows.map(({ accessTokenEnc, ...r }) => r);
}

export async function ownedPage(ownerId: string, id: string) {
  const [p] = await db.select().from(fbPages).where(and(eq(fbPages.id, id), eq(fbPages.ownerId, ownerId))).limit(1);
  if (!p) throw new FbError("Facebook Page not found", 404);
  return p;
}

export async function syncPage(p: FbPage) {
  const j = await pageCall(p, `/${p.pageId}`, { query: { fields: "name,category,picture{url},followers_count" } });
  const [row] = await db.update(fbPages).set({
    name: j.name, category: j.category || null, picture: j.picture?.data?.url || null, followers: j.followers_count ?? null,
    status: "active", lastError: null, updatedAt: new Date(),
  }).where(eq(fbPages.id, p.id)).returning();
  const { accessTokenEnc, ...safe } = row;
  return safe;
}

// ───────────── publish ─────────────

export interface FbPublishInput { postType: string; media: SocialMedia[]; message: string; link?: string | null }

/** Publishes now. Returns the Facebook post / video id and a link when available. */
export async function publishToPage(p: FbPage, i: FbPublishInput): Promise<{ remoteId: string; permalink?: string | null }> {
  const id = p.pageId;
  const images = i.media.filter((m) => m.kind === "image");
  const video = i.media.find((m) => m.kind === "video");

  if (i.postType === "reel") {
    if (!video) throw new FbError("A Reel needs a video.");
    const start = await pageCall(p, `/${id}/video_reels`, { form: { upload_phase: "start" } });
    const up = await fetch(`https://rupload.facebook.com/video-upload/${FB_API}/${start.video_id}`, {
      method: "POST", headers: { Authorization: `OAuth ${pageToken(p)}`, file_url: video.url },
    });
    const uj: any = await up.json().catch(() => ({}));
    if (!up.ok || uj?.success === false || uj?.error) throw new FbError(uj?.error?.message || uj?.debug_info?.message || "Facebook didn't accept the video");
    await pageCall(p, `/${id}/video_reels`, { form: { upload_phase: "finish", video_id: start.video_id, video_state: "PUBLISHED", description: i.message } });
    return { remoteId: String(start.video_id), permalink: `https://www.facebook.com/reel/${start.video_id}` };
  }
  if (i.postType === "video" || (video && !images.length)) {
    if (!video) throw new FbError("Add a video.");
    const r = await pageCall(p, `/${id}/videos`, { form: { file_url: video.url, description: i.message } });
    return { remoteId: String(r.id), permalink: `https://www.facebook.com/${id}/videos/${r.id}` };
  }
  if (images.length === 1) {
    const r = await pageCall(p, `/${id}/photos`, { form: { url: images[0].url, caption: i.message, published: "true" } });
    return { remoteId: String(r.post_id || r.id), permalink: r.post_id ? `https://www.facebook.com/${r.post_id}` : null };
  }
  if (images.length > 1) {
    const ids: string[] = [];
    for (const img of images.slice(0, 10)) {
      const r = await pageCall(p, `/${id}/photos`, { form: { url: img.url, published: "false" } });
      ids.push(r.id);
    }
    const r = await pageCall(p, `/${id}/feed`, { form: { message: i.message, attached_media: ids.map((m) => ({ media_fbid: m })) } });
    return { remoteId: String(r.id), permalink: `https://www.facebook.com/${r.id}` };
  }
  if (!i.message.trim() && !i.link) throw new FbError("Write something or add a link, photo or video.");
  const r = await pageCall(p, `/${id}/feed`, { form: { message: i.message, ...(i.link ? { link: i.link } : {}) } });
  return { remoteId: String(r.id), permalink: `https://www.facebook.com/${r.id}` };
}
