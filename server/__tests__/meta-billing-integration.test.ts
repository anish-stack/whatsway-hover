/**
 * Real-Postgres integration test for Meta usage tracking, rate history,
 * analytics, tenant isolation and campaign readiness.
 *
 * Runs only when META_BILLING_TEST_DATABASE_URL points at a THROWAWAY
 * database that already has the schema (npm run db:push). It writes rows.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";

const URL = process.env.META_BILLING_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

d("Meta billing — DB integration", () => {
  let db: any, pool: any, schema: any, eq: any, and: any;
  let tracker: typeof import("../services/meta-billing/usage-tracker.service");
  let rates: typeof import("../services/meta-billing/rate-card.service");
  let analytics: typeof import("../services/meta-billing/usage-analytics.service");
  let readiness: typeof import("../services/meta-billing/readiness.service");
  let billing: typeof import("../services/meta-billing/billing-overview.service");
  const ids = { admin: randomUUID(), other: randomUUID(), team: randomUUID(), chA: randomUUID(), chB: randomUUID(), plan: randomUUID(), tplOk: randomUUID(), tplPending: randomUUID(), camp: randomUUID() };
  let chA: any, chB: any;
  const realFetch = globalThis.fetch;
  const ts = (iso: string) => String(Math.floor(new Date(iso).getTime() / 1000));

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    ({ db, pool } = await import("../db"));
    schema = await import("@shared/schema");
    ({ eq, and } = await import("drizzle-orm"));
    const { runStartupMigration } = await import("../startup-migration");
    await runStartupMigration(pool);
    tracker = await import("../services/meta-billing/usage-tracker.service");
    rates = await import("../services/meta-billing/rate-card.service");
    analytics = await import("../services/meta-billing/usage-analytics.service");
    readiness = await import("../services/meta-billing/readiness.service");
    billing = await import("../services/meta-billing/billing-overview.service");

    const { users, channels, plans, subscriptions, templates, campaigns } = schema;
    await db.insert(users).values([
      { id: ids.admin, username: `a_${ids.admin}`, password: "x", email: `${ids.admin}@t.io`, role: "admin", permissions: [] },
      { id: ids.other, username: `o_${ids.other}`, password: "x", email: `${ids.other}@t.io`, role: "admin", permissions: [] },
      { id: ids.team, username: `t_${ids.team}`, password: "x", email: `${ids.team}@t.io`, role: "team", permissions: [], createdBy: ids.admin },
    ]);
    [chA] = await db.insert(channels).values({ id: ids.chA, name: "A", phoneNumberId: `pn_${ids.chA}`, accessToken: "tok", whatsappBusinessAccountId: "waba_A", phoneNumber: "+911111111111", createdBy: ids.admin }).returning();
    [chB] = await db.insert(channels).values({ id: ids.chB, name: "B", phoneNumberId: `pn_${ids.chB}`, accessToken: "tok", whatsappBusinessAccountId: "waba_B", phoneNumber: "+912222222222", createdBy: ids.other }).returning();
    await db.insert(plans).values({ id: ids.plan, name: "HoverChat", monthlyPrice: "999" });
    await db.insert(subscriptions).values({ userId: ids.admin, planId: ids.plan, planData: { name: "HoverChat", monthlyPrice: "999" }, status: "active", billingCycle: "monthly", startDate: new Date(), endDate: new Date(Date.now() + 20 * 86400000) });
    await db.insert(subscriptions).values({ userId: ids.other, planId: ids.plan, planData: { name: "HoverChat" }, status: "active", billingCycle: "monthly", startDate: new Date(Date.now() - 40 * 86400000), endDate: new Date(Date.now() - 86400000) });
    await db.insert(templates).values([
      { id: ids.tplOk, channelId: ids.chA, name: "promo", category: "MARKETING", body: "hi", status: "APPROVED" },
      { id: ids.tplPending, channelId: ids.chA, name: "later", category: "UTILITY", body: "hi", status: "PENDING" },
    ]);
    await db.insert(campaigns).values({ id: ids.camp, channelId: ids.chA, createdBy: ids.admin, name: "C1", campaignType: "contacts", type: "marketing", apiType: "cloud_api", templateId: ids.tplOk, status: "sending" });
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await pool?.end?.();
  });

  it("startup migration seeded the India rate card", async () => {
    const r = await rates.listRateCards({ countryCode: "IN" });
    const mk = r.find((x: any) => x.category === "marketing" && x.pricingVersion === "meta-2026-01-IN");
    expect(Number(mk.rate)).toBeCloseTo(0.8631, 4);
  });

  it("send success alone is not delivered; delivery priced once; retries idempotent", async () => {
    const wamid = `wamid.${randomUUID()}`;
    const pricing = { billable: true, category: "marketing", pricing_model: "PMP", type: "regular" };
    expect(await tracker.recordStatusUsage(chA, { id: wamid, status: "sent", timestamp: ts("2026-11-20T10:00:00Z"), recipient_id: "919876543210", pricing })).toBe("inserted");
    let [row] = await db.select().from(schema.whatsappMessageUsage).where(eq(schema.whatsappMessageUsage.messageId, wamid));
    expect(row.deliveredAt).toBeNull();
    expect(Number(row.estimatedCost)).toBe(0);

    await Promise.all(Array.from({ length: 5 }, () =>
      tracker.recordStatusUsage(chA, { id: wamid, status: "delivered", timestamp: ts("2026-11-20T10:00:05Z"), recipient_id: "919876543210", pricing })));
    await tracker.recordStatusUsage(chA, { id: wamid, status: "read", timestamp: ts("2026-11-20T10:01:00Z"), recipient_id: "919876543210", pricing });
    await tracker.recordStatusUsage(chA, { id: wamid, status: "failed", timestamp: ts("2026-11-20T10:02:00Z"), recipient_id: "919876543210", errors: [{ code: 131026 }] });

    const all = await db.select().from(schema.whatsappMessageUsage).where(eq(schema.whatsappMessageUsage.messageId, wamid));
    expect(all).toHaveLength(1);
    row = all[0];
    expect(row.status).toBe("read");
    expect(row.recipientCountry).toBe("IN");
    expect(Number(row.estimatedCost)).toBeCloseTo(0.8631, 4);
    expect(row.pricingVersion).toBe("meta-2026-01-IN");
    expect(row.failedAt).toBeNull();
  });

  it("concurrent first-seen webhooks create exactly one row", async () => {
    const wamid = `wamid.${randomUUID()}`;
    await Promise.all(Array.from({ length: 8 }, () =>
      tracker.recordStatusUsage(chA, { id: wamid, status: "delivered", timestamp: ts("2026-11-21T09:00:00Z"), recipient_id: "919876543210", pricing: { billable: true, category: "utility", pricing_model: "PMP" } })));
    const all = await db.select().from(schema.whatsappMessageUsage).where(eq(schema.whatsappMessageUsage.messageId, wamid));
    expect(all).toHaveLength(1);
    expect(Number(all[0].estimatedCost)).toBeCloseTo(0.115, 4);
  });

  it("free / unknown pricing never charged; failed tracked separately", async () => {
    await tracker.recordStatusUsage(chA, { id: `wamid.free.${randomUUID()}`, status: "delivered", timestamp: ts("2026-11-21T09:00:00Z"), recipient_id: "919000000000", pricing: { billable: false, category: "service", type: "free_customer_service" } });
    await tracker.recordStatusUsage(chA, { id: `wamid.unk.${randomUUID()}`, status: "delivered", timestamp: ts("2026-11-21T09:00:00Z"), recipient_id: "919000000000" });
    await tracker.recordStatusUsage(chA, { id: `wamid.fail.${randomUUID()}`, status: "failed", timestamp: ts("2026-11-21T09:00:00Z"), recipient_id: "919000000000", errors: [{ code: 131049 }] });
    const s = await analytics.usageSummary({ customerId: ids.admin, channelIds: [ids.chA] }, analytics.usageFilterSchema.parse({ range: "custom", from: "2026-11-01", to: "2026-11-30" }));
    expect(s.totals.total).toBe(5);
    expect(s.totals.failed).toBe(1);
    expect(s.totals.delivered).toBe(4);
    expect(s.estimatedCost.amount).toBeCloseTo(0.8631 + 0.115, 2);
  });

  it("rate changes apply only to later deliveries; history keeps old price", async () => {
    await db.delete(schema.metaRateCards).where(eq(schema.metaRateCards.pricingVersion, "test-2027")); // rerun-safe
    rates.invalidateRateCache();
    await rates.createRateCard(rates.rateCardInputSchema.parse({ countryCode: "IN", category: "marketing", rate: 1.25, currency: "INR", effectiveFrom: "2027-01-01T00:00:00Z", pricingVersion: "test-2027" }), ids.admin);
    const late = `wamid.${randomUUID()}`;
    await tracker.recordStatusUsage(chA, { id: late, status: "delivered", timestamp: ts("2027-01-05T00:00:00Z"), recipient_id: "919876543210", pricing: { billable: true, category: "marketing" } });
    const [r] = await db.select().from(schema.whatsappMessageUsage).where(eq(schema.whatsappMessageUsage.messageId, late));
    expect(Number(r.appliedRate)).toBe(1.25);
    const s = await analytics.usageSummary({ customerId: ids.admin }, analytics.usageFilterSchema.parse({ range: "custom", from: "2026-11-01", to: "2026-11-30" }));
    expect(s.estimatedCost.amount).toBeCloseTo(0.8631 + 0.115, 2); // unchanged
  });

  it("tenant isolation + grouped analytics queries run", async () => {
    await tracker.recordStatusUsage(chB, { id: `wamid.B.${randomUUID()}`, status: "delivered", timestamp: ts("2026-11-21T09:00:00Z"), recipient_id: "971501234567", pricing: { billable: true, category: "marketing" } });
    const f = analytics.usageFilterSchema.parse({ range: "custom", from: "2026-11-01", to: "2026-11-30" });
    const mine = await analytics.usageSummary({ customerId: ids.admin, channelIds: [ids.chA] }, f);
    const theirs = await analytics.usageSummary({ customerId: ids.other, channelIds: [ids.chB] }, f);
    expect(mine.totals.total).toBe(5);
    expect(theirs.totals.total).toBe(1);
    // customer A forcing channel B through filters sees nothing
    const leak = await analytics.usageSummary({ customerId: ids.admin, channelIds: [ids.chA] }, { ...f, channelId: ids.chB });
    expect(leak.totals.total).toBe(0);
    const series = await analytics.usageTimeseries({ customerId: ids.admin }, f, "day");
    expect(series.points.find((p: any) => p.bucket === "2026-11-20")?.marketing).toBe(1);
    const monthly = await analytics.usageTimeseries({ customerId: ids.admin }, f, "month");
    expect(monthly.points[0].bucket).toBe("2026-11");
    for (const by of ["category", "country", "campaign", "phone", "customer"] as const) {
      const b = await analytics.usageBreakdown({ customerId: null }, f, by);
      expect(b.rows.length).toBeGreaterThan(0);
    }
    const h = await analytics.usageHistory({ customerId: ids.admin }, f, 1, 2);
    expect(h.pagination.total).toBe(5);
    expect(h.rows).toHaveLength(2);
  });

  function mockGraph(waba: any, phone: any) {
    globalThis.fetch = vi.fn(async (u: any) => {
      const body = String(u).includes("waba_") ? waba : phone;
      return new Response(JSON.stringify(body), { status: body.error ? 400 : 200, headers: { "content-type": "application/json" } });
    }) as any;
  }

  it("readiness: subscription, template, ownership, Meta block, calling error", async () => {
    mockGraph(
      { id: "waba_A", name: "A", business_verification_status: "verified", health_status: { can_send_message: "AVAILABLE", entities: [] }, owner_business_info: { id: "biz1", name: "Biz" }, primary_funding_id: "f1" },
      { id: "pn", status: "CONNECTED", messaging_limit_tier: "TIER_1K", quality_rating: "GREEN", health_status: { can_send_message: "AVAILABLE", entities: [{ entity_type: "PHONE_NUMBER", can_send_message: "AVAILABLE", errors: [{ error_code: 138024 }] }] } },
    );
    let r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplOk, recipientCount: 10, ownerId: ids.admin, forceHealthRefresh: true });
    expect(r.ready).toBe(true); // calling error must not block messaging

    r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplPending, ownerId: ids.admin });
    expect(r.ready).toBe(false);
    expect(r.blockingReason).toMatch(/pending/);

    r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplOk, recipientCount: 5000, ownerId: ids.admin });
    expect(r.checks.find((c) => c.key === "limit")?.state).toBe("fail");

    r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplOk, ownerId: ids.other });
    expect(r.ready).toBe(false); // expired subscription + not their channel

    expect(await readiness.resolveOwnerId(ids.team)).toBe(ids.admin);

    mockGraph(
      { id: "waba_A", health_status: { can_send_message: "BLOCKED", entities: [{ entity_type: "WABA", can_send_message: "BLOCKED", errors: [{ error_code: 141006, error_description: "Payment issue" }] }] } },
      { id: "pn", status: "CONNECTED" },
    );
    r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplOk, ownerId: ids.admin, forceHealthRefresh: true });
    expect(r.ready).toBe(false);
    expect(r.checks.find((c) => c.key === "messaging")).toMatchObject({ state: "fail", code: "141006" });
    // subscription untouched
    const s = await readiness.getSubscriptionState(ids.admin);
    expect(s.active).toBe(true);

    mockGraph({ error: { code: 2, message: "Service unavailable" } }, { error: { code: 2, message: "Service unavailable" } });
    r = await readiness.checkCampaignReadiness({ channelId: ids.chA, templateId: ids.tplOk, ownerId: ids.admin, forceHealthRefresh: true });
    expect(r.ready).toBe(true); // Graph outage is a warning, not a block
    expect(r.checks.find((c) => c.key === "messaging")?.state).toBe("warn");
  });

  it("account-level send error pauses only the campaign", async () => {
    await readiness.pauseCampaignForAccountBlock(ids.camp, null, "131042");
    const [c] = await db.select().from(schema.campaigns).where(eq(schema.campaigns.id, ids.camp));
    expect(c.status).toBe("paused");
  });

  it("billing views run and keep revenue separate", async () => {
    const sub = await billing.subscriptionDetails(ids.admin);
    expect(sub.subscription?.status).toBe("active");
    const exp = await billing.subscriptionDetails(ids.other);
    expect(exp.subscription?.status).toBe("expired");
    const rev = await billing.adminSubscriptionRevenue(12);
    expect(rev).toHaveProperty("revenueTotals");
    const acc = await billing.adminCustomerAccounts({ search: ids.admin.slice(0, 8) });
    expect(acc.rows[0].channels[0].health?.overallStatus).toBeDefined();
  });

  it("HTTP routes: tenant scope, team access, admin gate, validation", async () => {
    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const { registerMetaBillingRoutes } = await import("../routes/meta-billing.routes");
    const as = (user: any) => {
      const app = express();
      app.use(express.json());
      app.use((req: any, _res, next) => { req.session = { user }; next(); });
      registerMetaBillingRoutes(app);
      return app;
    };
    const admin = as({ id: ids.admin, role: "admin" });
    const team = as({ id: ids.team, role: "team", createdBy: ids.admin });
    const other = as({ id: ids.other, role: "admin" });
    const sa = as({ id: ids.admin, role: "superadmin" });
    const q = "?range=custom&from=2026-11-01&to=2026-11-30";

    const a = await request(admin).get(`/api/whatsapp/usage/summary${q}`);
    expect(a.status).toBe(200);
    expect(a.body.data.totals.total).toBe(5);
    const t = await request(team).get(`/api/whatsapp/usage/summary${q}`);
    expect(t.body.data.totals.total).toBe(5);
    const o = await request(other).get(`/api/whatsapp/usage/summary${q}`);
    expect(o.body.data.totals.total).toBe(1);
    // customerId param cannot widen scope; foreign channel is 404
    const widen = await request(other).get(`/api/whatsapp/usage/summary${q}&customerId=${ids.admin}`);
    expect(widen.body.data.totals.total).toBe(1);
    expect((await request(other).get(`/api/whatsapp/usage/summary${q}&channelId=${ids.chA}`)).status).toBe(404);
    expect((await request(other).get(`/api/whatsapp/readiness?channelId=${ids.chA}`)).status).toBe(404);

    expect((await request(admin).get("/api/admin/meta-rate-cards")).status).toBe(403);
    expect((await request(sa).get("/api/admin/meta-rate-cards")).status).toBe(200);
    const bad = await request(sa).post("/api/admin/meta-rate-cards").send({ countryCode: "IN", category: "marketing", rate: -1, effectiveFrom: "2026-01-01" });
    expect(bad.status).toBe(400);
    const dup = await request(sa).post("/api/admin/meta-rate-cards").send({ countryCode: "IN", category: "marketing", rate: 2, effectiveFrom: "2026-01-01T00:00:00Z" });
    expect(dup.status).toBe(409);

    const est = await request(admin).get("/api/whatsapp/cost-estimate?country=IN&marketing=1000&service=1500");
    expect(est.status).toBe(200);
    expect(est.body.data.total).toBeCloseTo(863.1 + 500 * 0.115, 2);

    for (const path of ["/api/billing/overview", "/api/billing/subscription", "/api/whatsapp/usage/filters", `/api/whatsapp/usage/timeseries${q}`, `/api/whatsapp/usage/breakdown${q}&by=country`, `/api/whatsapp/usage/history${q}`, "/api/whatsapp/rate-card?country=IN", "/api/whatsapp/account-health"]) {
      const r = await request(admin).get(path);
      expect(r.status, path).toBe(200);
    }
    for (const path of ["/api/admin/billing/overview", `/api/admin/whatsapp/usage${q}`, "/api/admin/whatsapp/accounts"]) {
      const r = await request(sa).get(path);
      expect(r.status, path).toBe(200);
    }
    const ov = await request(admin).get("/api/billing/overview");
    expect(ov.body.data.notices.metaDirectBilling).toMatch(/HoverChat does not collect/);
    expect(JSON.stringify(ov.body)).not.toMatch(/primary_funding_id|card_number/);
  });
});
