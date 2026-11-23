/**
 * Read-side analytics over whatsapp_message_usage.
 * All queries are tenant-scoped by customer_id unless called from the
 * super-admin controller. Volume is bucketed by created_at (first Meta
 * status seen ≈ send time); cost only counts delivered billable messages.
 */
import { and, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { campaigns, channels, users, whatsappMessageUsage as u } from "@shared/schema";
import { countryName, round2 } from "@shared/meta-billing";
import { resolveRange as resolveRangeTz } from "@shared/usage-range";

const tzEnv = process.env.USAGE_TIMEZONE || "Asia/Kolkata";
/** Reporting timezone; validated because it is inlined into GROUP BY SQL. */
export const USAGE_TZ = /^[A-Za-z0-9_+\-\/]{1,64}$/.test(tzEnv) ? tzEnv : "Asia/Kolkata";

const PRESETS = ["today", "yesterday", "last_7_days", "last_30_days", "this_month", "last_month", "custom"] as const;

export const usageFilterSchema = z.object({
  range: z.enum(PRESETS).optional().default("this_month"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  channelId: z.string().trim().max(64).optional(),
  phoneNumberId: z.string().trim().max(64).optional(),
  wabaId: z.string().trim().max(64).optional(),
  category: z.enum(["marketing", "utility", "authentication", "service"]).optional(),
  country: z.string().trim().max(8).optional(),
  campaignId: z.string().trim().max(64).optional(),
  customerId: z.string().trim().max(64).optional(), // admin only
});
export type UsageFilter = z.infer<typeof usageFilterSchema>;

export function resolveRange(f: Pick<UsageFilter, "range" | "from" | "to">, now = new Date(), tz = USAGE_TZ) {
  return resolveRangeTz(f, now, tz);
}

export interface Scope {
  /** null = super admin across all tenants */
  customerId: string | null;
  /** tenant channel ids for extra isolation (non-admin) */
  channelIds?: string[] | null;
}

function buildWhere(scope: Scope, f: UsageFilter, range: { from: Date; to: Date }): SQL {
  const c: SQL[] = [gte(u.createdAt, range.from), lt(u.createdAt, range.to)];
  const customer = scope.customerId ?? f.customerId ?? null;
  if (customer) c.push(eq(u.customerId, customer));
  if (scope.channelIds) c.push(scope.channelIds.length ? inArray(u.channelId, scope.channelIds) : sql`false`);
  if (f.channelId) c.push(eq(u.channelId, f.channelId));
  if (f.phoneNumberId) c.push(eq(u.phoneNumberId, f.phoneNumberId));
  if (f.wabaId) c.push(eq(u.wabaId, f.wabaId));
  if (f.category === "authentication") c.push(inArray(u.category, ["authentication", "authentication_international"]));
  else if (f.category) c.push(eq(u.category, f.category));
  if (f.country) c.push(eq(u.recipientCountry, f.country.toUpperCase()));
  if (f.campaignId) c.push(eq(u.campaignId, f.campaignId));
  return and(...c)!;
}

const catExpr = sql<string>`CASE WHEN ${u.category} = 'authentication_international' THEN 'authentication' ELSE ${u.category} END`;
const deliveredCond = sql`${u.deliveredAt} IS NOT NULL`;

export async function usageSummary(scope: Scope, f: UsageFilter) {
  const range = resolveRange(f);
  const where = buildWhere(scope, f, range);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) FILTER (WHERE ${u.status} <> 'failed')::int`,
      delivered: sql<number>`count(*) FILTER (WHERE ${deliveredCond})::int`,
      read: sql<number>`count(*) FILTER (WHERE ${u.readAt} IS NOT NULL)::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${u.status} = 'failed')::int`,
      billable: sql<number>`count(*) FILTER (WHERE ${u.billable} AND ${deliveredCond})::int`,
      marketing: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'marketing')::int`,
      utility: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'utility')::int`,
      authentication: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'authentication')::int`,
      service: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'service')::int`,
      unpriced: sql<number>`count(*) FILTER (WHERE ${u.billable} AND ${deliveredCond} AND ${u.appliedRate} IS NULL)::int`,
    })
    .from(u)
    .where(where);

  const costRows = await db
    .select({ currency: u.currency, cost: sql<string>`coalesce(sum(${u.estimatedCost}),0)` })
    .from(u)
    .where(and(where, deliveredCond, eq(u.billable, true)))
    .groupBy(u.currency);
  const costByCurrency: Record<string, number> = {};
  for (const r of costRows) if (r.currency) costByCurrency[r.currency] = round2(Number(r.cost));
  const currencies = Object.keys(costByCurrency);

  const r = row ?? ({} as any);
  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label, timezone: USAGE_TZ },
    totals: {
      total: r.total ?? 0, sent: r.sent ?? 0, delivered: r.delivered ?? 0, read: r.read ?? 0, failed: r.failed ?? 0,
      billable: r.billable ?? 0, unpriced: r.unpriced ?? 0,
      deliveryRate: r.total ? round2(((r.delivered ?? 0) / r.total) * 100) : 0,
    },
    categories: { marketing: r.marketing ?? 0, utility: r.utility ?? 0, authentication: r.authentication ?? 0, service: r.service ?? 0 },
    estimatedCost: {
      amount: currencies.length === 1 ? costByCurrency[currencies[0]] : currencies.length === 0 ? 0 : null,
      currency: currencies.length === 1 ? currencies[0] : currencies.length === 0 ? "INR" : null,
      byCurrency: costByCurrency,
    },
  };
}

export async function usageTimeseries(scope: Scope, f: UsageFilter, granularity: "day" | "month") {
  const range = resolveRange(f);
  const where = buildWhere(scope, f, range);
  // Literals (not bind params) so SELECT and GROUP BY expressions are identical.
  const g = granularity === "month" ? "month" : "day";
  const bucket = sql<string>`to_char(date_trunc('${sql.raw(g)}', ${u.createdAt} AT TIME ZONE '${sql.raw(USAGE_TZ)}'), '${sql.raw(g === "day" ? "YYYY-MM-DD" : "YYYY-MM")}')`;
  const rows = await db
    .select({
      bucket,
      total: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) FILTER (WHERE ${deliveredCond})::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${u.status} = 'failed')::int`,
      marketing: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'marketing')::int`,
      utility: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'utility')::int`,
      authentication: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'authentication')::int`,
      service: sql<number>`count(*) FILTER (WHERE ${catExpr} = 'service')::int`,
      cost: sql<string>`coalesce(sum(${u.estimatedCost}) FILTER (WHERE ${u.billable} AND ${deliveredCond}),0)`,
    })
    .from(u)
    .where(where)
    .groupBy(bucket)
    .orderBy(bucket);

  // Fill gaps so charts have continuous axes.
  const out: any[] = [];
  const map = new Map(rows.map((r) => [r.bucket, r]));
  const fmt = (d: Date) => {
    const s = new Intl.DateTimeFormat("en-CA", { timeZone: USAGE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    return granularity === "day" ? s : s.slice(0, 7);
  };
  const seen = new Set<string>();
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86_400_000) {
    const k = fmt(new Date(t));
    if (seen.has(k)) continue;
    seen.add(k);
    const r = map.get(k);
    out.push({
      bucket: k,
      total: r?.total ?? 0, delivered: r?.delivered ?? 0, failed: r?.failed ?? 0,
      marketing: r?.marketing ?? 0, utility: r?.utility ?? 0, authentication: r?.authentication ?? 0, service: r?.service ?? 0,
      deliveryRate: r?.total ? round2((r.delivered / r.total) * 100) : 0,
      cost: round2(Number(r?.cost ?? 0)),
    });
  }
  return { granularity, timezone: USAGE_TZ, points: out };
}

export type BreakdownBy = "category" | "country" | "campaign" | "phone" | "customer";

export async function usageBreakdown(scope: Scope, f: UsageFilter, by: BreakdownBy, limit = 50) {
  const range = resolveRange(f);
  const where = buildWhere(scope, f, range);
  const key =
    by === "category" ? catExpr
    : by === "country" ? sql<string>`coalesce(${u.recipientCountry}, '*')`
    : by === "campaign" ? sql<string>`coalesce(${u.campaignId}, '')`
    : by === "phone" ? sql<string>`coalesce(${u.phoneNumberId}, '')`
    : sql<string>`${u.customerId}`;
  const rows = await db
    .select({
      key,
      total: sql<number>`count(*)::int`,
      delivered: sql<number>`count(*) FILTER (WHERE ${deliveredCond})::int`,
      failed: sql<number>`count(*) FILTER (WHERE ${u.status} = 'failed')::int`,
      billable: sql<number>`count(*) FILTER (WHERE ${u.billable} AND ${deliveredCond})::int`,
      cost: sql<string>`coalesce(sum(${u.estimatedCost}) FILTER (WHERE ${u.billable} AND ${deliveredCond}),0)`,
      currency: sql<string>`max(${u.currency})`,
    })
    .from(u)
    .where(where)
    .groupBy(key)
    .orderBy(desc(sql`count(*)`))
    .limit(Math.min(Math.max(limit, 1), 500));

  const labels = new Map<string, string>();
  const keys = rows.map((r) => r.key).filter(Boolean);
  if (by === "campaign" && keys.length) {
    const cs = await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(inArray(campaigns.id, keys));
    cs.forEach((c) => labels.set(c.id, c.name));
  } else if (by === "phone" && keys.length) {
    const ch = await db.select({ p: channels.phoneNumberId, name: channels.name, phone: channels.phoneNumber }).from(channels).where(inArray(channels.phoneNumberId, keys));
    ch.forEach((c) => labels.set(c.p, `${c.name}${c.phone ? ` (${c.phone})` : ""}`));
  } else if (by === "customer" && keys.length) {
    const us = await db.select({ id: users.id, email: users.email, first: users.firstName, last: users.lastName }).from(users).where(inArray(users.id, keys));
    us.forEach((x) => labels.set(x.id, [x.first, x.last].filter(Boolean).join(" ") || x.email));
  }

  return {
    by,
    rows: rows.map((r) => ({
      key: r.key,
      label:
        by === "country" ? countryName(r.key)
        : by === "campaign" ? (r.key ? labels.get(r.key) ?? "Deleted campaign" : "Not from a campaign")
        : labels.get(r.key) ?? r.key,
      total: r.total, delivered: r.delivered, failed: r.failed, billable: r.billable,
      deliveryRate: r.total ? round2((r.delivered / r.total) * 100) : 0,
      cost: round2(Number(r.cost)), currency: r.currency ?? null,
    })),
  };
}

export async function usageHistory(scope: Scope, f: UsageFilter, page = 1, pageSize = 50) {
  const range = resolveRange(f);
  const where = buildWhere(scope, f, range);
  const size = Math.min(Math.max(pageSize, 1), 200);
  const offset = (Math.max(page, 1) - 1) * size;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(u).where(where);
  const rows = await db
    .select({
      id: u.id, messageId: u.messageId, channelId: u.channelId, phoneNumberId: u.phoneNumberId, wabaId: u.wabaId,
      recipientCountry: u.recipientCountry, category: u.category, pricingType: u.pricingType, billable: u.billable,
      status: u.status, sentAt: u.sentAt, deliveredAt: u.deliveredAt, readAt: u.readAt, failedAt: u.failedAt,
      errorCode: u.errorCode, campaignId: u.campaignId, templateName: u.templateName,
      appliedRate: u.appliedRate, estimatedCost: u.estimatedCost, currency: u.currency, pricingVersion: u.pricingVersion,
      createdAt: u.createdAt,
    })
    .from(u)
    .where(where)
    .orderBy(desc(u.createdAt))
    .limit(size)
    .offset(offset);
  return { rows, pagination: { page: Math.max(page, 1), pageSize: size, total: n, totalPages: Math.ceil(n / size) } };
}
