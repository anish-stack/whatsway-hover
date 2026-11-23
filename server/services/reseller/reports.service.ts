/**
 * Read models for the reseller portal and super-admin reports.
 * Every reseller query is scoped by resellerId (never trust client ids).
 * Earnings always come from stored sale values / ledger rows — never
 * recomputed from today's pricing.
 */
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  plans,
  resellerAuditLogs,
  resellerCustomers,
  resellerLedgerEntries,
  resellerProfiles,
  resellerSales,
  subscriptions,
  transactions,
  users,
} from "@shared/schema";
import { ledgerBalances, money, PAYMENT_STATUSES, resolvePermissions } from "@shared/reseller-pricing";
import { resolveRange } from "@shared/usage-range";

const TZ = /^[A-Za-z0-9_+\-/]{1,64}$/.test(process.env.USAGE_TIMEZONE || "") ? process.env.USAGE_TIMEZONE! : "Asia/Kolkata";

export const salesFilterSchema = z.object({
  range: z.enum(["all", "today", "yesterday", "last_7_days", "last_30_days", "this_month", "last_month", "custom"]).default("this_month"),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  planId: z.string().max(64).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  saleType: z.enum(["new", "renewal"]).optional(),
  customerId: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
});
export type SalesFilter = z.infer<typeof salesFilterSchema>;

function salesWhere(resellerId: string | null, f: SalesFilter): SQL | undefined {
  const c: SQL[] = [];
  if (resellerId) c.push(eq(resellerSales.resellerId, resellerId));
  if (f.range !== "all") {
    const r = resolveRange(f, new Date(), TZ);
    c.push(gte(resellerSales.createdAt, r.from), lt(resellerSales.createdAt, r.to));
  }
  if (f.planId) c.push(eq(resellerSales.planId, f.planId));
  if (f.paymentStatus) c.push(eq(resellerSales.paymentStatus, f.paymentStatus));
  if (f.saleType) c.push(eq(resellerSales.saleType, f.saleType));
  if (f.customerId) c.push(eq(resellerSales.customerUserId, f.customerId));
  return c.length ? and(...c) : undefined;
}

const realSale = sql`${resellerSales.paymentStatus} NOT IN ('cancelled','failed')`;

export async function salesReport(resellerId: string | null, f: SalesFilter) {
  const where = salesWhere(resellerId, f);
  const [t] = await db
    .select({
      count: sql<number>`count(*) FILTER (WHERE ${realSale})::int`,
      totalSales: sql<string>`coalesce(sum(${resellerSales.sellingPrice}) FILTER (WHERE ${realSale}),0)`,
      paidCount: sql<number>`count(*) FILTER (WHERE ${resellerSales.paymentStatus} IN ('paid','partially_refunded','refunded'))::int`,
      paidSales: sql<string>`coalesce(sum(${resellerSales.sellingPrice} - ${resellerSales.refundedAmount}) FILTER (WHERE ${resellerSales.paymentStatus} IN ('paid','partially_refunded','refunded')),0)`,
      pendingCount: sql<number>`count(*) FILTER (WHERE ${resellerSales.paymentStatus} IN ('pending','pending_verification'))::int`,
      pendingAmount: sql<string>`coalesce(sum(${resellerSales.sellingPrice}) FILTER (WHERE ${resellerSales.paymentStatus} IN ('pending','pending_verification')),0)`,
      projectedMargin: sql<string>`coalesce(sum(${resellerSales.resellerEarning}) FILTER (WHERE ${resellerSales.paymentStatus} IN ('pending','pending_verification')),0)`,
      refundedCount: sql<number>`count(*) FILTER (WHERE ${resellerSales.paymentStatus} IN ('refunded','partially_refunded'))::int`,
      refundedAmount: sql<string>`coalesce(sum(${resellerSales.refundedAmount}),0)`,
      cancelledCount: sql<number>`count(*) FILTER (WHERE ${resellerSales.paymentStatus} = 'cancelled')::int`,
      platformRevenue: sql<string>`coalesce(sum(${resellerSales.platformRevenue}) FILTER (WHERE ${resellerSales.paymentStatus} IN ('paid','partially_refunded')),0)`,
    })
    .from(resellerSales)
    .where(where);

  // gross margin = ledger earnings + reversals attached to sales in the filter
  const [g] = await db
    .select({ m: sql<string>`coalesce(sum(${resellerLedgerEntries.amount}),0)` })
    .from(resellerLedgerEntries)
    .innerJoin(resellerSales, eq(resellerSales.id, resellerLedgerEntries.saleId))
    .where(and(where ?? sql`true`, inArray(resellerLedgerEntries.entryType, ["earning", "reversal"])));

  const offset = (f.page - 1) * f.pageSize;
  const rows = await db
    .select({
      s: resellerSales,
      customerEmail: users.email,
      customerFirstName: users.firstName,
      businessName: resellerCustomers.businessName,
      resellerName: resellerProfiles.businessName,
      resellerCode: resellerProfiles.resellerCode,
      txnStatus: transactions.status,
    })
    .from(resellerSales)
    .leftJoin(users, eq(users.id, resellerSales.customerUserId))
    .leftJoin(resellerCustomers, eq(resellerCustomers.customerUserId, resellerSales.customerUserId))
    .leftJoin(resellerProfiles, eq(resellerProfiles.id, resellerSales.resellerId))
    .leftJoin(transactions, eq(transactions.id, resellerSales.transactionId))
    .where(where)
    .orderBy(desc(resellerSales.createdAt))
    .limit(f.pageSize)
    .offset(offset);

  const now = Date.now();
  return {
    totals: {
      count: t.count, totalSales: money(t.totalSales), paidCount: t.paidCount, paidSales: money(t.paidSales),
      pendingCount: t.pendingCount, pendingAmount: money(t.pendingAmount), projectedMargin: money(t.projectedMargin),
      grossMargin: money(g?.m ?? 0), refundedCount: t.refundedCount, refundedAmount: money(t.refundedAmount),
      cancelledCount: t.cancelledCount, platformRevenue: money(t.platformRevenue),
    },
    rows: rows.map(({ s, ...r }) => ({
      id: s.id, saleType: s.saleType, customerUserId: s.customerUserId, customer: r.businessName || r.customerFirstName || r.customerEmail,
      customerEmail: r.customerEmail, resellerId: s.resellerId, resellerName: r.resellerName, resellerCode: r.resellerCode,
      planId: s.planId, planName: s.planName, billingCycle: s.billingCycle, cycles: s.cycles, periodStart: s.periodStart, periodEnd: s.periodEnd,
      sellingPrice: money(s.sellingPrice), wholesaleCost: s.wholesaleCost === null ? null : money(s.wholesaleCost),
      commissionAmount: s.commissionAmount === null ? null : money(s.commissionAmount), resellerEarning: money(s.resellerEarning),
      pricingModel: s.pricingModel, pricingVersion: s.pricingVersion, currency: s.currency, paymentStatus: s.paymentStatus,
      refundedAmount: money(s.refundedAmount), paidAt: s.paidAt, createdAt: s.createdAt, transactionId: s.transactionId,
      transactionStatus: r.txnStatus, paymentReference: s.paymentReference, activationPolicy: s.activationPolicy,
      renewalStatus:
        s.paymentStatus === "cancelled" ? "cancelled"
        : s.paymentStatus === "refunded" ? "refunded"
        : ["pending", "pending_verification"].includes(s.paymentStatus) && s.activationPolicy !== "immediate" ? "awaiting_payment"
        : new Date(s.periodEnd).getTime() < now ? "ended"
        : new Date(s.periodStart).getTime() > now ? "upcoming" : "current",
    })),
    pagination: { page: f.page, pageSize: f.pageSize, total: t.count + t.cancelledCount, totalPages: Math.max(1, Math.ceil((t.count + t.cancelledCount) / f.pageSize)) },
  };
}

/** Latest subscription per customer, scoped to a reseller (or all reseller customers). */
async function latestSubs(customerIds: string[]) {
  if (!customerIds.length) return new Map<string, any>();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (s.user_id) s.user_id, s.id, s.status, s.plan_id, s.plan_data->>'name' AS plan_name, s.billing_cycle, s.start_date, s.end_date
    FROM ${subscriptions} s
    WHERE s.user_id IN (${sql.join(customerIds.map((id) => sql`${id}`), sql`, `)})
      AND s.status IN ('active','expired','pending','cancelled')
    ORDER BY s.user_id, CASE s.status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END, s.end_date DESC`);
  const map = new Map<string, any>();
  for (const r of (rows as any).rows ?? rows) {
    const expired = r.status === "active" && new Date(r.end_date).getTime() < Date.now();
    map.set(r.user_id, { id: r.id, status: expired ? "expired" : r.status, planId: r.plan_id, planName: r.plan_name, billingCycle: r.billing_cycle, startDate: r.start_date, endDate: r.end_date });
  }
  return map;
}

export async function customersList(resellerId: string | null, opts: { search?: string; status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const size = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const c: SQL[] = [];
  if (resellerId) c.push(eq(resellerCustomers.resellerId, resellerId));
  if (opts.search) {
    const q = `%${opts.search.replace(/[%_]/g, "")}%`;
    c.push(or(ilike(users.email, q), ilike(users.firstName, q), ilike(resellerCustomers.businessName, q), ilike(resellerCustomers.mobile, q))!);
  }
  if (opts.status === "active" || opts.status === "inactive") c.push(eq(users.status, opts.status));
  const where = c.length ? and(...c) : undefined;
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(resellerCustomers).innerJoin(users, eq(users.id, resellerCustomers.customerUserId)).where(where);
  const rows = await db
    .select({
      id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, status: users.status,
      invitePending: sql<boolean>`${users.isEmailVerified} = false`, lastLogin: users.lastLogin, createdAt: users.createdAt,
      businessName: resellerCustomers.businessName, mobile: resellerCustomers.mobile, attributedAt: resellerCustomers.attributedAt,
      source: resellerCustomers.source, resellerId: resellerCustomers.resellerId, resellerName: resellerProfiles.businessName,
    })
    .from(resellerCustomers)
    .innerJoin(users, eq(users.id, resellerCustomers.customerUserId))
    .leftJoin(resellerProfiles, eq(resellerProfiles.id, resellerCustomers.resellerId))
    .where(where)
    .orderBy(desc(resellerCustomers.attributedAt))
    .limit(size)
    .offset((page - 1) * size);
  const subs = await latestSubs(rows.map((r) => r.id));
  const open = rows.length
    ? await db.select({ c: resellerSales.customerUserId, id: resellerSales.id, amount: resellerSales.sellingPrice, status: resellerSales.paymentStatus })
        .from(resellerSales).where(and(inArray(resellerSales.customerUserId, rows.map((r) => r.id)), inArray(resellerSales.paymentStatus, ["pending", "pending_verification"])))
    : [];
  const openMap = new Map(open.map((o) => [o.c, { id: o.id, amount: money(o.amount), status: o.status }]));
  return {
    rows: rows.map((r) => ({ ...r, subscription: subs.get(r.id) ?? null, openInvoice: openMap.get(r.id) ?? null })),
    pagination: { page, pageSize: size, total: n, totalPages: Math.max(1, Math.ceil(n / size)) },
  };
}

export async function customerDetail(resellerId: string | null, customerUserId: string) {
  const [m] = await db.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, customerUserId));
  if (!m || (resellerId && m.resellerId !== resellerId)) return null;
  const [u] = await db.select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, status: users.status, isEmailVerified: users.isEmailVerified, lastLogin: users.lastLogin, createdAt: users.createdAt })
    .from(users).where(eq(users.id, customerUserId));
  const subs = await db.select({ id: subscriptions.id, status: subscriptions.status, planData: subscriptions.planData, billingCycle: subscriptions.billingCycle, startDate: subscriptions.startDate, endDate: subscriptions.endDate })
    .from(subscriptions).where(eq(subscriptions.userId, customerUserId)).orderBy(desc(subscriptions.createdAt)).limit(20);
  const sales = await salesReport(resellerId, salesFilterSchema.parse({ range: "all", customerId: customerUserId, pageSize: 100 }));
  return { customer: { ...u, businessName: m.businessName, mobile: m.mobile, source: m.source, attributedAt: m.attributedAt, resellerId: m.resellerId }, subscriptions: subs.map((s) => ({ ...s, planName: (s.planData as any)?.name ?? null })), sales: sales.rows };
}

export async function subscriptionsList(resellerId: string, status?: string) {
  const ids = (await db.select({ id: resellerCustomers.customerUserId }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, resellerId))).map((r) => r.id);
  const subs = await latestSubs(ids);
  const people = ids.length
    ? await db.select({ id: users.id, email: users.email, firstName: users.firstName, businessName: resellerCustomers.businessName })
        .from(users).innerJoin(resellerCustomers, eq(resellerCustomers.customerUserId, users.id)).where(inArray(users.id, ids))
    : [];
  const rows = people.map((p) => ({ customerUserId: p.id, customer: p.businessName || p.firstName || p.email, email: p.email, subscription: subs.get(p.id) ?? null }))
    .filter((r) => !status || (r.subscription?.status ?? "none") === status)
    .sort((a, b) => new Date(a.subscription?.endDate ?? 0).getTime() - new Date(b.subscription?.endDate ?? 0).getTime());
  return { rows };
}

export async function resellerDashboard(resellerId: string) {
  const ids = (await db.select({ id: resellerCustomers.customerUserId }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, resellerId))).map((r) => r.id);
  const people = ids.length ? await db.select({ id: users.id, status: users.status }).from(users).where(inArray(users.id, ids)) : [];
  const subs = await latestSubs(ids);
  const subVals = [...subs.values()];
  const month = await salesReport(resellerId, salesFilterSchema.parse({ range: "this_month" }));
  const all = await salesReport(resellerId, salesFilterSchema.parse({ range: "all", pageSize: 1 }));
  const ledger = await db.select({ entryType: resellerLedgerEntries.entryType, amount: resellerLedgerEntries.amount, availableAt: resellerLedgerEntries.availableAt })
    .from(resellerLedgerEntries).where(eq(resellerLedgerEntries.resellerId, resellerId));
  const in30 = Date.now() + 30 * 86400_000;
  const upcoming = subVals.filter((s) => s.status === "active" && new Date(s.endDate).getTime() <= in30).length;
  const growth = await db.execute(sql`
    SELECT to_char(date_trunc('month', attributed_at AT TIME ZONE ${TZ}), 'YYYY-MM') AS month, count(*)::int AS added
    FROM ${resellerCustomers} WHERE reseller_id = ${resellerId} AND attributed_at > now() - interval '12 months'
    GROUP BY 1 ORDER BY 1`);
  const growthRows: { month: string; added: number }[] = ((growth as any).rows ?? growth).map((r: any) => ({ month: r.month, added: Number(r.added) }));
  // fill 12 months, cumulative
  const months: { month: string; added: number; total: number }[] = [];
  const startCount = ids.length - growthRows.reduce((s, r) => s + r.added, 0);
  let running = startCount;
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const added = growthRows.find((r) => r.month === key)?.added ?? 0;
    running += added;
    months.push({ month: key, added, total: running });
  }
  return {
    customers: { total: ids.length, active: people.filter((p) => p.status === "active").length, inactive: people.filter((p) => p.status !== "active").length },
    subscriptions: {
      sold: all.totals.paidCount,
      active: subVals.filter((s) => s.status === "active").length,
      expired: subVals.filter((s) => s.status === "expired").length,
      pending: subVals.filter((s) => s.status === "pending").length,
      upcomingRenewals30d: upcoming,
    },
    thisMonth: { sales: month.totals.paidSales, count: month.totals.paidCount, margin: month.totals.grossMargin },
    pendingPayments: { count: all.totals.pendingCount, amount: all.totals.pendingAmount, projectedMargin: all.totals.projectedMargin },
    balances: ledgerBalances(ledger),
    growth: months,
  };
}

export async function ledgerList(resellerId: string, limit = 200) {
  return db.select({
    id: resellerLedgerEntries.id, entryType: resellerLedgerEntries.entryType, amount: resellerLedgerEntries.amount, currency: resellerLedgerEntries.currency,
    reference: resellerLedgerEntries.reference, availableAt: resellerLedgerEntries.availableAt, description: resellerLedgerEntries.description,
    createdAt: resellerLedgerEntries.createdAt, saleId: resellerLedgerEntries.saleId, planName: resellerSales.planName,
  }).from(resellerLedgerEntries).leftJoin(resellerSales, eq(resellerSales.id, resellerLedgerEntries.saleId))
    .where(eq(resellerLedgerEntries.resellerId, resellerId)).orderBy(desc(resellerLedgerEntries.createdAt)).limit(Math.min(limit, 1000));
}

export async function auditList(resellerId: string, limit = 200) {
  return db.select({
    id: resellerAuditLogs.id, action: resellerAuditLogs.action, entityType: resellerAuditLogs.entityType, entityId: resellerAuditLogs.entityId,
    actorRole: resellerAuditLogs.actorRole, actorEmail: users.email, before: resellerAuditLogs.before, after: resellerAuditLogs.after, createdAt: resellerAuditLogs.createdAt,
  }).from(resellerAuditLogs).leftJoin(users, eq(users.id, resellerAuditLogs.actorUserId))
    .where(eq(resellerAuditLogs.resellerId, resellerId)).orderBy(desc(resellerAuditLogs.createdAt)).limit(Math.min(limit, 1000));
}

export async function resellerList(opts: { search?: string; status?: string; page?: number; pageSize?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const size = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const c: SQL[] = [];
  if (opts.status) c.push(eq(resellerProfiles.status, opts.status));
  else c.push(sql`${resellerProfiles.status} <> 'archived'`);
  if (opts.search) {
    const q = `%${opts.search.replace(/[%_]/g, "")}%`;
    c.push(or(ilike(resellerProfiles.businessName, q), ilike(resellerProfiles.email, q), ilike(resellerProfiles.resellerCode, q), ilike(resellerProfiles.contactPerson, q))!);
  }
  const where = and(...c);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(resellerProfiles).where(where);
  const rows = await db.select().from(resellerProfiles).where(where).orderBy(desc(resellerProfiles.createdAt)).limit(size).offset((page - 1) * size);
  const ids = rows.map((r) => r.id);
  const stats = ids.length ? await db.execute(sql`
    SELECT p.id,
      (SELECT count(*)::int FROM ${resellerCustomers} c WHERE c.reseller_id = p.id) AS customers,
      (SELECT coalesce(sum(s.selling_price - s.refunded_amount),0) FROM ${resellerSales} s WHERE s.reseller_id = p.id AND s.payment_status IN ('paid','partially_refunded','refunded')) AS revenue,
      (SELECT coalesce(sum(l.amount),0) FROM ${resellerLedgerEntries} l WHERE l.reseller_id = p.id AND l.entry_type IN ('earning','reversal')) AS margin
    FROM ${resellerProfiles} p WHERE p.id IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`) : { rows: [] };
  const map = new Map(((stats as any).rows ?? stats).map((r: any) => [r.id, r]));
  return {
    rows: rows.map((r) => {
      const st: any = map.get(r.id) ?? {};
      return { ...r, permissions: resolvePermissions(r.permissions as any), customers: Number(st.customers ?? 0), revenue: money(st.revenue ?? 0), grossMargin: money(st.margin ?? 0) };
    }),
    pagination: { page, pageSize: size, total: n, totalPages: Math.max(1, Math.ceil(n / size)) },
  };
}

export async function adminResellerSummary(range: SalesFilter["range"] = "this_month") {
  const statusRows = await db.select({ status: resellerProfiles.status, n: sql<number>`count(*)::int` }).from(resellerProfiles).groupBy(resellerProfiles.status);
  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
  const [{ rc }] = await db.select({ rc: sql<number>`count(*)::int` }).from(resellerCustomers);
  const [{ allCust }] = await db.select({ allCust: sql<number>`count(*)::int` }).from(users).where(eq(users.role, "admin"));
  const f = salesFilterSchema.parse({ range, pageSize: 1 });
  const period = await salesReport(null, f);
  const lifetime = await salesReport(null, salesFilterSchema.parse({ range: "all", pageSize: 1 }));
  const where = salesWhere(null, f);
  const top = await db
    .select({
      resellerId: resellerSales.resellerId, name: resellerProfiles.businessName, code: resellerProfiles.resellerCode,
      revenue: sql<string>`coalesce(sum(${resellerSales.sellingPrice} - ${resellerSales.refundedAmount}),0)`,
      sales: sql<number>`count(*)::int`, margin: sql<string>`coalesce(sum(${resellerSales.resellerEarning}),0)`,
    })
    .from(resellerSales)
    .innerJoin(resellerProfiles, eq(resellerProfiles.id, resellerSales.resellerId))
    .where(and(where ?? sql`true`, inArray(resellerSales.paymentStatus, ["paid", "partially_refunded"])))
    .groupBy(resellerSales.resellerId, resellerProfiles.businessName, resellerProfiles.resellerCode)
    .orderBy(desc(sql`4`))
    .limit(5);
  return {
    resellers: {
      total: statusRows.reduce((s, r) => s + r.n, 0) - (byStatus.archived ?? 0),
      active: byStatus.active ?? 0, suspended: byStatus.suspended ?? 0, inactive: byStatus.inactive ?? 0,
      pendingActivation: byStatus.pending_activation ?? 0, archived: byStatus.archived ?? 0,
    },
    customers: { reseller: rc, direct: Math.max(0, allCust - rc) },
    period: { range, subscriptionsSold: period.totals.paidCount, revenue: period.totals.paidSales, grossMargin: period.totals.grossMargin, platformRevenue: period.totals.platformRevenue, pending: period.totals.pendingAmount },
    lifetime: { subscriptionsSold: lifetime.totals.paidCount, revenue: lifetime.totals.paidSales, grossMargin: lifetime.totals.grossMargin },
    topResellers: top.map((t) => ({ ...t, revenue: money(t.revenue), margin: money(t.margin) })),
  };
}

export async function planOptions() {
  return db.select({ id: plans.id, name: plans.name, monthlyPrice: plans.monthlyPrice, annualPrice: plans.annualPrice }).from(plans).orderBy(plans.name);
}
