/**
 * Subscription & Billing, WhatsApp Usage, Account Health, Cost Calculator,
 * Readiness and super-admin Meta monitoring.
 *
 * Tenant isolation: every customer endpoint runs after requireAuth +
 * resolveTenantChannels and filters by the owner id (team → createdBy)
 * plus the owner's channel ids.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { db } from "../db";
import { campaigns, channels } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { storage } from "../storage";
import {
  KNOWN_COUNTRIES,
  META_DIRECT_BILLING_NOTICE,
  ESTIMATE_DISCLAIMER,
  TAX_DISCLAIMER,
  OVERALL_LABEL,
  calculateEstimate,
  metaBillingUrl,
  pickRate,
  DASHBOARD_CATEGORIES,
  countryName,
} from "@shared/meta-billing";
import { verifyChannelOwnership } from "../middlewares/tenant.middleware";
import {
  usageBreakdown,
  usageFilterSchema,
  usageHistory,
  usageSummary,
  usageTimeseries,
  type BreakdownBy,
  type Scope,
} from "../services/meta-billing/usage-analytics.service";
import {
  getHealthSnapshots,
  getOrRefreshHealth,
  presentHealth,
  refreshChannelHealth,
} from "../services/meta-billing/account-health.service";
import { checkCampaignReadiness, resolveOwnerId } from "../services/meta-billing/readiness.service";
import {
  createRateCard,
  getActiveRates,
  listRateCards,
  rateCardInputSchema,
  setRateCardActive,
  updateRateCard,
} from "../services/meta-billing/rate-card.service";
import { META_RANGES, metaCharges, type MetaRange } from "../services/meta-billing/meta-pricing.service";
import {
  adminCustomerAccounts,
  adminSubscriptionRevenue,
  subscriptionDetails,
} from "../services/meta-billing/billing-overview.service";

type Handler = (req: Request, res: Response) => Promise<unknown>;
const handle = (fn: Handler) => async (req: Request, res: Response, _next: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err: any) {
    if (err instanceof ZodError) {
      return res.status(400).json({ success: false, error: "Invalid request", details: err.flatten() });
    }
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error("[MetaBilling]", err);
    return res.status(status).json({ success: false, error: status >= 500 ? "Internal server error" : err.message });
  }
};

// ── tenant helpers ───────────────────────────────────────────

function sessionUser(req: Request): any {
  return (req as any).session?.user || (req as any).user;
}

async function ownerIdOf(req: Request): Promise<string | null> {
  const u = sessionUser(req);
  if (!u) return null;
  if (u.role === "superadmin") return null;
  if (u.role === "team") return u.createdBy || (await resolveOwnerId(u.id));
  return u.id;
}

async function scopeOf(req: Request): Promise<Scope> {
  const owner = await ownerIdOf(req);
  if (owner === null) return { customerId: null, channelIds: null };
  return { customerId: owner, channelIds: ((req as any).tenantChannelIds as string[]) ?? [] };
}

function assertChannel(req: Request, channelId?: string) {
  if (channelId && !verifyChannelOwnership(req, channelId)) {
    throw Object.assign(new Error("WhatsApp account not found"), { status: 404 });
  }
}

async function tenantChannels(req: Request) {
  const ids: string[] | null = (req as any).tenantChannelIds ?? null;
  if (ids === null) return db.select().from(channels);
  if (ids.length === 0) return [];
  return db.select().from(channels).where(inArray(channels.id, ids));
}

function parseFilters(req: Request) {
  const f = usageFilterSchema.parse(req.query);
  delete (f as any).customerId; // customers can never widen scope
  assertChannel(req, f.channelId);
  return f;
}

// ── Subscription & Billing ───────────────────────────────────

export const getBillingSubscription = handle(async (req, res) => {
  const owner = await ownerIdOf(req);
  if (!owner) return res.status(400).json({ success: false, error: "Super admin has no customer subscription. Use /api/admin/billing/overview." });
  res.json({ success: true, data: await subscriptionDetails(owner) });
});

export const getBillingOverview = handle(async (req, res) => {
  const owner = await ownerIdOf(req);
  const scope = await scopeOf(req);
  const chans = await tenantChannels(req);
  const snaps = await getHealthSnapshots(chans.map((c) => c.id));
  const byChannel = new Map(snaps.map((s) => [s.channelId, s]));

  const wabas = new Map<string, any>();
  for (const c of chans) {
    const h = byChannel.get(c.id);
    const key = c.whatsappBusinessAccountId || `channel:${c.id}`;
    const entry = wabas.get(key) ?? {
      wabaId: c.whatsappBusinessAccountId,
      wabaName: h?.wabaName ?? null,
      businessId: h?.businessId ?? null,
      businessName: h?.businessName ?? null,
      billingStatus: h?.billingStatus ?? "unknown",
      billingUrl: metaBillingUrl(h?.businessId),
      phoneNumbers: [] as any[],
      checkedAt: h?.checkedAt ?? null,
    };
    if (h?.billingStatus === "attention") entry.billingStatus = "attention";
    entry.phoneNumbers.push({
      channelId: c.id, name: c.name, phoneNumber: c.phoneNumber, phoneNumberId: c.phoneNumberId,
      isActive: c.isActive, overallStatus: h?.overallStatus ?? "unknown",
    });
    wabas.set(key, entry);
  }

  const [subscription, usage] = await Promise.all([
    owner ? subscriptionDetails(owner).then((d) => d.subscription) : Promise.resolve(null),
    usageSummary(scope, usageFilterSchema.parse({ range: "this_month" })),
  ]);

  res.json({
    success: true,
    data: {
      subscription,
      metaUsage: usage,
      metaAccounts: [...wabas.values()],
      notices: { metaDirectBilling: META_DIRECT_BILLING_NOTICE, estimate: ESTIMATE_DISCLAIMER, tax: TAX_DISCLAIMER },
    },
  });
});

// ── Meta-reported charges (pricing_analytics) ───────────────

/** What Meta itself reports as charged on the customer's WABA(s), plus
 *  HoverChat's own rate-card estimate for the same period for comparison. */
export const getMetaCharges = handle(async (req, res) => {
  const range = (META_RANGES as string[]).includes(String(req.query.range)) ? (String(req.query.range) as MetaRange) : "this_month";
  const owner = await ownerIdOf(req);
  const scope = await scopeOf(req);
  let chans = await tenantChannels(req);
  const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
  if (channelId) { assertChannel(req, channelId); chans = chans.filter((c) => c.id === channelId); }
  // Super admin: Meta's numbers are per customer WABA; skip the live calls
  // across every tenant and return only the platform-wide estimate.
  const live = owner ? await metaCharges(chans, range) : null;
  const estimate = await usageSummary(scope, usageFilterSchema.parse({ range, ...(channelId ? { channelId } : {}) }));
  res.json({
    success: true,
    data: { meta: live, estimate: { amount: estimate.estimatedCost.amount, currency: estimate.estimatedCost.currency, billable: estimate.totals.billable, categories: estimate.categories } },
    notice: META_DIRECT_BILLING_NOTICE,
  });
});

// ── Usage analytics ──────────────────────────────────────────

export const getUsageSummary = handle(async (req, res) => {
  res.json({ success: true, data: await usageSummary(await scopeOf(req), parseFilters(req)), disclaimer: ESTIMATE_DISCLAIMER });
});

export const getUsageTimeseries = handle(async (req, res) => {
  const g = req.query.granularity === "month" ? "month" : "day";
  res.json({ success: true, data: await usageTimeseries(await scopeOf(req), parseFilters(req), g) });
});

const BREAKDOWNS: BreakdownBy[] = ["category", "country", "campaign", "phone"];
export const getUsageBreakdown = handle(async (req, res) => {
  const by = String(req.query.by || "category") as BreakdownBy;
  if (!BREAKDOWNS.includes(by)) return res.status(400).json({ success: false, error: `by must be one of ${BREAKDOWNS.join(", ")}` });
  res.json({ success: true, data: await usageBreakdown(await scopeOf(req), parseFilters(req), by) });
});

export const getUsageHistory = handle(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 50;
  res.json({ success: true, data: await usageHistory(await scopeOf(req), parseFilters(req), page, pageSize) });
});

export const getUsageFilterOptions = handle(async (req, res) => {
  const chans = await tenantChannels(req);
  const ids = chans.map((c) => c.id);
  const camps = ids.length
    ? await db.select({ id: campaigns.id, name: campaigns.name, channelId: campaigns.channelId }).from(campaigns).where(inArray(campaigns.channelId, ids))
    : [];
  res.json({
    success: true,
    data: {
      channels: chans.map((c) => ({ id: c.id, name: c.name, phoneNumber: c.phoneNumber, phoneNumberId: c.phoneNumberId, wabaId: c.whatsappBusinessAccountId })),
      campaigns: camps,
      countries: KNOWN_COUNTRIES,
      categories: DASHBOARD_CATEGORIES,
    },
  });
});

// ── Account health ───────────────────────────────────────────

export const getAccountHealth = handle(async (req, res) => {
  const force = req.query.refresh === "1" || req.query.refresh === "true";
  const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
  assertChannel(req, channelId);
  let chans = await tenantChannels(req);
  if (channelId) chans = chans.filter((c) => c.id === channelId);
  if (sessionUser(req)?.role === "superadmin" && !channelId) chans = []; // admins use /api/admin/whatsapp/accounts
  const snaps = new Map((await getHealthSnapshots(chans.map((c) => c.id))).map((s) => [s.channelId, s]));

  const out = [];
  for (const c of chans.slice(0, 25)) {
    let h = snaps.get(c.id);
    if (force || !h) {
      try { h = force ? await refreshChannelHealth(c) : await getOrRefreshHealth(c); } catch (e) { console.warn("[AccountHealth]", (e as Error).message); }
    }
    if (h) out.push(presentHealth(h, c));
    else out.push({ channelId: c.id, channelName: c.name, overallStatus: "unknown", issues: [], callingIssues: [], lastError: "Health not checked yet" });
  }
  res.json({ success: true, data: out, labels: OVERALL_LABEL });
});

// ── Readiness ────────────────────────────────────────────────

const readinessQuery = z.object({
  channelId: z.string().min(1).max(64),
  templateId: z.string().max(64).optional(),
  recipients: z.coerce.number().int().min(0).max(10_000_000).optional(),
  refresh: z.string().optional(),
});

export const getReadiness = handle(async (req, res) => {
  const q = readinessQuery.parse(req.query);
  assertChannel(req, q.channelId);
  const owner = await ownerIdOf(req);
  const data = await checkCampaignReadiness({
    channelId: q.channelId, templateId: q.templateId ?? null, recipientCount: q.recipients ?? null,
    ownerId: owner, forceHealthRefresh: q.refresh === "1",
  });
  res.json({ success: true, data });
});

// ── Cost calculator / rate card (read-only for customers) ────

const estimateQuery = z.object({
  country: z.string().trim().min(1).max(8).transform((v) => (v === "*" ? v : v.toUpperCase())).default("IN"),
  marketing: z.coerce.number().int().min(0).max(1e9).default(0),
  utility: z.coerce.number().int().min(0).max(1e9).default(0),
  authentication: z.coerce.number().int().min(0).max(1e9).default(0),
  service: z.coerce.number().int().min(0).max(1e9).default(0),
  phoneNumbers: z.coerce.number().int().min(1).max(1000).default(1),
});

export const getCostEstimate = handle(async (req, res) => {
  const q = estimateQuery.parse(req.query);
  const result = calculateEstimate(await getActiveRates(), {
    country: q.country,
    counts: { marketing: q.marketing, utility: q.utility, authentication: q.authentication, service: q.service },
    phoneNumbers: q.phoneNumbers,
  });
  res.json({ success: true, data: result });
});

export const getCustomerRateCard = handle(async (req, res) => {
  const country = String(req.query.country || "IN").toUpperCase();
  const rows = await getActiveRates();
  const now = new Date();
  const data = DASHBOARD_CATEGORIES.map((cat) => {
    const r = pickRate(rows, country, cat, now);
    return r ? {
      category: cat, rate: Number(r.rate), currency: r.currency, freeMonthlyAllowance: r.freeMonthlyAllowance ?? null,
      hasVolumeTiers: !!(r.volumeTiers && r.volumeTiers.length), effectiveFrom: r.effectiveFrom,
      pricingVersion: r.pricingVersion ?? null, appliesToCountry: r.countryCode,
    } : { category: cat, rate: null, currency: null };
  });
  res.json({ success: true, data: { country, countryName: countryName(country), rates: data }, disclaimer: ESTIMATE_DISCLAIMER });
});

// ── Super admin ──────────────────────────────────────────────

export const adminBillingOverview = handle(async (req, res) => {
  const [revenue, metaUsage] = await Promise.all([
    adminSubscriptionRevenue(12),
    usageSummary({ customerId: null }, usageFilterSchema.parse({ range: String(req.query.range || "this_month") })),
  ]);
  // Kept as two separate objects on purpose: HoverChat revenue vs Meta estimates.
  res.json({
    success: true,
    data: {
      hoverchatSubscriptionRevenue: revenue,
      metaUsageEstimate: { ...metaUsage, note: "Estimates of what Meta bills customers directly. Not HoverChat revenue." },
    },
  });
});

export const adminUsage = handle(async (req, res) => {
  const f = usageFilterSchema.parse(req.query);
  const scope: Scope = { customerId: f.customerId ?? null };
  const g = req.query.granularity === "month" ? "month" : "day";
  const [summary, byCustomer, byCategory, byCountry, series] = await Promise.all([
    usageSummary(scope, f),
    usageBreakdown(scope, f, "customer", 200),
    usageBreakdown(scope, f, "category"),
    usageBreakdown(scope, f, "country"),
    usageTimeseries(scope, f, g),
  ]);
  res.json({ success: true, data: { summary, byCustomer, byCategory, byCountry, series } });
});

export const adminAccounts = handle(async (req, res) => {
  const data = await adminCustomerAccounts({
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    page: Number(req.query.page) || 1,
    pageSize: Number(req.query.pageSize) || 25,
    health: typeof req.query.health === "string" && req.query.health ? req.query.health : undefined,
  });
  res.json({ success: true, data });
});

export const adminRefreshChannelHealth = handle(async (req, res) => {
  const ch = await storage.getChannel(req.params.channelId);
  if (!ch) return res.status(404).json({ success: false, error: "Channel not found" });
  const h = await refreshChannelHealth(ch);
  res.json({ success: true, data: presentHealth(h, ch) });
});

export const adminListRateCards = handle(async (req, res) => {
  const rows = await listRateCards({
    countryCode: typeof req.query.country === "string" ? req.query.country : undefined,
    category: typeof req.query.category === "string" ? req.query.category : undefined,
    includeInactive: req.query.includeInactive !== "false",
  });
  res.json({ success: true, data: rows, countries: KNOWN_COUNTRIES });
});

export const adminCreateRateCard = handle(async (req, res) => {
  const input = rateCardInputSchema.parse(req.body);
  res.status(201).json({ success: true, data: await createRateCard(input, sessionUser(req)?.id) });
});

export const adminUpdateRateCard = handle(async (req, res) => {
  const input = rateCardInputSchema.parse(req.body);
  const row = await updateRateCard(req.params.id, input);
  if (!row) return res.status(404).json({ success: false, error: "Rate not found" });
  res.json({ success: true, data: row });
});

export const adminToggleRateCard = handle(async (req, res) => {
  const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
  const row = await setRateCardActive(req.params.id, isActive);
  if (!row) return res.status(404).json({ success: false, error: "Rate not found" });
  res.json({ success: true, data: row });
});

