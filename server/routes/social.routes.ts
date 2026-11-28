/**
 * Social content planner (Instagram + Facebook Pages):
 * accounts, Facebook Page connect, media upload, posts CRUD, reschedule, retry, AI captions.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { allowanceFor, assertPlan, remaining } from "../services/plan-gate";
import { db } from "../db";
import { fbPages, socialPosts } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { appOrigin } from "../services/reseller/common";
import * as fb from "../services/social/facebook.service";
import * as planner from "../services/social/planner.service";
import { processUpload } from "../services/social/media.service";
import { listAccounts } from "../services/instagram/instagram.service";

const me = (req: Request) => (req.session as any)?.user as { id: string; role: string; createdBy?: string };
const owner = (req: Request) => { const u = me(req); return u?.role === "team" && u.createdBy ? u.createdBy : u?.id; };
const originOf = async (req: Request) => (await appOrigin()) || `${req.protocol}://${req.get("host")}`;
const fbRedirect = async (req: Request) => `${await originOf(req)}/api/social/facebook/oauth/callback`;

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e?.status) return res.status(e.status).json({ error: e.message });
    console.error("[Social]", e); res.status(500).json({ error: e?.message || "Something went wrong" });
  }
};

const uploader = multer({
  storage: multer.diskStorage({
    destination: (req, _f, cb) => {
      const dir = path.join("uploads", "social", String(owner(req) || "guest").replace(/[^a-zA-Z0-9_-]/g, ""));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_r, f, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(f.originalname).toLowerCase().slice(0, 6) || ".bin"}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 10 },
  fileFilter: (_r, f, cb) => cb(null, /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm|x-m4v))$/i.test(f.mimetype)),
});

const media = z.object({
  url: z.string().min(1).max(2000), kind: z.enum(["image", "video"]), mime: z.string().optional(), size: z.number().optional(),
  width: z.number().optional(), height: z.number().optional(), duration: z.number().optional(), thumbUrl: z.string().max(2000).optional(), name: z.string().max(200).optional(),
});
const iso = z.string().refine((v) => !isNaN(new Date(v).getTime()), "Invalid date").nullable().optional();
const postSchema = z.object({
  mode: z.enum(["instagram", "facebook", "both"]),
  postType: z.enum(planner.POST_TYPES),
  media: z.array(media).max(10).default([]),
  igCaption: z.string().max(5000).nullable().optional(),
  igHashtags: z.string().max(2000).nullable().optional(),
  fbCaption: z.string().max(63000).nullable().optional(),
  fbHashtags: z.string().max(2000).nullable().optional(),
  fbLink: z.string().max(2000).refine((v) => !v || /^https?:\/\//.test(v), "Link must start with http(s)://").nullable().optional(),
  firstComment: z.string().max(2200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  scheduledAt: iso,
  targets: z.array(z.object({ platform: z.enum(["instagram", "facebook"]), accountId: z.string().min(1), scheduledAt: iso })).max(30).default([]),
  action: z.enum(["draft", "schedule", "publish_now"]),
});

export function registerSocialRoutes(app: Express) {
  // ── accounts ──
  app.get("/api/social/accounts", requireAuth, wrap(async (req, res) => {
    let fbConfigured = true;
    try { const { fbApp } = await import("../services/ads/ads.service"); await fbApp(); } catch { fbConfigured = false; }
    const lim = async (f: "instagramAccounts" | "facebookPages") => {
      const r = await allowanceFor(owner(req), f).catch(() => null);
      return r ? { limit: r.limit ?? (r.allowed ? "unlimited" : 0), reason: r.allowed ? null : r.code } : null;
    };
    res.json({ instagram: await listAccounts(owner(req)), facebook: await fb.listPages(owner(req)), fbConfigured,
      limits: { instagram: await lim("instagramAccounts"), facebook: await lim("facebookPages") } });
  }));

  app.get("/api/social/facebook/connect", requireAuth, wrap(async (req, res) => {
    if ((await remaining(owner(req), "facebookPages")) <= 0) {
      const needsReconnect = (await fb.listPages(owner(req))).some((p: any) => p.status !== "active");
      if (!needsReconnect) await assertPlan(owner(req), "facebookPages");
    }
    res.json({ url: await fb.authorizeUrl(owner(req), await fbRedirect(req)) });
  }));

  app.get("/api/social/facebook/oauth/callback", async (req, res) => {
    const back = (q: string) => res.redirect(`/content-planner?tab=accounts&${q}`);
    if (req.query.error) return back(`error=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
    try {
      const pages = await fb.completeOAuth(String(req.query.code || ""), String(req.query.state || ""), await fbRedirect(req));
      const sk = (pages as any).skipped as string[] | undefined;
      back(`fbConnected=${pages.length}${sk?.length ? `&fbSkipped=${sk.length}` : ""}`);
    } catch (e: any) { back(`error=${encodeURIComponent(e?.message || "Couldn't connect Facebook")}`); }
  });

  app.post("/api/social/facebook/pages/:id/sync", requireAuth, wrap(async (req, res) => {
    res.json({ data: await fb.syncPage(await fb.ownedPage(owner(req), req.params.id)) });
  }));

  app.delete("/api/social/facebook/pages/:id", requireAuth, wrap(async (req, res) => {
    const p = await fb.ownedPage(owner(req), req.params.id);
    await db.delete(fbPages).where(eq(fbPages.id, p.id));
    res.json({ success: true });
  }));

  // ── media ──
  app.post("/api/social/upload", requireAuth, uploader.array("files", 10), wrap(async (req, res) => {
    const files = ((req as any).files || []) as Express.Multer.File[];
    if (!files.length) return res.status(400).json({ error: "Choose JPG/PNG photos or MP4/MOV videos." });
    const out = [], errors: string[] = [];
    for (const f of files) {
      try { out.push(await processUpload(f, owner(req))); } catch (e) { errors.push((e as Error).message); }
    }
    if (!out.length) return res.status(400).json({ error: errors.join(" ") });
    res.json({ data: out, errors });
  }));

  // ── posts ──
  app.get("/api/social/posts", requireAuth, wrap(async (req, res) => {
    res.json({ data: await planner.listPosts(owner(req), {
      from: req.query.from as string | undefined, to: req.query.to as string | undefined,
      platform: req.query.platform as string | undefined, status: req.query.status as string | undefined,
    }) });
  }));

  app.get("/api/social/posts/:id", requireAuth, wrap(async (req, res) => {
    res.json({ data: await planner.getPost(owner(req), req.params.id) });
  }));

  app.post("/api/social/posts", requireAuth, wrap(async (req, res) => {
    await assertPlan(owner(req), "contentPlanner");
    const b = postSchema.parse(req.body) as planner.PostInput;
    res.status(201).json({ data: await planner.savePost(owner(req), me(req).id, b) });
  }));

  app.put("/api/social/posts/:id", requireAuth, wrap(async (req, res) => {
    const b = postSchema.parse(req.body) as planner.PostInput;
    res.json({ data: await planner.savePost(owner(req), me(req).id, b, req.params.id) });
  }));

  app.patch("/api/social/posts/:id/reschedule", requireAuth, wrap(async (req, res) => {
    const b = z.object({ scheduledAt: z.string(), targetId: z.string().optional() }).parse(req.body);
    res.json(await planner.reschedule(owner(req), req.params.id, b.scheduledAt, b.targetId));
  }));

  app.delete("/api/social/posts/:id", requireAuth, wrap(async (req, res) => {
    const r = await db.delete(socialPosts).where(and(eq(socialPosts.id, req.params.id), eq(socialPosts.ownerId, owner(req)))).returning({ id: socialPosts.id });
    if (!r.length) return res.status(404).json({ error: "Post not found" });
    res.json({ success: true });
  }));

  app.post("/api/social/targets/:id/retry", requireAuth, wrap(async (req, res) => {
    res.json({ data: await planner.retryTarget(owner(req), req.params.id) });
  }));

  app.post("/api/social/targets/:id/pause", requireAuth, wrap(async (req, res) => {
    res.json({ data: await planner.cancelTarget(owner(req), req.params.id) });
  }));

  app.post("/api/social/ai/caption", requireAuth, wrap(async (req, res) => {
    const b = z.object({
      brief: z.string().trim().min(3, "Tell the AI what the post is about").max(1000),
      platforms: z.array(z.enum(["instagram", "facebook"])).min(1).max(2),
      tone: z.string().max(40).optional(), language: z.string().max(30).optional(), postType: z.string().max(20).optional(),
      current: z.object({ instagram: z.string().max(3000).optional(), facebook: z.string().max(3000).optional() }).optional(),
    }).parse(req.body);
    res.json({ data: await planner.aiCaptions(owner(req), b) });
  }));
}
