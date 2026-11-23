import { describe, it, expect } from "vitest";
import { resolveAI } from "../utils/ai-provider";
import { ensureFlowButton } from "../utils/flow-template";

describe("AI provider resolution", () => {
  it("gemini uses Google endpoint even if an old OpenAI endpoint is stored", () => {
    const r = resolveAI({ provider: "gemini", endpoint: "https://api.openai.com/v1", model: "gpt-4o-mini", maxTokens: "500" });
    expect(r.baseURL).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(r.model).toBe("gemini-3.8-flash");
    expect(r.maxTokens).toBe(2048);
    expect(r.extra.reasoning_effort).toBe("low");
    expect(r.embeddingModel).toBe("gemini-embedding-001");
  });
  it("openai keeps its settings", () => {
    const r = resolveAI({ provider: "openai", model: "gpt-4.1", maxTokens: 300 });
    expect(r.baseURL).toBe("https://api.openai.com/v1");
    expect(r.model).toBe("gpt-4.1");
    expect(r.maxTokens).toBe(300);
    expect(r.extra).toEqual({});
  });
});

describe("FLOW template button", () => {
  const tpl = { buttons: [{ type: "FLOW", text: "Book now", flow_id: "123" }] };
  it("adds a flow button component with a token", () => {
    const out = ensureFlowButton([], tpl, "tok");
    expect(out).toEqual([{ type: "button", sub_type: "flow", index: "0", parameters: [{ type: "action", action: { flow_token: "tok" } }] }]);
  });
  it("leaves non-flow templates alone and does not duplicate", () => {
    expect(ensureFlowButton([], { buttons: [{ type: "URL" }] })).toEqual([]);
    const once = ensureFlowButton([], tpl, "a");
    expect(ensureFlowButton(once, tpl, "b")).toHaveLength(1);
  });
});
