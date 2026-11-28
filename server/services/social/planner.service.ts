/**
 * Social content planner: one post → many destinations (Instagram accounts and/or Facebook Pages),
 * each with its own time and status. A cron tick (every minute) publishes due destinations.
 *
 * Instagram publishing is two-phase because videos need processing:
 *   1. create media container(s) → stage = { containers, parent? }   (status "publishing")
 *   2. next ticks poll status_code; when FINISHED → media_publish → permalink → first comment
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  fbPages, igAccounts, socialPostTargets, socialPosts,
  type SocialMedia, type SocialPost, type SocialPostTarget,
} from "@shared/schema";
import * as ig from "../instagram/instagram.service";
import { publishToPage } from "./facebook.service";

export const POST_TYPES = ["image", "carousel", "video", "reel", "story", "text"] as const;
export type PostType = (typeof POST_TYPES)[number];
export type Platform = "instagram" | "facebook";

export class PlannerError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

// ───────────── validation ─────────────

export function countHashtags(s: string) {
  return (String(s || "").match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

/** Final caption text for a platform: caption + hashtags on new lines. */
export function captionFor(post: Pick<SocialPost, "igCaption" | "igHashtags" | "fbCaption" | "fbHashtags">, platform: Platform) {
  const c = platform === "instagram" ? post.igCaption : post.fbCaption;
  const h = platform === "instagram" ? post.igHashtags : post.fbHashtags;
  return [String(c || "").trim(), normaliseTags(h)].filter(Boolean).join("\n\n");
}

export function normaliseTags(h?: string | null) {
  return String(h || "").split(/[\s,]+/).map((t) => t.trim()).filter(Boolean).map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ");
}

/** Problems that block publishing for this platform (empty = ok). */
export function validateFor(platform: Platform, p: { postType: string; media: SocialMedia[]; igCaption?: string | null; igHashtags?: string | null; fbCaption?: string | null; fbHashtags?: string | null; fbLink?: string | null }) {
  const errs: string[] = [];
  const imgs = p.media.filter((m) => m.kind === "image");
  const vids = p.media.filter((m) => m.kind === "video");
  if (platform === "instagram") {
    const text = captionFor(p as any, "instagram");
    if (text.length > 2200) errs.push("Instagram caption is over 2,200 characters.");
    if (countHashtags(text) > 30) errs.push("Instagram allows up to 30 hashtags.");
    switch (p.postType) {
      case "text": errs.push("Instagram needs a photo or video."); break;
      case "image": if (imgs.length !== 1 || vids.length) errs.push("Photo post: add exactly 1 image (use Carousel for more)."); break;
      case "carousel": if (p.media.length < 2 || p.media.length > 10) errs.push("Carousel: add 2 to 10 photos or videos."); break;
      case "video": case "reel":
        if (vids.length !== 1 || imgs.length) errs.push(`${p.postType === "reel" ? "Reel" : "Video"}: add exactly 1 video.`);
        else if (vids[0].duration && (vids[0].duration < 3 || vids[0].duration > 900)) errs.push("Instagram videos must be 3 seconds to 15 minutes long.");
        break;
      case "story": if (p.media.length !== 1) errs.push("Story: add exactly 1 photo or video."); break;
    }
  } else {
    const text = captionFor(p as any, "facebook");
    if (text.length > 63206) errs.push("Facebook post text is too long.");
    switch (p.postType) {
      case "story": errs.push("Stories are Instagram only here."); break;
      case "text": if (!text.trim() && !p.fbLink) errs.push("Facebook text post: write something or add a link."); break;
      case "image": case "carousel": if (!imgs.length || vids.length) errs.push("Facebook photo post: add 1 to 10 images."); break;
      case "video": case "reel": if (vids.length !== 1) errs.push("Facebook video / Reel: add exactly 1 video."); break;
    }
  }
  return errs;
}

// ───────────── post CRUD ─────────────

export interface TargetInput { platform: Platform; accountId: string; scheduledAt?: string | null }
export interface PostInput {
  mode: "instagram" | "facebook" | "both";
  postType: PostType;
  media: SocialMedia[];
  igCaption?: string | null; igHashtags?: string | null;
  fbCaption?: string | null; fbHashtags?: string | null; fbLink?: string | null;
  firstComment?: string | null; notes?: string | null;
  scheduledAt?: string | null;
  targets: TargetInput[];
  action: "draft" | "schedule" | "publish_now";
}

async function assertAccounts(ownerId: string, targets: TargetInput[]) {
  const igIds = targets.filter((t) => t.platform === "instagram").map((t) => t.accountId);
  const fbIds = targets.filter((t) => t.platform === "facebook").map((t) => t.accountId);
  if (igIds.length) {
    const rows = await db.select({ id: igAccounts.id }).from(igAccounts).where(and(eq(igAccounts.ownerId, ownerId), inArray(igAccounts.id, igIds)));
    if (rows.length !== new Set(igIds).size) throw new PlannerError("One of the Instagram accounts isn't connected to your account.");
  }
  if (fbIds.length) {
    const rows = await db.select({ id: fbPages.id }).from(fbPages).where(and(eq(fbPages.ownerId, ownerId), inArray(fbPages.id, fbIds)));
    if (rows.length !== new Set(fbIds).size) throw new PlannerError("One of the Facebook Pages isn't connected to your account.");
  }
}

function checkInput(i: PostInput) {
  const platforms = new Set(i.targets.map((t) => t.platform));
  if (i.mode === "instagram" && platforms.has("facebook")) throw new PlannerError("Instagram-only post can't include Facebook Pages.");
  if (i.mode === "facebook" && platforms.has("instagram")) throw new PlannerError("Facebook-only post can't include Instagram accounts.");
  if (i.action !== "draft") {
    if (!i.targets.length) throw new PlannerError("Choose at least one account or Page to publish to.");
    const problems: string[] = [];
    for (const pf of platforms) for (const e of validateFor(pf, i)) problems.push(e);
    if (problems.length) throw new PlannerError([...new Set(problems)].join(" "));
    if (i.action === "schedule") {
      for (const t of i.targets) {
        const at = t.scheduledAt || i.scheduledAt;
        if (!at) throw new PlannerError("Pick a date and time for every destination.");
        if (new Date(at).getTime() < Date.now() - 60_000) throw new PlannerError("Scheduled time is in the past. Pick a future time or use Publish now.");
      }
    }
  }
}

export async function refreshPostStatus(postId: string) {
  const ts = await db.select({ status: socialPostTargets.status }).from(socialPostTargets).where(eq(socialPostTargets.postId, postId));
  const s = ts.map((t) => t.status);
  let status = "draft";
  if (s.length) {
    if (s.every((x) => x === "published")) status = "published";
    else if (s.some((x) => x === "publishing")) status = "publishing";
    else if (s.some((x) => x === "failed") && s.some((x) => x === "published")) status = "partial";
    else if (s.some((x) => x === "failed")) status = "failed";
    else if (s.some((x) => x === "scheduled")) status = "scheduled";
    else if (s.some((x) => x === "published")) status = "partial";
  }
  await db.update(socialPosts).set({ status, updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  return status;
}

export async function savePost(ownerId: string, userId: string, i: PostInput, existingId?: string) {
  checkInput(i);
  await assertAccounts(ownerId, i.targets);
  const now = new Date();
  const fields = {
    mode: i.mode, postType: i.postType, media: i.media,
    igCaption: i.igCaption ?? null, igHashtags: i.igHashtags ?? null,
    fbCaption: i.fbCaption ?? null, fbHashtags: i.fbHashtags ?? null, fbLink: i.fbLink ?? null,
    firstComment: i.firstComment ?? null, notes: i.notes ?? null,
    scheduledAt: i.action === "publish_now" ? now : i.scheduledAt ? new Date(i.scheduledAt) : null,
    updatedAt: now,
  };
  return db.transaction(async (tx) => {
    let post: SocialPost;
    let keep: SocialPostTarget[] = [];
    if (existingId) {
      const [cur] = await tx.select().from(socialPosts).where(and(eq(socialPosts.id, existingId), eq(socialPosts.ownerId, ownerId))).for("update");
      if (!cur) throw new PlannerError("Post not found", 404);
      const old = await tx.select().from(socialPostTargets).where(eq(socialPostTargets.postId, cur.id));
      if (old.some((t) => t.status === "publishing")) throw new PlannerError("This post is publishing right now. Try again in a minute.", 409);
      keep = old.filter((t) => t.status === "published"); // published destinations are history, never re-sent
      await tx.delete(socialPostTargets).where(and(eq(socialPostTargets.postId, cur.id), sql`${socialPostTargets.status} <> 'published'`));
      [post] = await tx.update(socialPosts).set(fields).where(eq(socialPosts.id, cur.id)).returning();
    } else {
      [post] = await tx.insert(socialPosts).values({ ...fields, ownerId, createdBy: userId }).returning();
    }
    const done = new Set(keep.map((t) => `${t.platform}:${t.accountId}`));
    const rows = i.targets.filter((t) => !done.has(`${t.platform}:${t.accountId}`)).map((t) => ({
      postId: post.id, ownerId, platform: t.platform, accountId: t.accountId,
      scheduledAt: i.action === "publish_now" ? now : t.scheduledAt ? new Date(t.scheduledAt) : fields.scheduledAt,
      status: i.action === "draft" ? "draft" : "scheduled",
    }));
    if (rows.length) await tx.insert(socialPostTargets).values(rows);
    return post;
  }).then(async (post) => {
    await refreshPostStatus(post.id);
    if (i.action === "publish_now") setImmediate(() => processDueSocial().catch((e) => console.error("[Social] publish now", e)));
    return post;
  });
}

export async function reschedule(ownerId: string, postId: string, at: string, targetId?: string) {
  const when = new Date(at);
  if (isNaN(when.getTime())) throw new PlannerError("Invalid date");
  if (when.getTime() < Date.now() - 60_000) throw new PlannerError("Pick a future time.");
  const [post] = await db.select().from(socialPosts).where(and(eq(socialPosts.id, postId), eq(socialPosts.ownerId, ownerId))).limit(1);
  if (!post) throw new PlannerError("Post not found", 404);
  const cond = targetId ? and(eq(socialPostTargets.postId, postId), eq(socialPostTargets.id, targetId)) : eq(socialPostTargets.postId, postId);
  const updated = await db.update(socialPostTargets).set({ scheduledAt: when, updatedAt: new Date() })
    .where(and(cond, inArray(socialPostTargets.status, ["scheduled", "draft", "failed"]))).returning({ id: socialPostTargets.id });
  if (!targetId) await db.update(socialPosts).set({ scheduledAt: when, updatedAt: new Date() }).where(eq(socialPosts.id, postId));
  return { moved: updated.length };
}

export async function retryTarget(ownerId: string, targetId: string) {
  const [t] = await db.update(socialPostTargets).set({ status: "scheduled", scheduledAt: new Date(), stage: null, lastError: null, lockedAt: null, updatedAt: new Date() })
    .where(and(eq(socialPostTargets.id, targetId), eq(socialPostTargets.ownerId, ownerId), eq(socialPostTargets.status, "failed"))).returning();
  if (!t) throw new PlannerError("Only failed destinations can be retried.", 409);
  await refreshPostStatus(t.postId);
  setImmediate(() => processDueSocial().catch(() => {}));
  return t;
}

export async function cancelTarget(ownerId: string, targetId: string) {
  const [t] = await db.update(socialPostTargets).set({ status: "draft", updatedAt: new Date() })
    .where(and(eq(socialPostTargets.id, targetId), eq(socialPostTargets.ownerId, ownerId), inArray(socialPostTargets.status, ["scheduled", "failed"]))).returning();
  if (!t) throw new PlannerError("Only scheduled or failed destinations can be paused.", 409);
  await refreshPostStatus(t.postId);
  return t;
}

/** Posts (with destinations) overlapping a date range. */
export async function listPosts(ownerId: string, f: { from?: string; to?: string; platform?: string; status?: string }) {
  const tconds: any[] = [eq(socialPostTargets.ownerId, ownerId)];
  if (f.platform === "instagram" || f.platform === "facebook") tconds.push(eq(socialPostTargets.platform, f.platform));
  const posts = await db.select().from(socialPosts).where(and(
    eq(socialPosts.ownerId, ownerId),
    f.status && f.status !== "all" ? eq(socialPosts.status, f.status) : sql`TRUE`,
  )).orderBy(asc(socialPosts.scheduledAt)).limit(1000);
  if (!posts.length) return [];
  const targets = await db.select().from(socialPostTargets).where(and(...tconds, inArray(socialPostTargets.postId, posts.map((p) => p.id))));
  const [igs, fbs] = await Promise.all([
    db.select({ id: igAccounts.id, name: igAccounts.username, pic: igAccounts.profilePic }).from(igAccounts).where(eq(igAccounts.ownerId, ownerId)),
    db.select({ id: fbPages.id, name: fbPages.name, pic: fbPages.picture }).from(fbPages).where(eq(fbPages.ownerId, ownerId)),
  ]);
  const acct = new Map<string, any>([...igs.map((a) => [`instagram:${a.id}`, a] as const), ...fbs.map((a) => [`facebook:${a.id}`, a] as const)]);
  const from = f.from ? new Date(f.from).getTime() : -Infinity;
  const to = f.to ? new Date(f.to).getTime() : Infinity;
  return posts.map((p) => {
    const ts = targets.filter((t) => t.postId === p.id).map((t) => ({
      ...t, stage: undefined, accountName: acct.get(`${t.platform}:${t.accountId}`)?.name || "(disconnected)", accountPic: acct.get(`${t.platform}:${t.accountId}`)?.pic || null,
    }));
    return { ...p, targets: ts };
  }).filter((p) => {
    if (f.platform && f.platform !== "all" && !p.targets.length) return false;
    const times = [p.scheduledAt, ...p.targets.map((t) => t.publishedAt || t.scheduledAt)].filter(Boolean).map((d) => new Date(d as any).getTime());
    if (!times.length) return f.from ? false : true; // undated drafts only in the drafts list
    return times.some((x) => x >= from && x <= to);
  });
}

/** One post with its destinations (for the edit page). */
export async function getPost(ownerId: string, id: string) {
  const all = await listPosts(ownerId, {});
  const p = all.find((x) => x.id === id);
  if (!p) throw new PlannerError("Post not found", 404);
  return p;
}

// ───────────── publishing ─────────────

async function publicUrl(u: string) {
  if (/^https?:\/\//.test(u)) return u;
  const { appOrigin } = await import("../reseller/common");
  const base = (await appOrigin()) || process.env.APP_URL || "";
  if (!base) throw new PlannerError("Set PUBLIC_APP_URL so Instagram/Facebook can download your media.");
  return `${base.replace(/\/$/, "")}${u.startsWith("/") ? "" : "/"}${u}`;
}

async function withPublicMedia(media: SocialMedia[]) {
  return Promise.all(media.map(async (m) => ({ ...m, url: await publicUrl(m.url) })));
}

type Stage = { containers?: string[]; parent?: string | null; startedAt?: number };

async function igCreate(acc: any, post: SocialPost, media: SocialMedia[], caption: string): Promise<Stage> {
  const q = (extra: Record<string, string>) => ({ method: "POST", query: extra });
  const vid = (m: SocialMedia) => ({ video_url: m.url });
  switch (post.postType) {
    case "image": {
      const c = await ig.call(acc, "/me/media", q({ image_url: media[0].url, caption }));
      return { containers: [c.id], parent: c.id };
    }
    case "video": case "reel": {
      const c = await ig.call(acc, "/me/media", q({ media_type: "REELS", ...vid(media[0]), caption, share_to_feed: "true" }));
      return { containers: [c.id], parent: c.id };
    }
    case "story": {
      const m = media[0];
      const c = await ig.call(acc, "/me/media", q(m.kind === "video" ? { media_type: "STORIES", ...vid(m) } : { media_type: "STORIES", image_url: m.url }));
      return { containers: [c.id], parent: c.id };
    }
    case "carousel": {
      const kids: string[] = [];
      for (const m of media.slice(0, 10)) {
        const c = await ig.call(acc, "/me/media", q(m.kind === "video" ? { media_type: "VIDEO", ...vid(m), is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" }));
        kids.push(c.id);
      }
      return { containers: kids, parent: null };
    }
    default: throw new PlannerError("Instagram needs a photo or video.");
  }
}

async function containerStates(acc: any, ids: string[]) {
  const out: string[] = [];
  for (const id of ids) {
    const s = await ig.call(acc, `/${id}`, { query: { fields: "status_code,status" } });
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new PlannerError(`Instagram couldn't process the media: ${s.status || s.status_code}`);
    out.push(s.status_code || "FINISHED");
  }
  return out;
}

/** One step for an Instagram destination. Returns true when finished (published). */
async function stepInstagram(t: SocialPostTarget, post: SocialPost) {
  const [acc] = await db.select().from(igAccounts).where(eq(igAccounts.id, t.accountId)).limit(1);
  if (!acc) throw new PlannerError("Instagram account was disconnected.");
  if (acc.status !== "active") throw new PlannerError("Instagram connection expired — reconnect the account.");
  let stage = (t.stage || {}) as Stage;
  const caption = captionFor(post, "instagram");
  if (!stage.containers?.length) {
    const media = await withPublicMedia(post.media as SocialMedia[]);
    stage = { ...(await igCreate(acc, post, media, caption)), startedAt: Date.now() };
    await db.update(socialPostTargets).set({ stage, status: "publishing", updatedAt: new Date() }).where(eq(socialPostTargets.id, t.id));
  }
  if (Date.now() - (stage.startedAt || Date.now()) > 45 * 60_000) throw new PlannerError("Instagram took too long to process the video. Try a smaller MP4 (H.264, 1080×1920).");

  // carousel: children first, then the parent
  const kidStates = await containerStates(acc, stage.containers!);
  if (kidStates.some((s) => s !== "FINISHED")) return false;
  if (!stage.parent) {
    const parent = await ig.call(acc, "/me/media", { method: "POST", query: { media_type: "CAROUSEL", children: stage.containers!.join(","), caption } });
    stage = { ...stage, parent: parent.id };
    await db.update(socialPostTargets).set({ stage, updatedAt: new Date() }).where(eq(socialPostTargets.id, t.id));
    const [ps] = await containerStates(acc, [parent.id]);
    if (ps !== "FINISHED") return false;
  } else if (stage.parent !== stage.containers![0]) {
    const [ps] = await containerStates(acc, [stage.parent]);
    if (ps !== "FINISHED") return false;
  }
  const pub = await ig.call(acc, "/me/media_publish", { method: "POST", query: { creation_id: stage.parent! } });
  let permalink: string | null = null;
  try { permalink = (await ig.call(acc, `/${pub.id}`, { query: { fields: "permalink" } })).permalink || null; } catch { /* stories have none */ }
  if (post.firstComment?.trim() && post.postType !== "story") {
    try { await ig.call(acc, `/${pub.id}/comments`, { method: "POST", query: { message: post.firstComment.trim().slice(0, 2200) } }); }
    catch (e) { console.warn("[Social] first comment failed", (e as Error).message); }
  }
  await db.update(socialPostTargets).set({ status: "published", remoteId: String(pub.id), permalink, publishedAt: new Date(), lastError: null, stage: null, lockedAt: null, updatedAt: new Date() })
    .where(eq(socialPostTargets.id, t.id));
  return true;
}

async function stepFacebook(t: SocialPostTarget, post: SocialPost) {
  const [page] = await db.select().from(fbPages).where(eq(fbPages.id, t.accountId)).limit(1);
  if (!page) throw new PlannerError("Facebook Page was disconnected.");
  if (page.status !== "active") throw new PlannerError("Facebook Page connection expired — reconnect it.");
  await db.update(socialPostTargets).set({ status: "publishing", updatedAt: new Date() }).where(eq(socialPostTargets.id, t.id));
  const r = await publishToPage(page, { postType: post.postType, media: await withPublicMedia(post.media as SocialMedia[]), message: captionFor(post, "facebook"), link: post.fbLink });
  await db.update(socialPostTargets).set({ status: "published", remoteId: r.remoteId, permalink: r.permalink || null, publishedAt: new Date(), lastError: null, lockedAt: null, updatedAt: new Date() })
    .where(eq(socialPostTargets.id, t.id));
  return true;
}

let running = false;
/** Cron: publish due destinations and continue Instagram ones still processing. */
export async function processDueSocial(limit = 25): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const claimed = await db.execute(sql`
      UPDATE social_post_targets SET locked_at = now(), attempts = attempts + CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END
      WHERE id IN (
        SELECT id FROM social_post_targets
        WHERE ((status = 'scheduled' AND scheduled_at <= now()) OR status = 'publishing')
          AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
        ORDER BY scheduled_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
      ) RETURNING id`);
    const ids: string[] = ((claimed as any).rows || claimed).map((r: any) => r.id);
    let done = 0;
    for (const id of ids) {
      const [t] = await db.select().from(socialPostTargets).where(eq(socialPostTargets.id, id)).limit(1);
      if (!t) continue;
      const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, t.postId)).limit(1);
      if (!post) continue;
      try {
        const finished = t.platform === "instagram" ? await stepInstagram(t, post) : await stepFacebook(t, post);
        if (finished) done++;
        else await db.update(socialPostTargets).set({ lockedAt: null }).where(eq(socialPostTargets.id, t.id));
      } catch (e) {
        const raw = (e as Error).message || "Publishing failed";
        const network = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(raw) || (e as any)?.code === 2 || (e as any)?.code === 4;
        const where = t.platform === "instagram" ? "Instagram" : "Facebook";
        const msg = network ? `Couldn't reach ${where} right now.` : raw;
        if (network && t.attempts < 3) {
          // temporary problem: try again in 5 minutes (keeps any container already created)
          await db.update(socialPostTargets).set({ status: t.status === "publishing" ? "publishing" : "scheduled", scheduledAt: new Date(Date.now() + 5 * 60_000), lastError: `${msg} Retrying automatically.`, lockedAt: null, updatedAt: new Date() })
            .where(eq(socialPostTargets.id, t.id));
          await refreshPostStatus(post.id);
          continue;
        }
        await db.update(socialPostTargets).set({ status: "failed", lastError: msg.slice(0, 1000), stage: null, lockedAt: null, updatedAt: new Date() })
          .where(eq(socialPostTargets.id, t.id));
        try {
          const { notifyUsers } = await import("../reseller/common");
          await notifyUsers([post.ownerId], { title: "Post not published", message: `${t.platform === "instagram" ? "Instagram" : "Facebook"}: ${msg}`.slice(0, 300), type: "social_post_failed" });
        } catch { /* ignore */ }
      }
      await refreshPostStatus(post.id);
    }
    return done;
  } finally {
    running = false;
  }
}

// ───────────── AI captions (text only) ─────────────

export async function aiCaptions(ownerId: string, input: { brief: string; platforms: Platform[]; tone?: string; language?: string; postType?: string; current?: { instagram?: string; facebook?: string } }) {
  const { chatComplete } = await import("../../utils/ai-provider");
  const { resolveSetting, extractJson } = await import("../ai-template.service");
  const { channels } = await import("@shared/schema");
  const [ch] = await db.select({ id: channels.id }).from(channels).where(eq(channels.createdBy, ownerId)).limit(1);
  const setting = await resolveSetting(ch?.id);
  if (!setting) throw new PlannerError("No AI key found. Add a Gemini API key in Settings → AI Assistant.");
  const want = input.platforms.length ? input.platforms : ["instagram"];
  const sys = `You write social media captions for small businesses. You only write text — never describe or create images.
Return ONLY JSON: {${want.map((p) => `"${p}":{"caption":"","hashtags":[""]}`).join(",")}}
Instagram: hook in the first line, 1-3 short paragraphs, 2-4 emojis, a clear call to action (e.g. "Comment SHOP" or "DM us"), max 1,800 characters. 12-20 relevant hashtags mixing popular and niche, no spaces inside a tag, never banned or misleading tags.
Facebook: conversational, 1-2 short paragraphs, fewer emojis, a question or call to action; 2-5 hashtags.
Write in the requested language (Hinglish = Hindi in Latin letters mixed with English). No false claims, no prices unless given. Hashtags without spaces; include the # sign.`;
  const user = `Post type: ${input.postType || "image"}\nTone: ${input.tone || "friendly"}\nLanguage: ${input.language || "English"}\nWhat the post is about: ${input.brief}${input.current?.instagram ? `\nCurrent Instagram draft (improve it): ${input.current.instagram}` : ""}${input.current?.facebook ? `\nCurrent Facebook draft (improve it): ${input.current.facebook}` : ""}`;
  const text = await chatComplete(setting, [{ role: "system", content: sys }, { role: "user", content: user }], { maxTokens: 2000, temperature: 0.8 });
  const j = extractJson(text);
  if (!j) throw new PlannerError("AI didn't return a caption, try again.");
  const out: Record<string, { caption: string; hashtags: string }> = {};
  for (const p of want) {
    const v = j[p] || {};
    const tags = (Array.isArray(v.hashtags) ? v.hashtags : String(v.hashtags || "").split(/[\s,]+/))
      .map((t: string) => String(t).trim().replace(/\s+/g, "")).filter(Boolean).map((t: string) => (t.startsWith("#") ? t : `#${t}`));
    out[p] = { caption: String(v.caption || "").trim().slice(0, p === "instagram" ? 2000 : 5000), hashtags: [...new Set(tags)].slice(0, p === "instagram" ? 30 : 10).join(" ") };
  }
  return out;
}

