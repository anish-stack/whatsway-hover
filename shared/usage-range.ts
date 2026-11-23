/**
 * Reporting-period math in a given IANA timezone (pure; shared by server
 * analytics and tests). Returns UTC instants [from, to).
 */
export interface RangeInput {
  range?: string;
  from?: Date;
  to?: Date;
}

/** Calendar math in the reporting timezone, returned as UTC instants. */
function tzStartOfDay(d: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return zonedToUtc(`${parts}T00:00:00`, tz);
}
function zonedToUtc(local: string, tz: string): Date {
  const guess = new Date(`${local}Z`);
  const asTz = new Date(guess.toLocaleString("en-US", { timeZone: tz }));
  const asUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (asTz.getTime() - asUtc.getTime()));
}
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * 86_400_000); }

export function resolveRange(f: RangeInput, now: Date, tz: string): { from: Date; to: Date; label: string } {
  const today = tzStartOfDay(now, tz);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(now); // YYYY-MM
  const [y, m] = ymd.split("-").map(Number);
  const monthStart = zonedToUtc(`${y}-${String(m).padStart(2, "0")}-01T00:00:00`, tz);
  const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const prevStart = zonedToUtc(`${prev.y}-${String(prev.m).padStart(2, "0")}-01T00:00:00`, tz);
  switch (f.range) {
    case "today": return { from: today, to: addDays(today, 1), label: "Today" };
    case "yesterday": return { from: addDays(today, -1), to: today, label: "Yesterday" };
    case "last_7_days": return { from: addDays(today, -6), to: addDays(today, 1), label: "Last 7 days" };
    case "last_30_days": return { from: addDays(today, -29), to: addDays(today, 1), label: "Last 30 days" };
    case "last_month": return { from: prevStart, to: monthStart, label: "Last month" };
    case "custom": {
      const from = f.from ? tzStartOfDay(f.from, tz) : monthStart;
      const to = f.to ? addDays(tzStartOfDay(f.to, tz), 1) : addDays(today, 1);
      if (to.getTime() - from.getTime() > 400 * 86_400_000) throw Object.assign(new Error("Custom range cannot exceed 400 days"), { status: 400 });
      if (to <= from) throw Object.assign(new Error("'to' must be after 'from'"), { status: 400 });
      return { from, to, label: "Custom range" };
    }
    case "this_month":
    default: return { from: monthStart, to: addDays(today, 1), label: "This month" };
  }
}

