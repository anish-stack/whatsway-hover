import { describe, it, expect } from "vitest";
import {
  calculateEstimate,
  classifyHealth,
  countryFromPhone,
  decidePricing,
  isAccountBlockingSendError,
  marginalTieredCost,
  normalizeCategory,
  pickRate,
  shouldAdvanceStatus,
  type RateCardRow,
} from "@shared/meta-billing";
import { resolveRange } from "@shared/usage-range";

const rows: RateCardRow[] = [
  { id: "m1", countryCode: "IN", category: "marketing", rate: 0.7846, currency: "INR", effectiveFrom: "2025-07-01T00:00:00Z", effectiveTo: "2026-01-01T00:00:00Z", pricingVersion: "v1" },
  { id: "m2", countryCode: "IN", category: "marketing", rate: 0.8631, currency: "INR", effectiveFrom: "2026-01-01T00:00:00Z", pricingVersion: "v2" },
  { id: "u1", countryCode: "IN", category: "utility", rate: 0.115, currency: "INR", effectiveFrom: "2026-01-01T00:00:00Z",
    volumeTiers: [{ fromVolume: 1000, rate: 0.1 }, { fromVolume: 5000, rate: 0.08 }] },
  { id: "a1", countryCode: "IN", category: "authentication", rate: 0.115, currency: "INR", effectiveFrom: "2026-01-01T00:00:00Z" },
  { id: "s1", countryCode: "IN", category: "service", rate: 0.115, currency: "INR", freeMonthlyAllowance: 1000, effectiveFrom: "2026-01-01T00:00:00Z" },
  { id: "o1", countryCode: "*", category: "marketing", rate: 5, currency: "INR", effectiveFrom: "2025-01-01T00:00:00Z" },
  { id: "x1", countryCode: "IN", category: "marketing", rate: 99, currency: "INR", effectiveFrom: "2025-01-01T00:00:00Z", isActive: false },
];

describe("rate selection", () => {
  it("uses the rate valid at the delivery instant (history preserved)", () => {
    expect(pickRate(rows, "IN", "marketing", "2025-12-31T23:00:00Z")?.id).toBe("m1");
    expect(pickRate(rows, "IN", "marketing", "2026-03-01T00:00:00Z")?.id).toBe("m2");
  });
  it("prefers exact country, falls back to Other, ignores inactive", () => {
    expect(pickRate(rows, "BR", "marketing", "2026-03-01")?.id).toBe("o1");
    expect(pickRate(rows, "BR", "utility", "2026-03-01")).toBeNull();
  });
  it("auth-international falls back to authentication", () => {
    expect(pickRate(rows, "IN", "authentication_international", "2026-03-01")?.id).toBe("a1");
  });
});

describe("calculator", () => {
  it("applies service free allowance per phone number and tax-free estimate", () => {
    const r = calculateEstimate(rows, { country: "IN", counts: { marketing: 1000, service: 2500 }, phoneNumbers: 2, at: new Date("2026-06-01") });
    const svc = r.lines.find((l) => l.category === "service")!;
    expect(svc.freeAllowance).toBe(2000);
    expect(svc.billableCount).toBe(500);
    expect(svc.cost).toBeCloseTo(57.5, 2);
    expect(r.lines.find((l) => l.category === "marketing")!.cost).toBeCloseTo(863.1, 2);
    expect(r.total).toBeCloseTo(920.6, 2);
    expect(r.disclaimer).toMatch(/Actual charges are determined by Meta/);
  });
  it("applies utility volume tiers marginally", () => {
    expect(marginalTieredCost(0.115, [{ fromVolume: 1000, rate: 0.1 }], 1500)).toBeCloseTo(1000 * 0.115 + 500 * 0.1, 6);
    const r = calculateEstimate(rows, { country: "IN", counts: { utility: 6000 }, at: new Date("2026-06-01") });
    const u = r.lines.find((l) => l.category === "utility")!;
    expect(u.cost).toBeCloseTo(1000 * 0.115 + 4000 * 0.1 + 1000 * 0.08, 2);
    expect(u.volumeDiscountApplied).toBe(true);
  });
  it("flags missing rates instead of inventing one", () => {
    const r = calculateEstimate(rows, { country: "BR", counts: { utility: 10 } });
    expect(r.lines.find((l) => l.category === "utility")!.note).toMatch(/No active rate/);
  });
});

describe("pricing decision from Meta webhook", () => {
  it("trusts Meta billable flag", () => {
    expect(decidePricing({ billable: false, category: "utility", type: "free_customer_service", pricing_model: "PMP" }, null))
      .toMatchObject({ billable: false, category: "utility", pricingType: "free_customer_service" });
    expect(decidePricing({ billable: true, category: "marketing_lite", pricing_model: "PMP" }, null)).toMatchObject({ billable: true, category: "marketing" });
  });
  it("never charges when Meta omits pricing", () => {
    expect(decidePricing(undefined, "marketing")).toMatchObject({ billable: false, category: "marketing", pricingType: "unknown" });
  });
  it("normalises categories", () => {
    expect(normalizeCategory("AUTHENTICATION")).toBe("authentication");
    expect(normalizeCategory("authentication_international")).toBe("authentication_international");
    expect(normalizeCategory("nonsense")).toBeNull();
  });
});

describe("status ordering", () => {
  it("never regresses or fails a delivered message", () => {
    expect(shouldAdvanceStatus("sent", "delivered")).toBe(true);
    expect(shouldAdvanceStatus("read", "delivered")).toBe(false);
    expect(shouldAdvanceStatus("delivered", "failed")).toBe(false);
    expect(shouldAdvanceStatus("sent", "failed")).toBe(true);
    expect(shouldAdvanceStatus("failed", "sent")).toBe(false);
  });
});

describe("country from phone", () => {
  it("longest calling-code prefix wins", () => {
    expect(countryFromPhone("919876543210").iso).toBe("IN");
    expect(countryFromPhone("+971501234567").iso).toBe("AE");
    expect(countryFromPhone("14155550100").iso).toBe("US");
    expect(countryFromPhone("8801712345678").iso).toBe("BD");
    expect(countryFromPhone("").iso).toBe("*");
  });
});

describe("account health classification", () => {
  it("141006 + BLOCKED → Messaging Blocked with payment action", () => {
    const r = classifyHealth({
      waba: { ok: true, canSendMessage: "BLOCKED", entities: [{ entity_type: "WABA", can_send_message: "BLOCKED", errors: [{ error_code: 141006, error_description: "Payment method issue" }] }] },
      phone: { ok: true, status: "CONNECTED" },
    });
    expect(r.overall).toBe("blocked");
    expect(r.billingStatus).toBe("attention");
    expect(r.issues[0]).toMatchObject({ code: "141006", category: "billing", severity: "blocked" });
  });
  it("138024 calling error does not mark messaging as restricted", () => {
    const r = classifyHealth({
      waba: { ok: true, canSendMessage: "AVAILABLE", entities: [] },
      phone: { ok: true, status: "CONNECTED", canSendMessage: "AVAILABLE", entities: [{ entity_type: "PHONE_NUMBER", can_send_message: "AVAILABLE", errors: [{ error_code: 138024 }] }] },
    });
    expect(r.overall).toBe("healthy");
    expect(r.callingIssues).toHaveLength(1);
    expect(r.issues.some((i) => i.code === "138024")).toBe(false);
  });
  it("pending verification / display name / missing payment are separate and non-blocking", () => {
    const r = classifyHealth({
      waba: { ok: true, businessVerificationStatus: "pending", canSendMessage: "AVAILABLE", fundingFieldReadable: true, primaryFundingId: null },
      phone: { ok: true, status: "CONNECTED", nameStatus: "PENDING_REVIEW" },
      templates: { approved: 2, pending: 1 },
    });
    expect(r.overall).toBe("healthy");
    const cats = r.issues.map((i) => i.category);
    expect(cats).toEqual(expect.arrayContaining(["business_verification", "display_name", "billing"]));
    expect(r.issues.every((i) => i.affectsMessaging === false)).toBe(true);
    expect(r.billingStatus).toBe("not_detected");
  });
  it("141010 under LIMITED → restricted", () => {
    const r = classifyHealth({
      waba: { ok: true, canSendMessage: "LIMITED", entities: [{ entity_type: "BUSINESS", can_send_message: "LIMITED", errors: [{ error_code: 141010 }] }] },
      phone: { ok: true, status: "CONNECTED" },
    });
    expect(r.overall).toBe("restricted");
    expect(r.issues[0].category).toBe("business_verification");
  });
  it("no approved templates → action required", () => {
    const r = classifyHealth({ waba: { ok: true }, phone: { ok: true, status: "CONNECTED" }, templates: { approved: 0, rejected: 2 } });
    expect(r.overall).toBe("action_required");
  });
  it("blocking send codes", () => {
    expect(isAccountBlockingSendError(131042)).toBe(true);
    expect(isAccountBlockingSendError("138024")).toBe(false);
    expect(isAccountBlockingSendError(131026)).toBe(false);
  });
});

describe("date ranges (Asia/Kolkata)", () => {
  const now = new Date("2026-11-23T06:30:00Z"); // 12:00 IST
  it("today starts at IST midnight", () => {
    const r = resolveRange({ range: "today" }, now, "Asia/Kolkata");
    expect(r.from.toISOString()).toBe("2026-11-22T18:30:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-23T18:30:00.000Z");
  });
  it("last month boundaries", () => {
    const r = resolveRange({ range: "last_month" }, now, "Asia/Kolkata");
    expect(r.from.toISOString()).toBe("2026-09-30T18:30:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
  it("rejects inverted custom range", () => {
    expect(() => resolveRange({ range: "custom", from: new Date("2026-11-10"), to: new Date("2026-11-01") }, now, "Asia/Kolkata")).toThrow();
  });
});
