/**
 * Reseller sales: customer onboarding, renewals, payment settlement,
 * refunds and the immutable earnings ledger.
 *
 * Money rules
 *  - A sale is only "paid" after verified payment (Razorpay signature /
 *    webhook, or super-admin manual verification). Never auto-paid.
 *  - Earnings are written to the ledger once per sale (unique reference),
 *    only on settlement. Failed/unpaid sales never earn.
 *  - Refunds write reversal rows keyed by refund id (idempotent).
 *  - Pricing is frozen on the sale; later pricing edits never change it.
 */
import crypto from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  paymentProviders,
  plans,
  resellerCustomers,
  resellerLedgerEntries,
  resellerProfiles,
  resellerSales,
  subscriptions,
  transactions,
  users,
  type ResellerProfile,
  type ResellerSale,
} from "@shared/schema";
import {
  addCycles,
  BILLING_CYCLES,
  computeSaleEconomics,
  ledgerBalances,
  money,
  refundReversal,
  resolvePermissions,
  toPaise,
  type ResellerPermissionKey,
} from "@shared/reseller-pricing";
import { audit, appOrigin, emailLayout, escapeHtml, HttpError, lockedPassword, newToken, notifyUsers, sendEmailTo, sha256, type Actor } from "./common";
import { issueToken, sendInviteEmail } from "./invitations.service";
import { findApplicablePricing } from "./pricing.service";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── guards ───────────────────────────────────────────────────

export function assertResellerCan(profile: ResellerProfile, perm?: ResellerPermissionKey, selling = false) {
  if (profile.status !== "active") throw new HttpError(403, "Reseller account is not active", "RESELLER_INACTIVE");
  if (selling && profile.validUntil && new Date(profile.validUntil).getTime() < Date.now()) {
    throw new HttpError(403, "Reseller agreement has expired. Contact HoverChat to renew.", "RESELLER_EXPIRED");
  }
  if (perm && !resolvePermissions(profile.permissions as any)[perm]) throw new HttpError(403, "This action is not enabled for your reseller account", "RESELLER_PERMISSION");
}

/** Customer must belong to this reseller (prevents cross-reseller access). */
export async function assertOwnsCustomer(resellerId: string, customerUserId: string) {
  const [m] = await db.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, customerUserId));
  if (!m || m.resellerId !== resellerId) throw new HttpError(404, "Customer not found");
  return m;
}

async function razorpayProviderId(exec: Pick<typeof db, "select">) {
  const [p] = await exec.select({ id: paymentProviders.id }).from(paymentProviders).where(eq(paymentProviders.providerKey, "razorpay")).limit(1);
  if (!p) throw new HttpError(409, "Razorpay is not configured in Payment Gateway settings. Configure it before selling through resellers.");
  return p.id;
}

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function uniqueUsername(exec: Pick<typeof db, "select">, email: string) {
  const base = email.toLowerCase().split("@")[0].replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "customer";
  // Prefer the email itself as login username (matches how resellers sign in).
  const [taken] = await exec.select({ id: users.id }).from(users).where(eq(users.username, email.toLowerCase()));
  if (!taken) return email.toLowerCase();
  for (let i = 0; i < 20; i++) {
    const candidate = `${base}${crypto.randomInt(100, 99999)}`;
    const [u] = await exec.select({ id: users.id }).from(users).where(eq(users.username, candidate));
    if (!u) return candidate;
  }
  return `${base}${crypto.randomBytes(4).toString("hex")}`;
}

// ── create customer + first sale ─────────────────────────────

export const newCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  businessName: z.string().trim().min(1).max(160),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid mobile number"),
  planId: z.string().min(1).max(64),
  billingCycle: z.enum(BILLING_CYCLES),
  cycles: z.coerce.number().int().min(1).max(36).default(1),
  unitSellingPrice: z.coerce.number().positive().optional(),
  startDate: z.coerce.date().optional(),
  sendInvite: z.boolean().optional().default(true),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().max(80).optional(),
});
export type NewCustomerInput = z.infer<typeof newCustomerSchema>;

export async function createCustomerWithSale(profileId: string, input: NewCustomerInput, actor: Actor) {
  if (input.idempotencyKey) {
    const [dup] = await db.select().from(resellerSales).where(and(eq(resellerSales.resellerId, profileId), eq(resellerSales.idempotencyKey, input.idempotencyKey)));
    if (dup) return { sale: dup, customerUserId: dup.customerUserId, duplicate: true, payUrl: null, inviteUrl: null };
  }
  const start = input.startDate ? new Date(input.startDate) : new Date();
  if (start < startOfToday()) throw new HttpError(400, "Start date cannot be in the past");
  if (start.getTime() > Date.now() + 60 * 86400_000) throw new HttpError(400, "Start date can be at most 60 days ahead");

  const payToken = newToken();
  const result = await db.transaction(async (tx) => {
    const [profile] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, profileId)).for("update");
    if (!profile) throw new HttpError(404, "Reseller not found");
    if (actor.role === "reseller") assertResellerCan(profile, "createCustomers", true);
    else if (profile.status !== "active") throw new HttpError(409, "Reseller is not active");

    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, profileId));
    if (n >= profile.maxCustomers) throw new HttpError(409, `Customer limit reached (${profile.maxCustomers}). Contact HoverChat to raise it.`, "CUSTOMER_LIMIT");

    const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email}`);
    if (exists) throw new HttpError(409, "An account with this email already exists. Existing customers can only be moved between resellers by HoverChat.", "EMAIL_EXISTS");

    const pricing = await findApplicablePricing(tx, profileId, input.planId, input.billingCycle, null);
    if (!pricing) throw new HttpError(403, "This plan/billing cycle is not authorised for your reseller account", "PLAN_NOT_AUTHORISED");
    const perms = resolvePermissions(profile.permissions as any);
    const econ = computeSaleEconomics(pricing, input.unitSellingPrice, input.cycles, { canSetPrice: actor.role === "reseller" ? perms.setSellingPrice : true });

    const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId));
    if (!plan) throw new HttpError(404, "Plan not found");
    const providerId = await razorpayProviderId(tx);
    const end = addCycles(start, input.billingCycle, input.cycles);
    const immediate = profile.activationPolicy === "immediate";

    const [customer] = await tx
      .insert(users)
      .values({
        username: await uniqueUsername(tx, input.email),
        password: lockedPassword(),
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName || null,
        role: "admin",
        status: "active",
        permissions: [],
        isEmailVerified: false,
      })
      .returning({ id: users.id, email: users.email, firstName: users.firstName });

    await tx.insert(resellerCustomers).values({
      resellerId: profileId, customerUserId: customer.id, businessName: input.businessName, mobile: input.mobile, source: "reseller_created",
    });

    const [txn] = await tx
      .insert(transactions)
      .values({
        userId: customer.id, planId: plan.id, paymentProviderId: providerId, amount: String(econ.sellingPrice), currency: econ.currency,
        billingCycle: input.billingCycle, status: "pending",
        metadata: { source: "reseller", resellerId: profileId, resellerCode: profile.resellerCode, saleType: "new" },
      })
      .returning();

    const [sub] = await tx
      .insert(subscriptions)
      .values({
        userId: customer.id, planId: plan.id,
        planData: { name: plan.name, description: plan.description, monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice, permissions: plan.permissions, features: plan.features },
        status: immediate ? "active" : "pending", billingCycle: input.billingCycle, startDate: start, endDate: end,
        autoRenew: false, gatewayProvider: "reseller", gatewayStatus: immediate ? "active_unpaid" : "awaiting_payment",
      })
      .returning();
    await tx.update(transactions).set({ subscriptionId: sub.id }).where(eq(transactions.id, txn.id));

    const [sale] = await tx
      .insert(resellerSales)
      .values({
        resellerId: profileId, customerUserId: customer.id, saleType: "new", planId: plan.id, planName: plan.name,
        billingCycle: input.billingCycle, cycles: econ.cycles, periodStart: start, periodEnd: end,
        unitSellingPrice: String(econ.unitSellingPrice), sellingPrice: String(econ.sellingPrice),
        wholesaleCost: econ.wholesaleCost === null ? null : String(econ.wholesaleCost),
        commissionAmount: econ.commissionAmount === null ? null : String(econ.commissionAmount),
        resellerEarning: String(econ.resellerEarning), platformRevenue: String(econ.platformRevenue), currency: econ.currency,
        pricingModel: econ.pricingModel, pricingRowId: pricing.id, pricingVersion: pricing.version, pricingSnapshot: econ.snapshot,
        paymentStatus: "pending", activationPolicy: profile.activationPolicy, transactionId: txn.id, subscriptionId: sub.id,
        payTokenHash: sha256(payToken), idempotencyKey: input.idempotencyKey ?? null, notes: input.notes ?? null, createdBy: actor.id,
      })
      .returning();

    await audit(tx, { resellerId: profileId, actor, action: "customer.created", entityType: "customer", entityId: customer.id, after: { email: customer.email, businessName: input.businessName } });
    await audit(tx, { resellerId: profileId, actor, action: "sale.created", entityType: "sale", entityId: sale.id, after: { sellingPrice: sale.sellingPrice, resellerEarning: sale.resellerEarning, pricingVersion: sale.pricingVersion } });
    const inviteToken = input.sendInvite ? await issueToken(tx, customer.id, "customer_invite", actor.id) : null;
    return { profile, customer, sale, inviteToken };
  });

  const payUrl = `${await appOrigin()}/pay/${payToken}`;
  let inviteUrl: string | null = null;
  if (result.inviteToken) {
    inviteUrl = await sendInviteEmail({ to: result.customer.email, name: result.customer.firstName, token: result.inviteToken, purpose: "customer_invite", resellerName: result.profile.businessName });
  }
  await sendEmailTo(result.customer.email, `HoverChat invoice — ${result.sale.planName}`, invoiceEmail(result.sale, payUrl, result.profile.businessName));
  // Platform WhatsApp welcome (super admin's number + approved template), if configured
  try {
    const { enqueue } = await import("../jobs/queue");
    await enqueue("whatsapp.platform", { event: "customer_onboarded", customerUserId: result.customer.id, extra: { ...(inviteUrl ? { activation_link: inviteUrl } : {}), payment_link: payUrl } }, { jobId: `onboard-${result.customer.id}`, attempts: 3, delayMs: 3000 });
  } catch (e) { console.warn("[Reseller] WhatsApp welcome not queued:", (e as Error).message); }
  await notifyUsers([result.profile.userId], {
    type: "reseller_customer_created",
    title: "New customer and subscription sale",
    message: `${input.businessName}: ${result.sale.planName} for ₹${money(result.sale.sellingPrice)} — awaiting payment`,
  });
  return { sale: result.sale, customerUserId: result.customer.id, duplicate: false, payUrl, inviteUrl };
}

function invoiceEmail(sale: ResellerSale, payUrl: string, resellerName: string) {
  const period = `${new Date(sale.periodStart).toDateString()} – ${new Date(sale.periodEnd).toDateString()}`;
  return emailLayout(
    sale.saleType === "renewal" ? "Your HoverChat renewal" : "Your HoverChat subscription",
    `<p>${escapeHtml(resellerName)} has ${sale.saleType === "renewal" ? "prepared your renewal" : "set up your subscription"}.</p>
     <table style="width:100%;font-size:14px;border-collapse:collapse">
       <tr><td style="padding:4px 0;color:#6b7280">Plan</td><td style="text-align:right">${escapeHtml(sale.planName)} (${escapeHtml(sale.billingCycle)} × ${sale.cycles})</td></tr>
       <tr><td style="padding:4px 0;color:#6b7280">Period</td><td style="text-align:right">${escapeHtml(period)}</td></tr>
       <tr><td style="padding:4px 0;color:#6b7280">Amount</td><td style="text-align:right;font-weight:700">₹${money(sale.sellingPrice).toFixed(2)}</td></tr>
     </table>
     <p>Payment goes securely to HoverChat through Razorpay.</p>`,
    { label: `Pay ₹${money(sale.sellingPrice).toFixed(2)}`, url: payUrl },
  );
}

// ── renewal ──────────────────────────────────────────────────

export const renewalSchema = z.object({
  planId: z.string().max(64).optional(),
  billingCycle: z.enum(BILLING_CYCLES).optional(),
  cycles: z.coerce.number().int().min(1).max(36).default(1),
  unitSellingPrice: z.coerce.number().positive().optional(),
  notes: z.string().trim().max(1000).optional(),
  idempotencyKey: z.string().trim().max(80).optional(),
});

async function currentSubscription(exec: Pick<typeof db, "select">, customerUserId: string) {
  const [sub] = await exec
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, customerUserId), inArray(subscriptions.status, ["active", "expired", "pending"])))
    .orderBy(sql`CASE WHEN ${subscriptions.status} = 'active' THEN 0 WHEN ${subscriptions.status} = 'expired' THEN 1 ELSE 2 END`, desc(subscriptions.endDate))
    .limit(1);
  return sub ?? null;
}

export async function createRenewal(profileId: string, customerUserId: string, input: z.infer<typeof renewalSchema>, actor: Actor) {
  if (input.idempotencyKey) {
    const [dup] = await db.select().from(resellerSales).where(and(eq(resellerSales.resellerId, profileId), eq(resellerSales.idempotencyKey, input.idempotencyKey)));
    if (dup) return { sale: dup, duplicate: true, payUrl: null };
  }
  const payToken = newToken();
  const out = await db.transaction(async (tx) => {
    const [profile] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, profileId)).for("update");
    if (!profile) throw new HttpError(404, "Reseller not found");
    if (actor.role === "reseller") assertResellerCan(profile, "renewSubscriptions", true);
    const [map] = await tx.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, customerUserId)).for("update");
    if (!map || map.resellerId !== profileId) throw new HttpError(404, "Customer not found");

    const [open] = await tx.select({ id: resellerSales.id }).from(resellerSales)
      .where(and(eq(resellerSales.customerUserId, customerUserId), inArray(resellerSales.paymentStatus, ["pending", "pending_verification"])));
    if (open) throw new HttpError(409, "This customer already has an unpaid invoice. Collect or cancel it before creating another.", "OPEN_INVOICE");

    const cur = await currentSubscription(tx, customerUserId);
    const planId = input.planId || cur?.planId;
    const cycle = input.billingCycle || (cur?.billingCycle as any) || "monthly";
    if (!planId) throw new HttpError(400, "Select a plan for this renewal");
    const pricing = await findApplicablePricing(tx, profileId, planId, cycle, customerUserId);
    if (!pricing) throw new HttpError(403, "This plan/billing cycle is not authorised for your reseller account", "PLAN_NOT_AUTHORISED");
    const perms = resolvePermissions(profile.permissions as any);
    const econ = computeSaleEconomics(pricing, input.unitSellingPrice, input.cycles, { canSetPrice: actor.role === "reseller" ? perms.setSellingPrice : true });
    const [plan] = await tx.select().from(plans).where(eq(plans.id, planId));
    if (!plan) throw new HttpError(404, "Plan not found");
    const providerId = await razorpayProviderId(tx);

    const samePlanActive = cur && cur.status === "active" && cur.planId === planId && new Date(cur.endDate).getTime() > Date.now();
    const start = samePlanActive ? new Date(cur!.endDate) : new Date();
    const end = addCycles(start, cycle, input.cycles);
    const immediate = profile.activationPolicy === "immediate";

    const [txn] = await tx.insert(transactions).values({
      userId: customerUserId, planId, paymentProviderId: providerId, amount: String(econ.sellingPrice), currency: econ.currency,
      billingCycle: cycle, status: "pending", subscriptionId: cur?.id ?? null,
      metadata: { source: "reseller", resellerId: profileId, resellerCode: profile.resellerCode, saleType: "renewal" },
    }).returning();

    const [sale] = await tx.insert(resellerSales).values({
      resellerId: profileId, customerUserId, saleType: "renewal", planId, planName: plan.name, billingCycle: cycle, cycles: econ.cycles,
      periodStart: start, periodEnd: end, unitSellingPrice: String(econ.unitSellingPrice), sellingPrice: String(econ.sellingPrice),
      wholesaleCost: econ.wholesaleCost === null ? null : String(econ.wholesaleCost),
      commissionAmount: econ.commissionAmount === null ? null : String(econ.commissionAmount),
      resellerEarning: String(econ.resellerEarning), platformRevenue: String(econ.platformRevenue), currency: econ.currency,
      pricingModel: econ.pricingModel, pricingRowId: pricing.id, pricingVersion: pricing.version, pricingSnapshot: econ.snapshot,
      paymentStatus: "pending", activationPolicy: profile.activationPolicy, transactionId: txn.id, subscriptionId: cur?.id ?? null,
      payTokenHash: sha256(payToken), idempotencyKey: input.idempotencyKey ?? null, notes: input.notes ?? null, createdBy: actor.id,
    }).returning();

    if (immediate) await applySubscriptionForSale(tx, sale, new Date());
    await audit(tx, { resellerId: profileId, actor, action: "sale.renewal_created", entityType: "sale", entityId: sale.id, after: { sellingPrice: sale.sellingPrice, periodStart: start, periodEnd: end } });
    const [cust] = await tx.select({ email: users.email }).from(users).where(eq(users.id, customerUserId));
    return { sale, profile, email: cust?.email };
  });
  const payUrl = `${await appOrigin()}/pay/${payToken}`;
  if (out.email) await sendEmailTo(out.email, `HoverChat renewal invoice — ${out.sale.planName}`, invoiceEmail(out.sale, payUrl, out.profile.businessName));
  const [fresh] = await db.select().from(resellerSales).where(eq(resellerSales.id, out.sale.id));
  return { sale: fresh, duplicate: false, payUrl };
}

/**
 * Put the sale's period onto the customer's subscription.
 *  - new sale → the pending subscription becomes active (start shifted to
 *    `now` if payment arrived after the planned start).
 *  - renewal  → extends the same-plan subscription, or replaces it on a
 *    plan change.
 */
async function applySubscriptionForSale(tx: Tx, sale: ResellerSale, now: Date) {
  if (sale.saleType === "new") {
    if (!sale.subscriptionId) return;
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sale.subscriptionId));
    if (!sub) return;
    if (sub.status === "active") return; // immediate policy already active
    let start = new Date(sale.periodStart);
    let end = new Date(sale.periodEnd);
    if (start < now) { start = now; end = addCycles(now, sale.billingCycle, sale.cycles); }
    await tx.update(subscriptions).set({ status: "active", startDate: start, endDate: end, gatewayStatus: "active", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
    await tx.update(resellerSales).set({ periodStart: start, periodEnd: end, updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
    return;
  }
  const cur = await currentSubscription(tx, sale.customerUserId);
  const curActive = cur && cur.status === "active" && new Date(cur.endDate).getTime() > now.getTime();
  if (cur && cur.planId === sale.planId && cur.status !== "pending") {
    const base = curActive ? new Date(cur.endDate) : now;
    // If already extended for this sale (immediate policy), keep it.
    if (curActive && new Date(cur.endDate).getTime() >= new Date(sale.periodEnd).getTime() && sale.activationPolicy === "immediate" && sale.paymentStatus !== "pending") return;
    const start = curActive && new Date(sale.periodStart) <= new Date(cur.endDate) ? new Date(sale.periodStart) : base;
    const end = addCycles(start, sale.billingCycle, sale.cycles);
    await tx.update(subscriptions).set({ status: "active", endDate: end, billingCycle: sale.billingCycle, updatedAt: new Date() }).where(eq(subscriptions.id, cur.id));
    await tx.update(resellerSales).set({ periodStart: start, periodEnd: end, subscriptionId: cur.id, updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
    await tx.update(transactions).set({ subscriptionId: cur.id }).where(eq(transactions.id, sale.transactionId!));
    return;
  }
  // plan change (or no usable subscription): replace
  await tx.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(subscriptions.userId, sale.customerUserId), eq(subscriptions.status, "active")));
  const [plan] = await tx.select().from(plans).where(eq(plans.id, sale.planId));
  const start = now;
  const end = addCycles(start, sale.billingCycle, sale.cycles);
  const [sub] = await tx.insert(subscriptions).values({
    userId: sale.customerUserId, planId: sale.planId,
    planData: plan ? { name: plan.name, description: plan.description, monthlyPrice: plan.monthlyPrice, annualPrice: plan.annualPrice, permissions: plan.permissions, features: plan.features } : { name: sale.planName },
    status: "active", billingCycle: sale.billingCycle, startDate: start, endDate: end, autoRenew: false, gatewayProvider: "reseller", gatewayStatus: "active",
  }).returning();
  await tx.update(resellerSales).set({ periodStart: start, periodEnd: end, subscriptionId: sub.id, updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
  await tx.update(transactions).set({ subscriptionId: sub.id }).where(eq(transactions.id, sale.transactionId!));
}

// ── settlement ───────────────────────────────────────────────

export interface SettleInput {
  method: "razorpay" | "manual";
  reference?: string | null;
  providerPaymentId?: string | null;
  providerOrderId?: string | null;
  /** amount actually paid, in paise — mismatch blocks activation */
  amountPaise?: number | null;
  actor?: Actor | null;
}

export async function settleSale(saleId: string, p: SettleInput) {
  const res = await db.transaction(async (tx) => {
    const [sale] = await tx.select().from(resellerSales).where(eq(resellerSales.id, saleId)).for("update");
    if (!sale) throw new HttpError(404, "Sale not found");
    if (!["pending", "pending_verification"].includes(sale.paymentStatus)) return { settled: false, sale, reason: `already ${sale.paymentStatus}` };

    if (p.amountPaise !== null && p.amountPaise !== undefined && p.amountPaise !== toPaise(sale.sellingPrice)) {
      await tx.update(resellerSales).set({ paymentStatus: "pending_verification", paymentReference: p.providerPaymentId ?? p.reference ?? null, notes: `${sale.notes ?? ""}\n[auto] amount mismatch: paid ${p.amountPaise / 100}`.trim(), updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
      await audit(tx, { resellerId: sale.resellerId, actor: p.actor ?? null, action: "sale.amount_mismatch", entityType: "sale", entityId: sale.id, after: { paidPaise: p.amountPaise } });
      return { settled: false, sale, reason: "amount mismatch — needs verification" };
    }

    const now = new Date();
    const [profile] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, sale.resellerId));
    await tx.update(resellerSales).set({
      paymentStatus: "paid", paidAt: now, paymentMethod: p.method,
      paymentReference: p.providerPaymentId ?? p.reference ?? null, razorpayOrderId: sale.razorpayOrderId ?? p.providerOrderId ?? null, updatedAt: now,
    }).where(eq(resellerSales.id, sale.id));
    if (sale.transactionId) {
      await tx.update(transactions).set({
        status: "completed", paidAt: now, providerPaymentId: p.providerPaymentId ?? null,
        providerOrderId: sale.razorpayOrderId ?? p.providerOrderId ?? null, paymentMethod: p.method === "manual" ? "manual" : null, updatedAt: now,
      }).where(eq(transactions.id, sale.transactionId));
    }
    const paidSale = { ...sale, paymentStatus: "paid" };
    await applySubscriptionForSale(tx, paidSale as ResellerSale, now);

    const hold = profile?.payoutHoldDays ?? 7;
    await tx.insert(resellerLedgerEntries).values({
      resellerId: sale.resellerId, saleId: sale.id, entryType: "earning", amount: String(money(sale.resellerEarning)), currency: sale.currency,
      reference: sale.id, availableAt: new Date(now.getTime() + hold * 86400_000),
      description: `${sale.saleType === "renewal" ? "Renewal" : "New"} — ${sale.planName}`, createdBy: p.actor?.id ?? "system",
    }).onConflictDoNothing();
    await audit(tx, { resellerId: sale.resellerId, actor: p.actor ?? null, action: "sale.paid", entityType: "sale", entityId: sale.id, after: { method: p.method, reference: p.providerPaymentId ?? p.reference, earning: sale.resellerEarning } });
    const [fresh] = await tx.select().from(resellerSales).where(eq(resellerSales.id, sale.id));
    return { settled: true, sale: fresh, profile };
  });

  if (res.settled) {
    const s = res.sale;
    await notifyUsers([res.profile!.userId], {
      type: "reseller_payment_received",
      title: "Payment received",
      message: `₹${money(s.sellingPrice)} for ${s.planName}. Your margin: ₹${money(s.resellerEarning)}.`,
    });
    await notifyUsers([s.customerUserId], {
      type: "subscription_activated",
      title: s.saleType === "renewal" ? "Subscription renewed" : "Subscription activated",
      message: `${s.planName} active until ${new Date(s.periodEnd).toDateString()}.`,
      email: {
        subject: s.saleType === "renewal" ? "Your HoverChat subscription is renewed" : "Your HoverChat subscription is active",
        html: emailLayout("Payment confirmed", `<p>We received ₹${money(s.sellingPrice).toFixed(2)} for ${escapeHtml(s.planName)}.</p><p>Your subscription is active until <strong>${new Date(s.periodEnd).toDateString()}</strong>.</p>`),
      },
    });
  }
  return res;
}

// ── cancel unpaid sale ───────────────────────────────────────

export async function cancelSale(saleId: string, actor: Actor, reason?: string, resellerScope?: string) {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(resellerSales).where(eq(resellerSales.id, saleId)).for("update");
    if (!sale || (resellerScope && sale.resellerId !== resellerScope)) throw new HttpError(404, "Sale not found");
    if (!["pending", "pending_verification"].includes(sale.paymentStatus)) throw new HttpError(409, `Cannot cancel a ${sale.paymentStatus} sale. Paid sales are refunded instead.`);
    await tx.update(resellerSales).set({ paymentStatus: "cancelled", cancelledAt: new Date(), payTokenHash: null, updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
    if (sale.transactionId) await tx.update(transactions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(transactions.id, sale.transactionId));
    // Revoke access granted ahead of payment.
    if (sale.subscriptionId) {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sale.subscriptionId));
      if (sub) {
        if (sale.saleType === "new") {
          await tx.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        } else if (sale.activationPolicy === "immediate" && new Date(sub.endDate).getTime() === new Date(sale.periodEnd).getTime()) {
          const back = new Date(sale.periodStart);
          await tx.update(subscriptions).set({ endDate: back, status: back < new Date() ? "expired" : "active", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        }
      }
    }
    await audit(tx, { resellerId: sale.resellerId, actor, action: "sale.cancelled", entityType: "sale", entityId: sale.id, after: { reason: reason ?? null } });
    return { ...sale, paymentStatus: "cancelled" };
  });
}

// ── refunds ──────────────────────────────────────────────────

export async function applyRefund(saleId: string, refundAmount: number, refundRef: string, actor: Actor | null) {
  const out = await db.transaction(async (tx) => {
    const [sale] = await tx.select().from(resellerSales).where(eq(resellerSales.id, saleId)).for("update");
    if (!sale) throw new HttpError(404, "Sale not found");
    if (!["paid", "partially_refunded"].includes(sale.paymentStatus)) throw new HttpError(409, `Only paid sales can be refunded (status ${sale.paymentStatus})`);
    const [profile] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, sale.resellerId));
    const remaining = toPaise(sale.sellingPrice) - toPaise(sale.refundedAmount);
    const amountP = Math.min(toPaise(refundAmount), remaining);
    if (amountP <= 0) return { applied: false, sale, reason: "nothing left to refund" };
    const reversal = refundReversal(profile?.refundPolicy ?? "proportional", sale, amountP / 100, sale.refundedAmount);
    const inserted = await tx.insert(resellerLedgerEntries).values({
      resellerId: sale.resellerId, saleId: sale.id, entryType: "reversal", amount: String(reversal), currency: sale.currency,
      reference: `refund:${refundRef}`, availableAt: new Date(), description: `Refund ₹${(amountP / 100).toFixed(2)} (${profile?.refundPolicy ?? "proportional"} policy)`,
      createdBy: actor?.id ?? "system",
    }).onConflictDoNothing().returning({ id: resellerLedgerEntries.id });
    if (inserted.length === 0) return { applied: false, sale, reason: "refund already processed" };

    const newRefunded = toPaise(sale.refundedAmount) + amountP;
    const full = newRefunded >= toPaise(sale.sellingPrice);
    await tx.update(resellerSales).set({ refundedAmount: String(newRefunded / 100), paymentStatus: full ? "refunded" : "partially_refunded", updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
    if (full && sale.transactionId) {
      await tx.update(transactions).set({ status: "refunded", refundedAt: new Date(), updatedAt: new Date() }).where(eq(transactions.id, sale.transactionId));
    }
    if (full && sale.subscriptionId) {
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, sale.subscriptionId));
      if (sub) {
        if (sale.saleType === "new") {
          await tx.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        } else if (new Date(sub.endDate).getTime() === new Date(sale.periodEnd).getTime()) {
          const back = new Date(sale.periodStart);
          await tx.update(subscriptions).set({ endDate: back, status: back < new Date() ? "expired" : "active", updatedAt: new Date() }).where(eq(subscriptions.id, sub.id));
        }
      }
    }
    await audit(tx, { resellerId: sale.resellerId, actor, action: "sale.refunded", entityType: "sale", entityId: sale.id, after: { refundRef, amount: amountP / 100, reversal, full } });
    return { applied: true, sale: { ...sale, paymentStatus: full ? "refunded" : "partially_refunded" }, reversal, profile };
  });
  if (out.applied && out.profile) {
    await notifyUsers([out.profile.userId], {
      type: "reseller_margin_updated",
      title: "Margin adjusted after refund",
      message: `${out.sale.planName}: refund recorded. Margin change ₹${out.reversal}.`,
    });
  }
  return out;
}

// ── payouts / adjustments (super admin, manual — no automatic payouts) ──

export async function resellerBalances(resellerId: string) {
  const rows = await db.select({ entryType: resellerLedgerEntries.entryType, amount: resellerLedgerEntries.amount, availableAt: resellerLedgerEntries.availableAt })
    .from(resellerLedgerEntries).where(eq(resellerLedgerEntries.resellerId, resellerId));
  return ledgerBalances(rows);
}

export async function recordPayout(resellerId: string, amount: number, reference: string, note: string | null, actor: Actor) {
  return db.transaction(async (tx) => {
    await tx.select({ id: resellerProfiles.id }).from(resellerProfiles).where(eq(resellerProfiles.id, resellerId)).for("update");
    const rows = await tx.select({ entryType: resellerLedgerEntries.entryType, amount: resellerLedgerEntries.amount, availableAt: resellerLedgerEntries.availableAt })
      .from(resellerLedgerEntries).where(eq(resellerLedgerEntries.resellerId, resellerId));
    const bal = ledgerBalances(rows);
    if (amount <= 0) throw new HttpError(400, "Payout amount must be positive");
    if (toPaise(amount) > toPaise(bal.withdrawable)) throw new HttpError(409, `Payout exceeds withdrawable balance (₹${bal.withdrawable})`);
    const [row] = await tx.insert(resellerLedgerEntries).values({
      resellerId, entryType: "payout", amount: String(-money(amount)), reference: `payout:${reference}`, availableAt: new Date(),
      description: note || "Manual payout", createdBy: actor.id,
    }).onConflictDoNothing().returning();
    if (!row) throw new HttpError(409, "A payout with this reference already exists");
    await audit(tx, { resellerId, actor, action: "payout.recorded", entityType: "ledger", entityId: row.id, after: { amount, reference } });
    return row;
  });
}

export async function recordAdjustment(resellerId: string, amount: number, reference: string, reason: string, actor: Actor) {
  if (!reason?.trim()) throw new HttpError(400, "Adjustment reason is required");
  const [row] = await db.insert(resellerLedgerEntries).values({
    resellerId, entryType: "adjustment", amount: String(money(amount)), reference: `adjustment:${reference}`, availableAt: new Date(),
    description: reason, createdBy: actor.id,
  }).onConflictDoNothing().returning();
  if (!row) throw new HttpError(409, "An adjustment with this reference already exists");
  await audit(db, { resellerId, actor, action: "adjustment.recorded", entityType: "ledger", entityId: row.id, after: { amount, reason } });
  return row;
}

// ── Razorpay checkout (HoverChat's own Razorpay account) ─────

async function razorpaySecrets() {
  const [p] = await db.select().from(paymentProviders).where(and(eq(paymentProviders.providerKey, "razorpay"), eq(paymentProviders.isActive, true))).limit(1);
  if (!p) throw new HttpError(503, "Online payment is not available right now");
  const live = p.config?.isLive === true;
  const keyId = live ? p.config?.apiKey : p.config?.apiKeyTest;
  const secret = live ? p.config?.apiSecret : p.config?.apiSecretTest;
  if (!keyId || !secret) throw new HttpError(503, "Online payment is not configured");
  return { keyId: String(keyId), secret: String(secret) };
}

export async function saleByPayToken(token: string) {
  if (!token || token.length < 20 || token.length > 200) throw new HttpError(404, "Payment link not found");
  const [sale] = await db.select().from(resellerSales).where(eq(resellerSales.payTokenHash, sha256(token)));
  if (!sale) throw new HttpError(404, "Payment link not found or no longer valid");
  return sale;
}

export async function publicSaleView(sale: ResellerSale) {
  const [profile] = await db.select({ businessName: resellerProfiles.businessName }).from(resellerProfiles).where(eq(resellerProfiles.id, sale.resellerId));
  const [cust] = await db.select({ firstName: users.firstName, email: users.email }).from(users).where(eq(users.id, sale.customerUserId));
  const [map] = await db.select({ businessName: resellerCustomers.businessName }).from(resellerCustomers).where(eq(resellerCustomers.customerUserId, sale.customerUserId));
  const maskedEmail = cust?.email ? cust.email.replace(/^(.{2}).*(@.*)$/, "$1•••$2") : null;
  return {
    saleId: sale.id, status: sale.paymentStatus, planName: sale.planName, billingCycle: sale.billingCycle, cycles: sale.cycles,
    periodStart: sale.periodStart, periodEnd: sale.periodEnd, amount: money(sale.sellingPrice), currency: sale.currency,
    saleType: sale.saleType, resellerName: profile?.businessName ?? null, customerName: map?.businessName || cust?.firstName || null, email: maskedEmail,
  };
}

export async function ensureOrder(sale: ResellerSale) {
  if (!["pending", "pending_verification"].includes(sale.paymentStatus)) throw new HttpError(409, `This invoice is ${sale.paymentStatus}`);
  const { keyId } = await razorpaySecrets();
  if (sale.razorpayOrderId) return { orderId: sale.razorpayOrderId, keyId, amountPaise: toPaise(sale.sellingPrice), currency: sale.currency };
  const { getRazorpay } = await import("../payment-gateway.service");
  const rzp = await getRazorpay();
  if (!rzp) throw new HttpError(503, "Online payment is not available right now");
  const order = await rzp.orders.create({
    amount: toPaise(sale.sellingPrice), currency: sale.currency, receipt: `rs_${sale.id.replace(/-/g, "").slice(0, 30)}`,
    notes: { resellerSaleId: sale.id, source: "hoverchat_reseller" },
  } as any);
  const won = await db.update(resellerSales).set({ razorpayOrderId: order.id, updatedAt: new Date() })
    .where(and(eq(resellerSales.id, sale.id), sql`${resellerSales.razorpayOrderId} IS NULL`)).returning({ id: resellerSales.id });
  if (!won.length) {
    const [again] = await db.select().from(resellerSales).where(eq(resellerSales.id, sale.id));
    return { orderId: again.razorpayOrderId!, keyId, amountPaise: toPaise(sale.sellingPrice), currency: sale.currency };
  }
  if (sale.transactionId) await db.update(transactions).set({ providerOrderId: order.id, updatedAt: new Date() }).where(eq(transactions.id, sale.transactionId));
  return { orderId: order.id, keyId, amountPaise: toPaise(sale.sellingPrice), currency: sale.currency };
}

export async function verifyCheckout(sale: ResellerSale, body: { razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string }) {
  const { secret } = await razorpaySecrets();
  const orderId = String(body.razorpay_order_id || "");
  const paymentId = String(body.razorpay_payment_id || "");
  const sig = String(body.razorpay_signature || "");
  if (!sale.razorpayOrderId || orderId !== sale.razorpayOrderId) throw new HttpError(400, "Order does not match this invoice");
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  const ok = sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) {
    await audit(db, { resellerId: sale.resellerId, actor: null, action: "sale.signature_invalid", entityType: "sale", entityId: sale.id, after: { orderId, paymentId } });
    throw new HttpError(400, "Payment could not be verified");
  }
  return settleSale(sale.id, { method: "razorpay", providerOrderId: orderId, providerPaymentId: paymentId });
}

/** Razorpay webhook branch. Returns true when the event belonged to a reseller sale. */
export async function handleResellerRazorpayEvent(eventType: string, event: any): Promise<boolean> {
  const payment = event?.payload?.payment?.entity;
  const order = event?.payload?.order?.entity;
  const refund = event?.payload?.refund?.entity;
  if (eventType === "payment.captured" || eventType === "order.paid" || eventType === "payment.authorized" || eventType === "payment.failed") {
    const orderId = payment?.order_id || order?.id;
    if (!orderId) return false;
    const [sale] = await db.select().from(resellerSales).where(eq(resellerSales.razorpayOrderId, orderId));
    if (!sale) return false;
    if (eventType === "payment.captured" || eventType === "order.paid") {
      const amount = payment?.amount ?? order?.amount_paid ?? null;
      await settleSale(sale.id, { method: "razorpay", providerOrderId: orderId, providerPaymentId: payment?.id ?? null, amountPaise: typeof amount === "number" ? amount : null });
    } else if (eventType === "payment.failed") {
      await audit(db, { resellerId: sale.resellerId, actor: null, action: "sale.payment_failed", entityType: "sale", entityId: sale.id, after: { paymentId: payment?.id, reason: payment?.error_description } });
    }
    return true;
  }
  if ((eventType === "refund.created" || eventType === "refund.processed") && refund?.payment_id) {
    const [row] = await db
      .select({ sale: resellerSales })
      .from(resellerSales)
      .innerJoin(transactions, eq(transactions.id, resellerSales.transactionId))
      .where(eq(transactions.providerPaymentId, refund.payment_id));
    if (!row) return false;
    try {
      await applyRefund(row.sale.id, Number(refund.amount) / 100, refund.id, null);
    } catch (e) {
      console.error("[Reseller] refund webhook:", (e as Error).message);
    }
    return true;
  }
  return false;
}

/** New pay link for an unpaid sale (old link stops working). */
export async function rotatePayLink(sale: ResellerSale) {
  if (!["pending", "pending_verification"].includes(sale.paymentStatus)) throw new HttpError(409, `This invoice is ${sale.paymentStatus}`);
  const token = newToken();
  await db.update(resellerSales).set({ payTokenHash: sha256(token), updatedAt: new Date() }).where(eq(resellerSales.id, sale.id));
  return `${await appOrigin()}/pay/${token}`;
}
