import { describe, expect, it } from "vitest";
import { mergeLiveTemplate, templateVarKeys, textParam } from "../utils/template-params";

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
