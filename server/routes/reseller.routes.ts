/**
 * Reseller distribution routes.
 *  /api/reseller/*          reseller portal (role reseller + live DB status check)
 *  /api/admin/resellers/*   super admin only
 *  /api/public/reseller-pay public pay-link checkout (token = capability)
 *  /api/auth/invitation     invitation / password-set acceptance
 *  /api/billing/reseller-invoice  customer pays own reseller invoice
 * All authorisation is enforced here and in the services, not in the UI.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware";
import { requireReseller } from "../middlewares/reseller.middleware";
import * as c from "../controllers/reseller.controller";

/** Small per-IP limiter for unauthenticated token endpoints. */
function ipLimit(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}${req.route?.path ?? req.path}`;
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) hits.set(key, { n: 1, reset: now + windowMs });
    else if (++h.n > max) return res.status(429).json({ success: false, error: "Too many requests. Try again shortly." });
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  };
}

export function registerResellerRoutes(app: Express) {
  const R = [requireAuth, requireReseller];
  const SA = [requireAuth, requireSuperadmin];

  // ── Reseller portal ──
  app.get("/api/reseller/me", ...R, c.me);
  app.patch("/api/reseller/me", ...R, c.updateMe);
  app.get("/api/reseller/dashboard", ...R, c.dashboard);
  app.get("/api/reseller/catalog", ...R, c.catalog);
  app.get("/api/reseller/customers", ...R, c.myCustomers);
  app.post("/api/reseller/customers", ...R, c.addCustomer);
  app.get("/api/reseller/customers/:id", ...R, c.myCustomer);
  app.patch("/api/reseller/customers/:id", ...R, c.editCustomer);
  app.post("/api/reseller/customers/:id/status", ...R, c.setCustomerStatus);
  app.post("/api/reseller/customers/:id/resend-invite", ...R, c.resendCustomerInvite);
  app.post("/api/reseller/customers/:id/renewals", ...R, c.renewCustomer);
  app.post("/api/reseller/customers/:id/reminder", ...R, c.sendReminder);
  app.get("/api/reseller/subscriptions", ...R, c.mySubscriptions);
  app.get("/api/reseller/sales", ...R, c.mySales);
  app.get("/api/reseller/transactions", ...R, c.myTransactions);
  app.post("/api/reseller/sales/:id/pay-link", ...R, c.salePayLink);
  app.post("/api/reseller/sales/:id/cancel", ...R, c.cancelMySale);
  app.get("/api/reseller/earnings", ...R, c.myEarnings);

  // ── Super admin ──
  app.get("/api/admin/resellers/summary", ...SA, c.adminSummary);
  app.get("/api/admin/resellers/options", ...SA, c.adminPlans);
  app.get("/api/admin/resellers", ...SA, c.adminList);
  app.post("/api/admin/resellers", ...SA, c.adminCreate);
  app.get("/api/admin/resellers/customers/:customerId", ...SA, c.adminCustomerDetail);
  app.post("/api/admin/resellers/customers/:customerId/transfer", ...SA, c.adminTransfer);
  app.post("/api/admin/resellers/customers/:customerId/resend-invite", ...SA, c.adminResendCustomerInvite);
  app.post("/api/admin/resellers/customers/:customerId/renewals", ...SA, c.adminRenew);
  app.post("/api/admin/resellers/sales/:saleId/mark-paid", ...SA, c.adminMarkPaid);
  app.post("/api/admin/resellers/sales/:saleId/cancel", ...SA, c.adminCancelSale);
  app.post("/api/admin/resellers/sales/:saleId/refund", ...SA, c.adminRefund);
  app.post("/api/admin/resellers/sales/:saleId/pay-link", ...SA, c.adminSalePayLink);
  app.get("/api/admin/resellers/:id", ...SA, c.adminGet);
  app.patch("/api/admin/resellers/:id", ...SA, c.adminUpdate);
  app.post("/api/admin/resellers/:id/status", ...SA, c.adminStatus);
  app.post("/api/admin/resellers/:id/archive", ...SA, c.adminArchive);
  app.delete("/api/admin/resellers/:id", ...SA, c.adminDelete);
  app.post("/api/admin/resellers/:id/reset-password", ...SA, c.adminResetPassword);
  app.get("/api/admin/resellers/:id/pricing", ...SA, c.adminPricing);
  app.put("/api/admin/resellers/:id/pricing", ...SA, c.adminUpsertPricing);
  app.delete("/api/admin/resellers/:id/pricing/:pricingId", ...SA, c.adminDeactivatePricing);
  app.get("/api/admin/resellers/:id/customers", ...SA, c.adminCustomers);
  app.post("/api/admin/resellers/:id/customers", ...SA, c.adminAddCustomer);
  app.get("/api/admin/resellers/:id/sales", ...SA, c.adminSales);
  app.get("/api/admin/resellers/:id/earnings", ...SA, c.adminEarnings);
  app.post("/api/admin/resellers/:id/payouts", ...SA, c.adminPayout);
  app.post("/api/admin/resellers/:id/adjustments", ...SA, c.adminAdjustment);
  app.get("/api/admin/resellers/:id/audit", ...SA, c.adminAudit);

  // ── Public pay link (Razorpay checkout on HoverChat's account) ──
  app.get("/api/public/reseller-pay/:token", ipLimit(60, 60_000), c.publicPayView);
  app.post("/api/public/reseller-pay/:token/order", ipLimit(20, 60_000), c.publicPayOrder);
  app.post("/api/public/reseller-pay/:token/verify", ipLimit(20, 60_000), c.publicPayVerify);

  // ── Invitations ──
  app.get("/api/auth/invitation", ipLimit(30, 60_000), c.invitationInfo);
  app.post("/api/auth/accept-invite", ipLimit(10, 60_000), c.acceptInvitation);

  // ── Customer: pay own reseller invoice ──
  app.get("/api/billing/reseller-invoice", requireAuth, c.customerInvoice);
  app.post("/api/billing/reseller-invoice/:saleId/order", requireAuth, c.customerInvoiceOrder);
  app.post("/api/billing/reseller-invoice/:saleId/verify", requireAuth, c.customerInvoiceVerify);
}
