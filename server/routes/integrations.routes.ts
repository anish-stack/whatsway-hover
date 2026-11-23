import type { Express, Request, Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { channels, integrationRules, integrations, templates } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import {
  EVENTS, INTEGRATION_TYPES, OUTBOUND_EVENTS, appsScript, handleInbound, newToken, recentLogs,
  sendTemplateFromIntegration, normalizePhone, type IntegrationType,
} from "../services/integrations/integrations.service";

function ownerOf(req: Request): string | null {
  const u = (req.session as any)?.user;
  if (!u) return null;
  return u.role === "team" && u.createdBy ? u.createdBy : u.id;
}

function baseUrl(req: Request) {
  return (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
}

function present(req: Request, it: any) {
  const cfg = { ...(it.config || {}) };
  const hookUrl = `${baseUrl(req)}/api/webhooks/integrations/${it.id}/${it.token}`;
  return {
    ...it,
    token: undefined,
    hookUrl,
    config: { ...cfg, signingSecret: cfg.signingSecret ? "••••••" + String(cfg.signingSecret).slice(-4) : "" },
    hasSigningSecret: !!cfg.signingSecret,
    appsScript: it.type === "google_sheets" ? appsScript(hookUrl) : undefined,
  };
}

const configSchema = z.object({
  signingSecret: z.string().trim().max(200).optional(),
  outboundUrl: z.string().trim().url().max(1000).refine((u) => /^https:\/\//.test(u), "Must start with https://").optional().or(z.literal("")),
  outboundEvents: z.array(z.string().max(40)).max(10).optional(),
  defaultCountryCode: z.string().trim().regex(/^\d{1,4}$/).optional(),
  storeUrl: z.string().trim().max(300).optional(),
}).partial();

const createSchema = z.object({
  type: z.enum(INTEGRATION_TYPES),
  name: z.string().trim().min(1).max(120),
  channelId: z.string().min(1),
  config: configSchema.optional(),
});

const ruleSchema = z.object({
  event: z.string().trim().min(1).max(80),
  templateName: z.string().trim().min(1).max(512),
  language: z.string().trim().max(16).optional(),
  phonePath: z.string().trim().max(200).optional().nullable(),
  variables: z.array(z.string().trim().max(200)).max(20).optional(),
  headerVariable: z.string().trim().max(200).optional().nullable(),
  buttonVariable: z.string().trim().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

async function loadOwned(req: Request, res: Response) {
  const owner = ownerOf(req);
  const [it] = await db.select().from(integrations).where(eq(integrations.id, req.params.id)).limit(1);
  const u = (req.session as any)?.user;
  if (!it || (u?.role !== "superadmin" && it.ownerId !== owner)) {
    res.status(404).json({ error: "Integration not found" });
    return null;
  }
  return it;
}

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    console.error("[Integrations]", e);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export function registerIntegrationRoutes(app: Express) {
  // Public inbound endpoint (secret token in URL; optional HMAC).
  app.post("/api/webhooks/integrations/:id/:token", async (req: Request, res: Response) => {
    try {
      const [it] = await db.select().from(integrations).where(eq(integrations.id, req.params.id)).limit(1);
      if (!it || it.token !== req.params.token) return res.status(404).json({ error: "Unknown integration" });
      const { verifySignature } = await import("../services/integrations/integrations.service");
      const cfg = (it.config || {}) as any;
      if (!verifySignature(it.type as IntegrationType, cfg.signingSecret, req.headers as any, (req as any).rawBody)) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      // Reply fast (Shopify expects < 5s); process in background.
      res.status(200).json({ ok: true });
      handleInbound(it, { headers: req.headers, body: req.body || {}, query: req.query, rawBody: (req as any).rawBody })
        .catch((e) => console.error("[Integrations] inbound failed", e));
    } catch (e) {
      console.error("[Integrations] hook error", e);
      if (!res.headersSent) res.status(500).json({ error: "Failed" });
    }
  });

  const auth = [requireAuth, resolveTenantChannels];

  app.get("/api/integrations/catalog", ...[requireAuth, resolveTenantChannels], wrap(async (req, res) => {
    const ids: string[] | null = (req as any).tenantChannelIds ?? null;
    const owner = ownerOf(req);
    const chans = ids === null
      ? await db.select({ id: channels.id, name: channels.name, phoneNumber: channels.phoneNumber }).from(channels).where(eq(channels.createdBy, owner!))
      : ids.length ? await db.select({ id: channels.id, name: channels.name, phoneNumber: channels.phoneNumber }).from(channels).where(inArray(channels.id, ids)) : [];
    res.json({ events: EVENTS, outboundEvents: OUTBOUND_EVENTS, channels: chans });
  }));

  app.get("/api/integrations", ...auth, wrap(async (req, res) => {
    const owner = ownerOf(req);
    const rows = await db.select().from(integrations).where(eq(integrations.ownerId, owner!)).orderBy(desc(integrations.createdAt));
    const ids = rows.map((r) => r.id);
    const rules = ids.length ? await db.select().from(integrationRules).where(inArray(integrationRules.integrationId, ids)) : [];
    res.json({ data: rows.map((r) => ({ ...present(req, r), rules: rules.filter((x) => x.integrationId === r.id) })) });
  }));

  app.post("/api/integrations", ...auth, wrap(async (req, res) => {
    const body = createSchema.parse(req.body);
    if (!verifyChannelOwnership(req, body.channelId)) return res.status(403).json({ error: "WhatsApp number not accessible" });
    const [row] = await db.insert(integrations).values({
      ownerId: ownerOf(req)!, channelId: body.channelId, type: body.type, name: body.name, token: newToken(),
      config: { defaultCountryCode: "91", outboundEvents: body.type === "google_sheets" ? ["message.received", "flow.response"] : [], ...(body.config || {}) },
    }).returning();
    res.status(201).json({ data: { ...present(req, row), rules: [] } });
  }));

  app.patch("/api/integrations/:id", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const body = z.object({ name: z.string().trim().min(1).max(120).optional(), status: z.enum(["active", "paused"]).optional(), channelId: z.string().optional(), config: configSchema.optional() }).parse(req.body);
    if (body.channelId && !verifyChannelOwnership(req, body.channelId)) return res.status(403).json({ error: "WhatsApp number not accessible" });
    const cur = (it.config || {}) as any;
    const nextCfg = { ...cur, ...(body.config || {}) };
    if (body.config?.signingSecret?.startsWith("••••")) nextCfg.signingSecret = cur.signingSecret; // unchanged mask
    const [row] = await db.update(integrations).set({
      ...(body.name ? { name: body.name } : {}), ...(body.status ? { status: body.status } : {}),
      ...(body.channelId ? { channelId: body.channelId } : {}), config: nextCfg, updatedAt: new Date(),
    } as any).where(eq(integrations.id, it.id)).returning();
    res.json({ data: present(req, row) });
  }));

  app.post("/api/integrations/:id/rotate", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const [row] = await db.update(integrations).set({ token: newToken(), updatedAt: new Date() } as any).where(eq(integrations.id, it.id)).returning();
    res.json({ data: present(req, row) });
  }));

  app.delete("/api/integrations/:id", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    await db.delete(integrations).where(eq(integrations.id, it.id));
    res.json({ success: true });
  }));

  app.get("/api/integrations/:id/logs", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    res.json({ data: await recentLogs(it.id, 100) });
  }));

  app.get("/api/integrations/:id/templates", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const rows = await db.select({ id: templates.id, name: templates.name, language: templates.language, body: templates.body, header: templates.header, buttons: templates.buttons, status: templates.status, category: templates.category })
      .from(templates).where(eq(templates.channelId, it.channelId));
    res.json({ data: rows.filter((t) => String(t.status).toUpperCase() === "APPROVED") });
  }));

  app.post("/api/integrations/:id/rules", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const b = ruleSchema.parse(req.body);
    const [row] = await db.insert(integrationRules).values({
      integrationId: it.id, event: b.event, templateName: b.templateName, language: b.language || "en_US",
      phonePath: b.phonePath || null, variables: b.variables || [], headerVariable: b.headerVariable || null,
      buttonVariable: b.buttonVariable || null, isActive: b.isActive ?? true,
    }).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/integrations/:id/rules/:ruleId", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const b = ruleSchema.partial().parse(req.body);
    const [row] = await db.update(integrationRules).set({
      ...b, phonePath: b.phonePath ?? undefined, headerVariable: b.headerVariable ?? undefined, buttonVariable: b.buttonVariable ?? undefined,
    } as any).where(and(eq(integrationRules.id, req.params.ruleId), eq(integrationRules.integrationId, it.id))).returning();
    if (!row) return res.status(404).json({ error: "Rule not found" });
    res.json({ data: row });
  }));

  app.delete("/api/integrations/:id/rules/:ruleId", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    await db.delete(integrationRules).where(and(eq(integrationRules.id, req.params.ruleId), eq(integrationRules.integrationId, it.id)));
    res.json({ success: true });
  }));

  // Send a test message for a rule using a sample payload + test phone.
  app.post("/api/integrations/:id/rules/:ruleId/test", ...auth, wrap(async (req, res) => {
    const it = await loadOwned(req, res); if (!it) return;
    const [rule] = await db.select().from(integrationRules).where(and(eq(integrationRules.id, req.params.ruleId), eq(integrationRules.integrationId, it.id))).limit(1);
    if (!rule) return res.status(404).json({ error: "Rule not found" });
    const phone = normalizePhone(String(req.body?.phone || ""), String((it.config as any)?.defaultCountryCode || "91"));
    if (!phone) return res.status(400).json({ error: "Enter a valid WhatsApp number" });
    const [channel] = await db.select().from(channels).where(eq(channels.id, it.channelId)).limit(1);
    if (!channel) return res.status(400).json({ error: "WhatsApp number not found" });
    try {
      const id = await sendTemplateFromIntegration(channel, phone, rule, req.body?.payload || {}, it.ownerId);
      res.json({ success: true, messageId: id });
    } catch (e: any) {
      res.status(400).json({ error: [e?.metaErrorTitle, e?.message].filter(Boolean).join(" — ") || "Send failed" });
    }
  }));
}
