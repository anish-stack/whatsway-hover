/** Flow Studio API — no-code WhatsApp Flows: build, validate, push to Meta, publish, send, responses. */
import type { Express, Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { channels, PERMISSIONS, waFlows, type WaFlow } from "@shared/schema";
import { FLOW_CATEGORIES, FLOW_STARTERS, compileFlow, validateFlow, type FlowDefinition } from "@shared/flow-studio";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import {
  FlowError, deleteFlow, deprecateFlow, flowResponses, flowStats, importFromMeta, listMetaFlows, pushFlow,
  reconcileStatuses, refreshPreview, responsesCsv, sendFlow,
} from "../services/flow-studio/flow-studio.service";

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e instanceof FlowError) {
      const first = e.details?.metaErrors?.[0]?.message || e.details?.issues?.[0]?.message;
      return res.status(e.status).json({ ...(e.details || {}), error: first ? `${e.message} ${first}` : e.message });
    }
    console.error("[FlowStudio]", e);
    res.status(500).json({ error: "Something went wrong" });
  }
};

function channelParam(req: Request, res: Response): string | null {
  const id = String(req.query.channelId || req.body?.channelId || "");
  if (!id) { res.status(400).json({ error: "channelId is required" }); return null; }
  if (!verifyChannelOwnership(req, id)) { res.status(403).json({ error: "WhatsApp number not accessible" }); return null; }
  return id;
}

async function loadFlow(req: Request, res: Response): Promise<WaFlow | null> {
  const [f] = await db.select().from(waFlows).where(eq(waFlows.id, String(req.params.id))).limit(1);
  if (!f || !verifyChannelOwnership(req, f.channelId)) { res.status(404).json({ error: "Flow not found" }); return null; }
  return f;
}

const CATS = FLOW_CATEGORIES.map((c) => c.id) as [string, ...string[]];

/** Structural guard only — WhatsApp rules are checked by validateFlow(). */
const componentSchema = z.object({
  id: z.string().max(40), type: z.string().max(30),
  text: z.string().max(5000).optional(), name: z.string().max(80).optional(), label: z.string().max(200).optional(),
  required: z.boolean().optional(), helperText: z.string().max(200).optional(), inputType: z.string().max(20).optional(),
  minChars: z.number().int().min(0).max(10000).optional().nullable(), maxChars: z.number().int().min(0).max(10000).optional().nullable(),
  options: z.array(z.object({ id: z.string().max(80), title: z.string().max(100), description: z.string().max(400).optional() })).max(200).optional(),
  minSelected: z.number().int().min(0).max(200).optional().nullable(), maxSelected: z.number().int().min(0).max(200).optional().nullable(),
  minDate: z.string().max(10).optional().nullable(), maxDate: z.string().max(10).optional().nullable(),
  src: z.string().max(600_000).optional(), altText: z.string().max(100).optional(), height: z.number().int().min(40).max(600).optional(),
}).passthrough();

const definitionSchema = z.object({
  version: z.literal(1),
  screens: z.array(z.object({
    id: z.string().max(40), title: z.string().max(100), footerLabel: z.string().max(100), next: z.string().max(40),
    components: z.array(componentSchema).max(60),
    branch: z.object({ field: z.string().max(80), equals: z.string().max(80), goTo: z.string().max(40) }).nullable().optional(),
  })).max(20),
  raw: z.any().optional(),
});

const settingsSchema = z.object({
  saveName: z.string().max(80).optional().nullable(), saveEmail: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  thankYou: z.string().max(1000).optional().nullable(), notifyTeam: z.boolean().optional(),
});

export function registerFlowStudioRoutes(app: Express) {
  const base = [requireAuth, resolveTenantChannels];
  const view = requirePermission(PERMISSIONS.TEMPLATES_VIEW);
  const edit = requirePermission(PERMISSIONS.TEMPLATES_CREATE);

  app.get("/api/flow-studio/starters", ...base, view, (_req, res) => {
    res.json(FLOW_STARTERS.map(({ id, name, description, category }) => ({ id, name, description, category })));
  });

  /** Local flows + stats, and flows on Meta that aren't in the studio yet. */
  app.get("/api/flow-studio", ...base, view, wrap(async (req, res) => {
    const channelId = channelParam(req, res); if (!channelId) return;
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    let meta: Awaited<ReturnType<typeof listMetaFlows>> = [];
    let metaError: string | null = null;
    try { meta = await listMetaFlows(ch); await reconcileStatuses(channelId, meta); } catch (e: any) { metaError = e.message; }
    const flows = await db.select({
      id: waFlows.id, name: waFlows.name, categories: waFlows.categories, status: waFlows.status, dirty: waFlows.dirty,
      metaFlowId: waFlows.metaFlowId, metaHistory: waFlows.metaHistory, version: waFlows.version,
      updatedAt: waFlows.updatedAt, publishedAt: waFlows.publishedAt, definition: waFlows.definition,
    }).from(waFlows).where(eq(waFlows.channelId, channelId)).orderBy(desc(waFlows.updatedAt));
    const stats = await flowStats(flows.map((f) => f.id));
    const known = new Set(flows.flatMap((f) => [f.metaFlowId, ...((f.metaHistory as string[]) || [])]).filter(Boolean));
    res.json({
      flows: flows.map(({ definition, metaHistory, ...f }) => {
        const d = definition as FlowDefinition;
        return { ...f, screens: d.raw ? d.raw?.screens?.length || 0 : d.screens.length, jsonMode: !!d.raw, stats: stats[f.id] || { sent: 0, completed: 0, last: null } };
      }),
      unlinked: meta.filter((m) => !known.has(m.id)),
      metaError,
    });
  }));

  app.post("/api/flow-studio", ...base, edit, wrap(async (req, res) => {
    const channelId = channelParam(req, res); if (!channelId) return;
    const body = z.object({
      name: z.string().trim().min(1).max(120), starter: z.string().max(30).default("blank"), category: z.enum(CATS).optional(),
      // a flow made with AI (already repaired by fromAiFlow on the server, re-checked here)
      draft: z.object({ definition: definitionSchema, settings: settingsSchema, cta: z.string().trim().min(1).max(20), body: z.string().trim().min(1).max(1024) }).optional(),
    }).parse(req.body);
    const st = FLOW_STARTERS.find((s) => s.id === body.starter) || FLOW_STARTERS.find((s) => s.id === "blank")!;
    const built = body.draft ? { ...body.draft, definition: { ...body.draft.definition, raw: undefined } } as any : st.build();
    const [row] = await db.insert(waFlows).values({
      channelId, ownerId: owner(req), name: body.name, categories: [body.category || st.category],
      definition: built.definition as any, settings: built.settings as any, cta: built.cta, body: built.body, status: "local", dirty: true,
    } as any).returning();
    res.status(201).json(row);
  }));

  /** Make with AI: one chat turn → a question or a complete flow (optionally editing an existing one). */
  app.post("/api/flow-studio/ai", ...base, edit, wrap(async (req, res) => {
    const channelId = channelParam(req, res); if (!channelId) return;
    const body = z.object({
      messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) })).min(1).max(30),
      flowId: z.string().max(60).optional(),
      current: z.object({ definition: definitionSchema, name: z.string().max(120).optional(), cta: z.string().max(20).optional(), body: z.string().max(1024).optional(), settings: settingsSchema.optional() }).optional(),
    }).parse(req.body);
    if (body.messages[body.messages.length - 1].role !== "user") return res.status(400).json({ error: "Describe the flow you want." });
    let current: any = body.current || null; // e.g. refining an AI draft that isn't saved yet
    if (body.flowId) {
      const [f] = await db.select().from(waFlows).where(eq(waFlows.id, body.flowId)).limit(1);
      if (!f || f.channelId !== channelId) return res.status(404).json({ error: "Flow not found" });
      // the editor may have unsaved edits: prefer what the client sends
      current = body.current || { definition: f.definition, name: f.name, cta: f.cta, body: f.body, settings: f.settings };
    }
    try {
      const { aiFlowTurn } = await import("../services/flow-studio/flow-ai.service");
      res.json(await aiFlowTurn({ channelId, messages: body.messages, current }));
    } catch (e: any) {
      const status = e?.status || (/api key|401|403|invalid|permission/i.test(e?.message || "") ? 400 : 500);
      res.status(status).json({ error: status >= 500 ? "AI request failed. Please try again." : e.message });
    }
  }));

  app.post("/api/flow-studio/import", ...base, edit, wrap(async (req, res) => {
    const channelId = channelParam(req, res); if (!channelId) return;
    const metaFlowId = z.string().regex(/^\d+$/).parse(String(req.body?.metaFlowId || ""));
    const [exists] = await db.select({ id: waFlows.id }).from(waFlows).where(and(eq(waFlows.channelId, channelId), eq(waFlows.metaFlowId, metaFlowId))).limit(1);
    if (exists) return res.json({ id: exists.id, existed: true });
    const [ch] = await db.select().from(channels).where(eq(channels.id, channelId)).limit(1);
    res.status(201).json(await importFromMeta(ch, metaFlowId, owner(req)));
  }));

  app.get("/api/flow-studio/:id", ...base, view, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    const issues = validateFlow(f.definition as FlowDefinition);
    res.json({ ...f, issues });
  }));

  app.put("/api/flow-studio/:id", ...base, edit, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    const body = z.object({
      name: z.string().trim().min(1).max(120).optional(),
      categories: z.array(z.enum(CATS)).min(1).max(3).optional(),
      definition: definitionSchema.optional(),
      settings: settingsSchema.optional(),
      cta: z.string().trim().min(1).max(20).optional(),
      body: z.string().trim().min(1).max(1024).optional(),
    }).parse(req.body);
    const patch: any = { updatedAt: new Date() };
    if (body.name) patch.name = body.name;
    if (body.categories) patch.categories = body.categories;
    if (body.settings) patch.settings = body.settings;
    if (body.cta) patch.cta = body.cta;
    if (body.body) patch.body = body.body;
    if (body.definition) {
      const before = JSON.stringify(compileFlow(f.definition as FlowDefinition));
      patch.definition = body.definition;
      if (JSON.stringify(compileFlow(body.definition as FlowDefinition)) !== before) patch.dirty = true;
    }
    if (body.categories && JSON.stringify(body.categories) !== JSON.stringify(f.categories)) patch.dirty = true;
    const [saved] = await db.update(waFlows).set(patch).where(eq(waFlows.id, f.id)).returning();
    res.json({ ...saved, issues: validateFlow(saved.definition as FlowDefinition) });
  }));

  app.get("/api/flow-studio/:id/json", ...base, view, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    res.json(compileFlow(f.definition as FlowDefinition));
  }));

  app.post("/api/flow-studio/:id/sync", ...base, edit, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    res.json(await pushFlow(f.id));
  }));

  app.post("/api/flow-studio/:id/publish", ...base, edit, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    res.json(await pushFlow(f.id, { publish: true }));
  }));

  app.post("/api/flow-studio/:id/deprecate", ...base, edit, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    res.json(await deprecateFlow(f));
  }));

  app.post("/api/flow-studio/:id/preview", ...base, view, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    res.json({ previewUrl: await refreshPreview(f) });
  }));

  app.post("/api/flow-studio/:id/duplicate", ...base, edit, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    const [row] = await db.insert(waFlows).values({
      channelId: f.channelId, ownerId: owner(req), name: `${f.name} (copy)`.slice(0, 120), categories: f.categories,
      definition: f.definition, settings: f.settings, cta: f.cta, body: f.body, status: "local", dirty: true,
    } as any).returning();
    res.status(201).json(row);
  }));

  app.delete("/api/flow-studio/:id", ...base, requirePermission(PERMISSIONS.TEMPLATES_DELETE), wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    await deleteFlow(f);
    res.json({ ok: true });
  }));

  app.post("/api/flow-studio/:id/send", ...base, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    const body = z.object({
      to: z.string().min(8).max(20), body: z.string().max(1024).optional(), cta: z.string().max(20).optional(),
      header: z.string().max(60).optional(), footer: z.string().max(60).optional(), conversationId: z.string().max(60).optional().nullable(),
    }).parse(req.body);
    res.json(await sendFlow(f, body));
  }));

  app.get("/api/flow-studio/:id/responses", ...base, view, wrap(async (req, res) => {
    const f = await loadFlow(req, res); if (!f) return;
    const rows = await flowResponses(f.id, req.query.format === "csv" ? 10000 : 500);
    if (req.query.format === "csv") {
      const fname = `${f.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "flow"}-responses.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      return res.send(responsesCsv(f, rows));
    }
    const stats = (await flowStats([f.id]))[f.id] || { sent: 0, completed: 0, last: null };
    res.json({ rows, stats });
  }));
}
