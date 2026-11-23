/**
 * Meta-reported charges via the WABA `pricing_analytics` field.
 * COST = approximate charges in the WABA's currency, as computed by Meta for
 * delivered messages. This is Meta's own number (what shows in WhatsApp
 * Manager → Insights), not HoverChat's rate-card estimate. Meta's invoice
 * can still differ slightly (taxes, credits, late adjustments).
 */
import type { Channel } from "@shared/schema";
import { round2 } from "@shared/meta-billing";
import { resolveRange } from "@shared/usage-range";
import { USAGE_TZ } from "./usage-analytics.service";

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v25.0"}`;
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: WabaCharges }>();

export type MetaRange = "this_month" | "last_month" | "last_30_days" | "last_7_days" | "today";
export const META_RANGES: MetaRange[] = ["this_month", "last_month", "last_30_days", "last_7_days", "today"];

export interface WabaCharges {
  wabaId: string;
  name: string | null;
  currency: string | null;
  cost: number;
  volume: number;
  byCategory: Record<string, { cost: number; volume: number }>;
  daily: Record<string, { cost: number; volume: number }>; // YYYY-MM-DD (reporting tz)
  error?: string;
}

function dayKey(unix: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: USAGE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(unix * 1000));
}

function normCategory(c?: string) {
  const v = String(c || "OTHER").toUpperCase();
  if (v.startsWith("AUTHENTICATION")) return "authentication";
  if (v === "MARKETING" || v === "MARKETING_LITE") return "marketing";
  if (v === "UTILITY") return "utility";
  if (v === "SERVICE") return "service";
  return v.toLowerCase();
}

async function getJson(url: string, token: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error?.error_user_msg || j?.error?.message || `Meta API ${r.status}`);
  return j;
}

/** Collect data_points whether Meta nests them under data[] or not. */
function pointsOf(node: any): any[] {
  if (!node) return [];
  if (Array.isArray(node.data_points)) return node.data_points;
  if (Array.isArray(node.data)) return node.data.flatMap((d: any) => (Array.isArray(d?.data_points) ? d.data_points : []));
  return [];
}

export async function fetchWabaCharges(channel: Channel, range: MetaRange): Promise<WabaCharges> {
  const wabaId = channel.whatsappBusinessAccountId!;
  const key = `${wabaId}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  const r = resolveRange({ range }, new Date(), USAGE_TZ);
  const start = Math.floor(r.from.getTime() / 1000);
  const end = Math.min(Math.floor(r.to.getTime() / 1000), Math.floor(Date.now() / 1000));
  const field =
    `pricing_analytics.start(${start}).end(${end}).granularity(DAILY)` +
    `.metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY"])`;

  const out: WabaCharges = { wabaId, name: null, currency: null, cost: 0, volume: 0, byCategory: {}, daily: {} };
  try {
    let json = await getJson(`${GRAPH()}/${wabaId}?fields=name,currency,${encodeURIComponent(field)}`, channel.accessToken!);
    out.name = json.name ?? null;
    out.currency = json.currency ?? null;
    let points = pointsOf(json.pricing_analytics);
    let next: string | undefined = json.pricing_analytics?.paging?.next;
    for (let page = 0; next && page < 20; page++) {
      const more = await getJson(next, channel.accessToken!);
      points = points.concat(pointsOf(more));
      next = more?.paging?.next;
    }
    for (const p of points) {
      const cost = Number(p.cost) || 0;
      const volume = Number(p.volume) || 0;
      const cat = normCategory(p.pricing_category);
      out.cost += cost;
      out.volume += volume;
      const c = (out.byCategory[cat] ||= { cost: 0, volume: 0 });
      c.cost += cost; c.volume += volume;
      const d = (out.daily[dayKey(Number(p.start))] ||= { cost: 0, volume: 0 });
      d.cost += cost; d.volume += volume;
    }
    out.cost = round2(out.cost);
    for (const v of Object.values(out.byCategory)) v.cost = round2(v.cost);
    for (const v of Object.values(out.daily)) v.cost = round2(v.cost);
    cache.set(key, { at: Date.now(), data: out });
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

/** One call per WABA (several numbers can share a WABA). */
export async function metaCharges(chans: Channel[], range: MetaRange) {
  const byWaba = new Map<string, Channel>();
  for (const c of chans) if (c.whatsappBusinessAccountId && c.accessToken && !byWaba.has(c.whatsappBusinessAccountId)) byWaba.set(c.whatsappBusinessAccountId, c);
  const accounts = await Promise.all([...byWaba.values()].map((c) => fetchWabaCharges(c, range)));
  const ok = accounts.filter((a) => !a.error);
  const currencies = [...new Set(ok.map((a) => a.currency).filter(Boolean))] as string[];
  const single = currencies.length <= 1;
  const r = resolveRange({ range }, new Date(), USAGE_TZ);

  const byCategory: Record<string, { cost: number; volume: number }> = {};
  const daily: Record<string, { cost: number; volume: number }> = {};
  let cost = 0, volume = 0;
  for (const a of ok) {
    volume += a.volume;
    if (single) cost += a.cost;
    for (const [k, v] of Object.entries(a.byCategory)) {
      const t = (byCategory[k] ||= { cost: 0, volume: 0 });
      t.volume += v.volume; if (single) t.cost += v.cost;
    }
    for (const [k, v] of Object.entries(a.daily)) {
      const t = (daily[k] ||= { cost: 0, volume: 0 });
      t.volume += v.volume; if (single) t.cost += v.cost;
    }
  }
  // Fill every day in range so the chart has no gaps.
  const days: Array<{ date: string; cost: number; volume: number }> = [];
  for (let t = r.from.getTime(); t < Math.min(r.to.getTime(), Date.now() + 86_400_000); t += 86_400_000) {
    const k = dayKey(Math.floor(t / 1000) + 3600);
    if (days.length && days[days.length - 1].date === k) continue;
    days.push({ date: k, cost: round2(daily[k]?.cost ?? 0), volume: daily[k]?.volume ?? 0 });
  }
  for (const v of Object.values(byCategory)) v.cost = round2(v.cost);

  return {
    period: { from: r.from.toISOString(), to: r.to.toISOString(), label: r.label, timezone: USAGE_TZ },
    currency: single ? currencies[0] ?? null : null,
    multiCurrency: !single,
    total: single ? round2(cost) : null,
    volume,
    byCategory,
    daily: days,
    accounts: accounts.map((a) => ({ wabaId: a.wabaId, name: a.name, currency: a.currency, cost: a.cost, volume: a.volume, error: a.error })),
    fetchedAt: new Date().toISOString(),
  };
}
