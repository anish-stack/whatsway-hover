/**
 * Pure slot math for appointment booking (shared by server + UI).
 * Weekly hours are wall-clock times in the clinic's timezone.
 */
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type WeeklyHours = Partial<Record<Weekday, Array<[string, string]>>>;

const pad = (n: number) => String(n).padStart(2, "0");

/** Offset (ms) of `tz` from UTC at instant `d`. */
function tzOffset(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(d).reduce((a: any, x) => ((a[x.type] = x.value), a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** "2026-11-25" + "10:30" in tz → UTC Date. */
export function localToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const off1 = tzOffset(new Date(guess), tz);
  const off2 = tzOffset(new Date(guess - off1), tz);
  return new Date(guess - off2);
}

/** Local calendar date "YYYY-MM-DD" of an instant. */
export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (n: number) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

export function isValidHours(h: unknown): h is WeeklyHours {
  if (!h || typeof h !== "object") return false;
  return Object.entries(h as any).every(([k, v]) =>
    (WEEKDAYS as readonly string[]).includes(k) && Array.isArray(v) &&
    (v as any[]).every((r) => Array.isArray(r) && r.length === 2 && /^\d{2}:\d{2}$/.test(r[0]) && /^\d{2}:\d{2}$/.test(r[1]) && toMin(r[0]) < toMin(r[1])));
}

/** All slot start/end instants for one provider on one local date. */
export function slotsForDate(
  p: { weeklyHours: unknown; daysOff?: unknown; slotMinutes: number },
  date: string,
  tz: string,
): Array<{ start: Date; end: Date; label: string }> {
  const off = Array.isArray(p.daysOff) ? (p.daysOff as string[]) : [];
  if (off.includes(date)) return [];
  const hours = (p.weeklyHours || {}) as WeeklyHours;
  const ranges = hours[weekdayOf(date)] || [];
  const step = Math.max(5, Math.min(p.slotMinutes || 15, 480));
  const out: Array<{ start: Date; end: Date; label: string }> = [];
  for (const [a, b] of ranges) {
    for (let t = toMin(a); t + step <= toMin(b); t += step) {
      const start = localToUtc(date, fromMin(t), tz);
      out.push({ start, end: new Date(start.getTime() + step * 60_000), label: fromMin(t) });
    }
  }
  return out.sort((x, y) => x.start.getTime() - y.start.getTime());
}

export function fmtTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).toUpperCase();
}
export function fmtDay(d: Date | string, tz: string) {
  const dt = typeof d === "string" ? localToUtc(d, "12:00", tz) : d;
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(dt);
}
