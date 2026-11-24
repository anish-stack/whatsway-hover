/**
 * Appointment booking over WhatsApp (clinics, doctors, salons, consultants).
 *
 * Patient types a keyword ("book", "appointment" …) → pick doctor → pick day
 * → pick time slot → (name / reason) → confirmed, with Reschedule / Cancel
 * buttons. "my appointment" lists upcoming bookings. Button / list ids start
 * with "ap:" so they never collide with the store ("st:") or automations.
 *
 * Double booking is prevented by a partial unique index on
 * (provider_id, start_at) for non-cancelled appointments.
 */
import crypto from "crypto";
import { and, asc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  appointmentProviders, appointmentSessions, appointmentSettings, appointments, channels,
  type Appointment, type AppointmentProvider, type AppointmentSettings, type Channel,
} from "@shared/schema";
import { addDays, fmtDay, fmtTime, localDate, slotsForDate } from "@shared/appointment-slots";
import { buttons, list, send, text } from "../store/store.service";
import { WhatsAppApiService } from "../whatsapp-api";

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

export async function getApptSettings(channelId: string) {
  const [s] = await db.select().from(appointmentSettings).where(eq(appointmentSettings.channelId, channelId)).limit(1);
  return s || null;
}

async function activeProviders(channelId: string) {
  return db.select().from(appointmentProviders)
    .where(and(eq(appointmentProviders.channelId, channelId), eq(appointmentProviders.isActive, true)))
    .orderBy(asc(appointmentProviders.sortOrder), asc(appointmentProviders.name));
}

async function getSession(channelId: string, phone: string) {
  const [s] = await db.select().from(appointmentSessions).where(and(eq(appointmentSessions.channelId, channelId), eq(appointmentSessions.phone, phone))).limit(1);
  // sessions expire after 30 minutes of silence
  if (s && Date.now() - new Date(s.updatedAt).getTime() > 30 * 60_000) return { state: "idle", data: {} as any };
  return s ? { state: s.state, data: (s.data || {}) as any } : { state: "idle", data: {} as any };
}
async function setSession(channelId: string, phone: string, state: string, data: any = {}) {
  await db.insert(appointmentSessions).values({ channelId, phone, state, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [appointmentSessions.channelId, appointmentSessions.phone], set: { state, data, updatedAt: new Date() } });
}

/** Free slots for a provider on a local date (respects min notice + existing bookings). */
export async function freeSlots(s: AppointmentSettings, p: AppointmentProvider, date: string, ignoreId?: string) {
  const all = slotsForDate(p, date, s.timezone);
  if (!all.length) return [];
  const earliest = Date.now() + (s.minNoticeMinutes || 0) * 60_000;
  const taken = await db.select({ startAt: appointments.startAt }).from(appointments).where(and(
    eq(appointments.providerId, p.id), ne(appointments.status, "cancelled"),
    gte(appointments.startAt, all[0].start), lt(appointments.startAt, all[all.length - 1].end),
    ...(ignoreId ? [ne(appointments.id, ignoreId)] : []),
  ));
  const busy = new Set(taken.map((t) => new Date(t.startAt).getTime()));
  return all.filter((x) => x.start.getTime() >= earliest && !busy.has(x.start.getTime()));
}

function ref() {
  return `AP${Date.now().toString(36).toUpperCase().slice(-5)}${crypto.randomInt(100, 999)}`;
}

export function describeAppt(s: AppointmentSettings, p: AppointmentProvider, a: Pick<Appointment, "startAt" | "patientName" | "ref" | "reason">) {
  const start = new Date(a.startAt);
  return `${s.providerLabel === "Doctor" ? "👨‍⚕️ Dr. " : "👤 "}${p.name.replace(/^dr\.?\s*/i, "")}${p.specialty ? ` (${p.specialty})` : ""}\n📅 ${fmtDay(start, s.timezone)} · ${fmtTime(start, s.timezone)}${a.patientName ? `\n🧑 ${a.patientName}` : ""}${a.reason ? `\n📝 ${a.reason}` : ""}\nRef: ${a.ref}`;
}

interface Ctx { channel: Channel; s: AppointmentSettings; conversationId: string | null; phone: string; name: string | null }

// ───────────── screens ─────────────

async function chooseProvider(ctx: Ctx, rescheduleOf?: string): Promise<void> {
  const provs = await activeProviders(ctx.channel.id);
  if (!provs.length) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, text(`Online booking isn't available right now. Please call ${ctx.s.businessName} or message us here and our team will help.`), "Appointments: no providers");
    return;
  }
  if (provs.length === 1) return chooseDate(ctx, provs[0].id, 0, rescheduleOf);
  const rows = provs.slice(0, 10).map((p) => ({
    id: `ap:prov:${p.id}`,
    title: p.name,
    description: [p.specialty, p.fee != null ? `Fee ₹${Number(p.fee).toLocaleString("en-IN")}` : null].filter(Boolean).join(" · ") || undefined,
  }));
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    list(rescheduleOf ? "Pick the doctor for your new time." : ctx.s.welcomeText, `Choose ${ctx.s.providerLabel.toLowerCase()}`, rows, ctx.s.businessName, "Type 'my appointment' to see bookings"),
    "Appointments: providers");
}

async function chooseDate(ctx: Ctx, providerId: string, startOffset = 0, rescheduleOf?: string): Promise<void> {
  const [p] = await db.select().from(appointmentProviders).where(and(eq(appointmentProviders.id, providerId), eq(appointmentProviders.channelId, ctx.channel.id))).limit(1);
  if (!p || !p.isActive) return chooseProvider(ctx);
  if (rescheduleOf) await setSession(ctx.channel.id, ctx.phone, "rescheduling", { rescheduleOf });
  const today = localDate(new Date(), ctx.s.timezone);
  const rows: Array<{ id: string; title: string; description?: string }> = [];
  const window = Math.min(Math.max(ctx.s.bookingWindowDays || 7, 1), 60);
  let offset = startOffset;
  for (; offset < window && rows.length < 9; offset++) {
    const date = addDays(today, offset);
    const free = await freeSlots(ctx.s, p, date);
    if (free.length) rows.push({ id: `ap:date:${p.id}:${date}`, title: `${offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : fmtDay(date, ctx.s.timezone)}`, description: `${offset > 1 ? "" : `${fmtDay(date, ctx.s.timezone)} · `}${free.length} slot${free.length > 1 ? "s" : ""} · from ${fmtTime(free[0].start, ctx.s.timezone)}` });
  }
  if (offset < window) rows.push({ id: `ap:more:${p.id}:${offset}`, title: "Later dates…" });
  if (!rows.length || (rows.length === 1 && rows[0].id.startsWith("ap:more"))) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`No free slots with ${p.name} in the next ${window} days. Please try another ${ctx.s.providerLabel.toLowerCase()} or message us.`, [{ id: "ap:start", title: "Choose again" }]), "Appointments: no dates");
    return;
  }
  await send(ctx.channel, ctx.conversationId, ctx.phone, list(`${p.name}${p.specialty ? ` · ${p.specialty}` : ""}\nPick a day:`, "Choose day", rows, "Available days"), `Appointments: dates for ${p.name}`);
}

async function chooseSlot(ctx: Ctx, providerId: string, date: string, page = 0): Promise<void> {
  const [p] = await db.select().from(appointmentProviders).where(and(eq(appointmentProviders.id, providerId), eq(appointmentProviders.channelId, ctx.channel.id))).limit(1);
  if (!p) return chooseProvider(ctx);
  const free = await freeSlots(ctx.s, p, date);
  if (!free.length) return chooseDate(ctx, providerId);
  const per = 9;
  const slice = free.slice(page * per, page * per + per);
  const rows = slice.map((x) => ({ id: `ap:slot:${p.id}:${x.start.getTime()}`, title: fmtTime(x.start, ctx.s.timezone), description: `${p.slotMinutes} min` }));
  if (free.length > (page + 1) * per) rows.push({ id: `ap:date:${p.id}:${date}:${page + 1}`, title: "Later times…", description: `${free.length - (page + 1) * per} more` });
  await send(ctx.channel, ctx.conversationId, ctx.phone, list(`${fmtDay(date, ctx.s.timezone)} with ${p.name}\nPick a time:`, "Choose time", rows, "Available times"), `Appointments: slots ${date}`);
}

async function pickedSlot(ctx: Ctx, providerId: string, startMs: number): Promise<void> {
  const sess = await getSession(ctx.channel.id, ctx.phone);
  const data = { providerId, startMs, rescheduleOf: sess.data?.rescheduleOf };
  // Rescheduling keeps the same patient details
  if (data.rescheduleOf) return book(ctx, data, null, null);
  if (ctx.s.askReason) {
    await setSession(ctx.channel.id, ctx.phone, "awaiting_details", data);
    await send(ctx.channel, ctx.conversationId, ctx.phone,
      text(`Almost done! Please reply with the *patient's name* and, if you like, the reason for the visit.\n\nExample: _Riya Sharma, fever since 2 days_`),
      "Appointments: asked for patient details");
    return;
  }
  return book(ctx, data, ctx.name, null);
}

async function book(ctx: Ctx, data: { providerId: string; startMs: number; rescheduleOf?: string }, patientName: string | null, reason: string | null): Promise<void> {
  const [p] = await db.select().from(appointmentProviders).where(and(eq(appointmentProviders.id, data.providerId), eq(appointmentProviders.channelId, ctx.channel.id))).limit(1);
  if (!p) return chooseProvider(ctx);
  const start = new Date(data.startMs);
  const date = localDate(start, ctx.s.timezone);
  const stillFree = (await freeSlots(ctx.s, p, date, data.rescheduleOf)).some((x) => x.start.getTime() === start.getTime());
  if (!stillFree) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, text("Sorry, that time was just taken. Here are the remaining times:"), "Appointments: slot taken");
    return chooseSlot(ctx, p.id, date);
  }
  let old: Appointment | undefined;
  if (data.rescheduleOf) {
    [old] = await db.select().from(appointments).where(and(eq(appointments.id, data.rescheduleOf), eq(appointments.phone, ctx.phone), eq(appointments.channelId, ctx.channel.id))).limit(1);
  }
  let row: Appointment;
  try {
    [row] = await db.insert(appointments).values({
      ref: ref(), channelId: ctx.channel.id, ownerId: ctx.s.ownerId, providerId: p.id, conversationId: ctx.conversationId,
      phone: ctx.phone, patientName: patientName || old?.patientName || ctx.name, reason: reason || old?.reason || null,
      startAt: start, endAt: new Date(start.getTime() + p.slotMinutes * 60_000), status: "booked", source: "whatsapp",
    }).returning();
  } catch (e: any) {
    if (String(e?.code) === "23505") {
      await send(ctx.channel, ctx.conversationId, ctx.phone, text("Sorry, that time was just taken. Here are the remaining times:"), "Appointments: slot taken");
      return chooseSlot(ctx, p.id, date);
    }
    throw e;
  }
  if (old && old.status !== "cancelled") {
    await db.update(appointments).set({ status: "cancelled", notes: sql`coalesce(${appointments.notes} || E'\\n', '') || ${`Rescheduled to ${row.ref}`}`, updatedAt: new Date() } as any).where(eq(appointments.id, old.id));
  }
  await setSession(ctx.channel.id, ctx.phone, "idle", {});
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    buttons(`✅ *Appointment ${old ? "rescheduled" : "confirmed"}*\n\n${describeAppt(ctx.s, p, row)}\n\nPlease arrive 10 minutes early.${p.fee != null ? ` Consultation fee: ₹${Number(p.fee).toLocaleString("en-IN")}.` : ""}`,
      [{ id: `ap:resched:${row.id}`, title: "Reschedule" }, { id: `ap:cancel:${row.id}`, title: "Cancel" }], undefined, ctx.s.businessName),
    `Appointment ${row.ref} ${old ? "rescheduled" : "booked"}`);
}

async function myAppointments(ctx: Ctx): Promise<void> {
  const rows = await db.select({ a: appointments, p: appointmentProviders }).from(appointments)
    .innerJoin(appointmentProviders, eq(appointmentProviders.id, appointments.providerId))
    .where(and(eq(appointments.channelId, ctx.channel.id), eq(appointments.phone, ctx.phone), ne(appointments.status, "cancelled"), gte(appointments.startAt, new Date(Date.now() - 60 * 60_000))))
    .orderBy(asc(appointments.startAt)).limit(3);
  if (!rows.length) {
    await send(ctx.channel, ctx.conversationId, ctx.phone, buttons("You have no upcoming appointments.", [{ id: "ap:start", title: "Book now" }]), "Appointments: none upcoming");
    return;
  }
  const body = rows.map(({ a, p }) => describeAppt(ctx.s, p, a)).join("\n\n");
  const next = rows[0].a;
  await send(ctx.channel, ctx.conversationId, ctx.phone,
    buttons(`🗓️ *Your upcoming appointment${rows.length > 1 ? "s" : ""}*\n\n${body}`, [{ id: `ap:resched:${next.id}`, title: "Reschedule" }, { id: `ap:cancel:${next.id}`, title: "Cancel" }, { id: "ap:start", title: "Book another" }]),
    "Appointments: upcoming list");
}

async function loadOwn(ctx: Ctx, id: string) {
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.channelId, ctx.channel.id), eq(appointments.phone, ctx.phone))).limit(1);
  return a || null;
}

// ───────────── entry point from the webhook ─────────────

export async function handleAppointmentMessage(m: { channel: Channel; conversationId: string | null; phone: string; name?: string | null; type: string; text?: string | null; interactive?: any }): Promise<boolean> {
  const s = await getApptSettings(m.channel.id);
  if (!s?.enabled) return false;
  const ctx: Ctx = { channel: m.channel, s, conversationId: m.conversationId, phone: m.phone, name: m.name || null };

  const id: string | undefined = m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || m.interactive?.buttonPayload;
  if (id?.startsWith("ap:")) {
    const [, action, a1, a2, a3] = id.split(":");
    try {
      switch (action) {
        case "start": await setSession(s.channelId, m.phone, "idle", {}); await chooseProvider(ctx); break;
        case "prov": { const sess = await getSession(s.channelId, m.phone); await chooseDate(ctx, a1, 0, sess.state === "rescheduling" ? sess.data.rescheduleOf : undefined); break; }
        case "more": await chooseDate(ctx, a1, Number(a2) || 0); break;
        case "date": await chooseSlot(ctx, a1, a2, Number(a3) || 0); break;
        case "slot": await pickedSlot(ctx, a1, Number(a2)); break;
        case "resched": {
          const a = await loadOwn(ctx, a1);
          if (!a || a.status === "cancelled") return myAppointments(ctx).then(() => true);
          await setSession(s.channelId, m.phone, "rescheduling", { rescheduleOf: a.id });
          await chooseDate(ctx, a.providerId, 0, a.id);
          break;
        }
        case "cancel": {
          const a = await loadOwn(ctx, a1);
          if (!a || a.status === "cancelled") return myAppointments(ctx).then(() => true);
          await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`Cancel appointment ${a.ref} on ${fmtDay(new Date(a.startAt), s.timezone)} at ${fmtTime(new Date(a.startAt), s.timezone)}?`, [{ id: `ap:cancelyes:${a.id}`, title: "Yes, cancel" }, { id: "ap:mine", title: "Keep it" }]), "Appointments: confirm cancel");
          break;
        }
        case "cancelyes": {
          const a = await loadOwn(ctx, a1);
          if (a && a.status !== "cancelled") {
            await db.update(appointments).set({ status: "cancelled", updatedAt: new Date() } as any).where(eq(appointments.id, a.id));
            await send(ctx.channel, ctx.conversationId, ctx.phone, buttons(`Your appointment ${a.ref} is cancelled.`, [{ id: "ap:start", title: "Book again" }]), `Appointment ${a.ref} cancelled by patient`);
          }
          break;
        }
        case "mine": await myAppointments(ctx); break;
        default: await chooseProvider(ctx);
      }
    } catch (e) { console.error("[Appointments] action failed", action, (e as Error).message); }
    return true;
  }

  if (m.type !== "text" || !m.text) return false;
  const t = m.text.trim();
  const lower = t.toLowerCase();

  const sess = await getSession(s.channelId, m.phone);
  if (sess.state === "awaiting_details") {
    if (["cancel", "stop"].includes(lower)) { await setSession(s.channelId, m.phone, "idle", {}); await send(ctx.channel, ctx.conversationId, ctx.phone, text("Okay, booking cancelled. Type *book* anytime to start again."), "Appointments: booking abandoned"); return true; }
    const [namePart, ...rest] = t.split(/[,\n]/);
    await book(ctx, sess.data, clip(namePart, 120) || ctx.name, clip(rest.join(",").trim(), 300) || null);
    return true;
  }

  const kws: string[] = (Array.isArray(s.keywords) ? (s.keywords as string[]) : []).map((k) => String(k).toLowerCase().trim()).filter(Boolean);
  if (kws.includes(lower) || /^(book|need|want).{0,20}(appointment|slot)/.test(lower)) { await setSession(s.channelId, m.phone, "idle", {}); await chooseProvider(ctx); return true; }
  if (/^(my )?(appointment|appointments|booking|bookings)( status)?$/.test(lower) || ["cancel appointment", "reschedule"].includes(lower)) { await myAppointments(ctx); return true; }
  return false;
}

// ───────────── staff actions + reminders ─────────────

export async function notifyPatient(a: Appointment, kind: "cancelled" | "rescheduled" | "confirmed") {
  const s = await getApptSettings(a.channelId);
  const [p] = await db.select().from(appointmentProviders).where(eq(appointmentProviders.id, a.providerId)).limit(1);
  const [ch] = await db.select().from(channels).where(eq(channels.id, a.channelId)).limit(1);
  if (!s || !p || !ch) throw new Error("Not configured");
  const head = kind === "cancelled" ? "❌ *Appointment cancelled*" : kind === "rescheduled" ? "🔁 *Appointment rescheduled*" : "✅ *Appointment confirmed*";
  const foot = kind === "cancelled" ? "\n\nSorry for the inconvenience. Tap below to pick a new time." : "";
  const btns = kind === "cancelled" ? [{ id: "ap:start", title: "Book again" }] : [{ id: `ap:resched:${a.id}`, title: "Reschedule" }, { id: `ap:cancel:${a.id}`, title: "Cancel" }];
  await send(ch, a.conversationId, a.phone, buttons(`${head}\n\n${describeAppt(s, p, a)}${foot}`, btns, undefined, s.businessName), `Appointment ${a.ref} ${kind} (staff)`);
}

/** Every 5 minutes: remind patients `reminderMinutes` before their visit. */
export async function sendDueReminders() {
  const due = await db.select({ a: appointments, s: appointmentSettings, p: appointmentProviders })
    .from(appointments)
    .innerJoin(appointmentSettings, eq(appointmentSettings.channelId, appointments.channelId))
    .innerJoin(appointmentProviders, eq(appointmentProviders.id, appointments.providerId))
    .where(and(
      inArray(appointments.status, ["booked", "confirmed"]),
      sql`${appointments.reminderSentAt} IS NULL`,
      sql`${appointmentSettings.enabled} AND ${appointmentSettings.reminderMinutes} > 0`,
      sql`${appointments.startAt} > now()`,
      sql`${appointments.startAt} <= now() + (${appointmentSettings.reminderMinutes} || ' minutes')::interval`,
      sql`${appointments.createdAt} < now() - interval '10 minutes'`,
    )).limit(100);
  let sent = 0;
  for (const { a, s, p } of due) {
    const [ch] = await db.select().from(channels).where(eq(channels.id, a.channelId)).limit(1);
    if (!ch) continue;
    const when = `${fmtDay(new Date(a.startAt), s.timezone)}, ${fmtTime(new Date(a.startAt), s.timezone)}`;
    try {
      if (s.reminderTemplate) {
        // Template works even outside the 24h window: {{1}} patient, {{2}} doctor, {{3}} date & time
        await WhatsAppApiService.sendTemplateMessage(ch, a.phone, s.reminderTemplate, [{
          type: "body", parameters: [a.patientName || "there", p.name, when].map((t) => ({ type: "text", text: String(t).slice(0, 60) })),
        }], s.reminderTemplateLang || "en_US");
      } else {
        await send(ch, a.conversationId, a.phone, buttons(`⏰ Reminder: your appointment with ${p.name} is at *${when}*.\nRef: ${a.ref}`, [{ id: `ap:resched:${a.id}`, title: "Reschedule" }, { id: `ap:cancel:${a.id}`, title: "Cancel" }], undefined, s.businessName), `Reminder ${a.ref}`);
      }
      sent++;
    } catch (e) {
      console.warn(`[Appointments] reminder ${a.ref} failed:`, (e as Error).message);
    }
    // mark even on failure so we don't spam retries
    await db.update(appointments).set({ reminderSentAt: new Date() } as any).where(eq(appointments.id, a.id));
  }
  return sent;
}
