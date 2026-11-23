import { describe, it, expect, vi } from "vitest";
vi.mock("../db", () => ({ db: {} }));
import { sanitizeTemplate } from "../services/ai-template.service";

describe("AI template sanitizer", () => {
  it("renumbers named variables, maps samples, fixes start/end and name", () => {
    const { template, notes } = sanitizeTemplate({
      name: "Order Shipped!",
      category: "utility",
      body: "{{customer}} your order {{order_id}} has shipped {{date}}",
      variables: [{ name: "customer", sample: "Rahul" }, { name: "order_id", sample: "A123" }, { name: "date", sample: "24 Nov" }],
      buttons: [{ type: "URL", text: "Track", url: "https://shop.in/track/{{order_id}}" }, { type: "QUICK_REPLY", text: "Ok" }],
    });
    expect(template.name).toBe("order_shipped");
    expect(template.category).toBe("UTILITY");
    expect(template.body.startsWith("Hi {{1}}")).toBe(true);
    expect(template.body).toContain("{{2}}");
    expect(/\{\{\d+\}\}\s*$/.test(template.body)).toBe(false);
    expect(template.samples).toEqual(["Rahul", "A123", "24 Nov"]);
    expect(template.buttons).toEqual([{ type: "URL", text: "Track", url: "https://shop.in/track/{{1}}" }]);
    expect(notes.length).toBeGreaterThan(0);
  });
  it("separates adjacent variables and caps quick replies at 3", () => {
    const { template } = sanitizeTemplate({
      body: "Hello {{1}}{{2}} welcome to our store today",
      variables: [{ sample: "A" }, { sample: "B" }],
      buttons: [1, 2, 3, 4].map((i) => ({ type: "QUICK_REPLY", text: `Opt ${i}` })),
    });
    expect(template.body).toContain("{{1}} - {{2}}");
    expect(template.buttons).toHaveLength(3);
  });
});
