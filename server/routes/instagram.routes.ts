/**
 * Instagram: connect, profile & insights, posts/reels, comments, publishing,
 * comment → DM automations, DM inbox, webhook.
 */
import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertPlan, remaining } from "../services/plan-gate";
import { db } from "../db";
import { igAccounts, igCommentEvents, igCommentRules, igMessages, igThreads } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import * as ig from "../services/instagram/instagram.service";
import { appOrigin } from "../services/reseller/common";

const originOf = async (req: Request) => (await appOrigin()) || `${req.protocol}://${req.get("host")}`;

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e instanceof ig.IgError || e?.status) return res.status(e.status || 400).json({ error: e.message, code: e.code });
    console.error("[Instagram]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
const redirectUri = async (req: Request) => `${await originOf(req)}/api/instagram/oauth/callback`;
const acc = (req: Request) => ig.ownedAccount(owner(req), req.params.accountId);

const ruleSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  mediaId: z.string().trim().max(40).optional().nullable(),
  mediaThumb: z.string().trim().max(2000).optional().nullable(),
  mediaCaption: z.string().trim().max(2200).optional().nullable(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(20),
  matchMode: z.enum(["contains", "exact"]).default("contains"),
  publicReplies: z.array(z.string().trim().max(300)).max(5).default([]),
  dmText: z.string().trim().min(1, "Write the DM").max(900),
  dmButtonText: z.string().trim().max(20).optional().nullable(),
  dmButtonUrl: z.string().trim().max(2000).refine((u) => !u || /^https:\/\//.test(u), "Button link must start with https://").optional().nullable(),
  oncePerUser: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export function registerInstagramRoutes(app: Express) {
  // ── webhook (Meta → us). Path under /api/webhooks so CSRF skips it ──
  app.get("/api/webhooks/instagram", async (req, res) => {
    try {
      const { verifyToken } = await ig.igApp();
      if (req.query["hub.mode"] === "subscribe" && verifyToken && req.query["hub.verify_token"] === verifyToken) {
        return res.status(200).send(String(req.query["hub.challenge"] || ""));
      }
    } catch { /* not configured */ }
    res.sendStatus(403);
  });

  app.post("/api/webhooks/instagram", async (req, res) => {
    try {
      const { secret } = await ig.igApp();
      if (!ig.verifySignature((req as any).rawBody, req.get("x-hub-signature-256"), secret)) return res.sendStatus(401);
    } catch { return res.sendStatus(503); }
    res.sendStatus(200); // reply fast, process after
    ig.processWebhook(req.body).catch((e) => console.error("[Instagram] webhook", e));
  });

// ── connect ──
app.get("/api/instagram/connect", requireAuth, wrap(async (req, res) => {
  console.log("[Instagram] Connect request received");

  if ((await remaining(owner(req), "instagramAccounts")) <= 0) {
    const needsReconnect = (await ig.listAccounts(owner(req)))
      .some((a: any) => a.status !== "active");

    if (!needsReconnect) await assertPlan(owner(req), "instagramAccounts");
  }

  const redirect = await redirectUri(req);
  console.log("[Instagram] Redirect URI:", redirect);

  const url = await ig.authorizeUrl(owner(req), redirect);
  console.log("[Instagram] Generated OAuth URL:", url);

  res.json({ url });
}));

  app.get("/api/instagram/oauth/callback", async (req, res) => {
    const back = (q: string) => res.redirect(`/instagram?${q}`);
    if (req.query.error) return back(`error=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
    try {
      const a = await ig.completeOAuth(String(req.query.code || ""), String(req.query.state || ""), await redirectUri(req));
      ig.syncConversations(a).catch(() => {});
      back(`connected=${encodeURIComponent(a.username)}`);
    } catch (e: any) {
      back(`error=${encodeURIComponent(e?.message || "Couldn't connect Instagram")}`);
    }
  });

  app.get("/api/instagram/status", requireAuth, wrap(async (_req, res) => {
    try { await ig.igApp(); res.json({ configured: true }); } catch { res.json({ configured: false }); }
  }));

  app.get("/api/instagram/accounts", requireAuth, wrap(async (req, res) => {
    res.json({ data: await ig.listAccounts(owner(req)) });
  }));

  app.delete("/api/instagram/accounts/:accountId", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    await db.delete(igAccounts).where(eq(igAccounts.id, a.id));
    res.json({ success: true });
  }));

  app.post("/api/instagram/accounts/:accountId/sync", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const profile = await ig.syncProfile(a);
    const chats = await ig.syncConversations(a).catch(() => 0);
    res.json({ data: profile, chats });
  }));

  app.get("/api/instagram/accounts/:accountId/insights", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const days = Math.min(Math.max(Number(req.query.days) || 28, 1), 90);
    res.json({ data: await ig.accountInsights(a, days), days });
  }));

  // ── posts / reels ──
  app.get("/api/instagram/accounts/:accountId/media", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json(await ig.listMedia(a, req.query.after ? String(req.query.after) : undefined));
  }));

  app.get("/api/instagram/accounts/:accountId/media/:mediaId/insights", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await ig.mediaInsights(a, req.params.mediaId, String(req.query.type || "")) });
  }));

  app.get("/api/instagram/accounts/:accountId/media/:mediaId/comments", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await ig.listComments(a, req.params.mediaId) });
  }));

  app.post("/api/instagram/accounts/:accountId/comments/:commentId/reply", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const { message } = z.object({ message: z.string().trim().min(1).max(2200) }).parse(req.body);
    res.json({ data: await ig.replyToComment(a, req.params.commentId, message) });
  }));

  app.post("/api/instagram/accounts/:accountId/comments/:commentId/dm", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const { message } = z.object({ message: z.string().trim().min(1).max(900) }).parse(req.body);
    res.json({ data: await ig.privateReply(a, req.params.commentId, message) });
  }));

  app.post("/api/instagram/accounts/:accountId/comments/:commentId/hide", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await ig.hideComment(a, req.params.commentId, req.body?.hide !== false) });
  }));

  app.delete("/api/instagram/accounts/:accountId/comments/:commentId", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await ig.deleteComment(a, req.params.commentId) });
  }));

  app.post("/api/instagram/accounts/:accountId/publish", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const b = z.object({
      kind: z.enum(["image", "reel"]),
      url: z.string().trim().url("Enter a public https link").refine((u) => u.startsWith("https://"), "Link must start with https://"),
      caption: z.string().max(2200).optional(),
    }).parse(req.body);
    res.json({ data: await ig.publish(a, b) });
  }));

  // ── comment → DM automations ──
  app.get("/api/instagram/accounts/:accountId/rules", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await db.select().from(igCommentRules).where(eq(igCommentRules.accountId, a.id)).orderBy(desc(igCommentRules.createdAt)) });
  }));

  app.post("/api/instagram/accounts/:accountId/rules", requireAuth, wrap(async (req, res) => {
    await assertPlan(owner(req), "instagramAutomation");
    const a = await acc(req);
    const b = ruleSchema.parse(req.body);
    if (!!b.dmButtonText !== !!b.dmButtonUrl) return res.status(400).json({ error: "Add both the button text and its link, or neither" });
    const [row] = await db.insert(igCommentRules).values({ ...b, accountId: a.id } as any).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/instagram/accounts/:accountId/rules/:ruleId", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const b = ruleSchema.parse(req.body);
    if (!!b.dmButtonText !== !!b.dmButtonUrl) return res.status(400).json({ error: "Add both the button text and its link, or neither" });
    const [row] = await db.update(igCommentRules).set({ ...b, updatedAt: new Date() } as any)
      .where(and(eq(igCommentRules.id, req.params.ruleId), eq(igCommentRules.accountId, a.id))).returning();
    if (!row) return res.status(404).json({ error: "Automation not found" });
    res.json({ data: row });
  }));

  app.patch("/api/instagram/accounts/:accountId/rules/:ruleId/active", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const [row] = await db.update(igCommentRules).set({ isActive: !!req.body?.isActive, updatedAt: new Date() })
      .where(and(eq(igCommentRules.id, req.params.ruleId), eq(igCommentRules.accountId, a.id))).returning();
    res.json({ data: row });
  }));

  app.delete("/api/instagram/accounts/:accountId/rules/:ruleId", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    await db.delete(igCommentRules).where(and(eq(igCommentRules.id, req.params.ruleId), eq(igCommentRules.accountId, a.id)));
    res.json({ success: true });
  }));

  app.get("/api/instagram/accounts/:accountId/activity", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await db.select().from(igCommentEvents).where(eq(igCommentEvents.accountId, a.id)).orderBy(desc(igCommentEvents.createdAt)).limit(100) });
  }));

  // ── DM inbox ──
  app.get("/api/instagram/accounts/:accountId/threads", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    res.json({ data: await db.select().from(igThreads).where(eq(igThreads.accountId, a.id)).orderBy(sql`${igThreads.lastMessageAt} DESC NULLS LAST`).limit(200) });
  }));

  app.get("/api/instagram/accounts/:accountId/threads/:threadId/messages", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const [t] = await db.select().from(igThreads).where(and(eq(igThreads.id, req.params.threadId), eq(igThreads.accountId, a.id))).limit(1);
    if (!t) return res.status(404).json({ error: "Chat not found" });
    await db.update(igThreads).set({ unread: 0 }).where(eq(igThreads.id, t.id));
    const rows = await db.select().from(igMessages).where(eq(igMessages.threadId, t.id)).orderBy(asc(igMessages.createdAt)).limit(300);
    const open = !!t.lastIncomingAt && Date.now() - new Date(t.lastIncomingAt).getTime() < 24 * 3600_000;
    res.json({ thread: t, data: rows, canReply: open });
  }));

  app.post("/api/instagram/accounts/:accountId/threads/:threadId/reply", requireAuth, wrap(async (req, res) => {
    const a = await acc(req);
    const { text } = z.object({ text: z.string().trim().min(1).max(1000) }).parse(req.body);
    const [t] = await db.select().from(igThreads).where(and(eq(igThreads.id, req.params.threadId), eq(igThreads.accountId, a.id))).limit(1);
    if (!t) return res.status(404).json({ error: "Chat not found" });
    res.json({ data: await ig.sendDm(a, t.igsid, text) });
  }));
}
