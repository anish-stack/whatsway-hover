import type { Express, Request, Response } from "express";
import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { appointmentProviders, appointmentSettings, appointments, channels, templates } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import { addDays, isValidHours, localDate, localToUtc } from "@shared/appointment-slots";
import { freeSlots, getApptSettings, notifyPatient } from "../services/appointments/appointments.service";

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (String(e?.code) === "23505") return res.status(409).json({ error: "That slot is already booked" });
    console.error("[Appointments]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
function ch(req: Request, res: Response): string | null {
  const id = String(req.query.channelId || req.body?.channelId || "");
  if (!id) { res.status(400).json({ error: "channelId is required" }); return null; }
  if (!verifyChannelOwnership(req, id)) { res.status(403).json({ error: "WhatsApp number not accessible" }); return null; }
  return id;
}

const DEFAULTS = {
  enabled: false, businessName: "Our clinic", providerLabel: "Doctor", keywords: ["book", "appointment", "doctor", "slot"],
  welcomeText: "Book an appointment in a few taps 🩺", timezone: "Asia/Kolkata", bookingWindowDays: 7, minNoticeMinutes: 60,
  askReason: true, reminderMinutes: 120, reminderTemplate: null, reminderTemplateLang: "en_US",
};

const settingsSchema = z.object({
  enabled: z.boolean(),
  businessName: z.string().trim().min(1).max(80),
  providerLabel: z.string().trim().min(1).max(24),
  keywords: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
  welcomeText: z.string().trim().min(1).max(900),
  timezone: z.string().trim().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "Unknown timezone"),
  bookingWindowDays: z.coerce.number().int().min(1).max(60),
  minNoticeMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  askReason: z.boolean(),
  reminderMinutes: z.coerce.number().int().min(0).max(7 * 24 * 60),
  reminderTemplate: z.string().trim().max(512).optional().nullable(),
  reminderTemplateLang: z.string().trim().max(16).optional().nullable(),
}).partial();

const providerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  specialty: z.string().trim().max(80).optional().nullable(),
  fee: z.coerce.number().min(0).max(1e7).optional().nullable(),
  slotMinutes: z.coerce.number().int().min(5).max(480),
  weeklyHours: z.any().refine(isValidHours, "Working hours are invalid (use HH:MM and end after start)"),
  daysOff: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export function registerAppointmentRoutes(app: Express) {
  const auth = [requireAuth, resolveTenantChannels];

  app.get("/api/appointments/settings", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const s = await getApptSettings(id);
    const tpls = await db.select({ name: templates.name, language: templates.language, status: templates.status, body: templates.body })
      .from(templates).where(eq(templates.channelId, id));
    res.json({ data: s || { channelId: id, ...DEFAULTS }, templates: tpls.filter((t) => String(t.status).toUpperCase() === "APPROVED") });
  }));

  app.put("/api/appointments/settings", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = settingsSchema.parse(req.body);
    const cur = await getApptSettings(id);
    const values: any = { ...b, updatedAt: new Date() };
    if (cur) await db.update(appointmentSettings).set(values).where(eq(appointmentSettings.channelId, id));
    else await db.insert(appointmentSettings).values({ ...DEFAULTS, ...values, channelId: id, ownerId: owner(req) });
    res.json({ success: true });
  }));

  app.get("/api/appointments/providers", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    res.json({ data: await db.select().from(appointmentProviders).where(eq(appointmentProviders.channelId, id)).orderBy(asc(appointmentProviders.sortOrder), asc(appointmentProviders.name)) });
  }));

  app.post("/api/appointments/providers", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = providerSchema.parse(req.body);
    const [row] = await db.insert(appointmentProviders).values({
      channelId: id, name: b.name, specialty: b.specialty || null, fee: b.fee != null ? String(b.fee) : null,
      slotMinutes: b.slotMinutes, weeklyHours: b.weeklyHours, daysOff: b.daysOff || [], isActive: b.isActive ?? true, sortOrder: b.sortOrder ?? 0,
    }).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/appointments/providers/:pid", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = providerSchema.partial().parse(req.body);
    const set: any = { ...b, updatedAt: new Date() };
    if ("fee" in b) set.fee = b.fee != null ? String(b.fee) : null;
    const [row] = await db.update(appointmentProviders).set(set).where(and(eq(appointmentProviders.id, req.params.pid), eq(appointmentProviders.channelId, id))).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ data: row });
  }));

  app.delete("/api/appointments/providers/:pid", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [upcoming] = await db.select({ n: sql<number>`count(*)::int` }).from(appointments)
      .where(and(eq(appointments.providerId, req.params.pid), ne(appointments.status, "cancelled"), gte(appointments.startAt, new Date())));
    if ((upcoming?.n || 0) > 0) return res.status(409).json({ error: `This ${"doctor"} has ${upcoming.n} upcoming appointment(s). Cancel them or mark the doctor inactive instead.` });
    await db.delete(appointmentProviders).where(and(eq(appointmentProviders.id, req.params.pid), eq(appointmentProviders.channelId, id)));
    res.json({ success: true });
  }));

  // Day view: appointments for a local date (all doctors or one)
  app.get("/api/appointments", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const s = (await getApptSettings(id)) || ({ ...DEFAULTS } as any);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date)) ? String(req.query.date) : localDate(new Date(), s.timezone);
    const days = Math.min(Math.max(Number(req.query.days) || 1, 1), 31);
    const from = localToUtc(date, "00:00", s.timezone);
    const to = localToUtc(addDays(date, days), "00:00", s.timezone);
    const providerId = String(req.query.providerId || "");
    const rows = await db.select().from(appointments).where(and(
      eq(appointments.channelId, id), gte(appointments.startAt, from), lt(appointments.startAt, to),
      ...(providerId && providerId !== "all" ? [eq(appointments.providerId, providerId)] : []),
    )).orderBy(asc(appointments.startAt));
    const today = localDate(new Date(), s.timezone);
    const [stats] = await db.select({
      today: sql<number>`count(*) filter (where ${appointments.startAt} >= ${localToUtc(today, "00:00", s.timezone)} and ${appointments.startAt} < ${localToUtc(addDays(today, 1), "00:00", s.timezone)} and ${appointments.status} <> 'cancelled')::int`,
      upcoming: sql<number>`count(*) filter (where ${appointments.startAt} >= now() and ${appointments.status} in ('booked','confirmed'))::int`,
      noShow30: sql<number>`count(*) filter (where ${appointments.status} = 'no_show' and ${appointments.startAt} > now() - interval '30 days')::int`,
      done30: sql<number>`count(*) filter (where ${appointments.status} = 'completed' and ${appointments.startAt} > now() - interval '30 days')::int`,
    }).from(appointments).where(eq(appointments.channelId, id));
    res.json({ data: rows, date, timezone: s.timezone, stats });
  }));

  app.get("/api/appointments/free-slots", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const s = await getApptSettings(id);
    if (!s) return res.json({ data: [] });
    const [p] = await db.select().from(appointmentProviders).where(and(eq(appointmentProviders.id, String(req.query.providerId)), eq(appointmentProviders.channelId, id))).limit(1);
    if (!p) return res.status(404).json({ error: "Doctor not found" });
    const slots = await freeSlots({ ...s, minNoticeMinutes: 0 }, p, String(req.query.date));
    res.json({ data: slots.map((x) => ({ start: x.start.toISOString(), label: x.label })) });
  }));

  // Manual booking by staff (walk-in / phone call)
  app.post("/api/appointments", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = z.object({
      providerId: z.string(), startAt: z.string().datetime(), phone: z.string().trim().min(8).max(20),
      patientName: z.string().trim().min(1).max(120), reason: z.string().trim().max(300).optional().nullable(), notify: z.boolean().optional(),
    }).parse(req.body);
    const s = await getApptSettings(id);
    const [p] = await db.select().from(appointmentProviders).where(and(eq(appointmentProviders.id, b.providerId), eq(appointmentProviders.channelId, id))).limit(1);
    if (!s || !p) return res.status(400).json({ error: "Set up appointment settings and a doctor first" });
    const start = new Date(b.startAt);
    const phone = b.phone.replace(/\D/g, "").replace(/^0+/, "");
    const [row] = await db.insert(appointments).values({
      ref: `AP${Date.now().toString(36).toUpperCase().slice(-5)}${Math.floor(100 + Math.random() * 900)}`,
      channelId: id, ownerId: s.ownerId, providerId: p.id, phone: phone.length === 10 ? `91${phone}` : phone,
      patientName: b.patientName, reason: b.reason || null, startAt: start, endAt: new Date(start.getTime() + p.slotMinutes * 60_000),
      status: "confirmed", source: "manual",
    }).returning();
    let notifyError: string | undefined;
    if (b.notify) { try { await notifyPatient(row, "confirmed"); } catch (e: any) { notifyError = e?.message; } }
    res.status(201).json({ data: row, notifyError });
  }));

  app.patch("/api/appointments/:aid", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = z.object({
      status: z.enum(["booked", "confirmed", "completed", "no_show", "cancelled"]).optional(),
      startAt: z.string().datetime().optional(), notes: z.string().max(1000).optional().nullable(), notify: z.boolean().optional(),
    }).parse(req.body);
    const [cur] = await db.select().from(appointments).where(and(eq(appointments.id, req.params.aid), eq(appointments.channelId, id))).limit(1);
    if (!cur) return res.status(404).json({ error: "Appointment not found" });
    const set: any = { updatedAt: new Date() };
    if (b.status) set.status = b.status;
    if ("notes" in b) set.notes = b.notes || null;
    if (b.startAt) {
      const [p] = await db.select().from(appointmentProviders).where(eq(appointmentProviders.id, cur.providerId)).limit(1);
      const st = new Date(b.startAt);
      set.startAt = st; set.endAt = new Date(st.getTime() + (p?.slotMinutes || 15) * 60_000); set.reminderSentAt = null;
    }
    const [row] = await db.update(appointments).set(set).where(eq(appointments.id, cur.id)).returning();
    let notified = false, notifyError: string | undefined;
    const kind = b.startAt ? "rescheduled" : b.status === "cancelled" ? "cancelled" : b.status === "confirmed" && cur.status !== "confirmed" ? "confirmed" : null;
    if (kind && b.notify !== false) {
      try { await notifyPatient(row, kind); notified = true; }
      catch (e: any) { notifyError = /24|131047|re-engagement/i.test(e?.message || "") ? "Patient hasn't messaged in 24 hours, so WhatsApp blocked this free-form message." : e?.message; }
    }
    res.json({ data: row, notified, notifyError });
  }));
}
