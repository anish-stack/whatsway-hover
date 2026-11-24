import type { Express, Request, Response } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { demoRequests, notifications, sentNotifications, users } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60 * 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5; // 5 requests / hour / IP
}
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const schema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(120),
  email: z.string().trim().email("Please enter a valid email").max(200),
  phone: z.string().trim().min(8, "Please enter a valid phone number").max(30).regex(/^[+\d\s()-]+$/, "Please enter a valid phone number"),
  company: z.string().trim().max(160).optional().nullable(),
  businessType: z.string().trim().max(60).optional().nullable(),
  teamSize: z.string().trim().max(30).optional().nullable(),
  preferredTime: z.string().trim().max(80).optional().nullable(),
  message: z.string().trim().max(2000).optional().nullable(),
  website: z.string().optional(), // honeypot — must stay empty
  source: z.string().trim().max(200).optional(),
});

async function notifyTeam(r: typeof demoRequests.$inferSelect) {
  const admins = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.role, "superadmin"));
  const title = `New demo request: ${r.name}${r.company ? ` (${r.company})` : ""}`;
  const message = `${r.email} · ${r.phone}${r.businessType ? ` · ${r.businessType}` : ""}${r.preferredTime ? ` · prefers ${r.preferredTime}` : ""}`;
  for (const a of admins) {
    try {
      const [n] = await db.insert(notifications).values({
        title, message, type: "demo_request", createdBy: "system", targetType: "single", targetIds: [a.id], status: "sent", sentAt: new Date(),
      } as any).returning();
      await db.insert(sentNotifications).values({ notificationId: n.id, userId: a.id } as any);
      (global as any).io?.to(`user:${a.id}`).emit("notification:new", { id: n.id, title, message, type: "demo_request", link: "/demo-requests", createdAt: n.createdAt });
    } catch (e) { console.warn("[Demo] in-app notification failed", (e as Error).message); }
  }
  try {
    const { sendNotificationEmail } = await import("../services/notification.service");
    const to = process.env.DEMO_REQUEST_EMAIL || admins.find((a) => a.email)?.email;
    if (to) {
      await sendNotificationEmail(to, title, `
        <h2 style="margin:0 0 12px">New demo request</h2>
        <table cellpadding="6" style="border-collapse:collapse;font-size:14px">
          ${[["Name", r.name], ["Email", r.email], ["Phone", r.phone], ["Company", r.company], ["Business", r.businessType], ["Team size", r.teamSize], ["Preferred time", r.preferredTime], ["Message", r.message], ["Page", r.source]]
            .filter(([, v]) => v).map(([k, v]) => `<tr><td style="color:#666">${k}</td><td><b>${esc(v)}</b></td></tr>`).join("")}
        </table>`);
    }
  } catch (e) { console.warn("[Demo] email failed", (e as Error).message); }
}

export function registerDemoRequestRoutes(app: Express) {
  app.post("/api/demo-requests", async (req: Request, res: Response) => {
    try {
      const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
      if (limited(ip)) return res.status(429).json({ error: "Too many requests. Please try again in a while." });
      const b = schema.parse(req.body);
      if (b.website) return res.json({ success: true }); // bot
      const [row] = await db.insert(demoRequests).values({
        name: b.name, email: b.email.toLowerCase(), phone: b.phone, company: b.company || null, businessType: b.businessType || null,
        teamSize: b.teamSize || null, preferredTime: b.preferredTime || null, message: b.message || null,
        source: b.source || String(req.headers.referer || "").slice(0, 200) || null, ip,
      }).returning();
      notifyTeam(row).catch(() => {});
      res.status(201).json({ success: true });
    } catch (e: any) {
      if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Please check the form" });
      console.error("[Demo] create failed", e);
      res.status(500).json({ error: "Could not send your request. Please try again." });
    }
  });

  const superOnly = (req: Request, res: Response, next: any) => ((req.session as any)?.user?.role === "superadmin" ? next() : res.status(403).json({ error: "Forbidden" }));

  app.get("/api/admin/demo-requests", requireAuth, superOnly, async (req, res) => {
    const status = String(req.query.status || "all");
    const rows = await db.select().from(demoRequests)
      .where(status === "all" ? sql`true` : eq(demoRequests.status, status)).orderBy(desc(demoRequests.createdAt)).limit(500);
    const [counts] = await db.select({
      total: sql<number>`count(*)::int`,
      new: sql<number>`count(*) filter (where ${demoRequests.status} = 'new')::int`,
      week: sql<number>`count(*) filter (where ${demoRequests.createdAt} > now() - interval '7 days')::int`,
    }).from(demoRequests);
    res.json({ data: rows, counts });
  });

  app.patch("/api/admin/demo-requests/:id", requireAuth, superOnly, async (req, res) => {
    const b = z.object({ status: z.enum(["new", "contacted", "scheduled", "closed"]).optional(), notes: z.string().max(2000).optional().nullable() }).safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: "Invalid input" });
    const [row] = await db.update(demoRequests).set({ ...b.data, updatedAt: new Date() } as any).where(eq(demoRequests.id, req.params.id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ data: row });
  });
}
