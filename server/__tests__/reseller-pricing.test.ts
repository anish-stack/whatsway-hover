import { describe, it, expect } from "vitest";
import {
  addCycles,
  computeSaleEconomics,
  generateResellerCode,
  ledgerBalances,
  PricingError,
  refundReversal,
  resolvePermissions,
  validatePricingRow,
} from "@shared/reseller-pricing";

const wholesale = { pricingModel: "wholesale", wholesalePrice: 799, suggestedRetailPrice: 1499, minSellingPrice: 999, maxSellingPrice: 2499, currency: "INR" };
const commission = { pricingModel: "commission_percent", commissionPercent: 30, suggestedRetailPrice: 1499, minSellingPrice: 999 };
const fixed = { pricingModel: "fixed_commission", fixedCommission: 300, suggestedRetailPrice: 1499, minSellingPrice: 999 };

describe("Model A — wholesale", () => {
  it("₹1,499 sale on ₹799 wholesale → ₹700 margin", () => {
    const e = computeSaleEconomics(wholesale, 1499, 1);
    expect(e).toMatchObject({ sellingPrice: 1499, wholesaleCost: 799, resellerEarning: 700, platformRevenue: 799, commissionAmount: null });
  });
  it("multi-cycle multiplies", () => {
    const e = computeSaleEconomics(wholesale, 1200, 3);
    expect(e).toMatchObject({ sellingPrice: 3600, wholesaleCost: 2397, resellerEarning: 1203 });
  });
  it("enforces min/max and SRP lock", () => {
    expect(() => computeSaleEconomics(wholesale, 998)).toThrow(PricingError);
    expect(() => computeSaleEconomics(wholesale, 2500)).toThrow(/maximum/);
    expect(() => computeSaleEconomics(wholesale, 1200, 1, { canSetPrice: false })).toThrow(/suggested retail/);
    expect(computeSaleEconomics(wholesale, undefined, 1, { canSetPrice: false }).sellingPrice).toBe(1499);
  });
  it("rejects configs that allow negative margin", () => {
    expect(() => validatePricingRow({ ...wholesale, minSellingPrice: 700 })).toThrow(/wholesale/);
  });
});

describe("Model B — commission", () => {
  it("30% of ₹1,499 → ₹449.70", () => {
    const e = computeSaleEconomics(commission, 1499);
    expect(e).toMatchObject({ resellerEarning: 449.7, commissionAmount: 449.7, wholesaleCost: null, platformRevenue: 1049.3 });
  });
  it("fixed commission per cycle", () => {
    expect(computeSaleEconomics(fixed, 1499, 2)).toMatchObject({ resellerEarning: 600, platformRevenue: 2398 });
  });
  it("never mixes models in one sale", () => {
    const e = computeSaleEconomics({ ...commission, wholesalePrice: 799 } as any, 1499);
    expect(e.wholesaleCost).toBeNull();
  });
  it("snapshot freezes the pricing used", () => {
    const e = computeSaleEconomics({ ...wholesale, id: "p1", version: 3 }, 1499);
    expect(e.snapshot).toMatchObject({ pricingRowId: "p1", version: 3, wholesalePrice: 799, minSellingPrice: 999 });
  });
});

describe("refund reversals", () => {
  const sale = { sellingPrice: 1499, resellerEarning: 700 };
  it("proportional, cumulative exact", () => {
    const r1 = refundReversal("proportional", sale, 749.5, 0);
    const r2 = refundReversal("proportional", sale, 749.5, 749.5);
    expect(r1).toBe(-350);
    expect(r1 + r2).toBe(-700);
  });
  it("full policy reverses once", () => {
    expect(refundReversal("full", sale, 100, 0)).toBe(-700);
    expect(refundReversal("full", sale, 100, 100)).toBe(0);
  });
  it("none policy and over-refund", () => {
    expect(refundReversal("none", sale, 1499, 0)).toBe(0);
    expect(refundReversal("proportional", sale, 5000, 1499)).toBe(0);
  });
});

describe("ledger balances", () => {
  it("separates gross margin from withdrawable", () => {
    const now = new Date("2026-11-23T00:00:00Z");
    const b = ledgerBalances([
      { entryType: "earning", amount: 700, availableAt: "2026-11-01" },
      { entryType: "earning", amount: 449.7, availableAt: "2026-11-30" }, // on hold
      { entryType: "reversal", amount: -350, availableAt: "2026-11-02" },
      { entryType: "payout", amount: -200, availableAt: "2026-11-03" },
    ], now);
    expect(b).toMatchObject({ grossMargin: 799.7, onHold: 449.7, withdrawable: 150, paidOut: 200 });
  });
});

describe("misc", () => {
  it("month-end safe cycles", () => {
    expect(addCycles(new Date("2026-01-31T10:00:00Z"), "monthly", 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addCycles(new Date("2024-02-29T00:00:00Z"), "annual", 1).toISOString()).toBe("2025-02-28T00:00:00.000Z");
  });
  it("reseller codes", () => {
    expect(generateResellerCode()).toMatch(/^HCR-[A-Z2-9]{6}$/);
  });
  it("permissions default + override", () => {
    expect(resolvePermissions({ suspendCustomers: true, createCustomers: false })).toMatchObject({ suspendCustomers: true, createCustomers: false, renewSubscriptions: true });
  });
});
