/** Super admin: platform WhatsApp messages (onboarding templates) and background queue health. */
import type { Express, NextFunction, Request, Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { channels, messageQueue, resellerCustomers, templates, users } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  PLATFORM_EVENTS, PLATFORM_TOKENS, customerContext, getPlatformSettings, recentPlatformLogs, savePlatformSettings, sendPlatformMessage, templateSlots, type PlatformEvent,
} from "../services/platform-whatsapp.service";

const superOnly = (req: Request, res: Response, next: NextFunction) =>
  ((req.session as any)?.user?.role === "superadmin" ? next() : res.status(403).json({ error: "Forbidden" }));
const uid = (req: Request) => (req.session as any)?.user?.id as string;
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    const status = e?.status || 500;
    if (status >= 500) console.error("[PlatformAdmin]", e);
    res.status(status).json({ error: status >= 500 && !e?.metaErrorCode ? "Something went wrong" : e.message });
  }
};

const tokenEnum = z.enum(Object.keys(PLATFORM_TOKENS) as [string, ...string[]]);
const eventCfg = z.object({
  enabled: z.boolean().optional(),
  templateName: z.string().max(200).optional().nullable(),
  language: z.string().max(20).optional().nullable(),
  body: z.array(tokenEnum).max(20).optional(),
  header: tokenEnum.optional().nullable(),
  button: tokenEnum.optional().nullable(),
});

const SAMPLE = {
  customer_name: "Rahul Sharma", business_name: "Sharma Traders", customer_email: "rahul@example.com", reseller_name: "Test Business",
  reseller_contact: "Amit", reseller_phone: "+91 98765 43210", plan_name: "Enterprise", plan_end_date: "24 Nov 2027",
  activation_link: "https://example.com/accept-invite?token=demo", payment_link: "https://example.com/pay/demo", login_url: "https://example.com/login", platform_name: "HoverChat",
};

export function registerPlatformAdminRoutes(app: Express) {
  const SA = [requireAuth, superOnly];

  app.get("/api/admin/platform-whatsapp", ...SA, wrap(async (_req, res) => {
    const settings = await getPlatformSettings();
    const chans = await db.select({ id: channels.id, name: channels.name, phoneNumber: channels.phoneNumber, isActive: channels.isActive })
      .from(channels).orderBy(asc(channels.name));
    res.json({ settings, channels: chans, events: PLATFORM_EVENTS, tokens: PLATFORM_TOKENS, sample: SAMPLE, logs: await recentPlatformLogs(30) });
  }));

  app.get("/api/admin/platform-whatsapp/templates", ...SA, wrap(async (req, res) => {
    const channelId = String(req.query.channelId || "");
    if (!channelId) return res.json([]);
    const rows = await db.select().from(templates)
      .where(and(eq(templates.channelId, channelId), sql`lower(${templates.status}) = 'approved'`)).orderBy(asc(templates.name));
    res.json(rows.map((t: any) => ({ name: t.name, language: t.language, category: t.category, header: t.header, body: t.body, footer: t.footer, buttons: t.buttons, slots: templateSlots(t) })));
  }));

  app.put("/api/admin/platform-whatsapp", ...SA, wrap(async (req, res) => {
    const body = z.object({
      enabled: z.boolean(),
      channelId: z.string().max(60).nullable(),
      events: z.record(z.enum(Object.keys(PLATFORM_EVENTS) as [string, ...string[]]), eventCfg),
    }).parse(req.body);
    res.json(await savePlatformSettings(body as any, uid(req)));
  }));

  /** Send the event's template to any number with sample values (works even when the event is off). */
  app.post("/api/admin/platform-whatsapp/test", ...SA, wrap(async (req, res) => {
    const b = z.object({ event: z.enum(Object.keys(PLATFORM_EVENTS) as [string, ...string[]]), to: z.string().min(8).max(20) }).parse(req.body);
    res.json(await sendPlatformMessage(b.event as PlatformEvent, { ...SAMPLE, userId: uid(req) }, { trigger: "test", to: b.to }));
  }));

  /** Manual "Send WhatsApp welcome" for a reseller's customer (fresh activation link if not activated yet). */
  app.post("/api/admin/resellers/customers/:customerId/whatsapp-welcome", ...SA, wrap(async (req, res) => {
    const id = String(req.params.customerId);
    const [m] = await db.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, id)).limit(1);
    if (!m) return res.status(404).json({ error: "Customer not found" });
    const [u] = await db.select({ verified: users.isEmailVerified, email: users.email, firstName: users.firstName }).from(users).where(eq(users.id, id)).limit(1);
    const extra: Record<string, string> = {};
    if (u && u.verified === false) {
      const { issueToken } = await import("../services/reseller/invitations.service");
      const { appOrigin } = await import("../services/reseller/common");
      const token = await issueToken(db, id, "customer_invite", uid(req));
      extra.activation_link = `${await appOrigin()}/accept-invite?token=${encodeURIComponent(token)}`;
    }
    const ctx = await customerContext(id, extra);
    res.json(await sendPlatformMessage("customer_onboarded", ctx, { trigger: "manual", to: typeof req.body?.to === "string" && req.body.to ? req.body.to : undefined }));
  }));

  // ───────────── queues ─────────────
  app.get("/api/admin/queues", ...SA, wrap(async (_req, res) => {
    const { MessageQueueService } = await import("../services/message-queue");
    const { jobStats, recentFailed } = await import("../services/jobs/queue");
    const { countBullWorkers } = await import("../services/bull-queue");
    const { isRedisAvailable } = await import("../services/redis");
    const [messages, jobs, failed, workers] = await Promise.all([MessageQueueService.getQueueStats(), jobStats(), recentFailed(20), countBullWorkers()]);
    const [stuck] = await db.select({ n: sql<number>`count(*)::int` }).from(messageQueue)
      .where(sql`${messageQueue.status} = 'queued' AND ${messageQueue.createdAt} < NOW() - INTERVAL '10 minutes'`);
    res.json({
      redisUrlSet: !!process.env.REDIS_URL,
      // workers are counted across all instances, so this is right whichever PM2 worker answers
      engine: workers > 0 ? "bullmq" : isRedisAvailable() ? "bullmq-no-worker" : "db-polling",
      messageWorkers: workers,
      instance: process.env.NODE_APP_INSTANCE ?? "main",
      messages, stuckQueued: stuck?.n ?? 0, jobs, failed,
      limits: {
        messages: { concurrency: Number(process.env.BULLMQ_CONCURRENCY || 10), perSecond: Number(process.env.BULLMQ_RATE_MAX || 50) },
        email: { concurrency: Number(process.env.EMAIL_CONCURRENCY || 3), perSecond: Number(process.env.EMAIL_RATE_PER_SEC || 5) },
        jobs: { concurrency: Number(process.env.JOBS_CONCURRENCY || 5), perSecond: Number(process.env.JOBS_RATE_PER_SEC || 20) },
      },
    });
  }));

  app.post("/api/admin/queues/retry-failed", ...SA, wrap(async (req, res) => {
    const { retryFailed } = await import("../services/jobs/queue");
    res.json({ retried: await retryFailed(typeof req.body?.queue === "string" ? req.body.queue : undefined) });
  }));

  /** Push rows stuck in "queued" into BullMQ now (normally the leader does this every minute). */
  app.post("/api/admin/queues/requeue-messages", ...SA, wrap(async (_req, res) => {
    const { MessageQueueService } = await import("../services/message-queue");
    const { countBullWorkers } = await import("../services/bull-queue");
    if ((await countBullWorkers()) === 0) return res.status(409).json({ error: "No BullMQ worker is running — messages are being sent by DB polling (or the app needs a restart)." });
    res.json({ requeued: await MessageQueueService.reconcileQueuedMessagesToBull() });
  }));
}
