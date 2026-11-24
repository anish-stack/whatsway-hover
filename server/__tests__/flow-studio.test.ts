import { describe, it, expect } from "vitest";
import { FLOW_STARTERS, compileFlow, validateFlow, parseFlowJson, COMPLETE, newComponent, listFields, formatAnswer, type FlowDefinition } from "@shared/flow-studio";

describe("flow studio compiler", () => {
  for (const st of FLOW_STARTERS) {
    it(`starter "${st.name}" is valid and round-trips`, () => {
      const { definition } = st.build();
      expect(validateFlow(definition).filter((i) => i.level === "error")).toEqual([]);
      const json = compileFlow(definition);
      expect(json.version).toBe("7.3");
      for (const s of json.screens) expect(s.id).toMatch(/^[A-Z_]+$/);
      expect(json.screens.some((s: any) => s.terminal)).toBe(true);
      const back = parseFlowJson(JSON.parse(JSON.stringify(json)))!;
      expect(back).not.toBeNull();
      expect(back.screens.map((s) => [s.id, s.next, s.branch?.goTo || null])).toEqual(definition.screens.map((s) => [s.id, s.next, s.branch?.goTo || null]));
      expect(compileFlow({ ...back })).toEqual(json);
    });
  }

  it("carries earlier answers forward and completes with every field", () => {
    const { definition } = FLOW_STARTERS.find((s) => s.id === "feedback")!.build();
    const json = compileFlow(definition);
    const [a, b, c] = json.screens;
    const ifc = a.layout.children.at(-1);
    expect(ifc.type).toBe("If");
    expect(ifc.condition).toBe("${form.rating} == 'poor'");
    expect(ifc.then[0]["on-click-action"].next.name).toBe(b.id);
    expect(ifc.else[0]["on-click-action"].next.name).toBe(c.id);
    // screen C can be reached from A (no issue/callback answered) or from B
    expect(Object.keys(c.data).sort()).toEqual(["callback", "issue", "liked", "rating"]);
    expect(ifc.else[0]["on-click-action"].payload).toEqual({ rating: "${form.rating}", liked: "${form.liked}", issue: "", callback: false });
    expect(ifc.then[0]["on-click-action"].payload).toEqual({ rating: "${form.rating}", liked: "${form.liked}" });
    expect(b.data.liked).toEqual({ type: "array", items: { type: "string" }, __example__: [] });
    const done = c.layout.children.at(-1)["on-click-action"];
    expect(done.name).toBe("complete");
    expect(done.payload).toEqual({ rating: "${data.rating}", liked: "${data.liked}", issue: "${data.issue}", callback: "${data.callback}", comments: "${form.comments}" });
    expect(c.terminal).toBe(true);
  });

  it("catches common mistakes", () => {
    const def: FlowDefinition = FLOW_STARTERS.find((s) => s.id === "lead")!.build().definition;
    def.screens[1].components[0].label = "This label is far too long for WhatsApp";
    def.screens[1].components[1].name = "full_name";
    def.screens[1].next = def.screens[0].id;
    def.screens[0].components.push({ ...newComponent("Dropdown", def), options: [] });
    const msgs = validateFlow(def).map((i) => i.message).join("\n");
    expect(msgs).toMatch(/label is longer than 20/);
    expect(msgs).toMatch(/"full_name" is already used/);
    expect(msgs).toMatch(/only go to a later screen/);
    expect(msgs).toMatch(/needs 1–200 options/);
    expect(msgs).toMatch(/must finish the flow/);
  });

  it("refuses to model endpoint flows and formats answers", () => {
    expect(parseFlowJson({ version: "7.3", data_api_version: "3.0", screens: [{ id: "A", layout: { type: "SingleColumnLayout", children: [] } }] })).toBeNull();
    const { definition } = FLOW_STARTERS.find((s) => s.id === "signup")!.build();
    const f = listFields(definition).find((x) => x.name === "interests");
    expect(formatAnswer(f, ["offers", "events"])).toBe("Offers, Events");
    expect(formatAnswer(undefined, true)).toBe("Yes");
    expect(definition.screens.at(-1)!.next).toBe(COMPLETE);
  });
});

describe("AI format", () => {
  it("repairs a sloppy AI flow into a valid definition", async () => {
    const { fromAiFlow, toAiFlow, validateFlow, compileFlow, COMPLETE } = await import("@shared/flow-studio");
    const r = fromAiFlow({
      name: "Clinic intake", category: "appointment_booking", message: "Book your visit", button: "Book a visit now please",
      screens: [
        { title: "Your visit to our wonderful clinic today", button: "Next", rule: { field: "visit", equals: "New patient", goTo: 2 }, next: 3, blocks: [
          { type: "heading", text: "Book a visit" },
          { type: "single choice", label: "Visit type", key: "visit", options: ["New patient", "Follow-up"] },
          { type: "short_answer", label: "What is your full name please?", key: "name" },
          { type: "short_answer", label: "Email", key: "name", input: "email" },
          { type: "image", text: "x" },
        ] },
        { title: "History", next: 1, blocks: [{ type: "long_answer", label: "Medical history" }, { type: "chips", label: "Symptoms", options: ["Fever"] }] },
        { title: "When", blocks: [{ type: "date", label: "Preferred date" }, { type: "consent", label: "I agree" }] },
      ],
      onSubmit: { saveName: "name", saveEmail: "nope", tags: ["Clinic"], thankYou: "Thanks {{name}}" },
    });
    expect(validateFlow(r.definition).filter((i) => i.level === "error")).toEqual([]);
    expect(r.category).toBe("APPOINTMENT_BOOKING");
    expect(r.cta.length).toBeLessThanOrEqual(20);
    const [a, b, c] = r.definition.screens;
    expect(a.title.length).toBeLessThanOrEqual(30);
    expect(a.next).toBe(c.id);                       // explicit next: 3
    expect(a.branch).toEqual({ field: "visit", equals: "new_patient", goTo: b.id });
    expect(b.next).toBe(c.id);                       // backwards "next: 1" repaired
    expect(c.next).toBe(COMPLETE);
    const keys = a.components.filter((x) => x.name).map((x) => x.name);
    expect(new Set(keys).size).toBe(keys.length);   // duplicate key "name" made unique
    expect(a.components.find((x) => x.label?.startsWith("What"))!.label!.length).toBeLessThanOrEqual(20);
    expect(b.components[1].type).toBe("CheckboxGroup"); // chips with 1 option → checkbox
    expect(r.settings).toMatchObject({ saveName: "name", saveEmail: undefined, tags: ["clinic"], notifyTeam: true });
    expect(compileFlow(r.definition).screens).toHaveLength(3);
    // round trip through the AI format keeps the structure
    const again = fromAiFlow(toAiFlow(r.definition, { settings: r.settings }));
    expect(again.definition.screens.map((s) => s.components.length)).toEqual(r.definition.screens.map((s) => s.components.length));
    expect(again.definition.screens[0].branch?.equals).toBe("new_patient");
  });
});
