/**
 * Reseller portal, super-admin reseller management, public pay links,
 * invitation acceptance and customer-side reseller invoices.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { resellerCustomers, resellerProfiles, resellerSales, users } from "@shared/schema";
import { DEFAULT_RESELLER_PERMISSIONS, PricingError, resolvePermissions, RESELLER_PERMISSION_KEYS, money } from "@shared/reseller-pricing";
import { audit, HttpError, type Actor, emailLayout, escapeHtml, sendEmailTo } from "../services/reseller/common";
import { acceptToken, describeToken, issueToken, sendInviteEmail } from "../services/reseller/invitations.service";
import { deactivatePricing, listPricing, pricingInputSchema, resellerCatalog, upsertPricing } from "../services/reseller/pricing.service";
import {
  applyRefund, assertOwnsCustomer, assertResellerCan, cancelSale, createCustomerWithSale, createRenewal, ensureOrder,
  newCustomerSchema, publicSaleView, recordAdjustment, recordPayout, renewalSchema, resellerBalances, rotatePayLink,
  saleByPayToken, settleSale, verifyCheckout,
} from "../services/reseller/sales.service";
import {
  archiveReseller, createReseller, createResellerSchema, deleteReseller, getProfile, sendPasswordReset, setStatus,
  transferCustomer, updateReseller, updateResellerSchema,
} from "../services/reseller/reseller-admin.service";
import {
  adminResellerSummary, auditList, customerDetail, customersList, ledgerList, planOptions, resellerDashboard, resellerList,
  salesFilterSchema, salesReport, subscriptionsList,
} from "../services/reseller/reports.service";

type H = (req: Request, res: Response) => Promise<unknown>;
export const handle = (fn: H) => async (req: Request, res: Response, _n: NextFunction) => {
  try {
    await fn(req, res);
  } catch (err: any) {
    if (err instanceof ZodError) return res.status(400).json({ success: false, error: err.errors[0]?.message || "Invalid request", details: err.flatten() });
    if (err instanceof PricingError) return res.status(400).json({ success: false, error: err.message, code: "PRICING_RULE" });
    if (err instanceof HttpError) return res.status(err.status).json({ success: false, error: err.message, code: err.code });
    if (err?.code === "23505") return res.status(409).json({ success: false, error: "Duplicate record — this action was already performed", code: "DUPLICATE" });
    console.error("[Reseller]", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};

const actorOf = (req: Request): Actor => {
  const u = (req as any).session?.user || (req as any).user;
  return { id: u?.id, role: u?.role, ip: req.ip };
};
const resellerOf = (req: Request) => (req as any).reseller as typeof resellerProfiles.$inferSelect;
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

// ═════════════════ Reseller portal ═════════════════

export const me = handle(async (req, res) => {
  const p = resellerOf(req);
  ok(res, {
    id: p.id, resellerCode: p.resellerCode, businessName: p.businessName, contactPerson: p.contactPerson, email: p.email, mobile: p.mobile,
    companyName: p.companyName, address: p.address, status: p.status, maxCustomers: p.maxCustomers, activationPolicy: p.activationPolicy,
    refundPolicy: p.refundPolicy, payoutHoldDays: p.payoutHoldDays, validUntil: p.validUntil,
    permissions: resolvePermissions(p.permissions as any), permissionLabels: RESELLER_PERMISSION_KEYS,
    expired: !!(p.validUntil && new Date(p.validUntil).getTime() < Date.now()),
  });
});

const profileSelfSchema = z.object({
  contactPerson: z.string().trim().min(2).max(120).optional(),
  mobile: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  companyName: z.string().trim().max(160).nullable().optional(),
});
/** Resellers can edit contact details only — never pricing, limits or permissions. */
export const updateMe = handle(async (req, res) => {
  const p = resellerOf(req);
  const patch = profileSelfSchema.parse(req.body);
  const [after] = await db.update(resellerProfiles).set({ ...patch, updatedAt: new Date() }).where(eq(resellerProfiles.id, p.id)).returning();
  await audit(db, { resellerId: p.id, actor: actorOf(req), action: "reseller.self_updated", entityType: "reseller", entityId: p.id, before: p, after: patch });
  ok(res, after);
});

export const dashboard = handle(async (req, res) => ok(res, await resellerDashboard(resellerOf(req).id)));
export const catalog = handle(async (req, res) => ok(res, await resellerCatalog(resellerOf(req).id)));

export const myCustomers = handle(async (req, res) => ok(res, await customersList(resellerOf(req).id, {
  search: typeof req.query.search === "string" ? req.query.search : undefined,
  status: typeof req.query.status === "string" ? req.query.status : undefined,
  page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25,
})));

export const addCustomer = handle(async (req, res) => {
  const p = resellerOf(req);
  const input = newCustomerSchema.parse(req.body);
  const out = await createCustomerWithSale(p.id, input, actorOf(req));
  ok(res, out, out.duplicate ? 200 : 201);
});

export const myCustomer = handle(async (req, res) => {
  const d = await customerDetail(resellerOf(req).id, req.params.id);
  if (!d) throw new HttpError(404, "Customer not found");
  ok(res, d);
});

const editCustomerSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  businessName: z.string().trim().min(1).max(160).optional(),
  mobile: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
});
/** Contact edits only. Reseller attribution can never change here. */
export const editCustomer = handle(async (req, res) => {
  const p = resellerOf(req);
  assertResellerCan(p, "editCustomers");
  const m = await assertOwnsCustomer(p.id, req.params.id);
  const b = editCustomerSchema.parse(req.body);
  await db.transaction(async (tx) => {
    if (b.firstName !== undefined || b.lastName !== undefined) {
      await tx.update(users).set({ ...(b.firstName !== undefined ? { firstName: b.firstName } : {}), ...(b.lastName !== undefined ? { lastName: b.lastName } : {}), updatedAt: new Date() }).where(eq(users.id, req.params.id));
    }
    if (b.businessName !== undefined || b.mobile !== undefined) {
      await tx.update(resellerCustomers).set({ ...(b.businessName !== undefined ? { businessName: b.businessName } : {}), ...(b.mobile !== undefined ? { mobile: b.mobile } : {}), updatedAt: new Date() }).where(eq(resellerCustomers.id, m.id));
    }
    await audit(tx, { resellerId: p.id, actor: actorOf(req), action: "customer.updated", entityType: "customer", entityId: req.params.id, after: b });
  });
  ok(res, await customerDetail(p.id, req.params.id));
});

export const setCustomerStatus = handle(async (req, res) => {
  const p = resellerOf(req);
  assertResellerCan(p, "suspendCustomers");
  await assertOwnsCustomer(p.id, req.params.id);
  const { status } = z.object({ status: z.enum(["active", "inactive"]) }).parse(req.body);
  await db.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, req.params.id));
  await audit(db, { resellerId: p.id, actor: actorOf(req), action: `customer.${status}`, entityType: "customer", entityId: req.params.id });
  ok(res, { status });
});

export const resendCustomerInvite = handle(async (req, res) => {
  const p = resellerOf(req);
  assertResellerCan(p);
  await assertOwnsCustomer(p.id, req.params.id);
  const [u] = await db.select({ email: users.email, firstName: users.firstName, verified: users.isEmailVerified }).from(users).where(eq(users.id, req.params.id));
  if (u?.verified) throw new HttpError(409, "Customer has already activated the account. They can use 'Forgot password'.");
  const token = await issueToken(db, req.params.id, "customer_invite", actorOf(req).id);
  const link = await sendInviteEmail({ to: u!.email, name: u!.firstName, token, purpose: "customer_invite", resellerName: p.businessName });
  await audit(db, { resellerId: p.id, actor: actorOf(req), action: "customer.invite_resent", entityType: "customer", entityId: req.params.id });
  ok(res, { link });
});

/** Super admin: resend the activation (set-password) link to a reseller's customer. */
export const adminResendCustomerInvite = handle(async (req, res) => {
  const [m] = await db.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, req.params.customerId));
  if (!m) throw new HttpError(404, "Customer not found");
  const [u] = await db.select({ email: users.email, firstName: users.firstName, verified: users.isEmailVerified }).from(users).where(eq(users.id, req.params.customerId));
  if (!u) throw new HttpError(404, "Customer not found");
  if (u.verified) throw new HttpError(409, "Customer has already activated the account. They can use 'Forgot password'.");
  const [rp] = await db.select({ businessName: resellerProfiles.businessName }).from(resellerProfiles).where(eq(resellerProfiles.id, m.resellerId));
  const token = await issueToken(db, req.params.customerId, "customer_invite", actorOf(req).id);
  const link = await sendInviteEmail({ to: u.email, name: u.firstName, token, purpose: "customer_invite", resellerName: rp?.businessName });
  await audit(db, { resellerId: m.resellerId, actor: actorOf(req), action: "customer.invite_resent", entityType: "customer", entityId: req.params.customerId });
  ok(res, { link });
});

export const renewCustomer = handle(async (req, res) => {
  const p = resellerOf(req);
  const out = await createRenewal(p.id, req.params.id, renewalSchema.parse(req.body), actorOf(req));
  ok(res, out, out.duplicate ? 200 : 201);
});

export const sendReminder = handle(async (req, res) => {
  const p = resellerOf(req);
  assertResellerCan(p, "sendReminders");
  await assertOwnsCustomer(p.id, req.params.id);
  const [open] = await db.select().from(resellerSales).where(and(eq(resellerSales.customerUserId, req.params.id), eq(resellerSales.resellerId, p.id), inArray(resellerSales.paymentStatus, ["pending", "pending_verification"])));
  const [u] = await db.select({ email: users.email, firstName: users.firstName }).from(users).where(eq(users.id, req.params.id));
  const d = await customerDetail(p.id, req.params.id);
  const sub = d?.subscriptions.find((s) => s.status === "active") ?? d?.subscriptions[0];
  const payUrl = open ? await rotatePayLink(open) : null;
  const body = `<p>Hello ${escapeHtml(u?.firstName || "there")},</p><p>Your HoverChat subscription${sub ? ` (${escapeHtml(sub.planName ?? "")})` : ""} ${sub && new Date(sub.endDate).getTime() < Date.now() ? "has expired" : `renews on <strong>${sub ? new Date(sub.endDate).toDateString() : "soon"}</strong>`}.</p>${open ? `<p>Your renewal invoice of ₹${money(open.sellingPrice).toFixed(2)} is ready.</p>` : `<p>Please contact ${escapeHtml(p.businessName)} to renew.</p>`}`;
  await sendEmailTo(u!.email, "HoverChat subscription renewal reminder", emailLayout("Renewal reminder", body, payUrl ? { label: "Pay renewal", url: payUrl } : undefined));
  await audit(db, { resellerId: p.id, actor: actorOf(req), action: "customer.reminder_sent", entityType: "customer", entityId: req.params.id });
  ok(res, { sent: true, payUrl });
});

export const mySubscriptions = handle(async (req, res) => ok(res, await subscriptionsList(resellerOf(req).id, typeof req.query.status === "string" ? req.query.status : undefined)));

export const mySales = handle(async (req, res) => {
  const p = resellerOf(req);
  const f = salesFilterSchema.parse(req.query);
  if (f.customerId) await assertOwnsCustomer(p.id, f.customerId);
  ok(res, await salesReport(p.id, f));
});

export const myTransactions = handle(async (req, res) => {
  const p = resellerOf(req);
  assertResellerCan(p, "viewTransactions");
  ok(res, await salesReport(p.id, salesFilterSchema.parse({ ...req.query, range: req.query.range || "all" })));
});

export const salePayLink = handle(async (req, res) => {
  const p = resellerOf(req);
  const [sale] = await db.select().from(resellerSales).where(and(eq(resellerSales.id, req.params.id), eq(resellerSales.resellerId, p.id)));
  if (!sale) throw new HttpError(404, "Sale not found");
  ok(res, { payUrl: await rotatePayLink(sale) });
});

export const cancelMySale = handle(async (req, res) => {
  const p = resellerOf(req);
  const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  ok(res, await cancelSale(req.params.id, actorOf(req), reason, p.id));
});

export const myEarnings = handle(async (req, res) => {
  const p = resellerOf(req);
  ok(res, { balances: await resellerBalances(p.id), ledger: await ledgerList(p.id), payoutHoldDays: p.payoutHoldDays, refundPolicy: p.refundPolicy, note: "Gross margin includes amounts on hold. Withdrawable = released earnings − reversals − payouts. Payouts are made manually by HoverChat." });
});

// ═════════════════ Super admin ═════════════════

export const adminSummary = handle(async (req, res) => ok(res, await adminResellerSummary((req.query.range as any) || "this_month")));
export const adminList = handle(async (req, res) => ok(res, await resellerList({
  search: typeof req.query.search === "string" ? req.query.search : undefined,
  status: typeof req.query.status === "string" && req.query.status ? req.query.status : undefined,
  page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25,
})));
export const adminPlans = handle(async (_req, res) => ok(res, { plans: await planOptions(), permissionLabels: RESELLER_PERMISSION_KEYS, defaultPermissions: DEFAULT_RESELLER_PERMISSIONS }));

export const adminCreate = handle(async (req, res) => ok(res, await createReseller(createResellerSchema.parse(req.body), actorOf(req)), 201));
export const adminGet = handle(async (req, res) => {
  const p = await getProfile(req.params.id);
  ok(res, { ...p, permissions: resolvePermissions(p.permissions as any), balances: await resellerBalances(p.id) });
});
export const adminUpdate = handle(async (req, res) => ok(res, await updateReseller(req.params.id, updateResellerSchema.parse(req.body), actorOf(req))));
export const adminStatus = handle(async (req, res) => {
  const b = z.object({ status: z.enum(["active", "inactive", "suspended"]), reason: z.string().trim().max(500).optional() }).parse(req.body);
  ok(res, await setStatus(req.params.id, b.status, b.reason ?? null, actorOf(req)));
});
export const adminArchive = handle(async (req, res) => ok(res, await archiveReseller(req.params.id, actorOf(req))));
export const adminDelete = handle(async (req, res) => ok(res, await deleteReseller(req.params.id, actorOf(req))));
export const adminResetPassword = handle(async (req, res) => ok(res, await sendPasswordReset(req.params.id, actorOf(req))));

export const adminPricing = handle(async (req, res) => ok(res, await listPricing(req.params.id, req.query.history === "1")));
export const adminUpsertPricing = handle(async (req, res) => {
  await getProfile(req.params.id);
  ok(res, await upsertPricing(req.params.id, pricingInputSchema.parse(req.body), actorOf(req)));
});
export const adminDeactivatePricing = handle(async (req, res) => ok(res, await deactivatePricing(req.params.id, req.params.pricingId, actorOf(req))));

export const adminCustomers = handle(async (req, res) => ok(res, await customersList(req.params.id === "all" ? null : req.params.id, {
  search: typeof req.query.search === "string" ? req.query.search : undefined,
  page: Number(req.query.page) || 1, pageSize: Number(req.query.pageSize) || 25,
})));
export const adminCustomerDetail = handle(async (req, res) => {
  const d = await customerDetail(null, req.params.customerId);
  if (!d) throw new HttpError(404, "Customer not linked to a reseller");
  ok(res, d);
});
export const adminAddCustomer = handle(async (req, res) => ok(res, await createCustomerWithSale(req.params.id, newCustomerSchema.parse(req.body), actorOf(req)), 201));
export const adminRenew = handle(async (req, res) => {
  const d = await customerDetail(null, req.params.customerId);
  if (!d) throw new HttpError(404, "Customer not linked to a reseller");
  ok(res, await createRenewal(d.customer.resellerId, req.params.customerId, renewalSchema.parse(req.body), actorOf(req)), 201);
});
export const adminSales = handle(async (req, res) => ok(res, await salesReport(req.params.id === "all" ? null : req.params.id, salesFilterSchema.parse(req.query))));
export const adminEarnings = handle(async (req, res) => ok(res, { balances: await resellerBalances(req.params.id), ledger: await ledgerList(req.params.id) }));
export const adminAudit = handle(async (req, res) => ok(res, await auditList(req.params.id)));

export const adminPayout = handle(async (req, res) => {
  const b = z.object({ amount: z.coerce.number().positive(), reference: z.string().trim().min(3).max(80), note: z.string().trim().max(300).optional() }).parse(req.body);
  ok(res, await recordPayout(req.params.id, b.amount, b.reference, b.note ?? null, actorOf(req)), 201);
});
export const adminAdjustment = handle(async (req, res) => {
  const b = z.object({ amount: z.coerce.number().refine((v) => v !== 0, "Amount cannot be 0"), reference: z.string().trim().min(3).max(80), reason: z.string().trim().min(3).max(300) }).parse(req.body);
  ok(res, await recordAdjustment(req.params.id, b.amount, b.reference, b.reason, actorOf(req)), 201);
});

export const adminTransfer = handle(async (req, res) => {
  const b = z.object({ toResellerId: z.string().max(64).nullable(), reason: z.string().trim().min(3).max(500) }).parse(req.body);
  ok(res, await transferCustomer(req.params.customerId, b.toResellerId, b.reason, actorOf(req)));
});

/** Manual verification (e.g. bank transfer received by HoverChat). Never automatic. */
export const adminMarkPaid = handle(async (req, res) => {
  const b = z.object({ reference: z.string().trim().min(3).max(120) }).parse(req.body);
  ok(res, await settleSale(req.params.saleId, { method: "manual", reference: b.reference, actor: actorOf(req) }));
});
export const adminCancelSale = handle(async (req, res) => {
  const b = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
  ok(res, await cancelSale(req.params.saleId, actorOf(req), b.reason));
});
/** Record a refund already made in the Razorpay dashboard / bank (amount + reference). */
export const adminRefund = handle(async (req, res) => {
  const b = z.object({ amount: z.coerce.number().positive(), reference: z.string().trim().min(3).max(120) }).parse(req.body);
  ok(res, await applyRefund(req.params.saleId, b.amount, `manual:${b.reference}`, actorOf(req)));
});
export const adminSalePayLink = handle(async (req, res) => {
  const [sale] = await db.select().from(resellerSales).where(eq(resellerSales.id, req.params.saleId));
  if (!sale) throw new HttpError(404, "Sale not found");
  ok(res, { payUrl: await rotatePayLink(sale) });
});

// ═════════════════ Public: pay link ═════════════════

export const publicPayView = handle(async (req, res) => ok(res, await publicSaleView(await saleByPayToken(req.params.token))));
export const publicPayOrder = handle(async (req, res) => ok(res, await ensureOrder(await saleByPayToken(req.params.token))));
export const publicPayVerify = handle(async (req, res) => {
  const sale = await saleByPayToken(req.params.token);
  const out = await verifyCheckout(sale, req.body ?? {});
  ok(res, { settled: out.settled, status: out.sale.paymentStatus, reason: (out as any).reason ?? null });
});

// ═════════════════ Customer: own reseller invoice ═════════════════

async function customerOpenSale(req: Request) {
  const u = (req as any).session?.user;
  if (!u) throw new HttpError(401, "Authentication required");
  const ownerId = u.role === "team" ? u.createdBy : u.id;
  const [sale] = await db.select().from(resellerSales).where(and(eq(resellerSales.customerUserId, ownerId), inArray(resellerSales.paymentStatus, ["pending", "pending_verification"])));
  return sale ?? null;
}
export const customerInvoice = handle(async (req, res) => {
  const sale = await customerOpenSale(req);
  const u = (req as any).session?.user;
  const [m] = await db.select({ resellerName: resellerProfiles.businessName, code: resellerProfiles.resellerCode }).from(resellerCustomers)
    .innerJoin(resellerProfiles, eq(resellerProfiles.id, resellerCustomers.resellerId)).where(eq(resellerCustomers.customerUserId, u.role === "team" ? u.createdBy : u.id));
  ok(res, { reseller: m ?? null, openInvoice: sale ? await publicSaleView(sale) : null });
});
export const customerInvoiceOrder = handle(async (req, res) => {
  const sale = await customerOpenSale(req);
  if (!sale || sale.id !== req.params.saleId) throw new HttpError(404, "Invoice not found");
  ok(res, await ensureOrder(sale));
});
export const customerInvoiceVerify = handle(async (req, res) => {
  const sale = await customerOpenSale(req);
  if (!sale || sale.id !== req.params.saleId) throw new HttpError(404, "Invoice not found");
  const out = await verifyCheckout(sale, req.body ?? {});
  ok(res, { settled: out.settled, status: out.sale.paymentStatus });
});

// ═════════════════ Invitations ═════════════════

export const invitationInfo = handle(async (req, res) => ok(res, await describeToken(String(req.query.token || ""))));
export const acceptInvitation = handle(async (req, res) => {
  const b = z.object({ token: z.string().min(20).max(200), password: z.string().min(1).max(200) }).parse(req.body);
  const out = await acceptToken(b.token, b.password);
  ok(res, { ...out, next: "/login" });
});


