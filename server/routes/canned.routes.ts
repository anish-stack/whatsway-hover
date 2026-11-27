/**
 * Canned messages: saved replies with /shortcuts, categories and variables
 * ({{customer_name}}, {{agent_name}}…). Shared with the whole team or private to the creator.
 */
import type { Express, Request, Response } from "express";
import { and, asc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { cannedMessages } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";

const me = (req: Request) => (req.session as any)?.user as { id: string; role: string; createdBy?: string };
const ownerOf = (req: Request) => { const u = me(req); return u?.role === "team" && u.createdBy ? u.createdBy : u?.id; };
/** owner / admin-ish roles can edit any shared message; team members only their own */
const canManageAll = (req: Request) => me(req)?.role !== "team";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(80),
  shortcut: z.string().trim().toLowerCase().transform((v) => v.replace(/^\//, "")).pipe(z.string().regex(/^[a-z0-9_-]{1,32}$/, "Shortcut: letters, numbers, - or _ (max 32)")),
  category: z.string().trim().min(1).max(40).default("General"),
  content: z.string().trim().min(1, "Message is required").max(4000),
  shared: z.boolean().default(true),
});

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e?.code === "23505" || e?.cause?.code === "23505") return res.status(409).json({ error: "That shortcut is already used. Pick another one." });
    console.error("[Canned]", e); res.status(500).json({ error: "Something went wrong" });
  }
};

export const CANNED_VARIABLES = ["customer_name", "customer_first_name", "customer_phone", "agent_name", "business_name", "today"];

export function registerCannedRoutes(app: Express) {
  app.get("/api/canned-messages", requireAuth, wrap(async (req, res) => {
    const owner = ownerOf(req);
    const rows = await db.select().from(cannedMessages)
      .where(and(eq(cannedMessages.ownerId, owner), or(eq(cannedMessages.shared, true), eq(cannedMessages.createdBy, me(req).id))))
      .orderBy(asc(cannedMessages.category), asc(cannedMessages.shortcut));
    res.json({ data: rows.map((r) => ({ ...r, editable: canManageAll(req) || r.createdBy === me(req).id })), variables: CANNED_VARIABLES });
  }));

  app.post("/api/canned-messages", requireAuth, wrap(async (req, res) => {
    const b = schema.parse(req.body);
    const [row] = await db.insert(cannedMessages).values({ ...b, ownerId: ownerOf(req), createdBy: me(req).id }).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/canned-messages/:id", requireAuth, wrap(async (req, res) => {
    const b = schema.parse(req.body);
    const owner = ownerOf(req);
    const where = canManageAll(req)
      ? and(eq(cannedMessages.id, req.params.id), eq(cannedMessages.ownerId, owner))
      : and(eq(cannedMessages.id, req.params.id), eq(cannedMessages.ownerId, owner), eq(cannedMessages.createdBy, me(req).id));
    const [row] = await db.update(cannedMessages).set({ ...b, updatedAt: new Date() }).where(where).returning();
    if (!row) return res.status(404).json({ error: "Message not found or you can't edit it" });
    res.json({ data: row });
  }));

  app.delete("/api/canned-messages/:id", requireAuth, wrap(async (req, res) => {
    const owner = ownerOf(req);
    const where = canManageAll(req)
      ? and(eq(cannedMessages.id, req.params.id), eq(cannedMessages.ownerId, owner))
      : and(eq(cannedMessages.id, req.params.id), eq(cannedMessages.ownerId, owner), eq(cannedMessages.createdBy, me(req).id));
    const r = await db.delete(cannedMessages).where(where).returning({ id: cannedMessages.id });
    if (!r.length) return res.status(404).json({ error: "Message not found or you can't delete it" });
    res.json({ success: true });
  }));

  // counted when an agent inserts it (sorts popular replies first)
  app.post("/api/canned-messages/:id/used", requireAuth, wrap(async (req, res) => {
    await db.update(cannedMessages).set({ usageCount: sql`${cannedMessages.usageCount} + 1`, lastUsedAt: new Date() } as any)
      .where(and(eq(cannedMessages.id, req.params.id), eq(cannedMessages.ownerId, ownerOf(req))));
    res.json({ success: true });
  }));
}
