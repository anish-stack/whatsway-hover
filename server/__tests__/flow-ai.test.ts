import { describe, it, expect, vi, beforeEach } from "vitest";

const replies: string[] = [];
const seen: any[] = [];
vi.mock("../utils/ai-provider", () => ({
  chatComplete: vi.fn(async (_s: any, msgs: any[]) => { seen.push(msgs); return replies.shift() || "{}"; }),
}));
vi.mock("../services/ai-template.service", () => ({
  resolveSetting: vi.fn(async () => ({ provider: "gemini", apiKey: "k" })),
  extractJson: (t: string) => { const a = t.indexOf("{"), b = t.lastIndexOf("}"); return JSON.parse(t.slice(a, b + 1)); },
}));

const flow = (label: string) => ({
  type: "flow", summary: "Lead form ready",
  flow: { name: "Agency leads", category: "LEAD_GENERATION", message: "Tell us about your project", button: "Get a quote",
    screens: [{ title: "About you", button: "Submit", next: "finish", blocks: [{ type: "heading", text: "Hi!" }, { type: "short_answer", label, key: "full_name" }, { type: "short_answer", label: "Email", key: "email", input: "email" }] }],
    onSubmit: { saveName: "full_name", saveEmail: "email", tags: ["lead"], thankYou: "Thanks {{name}}", notify: true } },
});

describe("aiFlowTurn", () => {
  beforeEach(() => { replies.length = 0; seen.length = 0; });

  it("returns a question with options", async () => {
    const { aiFlowTurn } = await import("../services/flow-studio/flow-ai.service");
    replies.push('```json\n{"type":"question","question":"What is your business?","options":["Clinic","Agency"]}\n```');
    const r = await aiFlowTurn({ channelId: "c", messages: [{ role: "user", content: "make a form" }] });
    expect(r).toEqual({ type: "question", question: "What is your business?", options: ["Clinic", "Agency"] });
  });

  it("builds a valid flow and keeps settings", async () => {
    const { aiFlowTurn } = await import("../services/flow-studio/flow-ai.service");
    replies.push(JSON.stringify(flow("Full name")));
    const r: any = await aiFlowTurn({ channelId: "c", messages: [{ role: "user", content: "lead form for my agency" }] });
    expect(r.type).toBe("flow");
    expect(r.cta).toBe("Get a quote");
    expect(r.settings).toMatchObject({ saveName: "full_name", saveEmail: "email", tags: ["lead"] });
    expect(r.notes).toEqual([]);
    expect(seen).toHaveLength(1);
  });

  it("asks the model to repair errors it can't fix itself", async () => {
    const { aiFlowTurn } = await import("../services/flow-studio/flow-ai.service");
    const bad = flow("x");
    replies.push(JSON.stringify({ ...bad, flow: { ...bad.flow, screens: [] } }));
    replies.push(JSON.stringify(flow("Full name")));
    const r: any = await aiFlowTurn({ channelId: "c", messages: [{ role: "user", content: "lead form" }] });
    expect(r.type).toBe("flow");
    expect(r.definition.screens[0].title).toBe("About you");
    expect(seen).toHaveLength(2);
    expect(seen[1].at(-1).content).toMatch(/Fix these problems/);
  });

  it("edits an existing flow with the current flow in the prompt", async () => {
    const { aiFlowTurn } = await import("../services/flow-studio/flow-ai.service");
    const { FLOW_STARTERS } = await import("@shared/flow-studio");
    const st = FLOW_STARTERS.find((s) => s.id === "lead")!.build();
    replies.push(JSON.stringify(flow("Your name")));
    const r: any = await aiFlowTurn({ channelId: "c", messages: [{ role: "user", content: "ask name only" }], current: { definition: st.definition, settings: st.settings } });
    expect(seen[0][0].content).toMatch(/EDITING this existing flow/);
    expect(seen[0][0].content).toContain('"key":"full_name"');
    expect(r.definition.screens[0].components[1].label).toBe("Your name");
  });
});
