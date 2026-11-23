/**
 * Reseller distribution — end-to-end against real Postgres + real routes
 * (auth, reseller portal, super admin, public pay link, Razorpay webhook).
 *
 * Runs only when RESELLER_TEST_DATABASE_URL points at a THROWAWAY database
 * whose schema was pushed (npm run db:push). It writes rows.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { randomUUID } from "crypto";

const URL = process.env.RESELLER_TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

d("Reseller distribution — 20 workflows", () => {
  let request: any, app: any, db: any, pool: any, S: any, eq: any, and: any;
  const RZP_SECRET = "rzp_test_secret_123";
  const WEBHOOK_SECRET = "whsec_test_456";
  const ids: Record<string, string> = {};
  const agents: Record<string, any> = {};
  const tokenFrom = (url: string) => new URL_(url).searchParams.get("token") || url.split("/pay/")[1];
  const URL_ = globalThis.URL;
  const RUN = randomUUID().slice(0, 6);

  async function login(username: string, password: string) {
    const agent = request.agent(app);
    const r = await agent.post("/api/auth/login").send({ username, password });
    return { agent, res: r };
  }
  const sign = (body: any) => crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(body)).digest("hex");
  async function webhook(body: any) {
    return request(app).post("/webhooks/razorpay").set("x-razorpay-signature", sign(body)).set("x-razorpay-event-id", `evt_${randomUUID()}`).send(body);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = URL;
    process.env.PUBLIC_APP_URL = "https://app.hoverchat.test";
    ({ db, pool } = await import("../db"));
    S = await import("@shared/schema");
    ({ eq, and } = await import("drizzle-orm"));
    const { runStartupMigration } = await import("../startup-migration");
    await runStartupMigration(pool);
    const express = (await import("express")).default;
    const session = (await import("express-session")).default;
    request = (await import("supertest")).default;
    const authRoutes = (await import("../routes/auth.routes")).default;
    const { registerResellerRoutes } = await import("../routes/reseller.routes");
    const { razorpayWebhook } = await import("../controllers/webhooks.controller");
    const { refundTransaction } = await import("../controllers/transactions.controller");
    const { requireAuth, requireRole } = await import("../middlewares/auth.middleware");
    app = express();
    app.use(express.json());
    app.use(session({ secret: "test-secret-test-secret", resave: false, saveUninitialized: false }));
    app.use("/api/auth", authRoutes);
    registerResellerRoutes(app);
    app.post("/webhooks/razorpay", razorpayWebhook);
    app.post("/api/transactions/:id/refund", requireAuth, requireRole("superadmin"), refundTransaction);

    const bcrypt = (await import("bcryptjs")).default;
    const hash = await bcrypt.hash("SuperPass123", 10);
    const [sa] = await db.insert(S.users).values({ username: `sa_${randomUUID().slice(0, 6)}`, email: `sa_${randomUUID().slice(0, 6)}@t.io`, password: hash, role: "superadmin", permissions: [], status: "active", isEmailVerified: true }).returning();
    ids.sa = sa.id;
    agents.sa = (await login(sa.username, "SuperPass123")).agent;
    const [plan] = await db.insert(S.plans).values({ name: "HoverChat Standard", monthlyPrice: "999", annualPrice: "9999" }).returning();
    ids.plan = plan.id;
    const cfg = { isLive: false, apiKeyTest: "rzp_test_key", apiSecretTest: RZP_SECRET, webhookSecretTest: WEBHOOK_SECRET };
    const [existing] = await db.select().from(S.paymentProviders).where(eq(S.paymentProviders.providerKey, "razorpay"));
    if (existing) await db.update(S.paymentProviders).set({ isActive: true, config: cfg }).where(eq(S.paymentProviders.id, existing.id));
    else await db.insert(S.paymentProviders).values({ name: "Razorpay", providerKey: "razorpay", isActive: true, config: cfg });
  });

  afterAll(async () => { await pool?.end?.(); });

  const resellerBody = (email: string, extra: any = {}) => ({
    businessName: "Acme Digital", contactPerson: "Asha Rao", email, mobile: "+91 98100 11111", maxCustomers: 2,
    activationPolicy: "on_payment", refundPolicy: "proportional", payoutHoldDays: 0,
    pricing: [{ planId: ids.plan, billingCycle: "monthly", pricingModel: "wholesale", wholesalePrice: 799, suggestedRetailPrice: 1499, minSellingPrice: 999, maxSellingPrice: 2499, currency: "INR" }],
    ...extra,
  });

  it("1–3. super admin creates reseller → invitation → reseller logs in", async () => {
    const email = `reseller_${randomUUID().slice(0, 6)}@t.io`;
    const r = await agents.sa.post("/api/admin/resellers").send(resellerBody(email));
    expect(r.status).toBe(201);
    ids.r1 = r.body.data.profile.id;
    expect(r.body.data.profile.status).toBe("pending_activation");
    expect(r.body.data.profile.resellerCode).toMatch(/^HCR-/);
    const [u] = await db.select().from(S.users).where(eq(S.users.email, email));
    expect(u.password.startsWith("!invite:")).toBe(true); // no plain/known password
    expect((await login(email, "anything")).res.status).toBe(403); // not activated
    const token = tokenFrom(r.body.data.inviteUrl);
    expect((await request(app).get(`/api/auth/invitation?token=${token}`)).body.data.purpose).toBe("reseller_invite");
    expect((await request(app).post("/api/auth/accept-invite").send({ token, password: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/accept-invite").send({ token, password: "Reseller123" })).status).toBe(200);
    expect((await request(app).post("/api/auth/accept-invite").send({ token, password: "Reseller123" })).status).toBe(400); // one-time
    const { agent, res } = await login(email, "Reseller123");
    expect(res.status).toBe(200);
    agents.r1 = agent;
    const me = await agent.get("/api/reseller/me");
    expect(me.status).toBe(200);
    expect(me.body.data.status).toBe("active");
    // self-signup can't hijack a pending invited account
    const email2 = `reseller_${randomUUID().slice(0, 6)}@t.io`;
    const r2 = await agents.sa.post("/api/admin/resellers").send(resellerBody(email2, { businessName: "Other Partner", pricing: [{ planId: ids.plan, billingCycle: "monthly", pricingModel: "commission_percent", commissionPercent: 30, suggestedRetailPrice: 1499, minSellingPrice: 999, currency: "INR" }] }));
    ids.r2 = r2.body.data.profile.id;
    const hijack = await request(app).post("/api/auth/signup").send({ username: "hijacker", password: "Hijack123", email: email2 });
    expect(hijack.status).toBe(409);
    await request(app).post("/api/auth/accept-invite").send({ token: tokenFrom(r2.body.data.inviteUrl), password: "Reseller456" });
    agents.r2 = (await login(email2, "Reseller456")).agent;
  });

  it("4–7. reseller creates customer → invite → customer logs in → pending subscription", async () => {
    const email = `cust_${randomUUID().slice(0, 6)}@t.io`;
    const body = { firstName: "Ravi", businessName: "Ravi Sweets", email, mobile: "+91 98111 22222", planId: ids.plan, billingCycle: "monthly", cycles: 1, unitSellingPrice: 1499, idempotencyKey: "k-cust-1" };
    expect((await agents.r1.post("/api/reseller/customers").send({ ...body, unitSellingPrice: 900 })).status).toBe(400); // below min
    const r = await agents.r1.post("/api/reseller/customers").send(body);
    expect(r.status).toBe(201);
    const again = await agents.r1.post("/api/reseller/customers").send(body); // idempotent retry
    expect(again.body.data.duplicate).toBe(true);
    ids.c1 = r.body.data.customerUserId;
    ids.sale1 = r.body.data.sale.id;
    ids.pay1 = tokenFrom(r.body.data.payUrl);
    expect(r.body.data.sale).toMatchObject({ paymentStatus: "pending", sellingPrice: "1499.00", wholesaleCost: "799.00", resellerEarning: "700.00" });
    const [sub] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.userId, ids.c1));
    expect(sub.status).toBe("pending"); // not active until verified payment
    const [txn] = await db.select().from(S.transactions).where(eq(S.transactions.userId, ids.c1));
    expect(txn.status).toBe("pending");
    expect((txn.metadata as any).source).toBe("reseller");
    await request(app).post("/api/auth/accept-invite").send({ token: tokenFrom(r.body.data.inviteUrl), password: "Customer123" });
    const { agent, res } = await login(email, "Customer123");
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("admin"); // normal HoverChat customer
    agents.c1 = agent;
    const inv = await agent.get("/api/billing/reseller-invoice");
    expect(inv.body.data.openInvoice.amount).toBe(1499);
    expect((await agent.get("/api/reseller/me")).status).toBe(403); // customer can't use portal
    expect((await agent.get("/api/admin/resellers")).status).toBe(403);
  });

  it("8–9. verified Razorpay payment activates and records ₹700 margin once", async () => {
    const view = await request(app).get(`/api/public/reseller-pay/${ids.pay1}`);
    expect(view.body.data).toMatchObject({ amount: 1499, status: "pending", resellerName: "Acme Digital" });
    // simulate order creation (no network in tests)
    await db.update(S.resellerSales).set({ razorpayOrderId: `order_T1_${RUN}` }).where(eq(S.resellerSales.id, ids.sale1));
    const bad = await request(app).post(`/api/public/reseller-pay/${ids.pay1}/verify`).send({ razorpay_order_id: `order_T1_${RUN}`, razorpay_payment_id: `pay_T1_${RUN}`, razorpay_signature: "forged" });
    expect(bad.status).toBe(400);
    let [s] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale1));
    expect(s.paymentStatus).toBe("pending"); // forged signature never pays
    const sig = crypto.createHmac("sha256", RZP_SECRET).update(`order_T1_${RUN}|pay_T1_${RUN}`).digest("hex");
    const ok = await request(app).post(`/api/public/reseller-pay/${ids.pay1}/verify`).send({ razorpay_order_id: `order_T1_${RUN}`, razorpay_payment_id: `pay_T1_${RUN}`, razorpay_signature: sig });
    expect(ok.body.data).toMatchObject({ settled: true, status: "paid" });
    // duplicate webhook for same payment
    const wh = await webhook({ event: "payment.captured", payload: { payment: { entity: { id: `pay_T1_${RUN}`, order_id: `order_T1_${RUN}`, amount: 149900, currency: "INR" } } } });
    expect(wh.status).toBe(200);
    const ledger = await db.select().from(S.resellerLedgerEntries).where(eq(S.resellerLedgerEntries.saleId, ids.sale1));
    expect(ledger).toHaveLength(1);
    expect(Number(ledger[0].amount)).toBe(700);
    const [sub] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.userId, ids.c1));
    expect(sub.status).toBe("active");
    const [txn] = await db.select().from(S.transactions).where(eq(S.transactions.id, s.transactionId));
    expect(txn.status).toBe("completed");
  });

  it("10–11. renewal priced at current version; webhook settles; separate earnings, no duplicates", async () => {
    // admin changes pricing → existing sale stays frozen, renewal uses v2
    await agents.sa.put(`/api/admin/resellers/${ids.r1}/pricing`).send({ planId: ids.plan, billingCycle: "monthly", pricingModel: "wholesale", wholesalePrice: 899, suggestedRetailPrice: 1599, minSellingPrice: 999, currency: "INR" });
    const [old] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale1));
    expect(old.wholesaleCost).toBe("799.00");
    const r = await agents.r1.post(`/api/reseller/customers/${ids.c1}/renewals`).send({ cycles: 1 });
    expect(r.status).toBe(201);
    ids.sale2 = r.body.data.sale.id;
    expect(r.body.data.sale).toMatchObject({ saleType: "renewal", sellingPrice: "1599.00", wholesaleCost: "899.00", resellerEarning: "700.00", pricingVersion: 2 });
    expect((await agents.r1.post(`/api/reseller/customers/${ids.c1}/renewals`).send({ cycles: 1 })).status).toBe(409); // one open invoice
    const [subBefore] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.userId, ids.c1));
    await db.update(S.resellerSales).set({ razorpayOrderId: `order_T2_${RUN}` }).where(eq(S.resellerSales.id, ids.sale2));
    // amount mismatch → needs verification, no activation, no earning
    await webhook({ event: "payment.captured", payload: { payment: { entity: { id: `pay_bad_${RUN}`, order_id: `order_T2_${RUN}`, amount: 100, currency: "INR" } } } });
    let [s2] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale2));
    expect(s2.paymentStatus).toBe("pending_verification");
    // correct payment via webhook (twice)
    const ev = { event: "payment.captured", payload: { payment: { entity: { id: `pay_T2_${RUN}`, order_id: `order_T2_${RUN}`, amount: 159900, currency: "INR" } } } };
    await webhook(ev);
    await webhook(ev);
    [s2] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale2));
    expect(s2.paymentStatus).toBe("paid");
    const earn = await db.select().from(S.resellerLedgerEntries).where(and(eq(S.resellerLedgerEntries.resellerId, ids.r1), eq(S.resellerLedgerEntries.entryType, "earning")));
    expect(earn).toHaveLength(2);
    const [subAfter] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.id, subBefore.id));
    expect(new Date(subAfter.endDate).getTime()).toBeGreaterThan(new Date(subBefore.endDate).getTime()); // extended, same row
    expect(new Date(s2.periodStart).getTime()).toBe(new Date(subBefore.endDate).getTime());
    const sales = await agents.r1.get("/api/reseller/sales?range=all");
    expect(sales.body.data.totals).toMatchObject({ paidCount: 2, paidSales: 3098, grossMargin: 1400 });
  });

  it("12. expiry: notices sent once; subscription shows expired", async () => {
    const past = new Date(Date.now() - 86400_000);
    const [s2] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale2));
    await db.update(S.subscriptions).set({ endDate: past }).where(eq(S.subscriptions.id, s2.subscriptionId));
    await db.update(S.resellerSales).set({ periodEnd: past }).where(eq(S.resellerSales.id, ids.sale2));
    const { runResellerReminders } = await import("../cron/reseller-reminders.cron");
    const a = await runResellerReminders();
    const b = await runResellerReminders();
    expect(a.expiries).toBe(1);
    expect(b.expiries).toBe(0);
    const list = await agents.r1.get("/api/reseller/subscriptions");
    expect(list.body.data.rows[0].subscription.status).toBe("expired");
  });

  it("16–17. tenant isolation & pricing control", async () => {
    expect((await agents.r2.get(`/api/reseller/customers/${ids.c1}`)).status).toBe(404);
    expect((await agents.r2.post(`/api/reseller/customers/${ids.c1}/renewals`).send({})).status).toBe(404);
    expect((await agents.r2.get(`/api/reseller/sales?range=all&customerId=${ids.c1}`)).status).toBe(404);
    expect((await agents.r2.post(`/api/reseller/sales/${ids.sale1}/pay-link`)).status).toBe(404);
    expect((await agents.r2.get("/api/reseller/customers")).body.data.rows).toHaveLength(0);
    expect((await agents.r1.put(`/api/admin/resellers/${ids.r1}/pricing`).send({ planId: ids.plan, billingCycle: "monthly", pricingModel: "wholesale", wholesalePrice: 1, suggestedRetailPrice: 1499, minSellingPrice: 999 })).status).toBe(403);
    expect((await agents.r1.patch("/api/reseller/me").send({ maxCustomers: 9999, contactPerson: "Asha R" })).body.data.maxCustomers).toBe(2); // unknown fields ignored
    // customer limit
    const c2 = await agents.r1.post("/api/reseller/customers").send({ firstName: "B", businessName: "B Co", email: `b_${randomUUID().slice(0, 5)}@t.io`, mobile: "+91 9000000001", planId: ids.plan, billingCycle: "monthly" });
    expect(c2.status).toBe(201);
    ids.c2 = c2.body.data.customerUserId;
    ids.sale3 = c2.body.data.sale.id;
    const c3 = await agents.r1.post("/api/reseller/customers").send({ firstName: "C", businessName: "C Co", email: `c_${randomUUID().slice(0, 5)}@t.io`, mobile: "+91 9000000002", planId: ids.plan, billingCycle: "monthly" });
    expect(c3.status).toBe(409);
    // existing email cannot be re-attributed by another reseller
    const [cu] = await db.select().from(S.users).where(eq(S.users.id, ids.c1));
    expect((await agents.r2.post("/api/reseller/customers").send({ firstName: "X", businessName: "X", email: cu.email, mobile: "+91 9000000003", planId: ids.plan, billingCycle: "monthly" })).status).toBe(409);
    // unauthorised plan / cycle
    const unauth = await agents.r2.post("/api/reseller/customers").send({ firstName: "Y", businessName: "Y", email: `y_${randomUUID().slice(0, 5)}@t.io`, mobile: "+91 9000000004", planId: ids.plan, billingCycle: "annual" });
    expect(unauth.status).toBe(403);
    expect(unauth.body.code).toBe("PLAN_NOT_AUTHORISED");
  });

  it("unpaid sales never earn; cancel revokes; ledger is append-only", async () => {
    const cx = await agents.r1.post(`/api/reseller/sales/${ids.sale3}/cancel`).send({});
    expect(cx.status).toBe(200);
    const led = await db.select().from(S.resellerLedgerEntries).where(eq(S.resellerLedgerEntries.saleId, ids.sale3));
    expect(led).toHaveLength(0);
    const [sub] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.userId, ids.c2));
    expect(sub.status).toBe("cancelled");
    await expect(pool.query("UPDATE reseller_ledger_entries SET amount = 0")).rejects.toThrow(/append-only/);
    await expect(pool.query("DELETE FROM reseller_ledger_entries")).rejects.toThrow(/append-only/);
  });

  it("18. refunds reverse margin proportionally, idempotently; full refund rolls back renewal", async () => {
    const half = { event: "refund.created", payload: { refund: { entity: { id: `rfnd_1_${RUN}`, payment_id: `pay_T2_${RUN}`, amount: 79950 } } } };
    await webhook(half);
    await webhook(half); // duplicate delivery (different event id) — refund id dedupes
    let rev = await db.select().from(S.resellerLedgerEntries).where(and(eq(S.resellerLedgerEntries.saleId, ids.sale2), eq(S.resellerLedgerEntries.entryType, "reversal")));
    expect(rev).toHaveLength(1);
    expect(Number(rev[0].amount)).toBe(-350);
    let [s2] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale2));
    expect(s2.paymentStatus).toBe("partially_refunded");
    await webhook({ event: "refund.created", payload: { refund: { entity: { id: `rfnd_2_${RUN}`, payment_id: `pay_T2_${RUN}`, amount: 79950 } } } });
    rev = await db.select().from(S.resellerLedgerEntries).where(and(eq(S.resellerLedgerEntries.saleId, ids.sale2), eq(S.resellerLedgerEntries.entryType, "reversal")));
    expect(rev.reduce((a: number, r: any) => a + Number(r.amount), 0)).toBe(-700);
    [s2] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale2));
    expect(s2.paymentStatus).toBe("refunded");
    const [sub] = await db.select().from(S.subscriptions).where(eq(S.subscriptions.id, s2.subscriptionId));
    expect(new Date(sub.endDate).getTime()).toBe(new Date(s2.periodStart).getTime());
    // super admin refund through the existing transactions endpoint
    const [s1] = await db.select().from(S.resellerSales).where(eq(S.resellerSales.id, ids.sale1));
    const rr = await agents.sa.post(`/api/transactions/${s1.transactionId}/refund`).send({ refundReason: "test" });
    expect(rr.status).toBe(200);
    const rev1 = await db.select().from(S.resellerLedgerEntries).where(and(eq(S.resellerLedgerEntries.saleId, ids.sale1), eq(S.resellerLedgerEntries.entryType, "reversal")));
    expect(Number(rev1[0].amount)).toBe(-700);
    const bal = await agents.r1.get("/api/reseller/earnings");
    expect(bal.body.data.balances.grossMargin).toBe(0);
    // payout cannot exceed withdrawable
    expect((await agents.sa.post(`/api/admin/resellers/${ids.r1}/payouts`).send({ amount: 10, reference: "UTR-1" })).status).toBe(409);
  });

  it("13–15. suspension blocks portal (even live sessions) but not customers; transfer by SA only", async () => {
    expect((await agents.sa.post(`/api/admin/resellers/${ids.r1}/status`).send({ status: "suspended", reason: "KYC" })).status).toBe(200);
    const blocked = await agents.r1.get("/api/reseller/dashboard");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("RESELLER_INACTIVE");
    const [ru] = await db.select().from(S.users).innerJoin(S.resellerProfiles, eq(S.resellerProfiles.userId, S.users.id)).where(eq(S.resellerProfiles.id, ids.r1));
    expect((await login(ru.users.username, "Reseller123")).res.status).toBe(403);
    const [cu] = await db.select().from(S.users).where(eq(S.users.id, ids.c1));
    expect((await login(cu.username, "Customer123")).res.status).toBe(200); // customer unaffected
    // transfer: reseller cannot, SA can
    expect((await agents.r2.post(`/api/admin/resellers/customers/${ids.c1}/transfer`).send({ toResellerId: ids.r2, reason: "x" })).status).toBe(403);
    const t = await agents.sa.post(`/api/admin/resellers/customers/${ids.c1}/transfer`).send({ toResellerId: ids.r2, reason: "Reseller suspended" });
    expect(t.status).toBe(200);
    expect((await agents.r2.get(`/api/reseller/customers/${ids.c1}`)).status).toBe(200);
    const hist = await db.select().from(S.resellerSales).where(eq(S.resellerSales.customerUserId, ids.c1));
    expect(hist.every((h: any) => h.resellerId === ids.r1)).toBe(true); // history stays with original reseller
    // resume
    expect((await agents.sa.post(`/api/admin/resellers/${ids.r1}/status`).send({ status: "active" })).status).toBe(200);
    expect((await agents.r1.get("/api/reseller/dashboard")).status).toBe(200);
    const audit = await agents.sa.get(`/api/admin/resellers/${ids.r1}/audit`);
    expect(audit.body.data.map((a: any) => a.action)).toEqual(expect.arrayContaining(["reseller.suspended", "reseller.active", "pricing.updated", "customer.transferred_out", "sale.refunded"]));
  });

  it("19. direct customers unaffected; reports separate direct vs reseller", async () => {
    const email = `direct_${randomUUID().slice(0, 6)}@t.io`;
    const r = await request(app).post("/api/auth/signup").send({ username: `direct_${randomUUID().slice(0, 6)}`, password: "Direct123", email, firstName: "Dee" });
    expect([200, 201]).toContain(r.status);
    const [u] = await db.select().from(S.users).where(eq(S.users.email, email));
    expect(u.role).toBe("admin");
    const sum = await agents.sa.get("/api/admin/resellers/summary?range=all");
    expect(sum.status).toBe(200);
    expect(sum.body.data.customers.reseller).toBeGreaterThanOrEqual(2);
    expect(sum.body.data.customers.direct).toBeGreaterThanOrEqual(1);
    expect(sum.body.data.resellers.total).toBeGreaterThanOrEqual(2);
    for (const p of [`/api/admin/resellers`, `/api/admin/resellers/${ids.r1}`, `/api/admin/resellers/${ids.r1}/customers`, `/api/admin/resellers/${ids.r1}/sales?range=all`, `/api/admin/resellers/${ids.r1}/earnings`, `/api/admin/resellers/${ids.r1}/pricing?history=1`, `/api/admin/resellers/options`]) {
      expect((await agents.sa.get(p)).status, p).toBe(200);
    }
    for (const p of ["/api/reseller/dashboard", "/api/reseller/catalog", "/api/reseller/customers", "/api/reseller/subscriptions", "/api/reseller/transactions", "/api/reseller/earnings"]) {
      expect((await agents.r2.get(p)).status, p).toBe(200);
    }
  });

  it("password reset requires a verified OTP (account-takeover fix)", async () => {
    const [cu] = await db.select().from(S.users).where(eq(S.users.id, ids.c1));
    await request(app).post("/api/auth/forgot-password").send({ email: cu.email });
    const take = await request(app).post("/api/auth/reset-password").send({ email: cu.email, newPassword: "Hacked1234" });
    expect(take.status).toBe(400);
    const take2 = await request(app).post("/api/auth/reset-password").send({ email: cu.email, newPassword: "Hacked1234", otpCode: "000000" });
    expect(take2.status).toBe(400);
    expect((await login(cu.username, "Customer123")).res.status).toBe(200);
  });
});
