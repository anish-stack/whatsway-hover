import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../db", () => ({ db: {} }));

describe("Meta pricing_analytics aggregation", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sums cost/volume by category and day, one call per WABA", async () => {
    const now = Math.floor(Date.now() / 1000);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        name: "Hover", currency: "INR",
        pricing_analytics: { data: [{ data_points: [
          { start: now - 3600, end: now, pricing_category: "MARKETING", volume: 10, cost: 8.63 },
          { start: now - 3600, end: now, pricing_category: "UTILITY", volume: 4, cost: 0.46 },
          { start: now - 3600, end: now, pricing_category: "SERVICE", volume: 3, cost: 0 },
        ] }] },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { metaCharges } = await import("../services/meta-billing/meta-pricing.service");
    const ch: any = { id: "c1", whatsappBusinessAccountId: "w1", accessToken: "t" };
    const r = await metaCharges([ch, { ...ch, id: "c2" }], "this_month");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r.currency).toBe("INR");
    expect(r.total).toBe(9.09);
    expect(r.volume).toBe(17);
    expect(r.byCategory.marketing).toEqual({ cost: 8.63, volume: 10 });
    expect(r.daily.reduce((a, d) => a + d.cost, 0)).toBeCloseTo(9.09);
    expect(r.accounts[0].error).toBeUndefined();
  });
});
