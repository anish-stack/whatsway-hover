/**
 * Instagram (Instagram API with Instagram Login — professional accounts).
 *  - connect: OAuth → long-lived token (60 days, refreshed by cron)
 *  - profile, posts/reels with insights, comments (reply / hide / delete), publish image or reel
 *  - comment automation: a comment with a keyword on a reel/post → public reply + private DM (once per person)
 *  - DM inbox: webhook messages stored as threads; reply within Instagram's 24 h window
 */
import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  igAccounts, igCommentEvents, igCommentRules, igMessages, igThreads, socialAppSettings,
  type IgAccount, type IgCommentRule,
} from "@shared/schema";
import { open, seal } from "../../utils/secret-box";

export const IG_API = process.env.IG_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.instagram.com/${IG_API}`;
export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
];

export class IgError extends Error {
  constructor(message: string, public status = 400, public code?: number) { super(message); }
}

// ───────────── app settings (super admin) ─────────────

export async function getSocialSettings() {
  const [row] = await db.select().from(socialAppSettings).where(eq(socialAppSettings.id, "default")).limit(1);
  return row || null;
}

export async function igApp() {
  const s = await getSocialSettings();
  const appId = s?.igAppId || process.env.INSTAGRAM_APP_ID || "";
  const secret = open(s?.igAppSecretEnc) || process.env.INSTAGRAM_APP_SECRET || "";
  if (!appId || !secret) throw new IgError("Instagram isn't set up on this platform yet. Ask the admin to add the Instagram app in Social apps.", 503);
  return { appId, secret, verifyToken: s?.webhookVerifyToken || process.env.INSTAGRAM_VERIFY_TOKEN || "" };
}

// ───────────── low-level API ─────────────

async function igFetch(path: string, token: string, init: { method?: string; body?: any; query?: Record<string, string> } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(init.query || {})) url.searchParams.set(k, v);
  const method = init.method || "GET";
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let body: any;
  if (init.body !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(init.body); }
  const r = await fetch(url, { method, headers, body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    const e = j?.error || {};
    const expired = e.code === 190;
    throw new IgError(e.error_user_msg || e.message || `Instagram error (${r.status})`, expired ? 401 : 400, e.code);
  }
  return j;
}

export function tokenOf(acc: IgAccount) {
  const t = open(acc.accessTokenEnc);
  if (!t) throw new IgError("Reconnect this Instagram account.", 401);
  return t;
}

async function markError(acc: IgAccount, e: unknown) {
  if (e instanceof IgError && e.status === 401) {
    await db.update(igAccounts).set({ status: "expired", lastError: e.message, updatedAt: new Date() }).where(eq(igAccounts.id, acc.id));
  }
}

export async function call<T = any>(acc: IgAccount, path: string, init?: Parameters<typeof igFetch>[2]): Promise<T> {
  try { return await igFetch(path, tokenOf(acc), init); } catch (e) { await markError(acc, e); throw e; }
}

// ───────────── OAuth ─────────────

export function signState(ownerId: string, secret: string) {
  const payload = Buffer.from(JSON.stringify({ o: ownerId, t: Date.now(), n: crypto.randomBytes(6).toString("hex") })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readState(state: string, secret: string): string | null {
  const [payload, sig] = String(state || "").split(".");
  if (!payload || !sig) return null;
  const want = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (Date.now() - p.t > 20 * 60_000) return null;
    return p.o;
  } catch { return null; }
}

export async function authorizeUrl(ownerId: string, redirectUri: string) {
  const { appId, secret } = await igApp();
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("enable_fb_login", "0");
  u.searchParams.set("force_authentication", "1");
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", IG_SCOPES.join(","));
  u.searchParams.set("state", signState(ownerId, secret));
  return u.toString();
}

export async function completeOAuth(code: string, state: string, redirectUri: string) {
  const { appId, secret } = await igApp();
  const ownerId = readState(state, secret);
  if (!ownerId) throw new IgError("This Instagram login link expired. Try connecting again.");
  const form = new URLSearchParams({ client_id: appId, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") });
  const r = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const short: any = await r.json().catch(() => ({}));
  if (!r.ok || !short.access_token) throw new IgError(short?.error_message || short?.error?.message || "Instagram didn't return a token");

  const ll = await igFetch(`https://graph.instagram.com/access_token`, short.access_token, {
    query: { grant_type: "ig_exchange_token", client_secret: secret, access_token: short.access_token },
  });
  const token: string = ll.access_token || short.access_token;
  const expiresAt = ll.expires_in ? new Date(Date.now() + Number(ll.expires_in) * 1000) : null;
  const me = await igFetch("/me", token, { query: { fields: "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count" } });
  const igUserId = String(me.user_id || short.user_id || me.id);

  const [existing] = await db.select().from(igAccounts).where(eq(igAccounts.igUserId, igUserId)).limit(1);
  if (existing && existing.ownerId !== ownerId) throw new IgError(`@${me.username} is already connected to another HoverChat account.`, 409);
  if (!existing) {
    const { allowanceFor } = await import("../plan-gate");
    const a = await allowanceFor(ownerId, "instagramAccounts");
    if (!a.allowed) throw new IgError(a.error || "Your plan doesn't allow more Instagram accounts.", 403);
  }
  const values = {
    ownerId, igUserId, appScopedId: String(me.id || ""), username: me.username, name: me.name || null,
    profilePic: me.profile_picture_url || null, accountType: me.account_type || null,
    accessTokenEnc: seal(token), tokenExpiresAt: expiresAt, followers: me.followers_count ?? null, follows: me.follows_count ?? null,
    mediaCount: me.media_count ?? null, status: "active", lastError: null, lastSyncAt: new Date(), updatedAt: new Date(),
  };
  const [acc] = await db.insert(igAccounts).values(values)
    .onConflictDoUpdate({ target: igAccounts.igUserId, set: values }).returning();

  // receive comments + DMs for this account
  try {
    await igFetch(`/me/subscribed_apps`, token, { method: "POST", query: { subscribed_fields: "comments,messages,messaging_postbacks" } });
  } catch (e) {
    console.warn("[Instagram] webhook subscribe failed:", (e as Error).message);
  }
  return acc;
}

export async function refreshExpiringTokens() {
  const rows = await db.select().from(igAccounts)
    .where(and(eq(igAccounts.status, "active"), sql`${igAccounts.tokenExpiresAt} < now() + interval '15 days'`));
  let n = 0;
  for (const acc of rows) {
    try {
      const j = await igFetch("https://graph.instagram.com/refresh_access_token", tokenOf(acc), { query: { grant_type: "ig_refresh_token", access_token: tokenOf(acc) } });
      await db.update(igAccounts).set({
        accessTokenEnc: seal(j.access_token), tokenExpiresAt: new Date(Date.now() + Number(j.expires_in || 5184000) * 1000), updatedAt: new Date(),
      }).where(eq(igAccounts.id, acc.id));
      n++;
    } catch (e) { await markError(acc, e); }
  }
  return n;
}

// ───────────── account data ─────────────

export async function ownedAccount(ownerId: string | null, id: string) {
  const [acc] = await db.select().from(igAccounts).where(ownerId ? and(eq(igAccounts.id, id), eq(igAccounts.ownerId, ownerId)) : eq(igAccounts.id, id)).limit(1);
  if (!acc) throw new IgError("Instagram account not found", 404);
  return acc;
}

export async function listAccounts(ownerId: string) {
  const rows = await db.select().from(igAccounts).where(eq(igAccounts.ownerId, ownerId)).orderBy(desc(igAccounts.connectedAt));
  return rows.map(({ accessTokenEnc, ...r }) => r);
}

export async function syncProfile(acc: IgAccount) {
  const me = await call(acc, "/me", { query: { fields: "user_id,username,name,account_type,profile_picture_url,followers_count,follows_count,media_count" } });
  const [row] = await db.update(igAccounts).set({
    username: me.username, name: me.name || null, profilePic: me.profile_picture_url || null,
    followers: me.followers_count ?? null, follows: me.follows_count ?? null, mediaCount: me.media_count ?? null,
    status: "active", lastError: null, lastSyncAt: new Date(), updatedAt: new Date(),
  }).where(eq(igAccounts.id, acc.id)).returning();
  const { accessTokenEnc, ...safe } = row;
  return safe;
}

/** Account reach / views / interactions for the last N days (best effort — metrics vary by account). */
export async function accountInsights(acc: IgAccount, days = 28) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const out: Record<string, number> = {};
  for (const metric of ["reach", "views", "accounts_engaged", "total_interactions", "profile_views", "follows_and_unfollows"]) {
    try {
      const j = await call(acc, "/me/insights", { query: { metric, period: "day", metric_type: "total_value", since: String(since), until: String(until) } });
      const v = j?.data?.[0]?.total_value?.value;
      if (typeof v === "number") out[metric] = v;
    } catch { /* metric not available for this account */ }
  }
  return out;
}

export async function listMedia(acc: IgAccount, after?: string) {
  const j = await call(acc, "/me/media", {
    query: {
      fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: "24", ...(after ? { after } : {}),
    },
  });
  return { data: j.data || [], next: j.paging?.cursors?.after && j.paging?.next ? j.paging.cursors.after : null };
}

export async function mediaInsights(acc: IgAccount, mediaId: string, productType?: string) {
  const sets = productType === "REELS"
    ? ["reach,views,likes,comments,shares,saved,total_interactions,ig_reels_avg_watch_time", "reach,likes,comments,shares,saved"]
    : ["reach,views,likes,comments,shares,saved,total_interactions", "reach,likes,comments,saved"];
  for (const metric of sets) {
    try {
      const j = await call(acc, `/${mediaId}/insights`, { query: { metric } });
      const out: Record<string, number> = {};
      for (const d of j.data || []) out[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0;
      return out;
    } catch (e) {
      if ((e as IgError).status === 401) throw e;
    }
  }
  return {};
}

export async function listComments(acc: IgAccount, mediaId: string) {
  const j = await call(acc, `/${mediaId}/comments`, { query: { fields: "id,text,username,timestamp,like_count,hidden,from{id,username},replies{id,text,username,timestamp}", limit: "50" } });
  return j.data || [];
}

export async function replyToComment(acc: IgAccount, commentId: string, message: string) {
  return call(acc, `/${commentId}/replies`, { method: "POST", query: { message: message.slice(0, 2200) } });
}

export async function hideComment(acc: IgAccount, commentId: string, hide: boolean) {
  return call(acc, `/${commentId}`, { method: "POST", query: { hide: String(hide) } });
}

export async function deleteComment(acc: IgAccount, commentId: string) {
  return call(acc, `/${commentId}`, { method: "DELETE" });
}

/** Publish an image post or a reel from a public URL. */
export async function publish(acc: IgAccount, input: { kind: "image" | "reel"; url: string; caption?: string }) {
  const q: Record<string, string> = { caption: (input.caption || "").slice(0, 2200) };
  if (input.kind === "image") q.image_url = input.url;
  else { q.media_type = "REELS"; q.video_url = input.url; q.share_to_feed = "true"; }
  const container = await call(acc, "/me/media", { method: "POST", query: q });
  const id = container.id;
  // videos need processing before publishing
  for (let i = 0; i < (input.kind === "reel" ? 30 : 5); i++) {
    const st = await call(acc, `/${id}`, { query: { fields: "status_code,status" } });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new IgError(`Instagram couldn't process this ${input.kind}: ${st.status || st.status_code}`);
    await new Promise((r) => setTimeout(r, input.kind === "reel" ? 4000 : 1500));
  }
  const pub = await call(acc, "/me/media_publish", { method: "POST", query: { creation_id: id } });
  return { id: pub.id };
}

// ───────────── messaging ─────────────

function dmPayload(text: string, buttonText?: string | null, buttonUrl?: string | null) {
  if (buttonText && buttonUrl) {
    return {
      attachment: {
        type: "template",
        payload: { template_type: "button", text: text.slice(0, 640), buttons: [{ type: "web_url", url: buttonUrl, title: buttonText.slice(0, 20) }] },
      },
    };
  }
  return { text: text.slice(0, 1000) };
}

/** DM to the person who wrote a comment (works once per comment, within 7 days). */
export async function privateReply(acc: IgAccount, commentId: string, text: string, buttonText?: string | null, buttonUrl?: string | null) {
  try {
    return await call(acc, "/me/messages", { method: "POST", body: { recipient: { comment_id: commentId }, message: dmPayload(text, buttonText, buttonUrl) } });
  } catch (e) {
    if (buttonText && buttonUrl && (e as IgError).status !== 401) {
      // some accounts can't send button templates in private replies → plain text with the link
      return call(acc, "/me/messages", { method: "POST", body: { recipient: { comment_id: commentId }, message: { text: `${text}\n\n${buttonText}: ${buttonUrl}`.slice(0, 1000) } } });
    }
    throw e;
  }
}

export async function sendDm(acc: IgAccount, igsid: string, text: string) {
  const r = await call(acc, "/me/messages", { method: "POST", body: { recipient: { id: igsid }, message: { text: text.slice(0, 1000) } } });
  await storeMessage(acc, igsid, { mid: r.message_id || null, direction: "out", text, source: "inbox" });
  return r;
}

async function upsertThread(acc: IgAccount, igsid: string, patch: Partial<typeof igThreads.$inferInsert> = {}) {
  const [t] = await db.insert(igThreads).values({ accountId: acc.id, igsid, ...patch })
    .onConflictDoUpdate({ target: [igThreads.accountId, igThreads.igsid], set: patch.lastMessageAt ? patch : { igsid } as any })
    .returning();
  return t;
}

export async function storeMessage(acc: IgAccount, igsid: string, m: { mid: string | null; direction: "in" | "out"; text?: string | null; attachments?: any; source?: string; at?: Date }) {
  const at = m.at || new Date();
  const preview = m.text || (m.attachments ? "[Attachment]" : "");
  const thread = await upsertThread(acc, igsid, {
    lastMessageText: preview.slice(0, 300), lastMessageAt: at,
    ...(m.direction === "in" ? { lastIncomingAt: at } : {}),
  });
  if (m.direction === "in") await db.update(igThreads).set({ unread: sql`${igThreads.unread} + 1` } as any).where(eq(igThreads.id, thread.id));
  if (m.mid) {
    await db.insert(igMessages).values({ threadId: thread.id, accountId: acc.id, mid: m.mid, direction: m.direction, text: m.text || null, attachments: m.attachments || null, source: m.source || "inbox", createdAt: at })
      .onConflictDoNothing();
  } else {
    await db.insert(igMessages).values({ threadId: thread.id, accountId: acc.id, direction: m.direction, text: m.text || null, attachments: m.attachments || null, source: m.source || "inbox", createdAt: at });
  }
  if (!thread.username && m.direction === "in") fillProfile(acc, thread.id, igsid).catch(() => {});
  try { (global as any).io?.to(`user:${acc.ownerId}`).emit("instagram:message", { accountId: acc.id, threadId: thread.id }); } catch { /* ignore */ }
  return thread;
}

async function fillProfile(acc: IgAccount, threadId: string, igsid: string) {
  const p = await call(acc, `/${igsid}`, { query: { fields: "name,username,profile_pic" } });
  await db.update(igThreads).set({ username: p.username || null, name: p.name || null, profilePic: p.profile_pic || null }).where(eq(igThreads.id, threadId));
}

/** Pull recent conversations (first connect / "Sync chats"). */
export async function syncConversations(acc: IgAccount) {
  const j = await call(acc, "/me/conversations", { query: { platform: "instagram", fields: "participants,messages.limit(20){id,message,from,created_time}", limit: "25" } });
  let n = 0;
  for (const conv of j.data || []) {
    const other = (conv.participants?.data || []).find((p: any) => p.id !== acc.igUserId && p.id !== acc.appScopedId);
    if (!other) continue;
    const msgs = [...(conv.messages?.data || [])].reverse();
    for (const m of msgs) {
      const inbound = m.from?.id === other.id;
      await storeMessage(acc, other.id, { mid: m.id, direction: inbound ? "in" : "out", text: m.message || null, source: "instagram_app", at: new Date(m.created_time) });
    }
    await db.update(igThreads).set({ username: other.username || null, unread: 0 }).where(and(eq(igThreads.accountId, acc.id), eq(igThreads.igsid, other.id)));
    n++;
  }
  return n;
}

// ───────────── comment automation ─────────────

export function ruleMatches(rule: Pick<IgCommentRule, "keywords" | "matchMode" | "mediaId">, mediaId: string | undefined, text: string) {
  if (rule.mediaId && rule.mediaId !== mediaId) return false;
  const kws = ((rule.keywords || []) as string[]).map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (!kws.length) return true;
  const t = String(text || "").toLowerCase().trim();
  if (rule.matchMode === "exact") return kws.some((k) => t === k || t.replace(/[^\p{L}\p{N}\s]/gu, "").trim() === k);
  return kws.some((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(t));
}

export async function handleComment(acc: IgAccount, v: { id: string; text?: string; from?: { id?: string; username?: string }; media?: { id?: string }; parent_id?: string }) {
  if (!v?.id) return;
  const fromId = v.from?.id;
  if (!fromId || fromId === acc.igUserId || fromId === acc.appScopedId) return; // our own replies
  const rules = await db.select().from(igCommentRules)
    .where(and(eq(igCommentRules.accountId, acc.id), eq(igCommentRules.isActive, true)))
    .orderBy(sql`${igCommentRules.mediaId} IS NULL`, desc(igCommentRules.createdAt)); // post-specific rules first
  const rule = rules.find((r) => ruleMatches(r, v.media?.id, v.text || ""));
  const base = { accountId: acc.id, commentId: v.id, mediaId: v.media?.id || null, fromId, fromUsername: v.from?.username || null, text: (v.text || "").slice(0, 2000) };

  // claim the comment (webhooks can arrive twice)
  const [claimed] = await db.insert(igCommentEvents).values({ ...base, ruleId: rule?.id || null, action: rule ? "processing" : "no_match" })
    .onConflictDoNothing().returning();
  if (!claimed || !rule) return;

  const setEvent = (action: string, error?: string) =>
    db.update(igCommentEvents).set({ action, error: error?.slice(0, 500) || null }).where(eq(igCommentEvents.id, claimed.id));

  await db.update(igCommentRules).set({ triggered: sql`${igCommentRules.triggered} + 1` } as any).where(eq(igCommentRules.id, rule.id));
  if (rule.oncePerUser) {
    const [prev] = await db.select({ id: igCommentEvents.id }).from(igCommentEvents)
      .where(and(eq(igCommentEvents.ruleId, rule.id), eq(igCommentEvents.fromId, fromId), eq(igCommentEvents.action, "dm_sent"))).limit(1);
    if (prev) return setEvent("skipped", "Already sent to this person");
  }
  const name = v.from?.username ? `@${v.from.username}` : "there";
  const fill = (s: string) => s.replace(/\{\{\s*(username|name)\s*\}\}/g, name);
  try {
    const replies = ((rule.publicReplies || []) as string[]).filter((r) => r.trim());
    if (replies.length) {
      const pick = replies[Math.floor(Math.random() * replies.length)];
      await replyToComment(acc, v.id, fill(pick)).catch((e) => console.warn("[Instagram] public reply failed:", e.message));
    }
    const r = await privateReply(acc, v.id, fill(rule.dmText), rule.dmButtonText, rule.dmButtonUrl);
    await db.update(igCommentRules).set({ dmsSent: sql`${igCommentRules.dmsSent} + 1` } as any).where(eq(igCommentRules.id, rule.id));
    await setEvent("dm_sent");
    if (r?.recipient_id) {
      await storeMessage(acc, r.recipient_id, { mid: r.message_id || null, direction: "out", text: fill(rule.dmText), source: "automation" });
    }
  } catch (e) {
    await setEvent("failed", (e as Error).message);
  }
}

// ───────────── webhook ─────────────

export function verifySignature(raw: Buffer | undefined, header: string | undefined, secret: string) {
  if (!raw || !header?.startsWith("sha256=")) return false;
  const want = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return want.length === header.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(header));
}

export async function processWebhook(body: any) {
  if (body?.object !== "instagram") return;
  for (const entry of body.entry || []) {
    const [acc] = await db.select().from(igAccounts).where(eq(igAccounts.igUserId, String(entry.id))).limit(1);
    if (!acc || acc.status === "disconnected") continue;
    for (const ch of entry.changes || []) {
      if (ch.field === "comments" || ch.field === "live_comments") {
        await handleComment(acc, ch.value).catch((e) => console.error("[Instagram] comment handler", e));
      }
    }
    for (const m of entry.messaging || []) {
      try {
        if (!m.message || m.message.is_deleted) continue;
        const echo = !!m.message.is_echo;
        const other = echo ? m.recipient?.id : m.sender?.id;
        if (!other) continue;
        await storeMessage(acc, String(other), {
          mid: m.message.mid || null, direction: echo ? "out" : "in", text: m.message.text || null,
          attachments: m.message.attachments || null, source: echo ? "instagram_app" : "inbox",
          at: m.timestamp ? new Date(Number(m.timestamp)) : new Date(),
        });
      } catch (e) { console.error("[Instagram] message handler", e); }
    }
  }
}
