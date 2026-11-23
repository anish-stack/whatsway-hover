/**
 * Subscription & Billing, WhatsApp Usage, Account Health, Cost Calculator
 * and super-admin Meta monitoring routes.
 */
import type { Express } from "express";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware";
import { resolveTenantChannels } from "../middlewares/tenant.middleware";
import * as c from "../controllers/meta-billing.controller";

export function registerMetaBillingRoutes(app: Express) {
  const tenant = [requireAuth, resolveTenantChannels];

  // Customer — HoverChat subscription (our billing)
  app.get("/api/billing/overview", ...tenant, c.getBillingOverview);
  app.get("/api/billing/subscription", ...tenant, c.getBillingSubscription);

  // Customer — Meta usage (estimates only; Meta bills the customer directly)
  app.get("/api/whatsapp/usage/summary", ...tenant, c.getUsageSummary);
  app.get("/api/whatsapp/usage/timeseries", ...tenant, c.getUsageTimeseries);
  app.get("/api/whatsapp/usage/breakdown", ...tenant, c.getUsageBreakdown);
  app.get("/api/whatsapp/usage/history", ...tenant, c.getUsageHistory);
  app.get("/api/whatsapp/usage/filters", ...tenant, c.getUsageFilterOptions);

  app.get("/api/whatsapp/account-health", ...tenant, c.getAccountHealth);
  app.get("/api/whatsapp/readiness", ...tenant, c.getReadiness);
  app.get("/api/whatsapp/cost-estimate", requireAuth, c.getCostEstimate);
  app.get("/api/whatsapp/rate-card", requireAuth, c.getCustomerRateCard);

  // Super admin
  app.get("/api/admin/billing/overview", requireAuth, requireSuperadmin, c.adminBillingOverview);
  app.get("/api/admin/whatsapp/usage", requireAuth, requireSuperadmin, c.adminUsage);
  app.get("/api/admin/whatsapp/accounts", requireAuth, requireSuperadmin, c.adminAccounts);
  app.post("/api/admin/whatsapp/accounts/:channelId/refresh-health", requireAuth, requireSuperadmin, c.adminRefreshChannelHealth);
  app.get("/api/admin/meta-rate-cards", requireAuth, requireSuperadmin, c.adminListRateCards);
  app.post("/api/admin/meta-rate-cards", requireAuth, requireSuperadmin, c.adminCreateRateCard);
  app.put("/api/admin/meta-rate-cards/:id", requireAuth, requireSuperadmin, c.adminUpdateRateCard);
  app.patch("/api/admin/meta-rate-cards/:id/active", requireAuth, requireSuperadmin, c.adminToggleRateCard);
}
