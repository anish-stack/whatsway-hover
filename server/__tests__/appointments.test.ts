import { describe as d, it, expect, vi, beforeAll } from "vitest";
import { localToUtc, localDate, slotsForDate, addDays, weekdayOf, isValidHours } from "@shared/appointment-slots";

d("slot math", () => {
  it("converts clinic wall time to UTC (IST = UTC+5:30)", () => {
    expect(localToUtc("2026-11-25", "10:30", "Asia/Kolkata").toISOString()).toBe("2026-11-25T05:00:00.000Z");
    expect(localDate(new Date("2026-11-24T20:00:00Z"), "Asia/Kolkata")).toBe("2026-11-25");
    expect(weekdayOf("2026-11-25")).toBe("wed");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("builds slots from weekly hours and skips days off", () => {
    const p = { slotMinutes: 20, weeklyHours: { wed: [["10:00", "11:00"], ["17:00", "17:40"]] }, daysOff: ["2026-12-02"] };
    expect(slotsForDate(p, "2026-11-25", "Asia/Kolkata").map((s) => s.label)).toEqual(["10:00", "10:20", "10:40", "17:00", "17:20"]);
    expect(slotsForDate(p, "2026-12-02", "Asia/Kolkata")).toEqual([]);
    expect(slotsForDate(p, "2026-11-26", "Asia/Kolkata")).toEqual([]);
  });
  it("validates hours", () => {
    expect(isValidHours({ mon: [["09:00", "13:00"]] })).toBe(true);
    expect(isValidHours({ mon: [["13:00", "09:00"]] })).toBe(false);
    expect(isValidHours({ funday: [] })).toBe(false);
  });
});

const sent: any[] = [];
vi.mock("../services/whatsapp-api", () => ({
  WhatsAppApiService: class {
    constructor(_c: any) {}
    async sendDirectMessage(p: any) { sent.push(p); return { messages: [{ id: `wamid.${sent.length}` }] }; }
    static async sendTemplateMessage() { return {}; }
  },
}));
const RUN = !!process.env.DATABASE_URL && process.env.STORE_TEST === "1";

d.skipIf(!RUN)("booking flow over WhatsApp", () => {
  let db: any, S: any, svc: any, channel: any, eq: any;
  const phone = "919811122233";
  beforeAll(async () => {
    ({ db } = await import("../db")); S = await import("@shared/schema"); svc = await import("../services/appointments/appointments.service");
    ({ eq } = await import("drizzle-orm"));
    [channel] = await db.select().from(S.channels).where(eq(S.channels.id, "demo-ch"));
    await db.delete(S.appointments).where(eq(S.appointments.channelId, channel.id));
    await db.delete(S.appointmentProviders).where(eq(S.appointmentProviders.channelId, channel.id));
    await db.delete(S.appointmentSessions).where(eq(S.appointmentSessions.channelId, channel.id));
    await db.delete(S.appointmentSettings).where(eq(S.appointmentSettings.channelId, channel.id));
    await db.insert(S.appointmentSettings).values({ channelId: channel.id, ownerId: "demo-admin", enabled: true, businessName: "Smile Dental", minNoticeMinutes: 0, bookingWindowDays: 7 });
    const all = { sun: [["00:00", "23:40"]], mon: [["00:00", "23:40"]], tue: [["00:00", "23:40"]], wed: [["00:00", "23:40"]], thu: [["00:00", "23:40"]], fri: [["00:00", "23:40"]], sat: [["00:00", "23:40"]] };
    await db.insert(S.appointmentProviders).values([
      { channelId: channel.id, name: "Dr. Mehta", specialty: "Dentist", fee: "500", slotMinutes: 20, weeklyHours: all },
      { channelId: channel.id, name: "Dr. Rao", specialty: "Orthodontist", slotMinutes: 30, weeklyHours: all },
    ]);
  });
  const say = (text: string) => svc.handleAppointmentMessage({ channel, conversationId: null, phone, name: "Riya", type: "text", text });
  const tap = (id: string) => svc.handleAppointmentMessage({ channel, conversationId: null, phone, name: "Riya", type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: "x" } } });
  const rows = () => sent.at(-1).interactive.action.sections[0].rows;

  it("keyword → doctors → days → times → details → confirmed", async () => {
    expect(await say("hello")).toBe(false);
    expect(await say("Book")).toBe(true);
    expect(rows().map((r: any) => r.title)).toEqual(["Dr. Mehta", "Dr. Rao"]);
    await tap(rows()[0].id);
    const day = rows().find((r: any) => r.id.startsWith("ap:date"));
    await tap(day.id);
    const slot = rows()[2];
    await tap(slot.id);
    expect(sent.at(-1).text.body).toContain("patient's name");
    await say("Riya Sharma, tooth pain");
    const m = sent.at(-1).interactive;
    expect(m.body.text).toContain("Appointment confirmed");
    expect(m.body.text).toContain("Mehta");
    expect(m.body.text).toContain("tooth pain");
    expect(m.action.buttons.map((b: any) => b.reply.title)).toEqual(["Reschedule", "Cancel"]);
  });

  it("the booked slot disappears for the next patient", async () => {
    const [a] = await db.select().from(S.appointments).where(eq(S.appointments.channelId, channel.id));
    const [p] = await db.select().from(S.appointmentProviders).where(eq(S.appointmentProviders.id, a.providerId));
    const s = await svc.getApptSettings(channel.id);
    const date = localDate(new Date(a.startAt), s.timezone);
    const free = await svc.freeSlots(s, p, date);
    expect(free.some((x: any) => x.start.getTime() === new Date(a.startAt).getTime())).toBe(false);
  });

  it("reschedule moves the booking and cancels the old one", async () => {
    const [a] = await db.select().from(S.appointments).where(eq(S.appointments.channelId, channel.id));
    await tap(`ap:resched:${a.id}`);
    await tap(rows().find((r: any) => r.id.startsWith("ap:date")).id);
    await tap(rows()[5].id);
    expect(sent.at(-1).interactive.body.text).toContain("rescheduled");
    const all = await db.select().from(S.appointments).where(eq(S.appointments.channelId, channel.id));
    expect(all.filter((x: any) => x.status === "cancelled")).toHaveLength(1);
    expect(all.filter((x: any) => x.status === "booked")).toHaveLength(1);
  });

  it("my appointment + cancel", async () => {
    await say("my appointment");
    const btn = sent.at(-1).interactive.action.buttons.find((b: any) => b.reply.title === "Cancel");
    await tap(btn.reply.id);
    await tap(sent.at(-1).interactive.action.buttons[0].reply.id);
    expect(sent.at(-1).interactive.body.text).toContain("cancelled");
  });
});
