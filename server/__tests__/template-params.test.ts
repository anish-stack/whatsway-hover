import { describe, expect, it } from "vitest";
import { mergeLiveTemplate, reconcileComponents, templateVarKeys, textParam } from "../utils/template-params";

describe("templateVarKeys", () => {
  it("counts a repeated {{1}} once (fixes #132000)", () => {
    const r = templateVarKeys("Hi {{1}}, your order {{2}} is ready. Thanks {{1}}!");
    expect(r.keys).toEqual(["1", "2"]);
    expect(r.named).toBe(false);
  });
  it("sorts numeric keys and tolerates spaces", () => {
    expect(templateVarKeys("{{ 3 }} {{1}} {{2}}").keys).toEqual(["1", "2", "3"]);
  });
  it("keeps named keys in order of appearance", () => {
    const r = templateVarKeys("Hello {{customer_name}}, code {{code}} — {{customer_name}}");
    expect(r).toEqual({ keys: ["customer_name", "code"], named: true });
  });
  it("empty text → no params", () => {
    expect(templateVarKeys(null).keys).toEqual([]);
  });
});

describe("textParam", () => {
  it("never sends empty text", () => {
    expect(textParam("1", "", false)).toEqual({ type: "text", text: "-" });
  });
  it("adds parameter_name for named templates", () => {
    expect(textParam("name", "Ravi", true)).toEqual({ type: "text", parameter_name: "name", text: "Ravi" });
  });
});

describe("mergeLiveTemplate", () => {
  it("takes body/header from Meta when local copy is stale", () => {
    const local = { name: "promo", body: "Hi {{1}} {{2}} {{3}}", header: "Sale {{1}}", mediaUrl: null };
    const meta = {
      parameter_format: "POSITIONAL",
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Hi {{1}}" },
        { type: "BUTTONS", buttons: [{ type: "url", text: "Shop", url: "https://x.in/{{1}}" }] },
      ],
    };
    const m = mergeLiveTemplate(local, meta);
    expect(m.body).toBe("Hi {{1}}");
    expect(m.headerFormat).toBe("IMAGE");
    expect(m.header).toBe("");
    expect(templateVarKeys(m.body).keys.length).toBe(1);
    expect((m as any).buttons[0].type).toBe("URL");
  });
  it("leaves local untouched when Meta has nothing", () => {
    const local = { body: "x" };
    expect(mergeLiveTemplate(local, null)).toBe(local);
  });
});

describe("reconcileComponents (limited_time_discount style)", () => {
  const meta = {
    parameter_format: "POSITIONAL",
    components: [
      { type: "HEADER", format: "IMAGE", example: { header_handle: ["https://scontent.example/img.jpg"] } },
      { type: "LIMITED_TIME_OFFER", limited_time_offer: { text: "Hurry", has_expiration: true } },
      { type: "BODY", text: "Hi {{1}}, get {{2}} off. {{1}} don't miss it" },
      { type: "BUTTONS", buttons: [
        { type: "COPY_CODE", example: ["SAVE20"] },
        { type: "URL", text: "Shop", url: "https://shop.in/{{1}}", example: ["https://shop.in/sale"] },
      ] },
    ],
  };

  it("fixes wrong header, extra body params and missing buttons", () => {
    const sent = [
      { type: "header", parameters: [{ type: "image", image: { id: "https://mysite.in/uploads/a.jpg" } }] },
      { type: "header", parameters: [{ type: "text", text: "x" }] },
      { type: "body", parameters: [{ type: "text", text: "Ravi" }, { type: "text", text: "20%" }, { type: "text", text: "Ravi" }] },
    ];
    const out = reconcileComponents(meta, sent);
    expect(out.filter((c) => c.type === "header")).toHaveLength(1);
    expect(out[0].parameters[0].image).toEqual({ link: "https://mysite.in/uploads/a.jpg" });
    expect(out.find((c) => c.type === "limited_time_offer")).toBeTruthy();
    expect(out.find((c) => c.type === "body").parameters.map((p: any) => p.text)).toEqual(["Ravi", "20%"]);
    const btns = out.filter((c) => c.type === "button");
    expect(btns).toHaveLength(2);
    expect(btns[0].parameters[0]).toEqual({ type: "coupon_code", coupon_code: "SAVE20" });
    expect(btns[1].parameters[0].text).toBe("sale");
  });

  it("uses sample header image when none uploaded, keeps user coupon", () => {
    const out = reconcileComponents(meta, [
      { type: "button", sub_type: "copy_code", index: "0", parameters: [{ type: "coupon_code", coupon_code: "DIWALI" }] },
      { type: "button", sub_type: "url", index: "1", parameters: [{ type: "text", text: "diwali" }] },
    ]);
    expect(out[0].parameters[0].image).toEqual({ link: "https://scontent.example/img.jpg" });
    expect(out.filter((c) => c.type === "button").map((b) => b.parameters[0].coupon_code || b.parameters[0].text)).toEqual(["DIWALI", "diwali"]);
  });

  it("no LTO param when offer has no expiry; no button param for static URL", () => {
    const m2 = { components: [
      { type: "LIMITED_TIME_OFFER", limited_time_offer: { has_expiration: false } },
      { type: "BODY", text: "Hello" },
      { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x.in" }, { type: "QUICK_REPLY", text: "Stop" }] },
    ] };
    expect(reconcileComponents(m2, [{ type: "body", parameters: [{ type: "text", text: "a" }] }])).toEqual([]);
  });
});

describe("flow/otp helpers keep parameters", () => {
  it("ensureFlowButton + splice never empties components (root cause of #132000)", async () => {
    const { ensureFlowButton } = await import("../utils/flow-template");
    const components: any[] = [{ type: "body", parameters: [{ type: "text", text: "Ravi" }] }];
    const withFlow = ensureFlowButton(components, { buttons: [] });
    components.splice(0, components.length, ...withFlow);
    expect(components).toHaveLength(1);
  });
});
