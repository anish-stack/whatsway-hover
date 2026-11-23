import { describe, it, expect, vi } from "vitest";
import crypto from "crypto";
vi.mock("../db", () => ({ db: {} }));
import { pick, normalizePhone, detectEvents, verifySignature } from "../services/integrations/integrations.service";

describe("integrations helpers", () => {
  const order = { customer: { first_name: "Rahul", phone: "+91 98765-43210" }, line_items: [{ title: "Shoes" }], total_price: "999.00" };
  it("pick handles paths, arrays, alternatives, static", () => {
    expect(pick(order, "customer.first_name")).toBe("Rahul");
    expect(pick(order, "line_items.0.title")).toBe("Shoes");
    expect(pick(order, "missing.x|total_price")).toBe("999.00");
    expect(pick(order, "static:Hover Store")).toBe("Hover Store");
    expect(pick(order, "customer")).toBe("");
  });
  it("normalizePhone adds default country code", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("9876543210")).toBe("919876543210");
    expect(normalizePhone("09876543210")).toBe("919876543210");
    expect(normalizePhone("12")).toBeNull();
  });
  it("detects events per platform", () => {
    expect(detectEvents("shopify", { "x-shopify-topic": "orders/create" }, {}, {})).toEqual(["orders/create"]);
    expect(detectEvents("woocommerce", { "x-wc-webhook-topic": "order.updated" }, { status: "completed" }, {})).toEqual(["order.updated", "order.status.completed"]);
    expect(detectEvents("google_sheets", {}, { row: {} }, {})).toEqual(["row.added"]);
    expect(detectEvents("crm_webhook", {}, {}, { event: "lead.created" })).toEqual(["lead.created"]);
  });
  it("verifies Shopify/Woo HMAC signatures", () => {
    const raw = Buffer.from('{"id":1}');
    const sig = crypto.createHmac("sha256", "s3cret").update(raw).digest("base64");
    expect(verifySignature("shopify", "s3cret", { "x-shopify-hmac-sha256": sig }, raw)).toBe(true);
    expect(verifySignature("woocommerce", "s3cret", { "x-wc-webhook-signature": sig }, raw)).toBe(true);
    expect(verifySignature("shopify", "s3cret", { "x-shopify-hmac-sha256": "bad" }, raw)).toBe(false);
    expect(verifySignature("shopify", undefined, {}, raw)).toBe(true);
  });
});
