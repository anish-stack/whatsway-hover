/**
 * HoverChat SUBSCRIPTION billing views (our revenue) — kept strictly
 * separate from Meta usage estimates (customer pays Meta directly).
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, paymentProviders, plans, subscriptions, transactions, users, whatsappAccountHealth } from "@shared/schema";
import { round2 } from "@shared/meta-billing";

export const HOVERCHAT_DEFAULT_PRICE = Number(process.env.HOVERCHAT_SUBSCRIPTION_PRICE || 999);

function effectiveStatus(s: { status: string; endDate: Date | string }) {
  if (s.status === "active" && new Date(s.endDate).getTime() < Date.now()) return "expired";
  return s.status;
}

export async function subscriptionDetails(ownerId: string) {
  const subs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, ownerId))
    .orderBy(sql`CASE WHEN ${subscriptions.status} = 'active' THEN 0 ELSE 1 END`, desc(subscriptions.endDate));
  const current = subs[0] ?? null;

  const txns = await db
    .select({
      id: transactions.id, amount: transactions.amount, currency: transactions.currency, status: transactions.status,
      billingCycle: transactions.billingCycle, paymentMethod: transactions.paymentMethod, paidAt: transactions.paidAt,
      createdAt: transactions.createdAt, providerInvoiceId: transactions.providerInvoiceId,
      providerPaymentId: transactions.providerPaymentId, subscriptionId: transactions.subscriptionId,
      planName: plans.name, provider: paymentProviders.name,
    })
    .from(transactions)
    .leftJoin(plans, eq(plans.id, transactions.planId))
    .leftJoin(paymentProviders, eq(paymentProviders.id, transactions.paymentProviderId))
    .where(eq(transactions.userId, ownerId))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  let summary: any = null;
  if (current) {
    const pd = (current.planData ?? {}) as Record<string, any>;
    const cycle = current.billingCycle;
    const price = Number(cycle === "annual" ? pd.annualPrice ?? 0 : pd.monthlyPrice ?? 0) || null;
    const status = effectiveStatus(current);
    summary = {
      id: current.id,
      planId: current.planId,
      planName: pd.name ?? "HoverChat plan",
      billingCycle: cycle,
      price,
      priceLabel: price ? `₹${price.toLocaleString("en-IN")}/${cycle === "annual" ? "year" : "month"}` : null,
      status,
      startDate: current.startDate,
      renewalDate: status === "active" && current.autoRenew ? current.endDate : null,
      expiryDate: current.endDate,
      autoRenew: current.autoRenew,
      gatewayProvider: current.gatewayProvider,
      canCancel: status === "active",
    };
  }

  return {
    subscription: summary,
    defaultPrice: HOVERCHAT_DEFAULT_PRICE,
    history: subs.map((s) => ({
      id: s.id, planName: (s.planData as any)?.name ?? null, status: effectiveStatus(s),
      billingCycle: s.billingCycle, startDate: s.startDate, endDate: s.endDate,
    })),
    payments: txns.map((t) => ({ ...t, amount: Number(t.amount) })),
    // An invoice = a completed subscription payment. Meta invoices are never stored here.
    invoices: txns
      .filter((t) => t.status === "completed")
      .map((t) => ({
        id: t.id,
        number: t.providerInvoiceId || `HC-${String(t.id).slice(0, 8).toUpperCase()}`,
        amount: Number(t.amount),
        currency: t.currency,
        date: t.paidAt ?? t.createdAt,
        planName: t.planName,
        provider: t.provider,
      })),
  };
}

export async function adminSubscriptionRevenue(monthsBack = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - monthsBack);
  const byMonth = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', coalesce(${transactions.paidAt}, ${transactions.createdAt})), 'YYYY-MM')`,
      currency: transactions.currency,
      amount: sql<string>`sum(${transactions.amount})`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(and(eq(transactions.status, "completed"), gte(transactions.createdAt, since)))
    .groupBy(sql`1`, transactions.currency)
    .orderBy(sql`1`);

  const [subCounts] = await db
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${subscriptions.status} = 'active' AND ${subscriptions.endDate} >= now())::int`,
      expired: sql<number>`count(*) FILTER (WHERE ${subscriptions.status} = 'expired' OR (${subscriptions.status} = 'active' AND ${subscriptions.endDate} < now()))::int`,
      cancelled: sql<number>`count(*) FILTER (WHERE ${subscriptions.status} = 'cancelled')::int`,
      renewingIn7d: sql<number>`count(*) FILTER (WHERE ${subscriptions.status} = 'active' AND ${subscriptions.endDate} BETWEEN now() AND now() + interval '7 days')::int`,
    })
    .from(subscriptions);

  const totals: Record<string, number> = {};
  for (const r of byMonth) totals[r.currency || "INR"] = round2((totals[r.currency || "INR"] ?? 0) + Number(r.amount));

  const recent = await db
    .select({
      id: transactions.id, amount: transactions.amount, currency: transactions.currency, status: transactions.status,
      createdAt: transactions.createdAt, paidAt: transactions.paidAt, email: users.email, planName: plans.name,
      providerInvoiceId: transactions.providerInvoiceId,
    })
    .from(transactions)
    .leftJoin(users, eq(users.id, transactions.userId))
    .leftJoin(plans, eq(plans.id, transactions.planId))
    .orderBy(desc(transactions.createdAt))
    .limit(50);

  return {
    revenueByMonth: byMonth.map((r) => ({ ...r, amount: round2(Number(r.amount)) })),
    revenueTotals: totals,
    subscriptions: subCounts,
    recentPayments: recent.map((r) => ({ ...r, amount: Number(r.amount) })),
  };
}

/** Customers (tenant owners) with subscription, channels and health. */
export async function adminCustomerAccounts(opts: { search?: string; page?: number; pageSize?: number; health?: string }) {
  const size = Math.min(Math.max(opts.pageSize ?? 25, 1), 100);
  const page = Math.max(opts.page ?? 1, 1);
  const conds = [eq(users.role, "admin")];
  if (opts.search) {
    const q = `%${opts.search.replace(/[%_]/g, "")}%`;
    conds.push(sql`(${users.email} ILIKE ${q} OR ${users.username} ILIKE ${q} OR ${users.firstName} ILIKE ${q} OR ${users.lastName} ILIKE ${q})` as any);
  }
  if (opts.health) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${whatsappAccountHealth} h WHERE h.customer_id = ${users.id} AND h.overall_status = ${opts.health})` as any);
  }
  const where = and(...conds);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(users).where(where);
  const people = await db
    .select({ id: users.id, email: users.email, username: users.username, firstName: users.firstName, lastName: users.lastName, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(size)
    .offset((page - 1) * size);
  const ids = people.map((p) => p.id);
  if (ids.length === 0) return { rows: [], pagination: { page, pageSize: size, total: n, totalPages: Math.ceil(n / size) } };

  const [subs, chans, health] = await Promise.all([
    db.select().from(subscriptions).where(inArray(subscriptions.userId, ids)).orderBy(desc(subscriptions.endDate)),
    db.select({ id: channels.id, name: channels.name, phoneNumber: channels.phoneNumber, phoneNumberId: channels.phoneNumberId, wabaId: channels.whatsappBusinessAccountId, isActive: channels.isActive, createdBy: channels.createdBy })
      .from(channels).where(inArray(channels.createdBy, ids)),
    db.select().from(whatsappAccountHealth).where(inArray(whatsappAccountHealth.customerId, ids)),
  ]);

  const healthByChannel = new Map(health.map((h) => [h.channelId, h]));
  return {
    rows: people.map((p) => {
      const mySubs = subs.filter((s) => s.userId === p.id);
      const cur = mySubs.find((s) => s.status === "active") ?? mySubs[0] ?? null;
      const myChannels = chans.filter((c) => c.createdBy === p.id).map((c) => {
        const h = healthByChannel.get(c.id);
        return {
          ...c,
          health: h ? {
            overallStatus: h.overallStatus, businessVerificationStatus: h.businessVerificationStatus, wabaReviewStatus: h.wabaReviewStatus,
            phoneStatus: h.phoneStatus, nameStatus: h.nameStatus, qualityRating: h.qualityRating, messagingLimit: h.messagingLimit,
            messagingAvailability: h.messagingAvailability, billingStatus: h.billingStatus, checkedAt: h.checkedAt,
            topIssue: ((h.issues as any[]) ?? [])[0] ?? null,
          } : null,
        };
      });
      return {
        ...p,
        subscription: cur ? {
          planName: (cur.planData as any)?.name ?? null, status: effectiveStatus(cur), billingCycle: cur.billingCycle,
          renewalDate: cur.autoRenew && effectiveStatus(cur) === "active" ? cur.endDate : null, endDate: cur.endDate,
        } : null,
        wabaCount: new Set(myChannels.map((c) => c.wabaId).filter(Boolean)).size,
        channels: myChannels,
      };
    }),
    pagination: { page, pageSize: size, total: n, totalPages: Math.ceil(n / size) },
  };
}
