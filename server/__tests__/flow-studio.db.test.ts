/**
 * Flow Studio against a real Postgres with Meta's Graph API mocked:
 * push → publish → edit → republish (new Meta flow, old id kept), send, and replies.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const sent: any[] = [];
vi.mock("../services/whatsapp-api", () => ({
  WhatsAppApiService: class {
    constructor(_c: any) {}
    async sendDirectMessage(p: any) { sent.push(p); return { messages: [{ id: `wamid.t${sent.length}` }] }; }
  },
}));

const RUN = !!process.env.DATABASE_URL && process.env.STORE_TEST === "1";
const calls: Array<{ method: string; path: string; body: any }> = [];
let nextFlowId = 9001;
const realFetch = globalThis.fetch;

describe.skipIf(!RUN)("flow studio (db)", () => {
  let db: any, schema: any, svc: any, channel: any, flowId: string, contactId: string;
  const phone = "919811177777";

  beforeAll(async () => {
    globalThis.fetch = (async (url: any, init: any = {}) => {
      const u = new URL(String(url));
      const path = u.pathname.replace(/^\/v[\d.]+/, "");
      const method = init.method || "GET";
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body instanceof FormData ? Object.fromEntries((init.body as FormData).entries()) : undefined;
      calls.push({ method, path: path + u.search, body });
      let out: any = { success: true };
      if (method === "POST" && /\/flows$/.test(path)) out = { id: String(nextFlowId++), success: true, validation_errors: [] };
      else if (method === "POST" && /\/assets$/.test(path)) out = { success: true, validation_errors: [] };
      else if (method === "GET" && /^\/\d+$/.test(path)) out = { status: "DRAFT", preview: { preview_url: "https://business.facebook.com/wa/manage/flows/preview" } };
      else if (/\/messages$/.test(path)) out = { messages: [{ id: "wamid.flow1" }] };
      return { ok: true, status: 200, json: async () => out } as any;
    }) as any;

    ({ db } = await import("../db"));
    schema = await import("@shared/schema");
    svc = await import("../services/flow-studio/flow-studio.service");
    const { FLOW_STARTERS } = await import("@shared/flow-studio");
    const { eq } = await import("drizzle-orm");
    [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, "demo-ch"));
    await db.delete(schema.waFlows).where(eq(schema.waFlows.channelId, channel.id));
    await db.delete(schema.waFlowSessions).where(eq(schema.waFlowSessions.channelId, channel.id));
    await db.delete(schema.contacts).where(eq(schema.contacts.phone, phone));
    const [c] = await db.insert(schema.contacts).values({ channelId: channel.id, name: phone, phone, tags: ["vip"] }).returning();
    contactId = c.id;
    const st = FLOW_STARTERS.find((s: any) => s.id === "lead")!.build();
    const [f] = await db.insert(schema.waFlows).values({ channelId: channel.id, ownerId: "demo-admin", name: "Website enquiry", categories: ["LEAD_GENERATION"], definition: st.definition, settings: st.settings, cta: st.cta, body: st.body }).returning();
    flowId = f.id;
  });
  afterAll(() => { globalThis.fetch = realFetch; });

  it("creates the Meta flow with compiled JSON and publishes it", async () => {
    const f = await svc.pushFlow(flowId, { publish: true });
    expect(f.metaFlowId).toBe("9001");
    expect(f.status).toBe("published");
    expect(f.version).toBe(1);
    expect(f.dirty).toBe(false);
    const create = calls.find((c) => c.method === "POST" && c.path.endsWith("/waba_demo/flows"))!;
    expect(create.body.name).toBe("Website enquiry");
    expect(create.body.categories).toEqual(["LEAD_GENERATION"]);
    expect(JSON.parse(create.body.flow_json).version).toBe("7.3");
    expect(calls.some((c) => c.method === "POST" && c.path === "/9001/publish")).toBe(true);
  });

  it("refuses to push a broken flow", async () => {
    const { eq } = await import("drizzle-orm");
    const [f] = await db.select().from(schema.waFlows).where(eq(schema.waFlows.id, flowId));
    const bad = JSON.parse(JSON.stringify(f.definition));
    bad.screens[0].components[2].label = "";
    await db.update(schema.waFlows).set({ definition: bad }).where(eq(schema.waFlows.id, flowId));
    await expect(svc.pushFlow(flowId)).rejects.toMatchObject({ status: 400 });
    await db.update(schema.waFlows).set({ definition: f.definition }).where(eq(schema.waFlows.id, flowId));
  });

  it("editing a published flow publishes a new Meta flow and keeps the old id", async () => {
    const { eq } = await import("drizzle-orm");
    await db.update(schema.waFlows).set({ dirty: true }).where(eq(schema.waFlows.id, flowId));
    const f = await svc.pushFlow(flowId, { publish: true });
    expect(f.metaFlowId).toBe("9002");
    expect(f.metaHistory).toEqual(["9001"]);
    expect(f.version).toBe(2);
    const create = calls.filter((c) => c.method === "POST" && c.path.endsWith("/waba_demo/flows")).at(-1)!;
    expect(create.body.name).toBe("Website enquiry v2");
  });

  it("sends the flow with a traceable token and records the send", async () => {
    const { eq } = await import("drizzle-orm");
    const [f] = await db.select().from(schema.waFlows).where(eq(schema.waFlows.id, flowId));
    const r = await svc.sendFlow(f, { to: `+${phone}` });
    expect(r.flowToken).toMatch(/^hcf_9002_/);
    expect(r.draft).toBe(false);
    const msg = calls.filter((c) => c.path.endsWith("/pn_demo/messages")).at(-1)!;
    expect(msg.body.interactive.action.parameters).toMatchObject({ flow_id: "9002", flow_cta: "Get a quote", flow_action: "navigate" });
    expect(msg.body.interactive.action.parameters.mode).toBeUndefined();
    const [s] = await db.select().from(schema.waFlowSessions).where(eq(schema.waFlowSessions.flowToken, r.flowToken));
    expect(s.status).toBe("sent");
    expect(s.contactId).toBe(contactId);

    // reply → answers stored, contact updated, thank-you sent, owner notified
    const before = sent.length;
    const ok = await svc.handleFlowReply({ channel, phone, contactId, conversationId: null, responseJson: JSON.stringify({ flow_token: r.flowToken, full_name: "Riya Kapoor", email: "Riya@Example.com", service: "website", budget: "under_25_000", consent: true }) });
    expect(ok).toBe(true);
    const [done] = await db.select().from(schema.waFlowSessions).where(eq(schema.waFlowSessions.flowToken, r.flowToken));
    expect(done.status).toBe("completed");
    expect(done.response.full_name).toBe("Riya Kapoor");
    expect(done.response.flow_token).toBeUndefined();
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contactId));
    expect(c.name).toBe("Riya Kapoor");
    expect(c.email).toBe("riya@example.com");
    expect(c.tags).toEqual(["vip", "lead"]);
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1).text.body).toBe("Thanks Riya Kapoor! Our team will reach out shortly.");
    const notes = await db.select().from(schema.notifications).where(eq(schema.notifications.type, "flow_response"));
    expect(notes.some((n: any) => n.title.includes("Website enquiry"))).toBe(true);

    // duplicate webhook → no second thank-you
    await svc.handleFlowReply({ channel, phone, contactId, conversationId: null, responseJson: JSON.stringify({ flow_token: r.flowToken, full_name: "X" }) });
    expect(sent.length).toBe(before + 1);
  });

  it("matches a template reply sent with the old version's id", async () => {
    const ok = await svc.handleFlowReply({ channel, phone, contactId, conversationId: null, responseJson: { flow_token: "hcf_9001_tmplabc", full_name: "Riya K" } });
    expect(ok).toBe(true);
    const rows = await svc.flowResponses(flowId);
    expect(rows.length).toBe(2);
    expect(rows.find((r: any) => r.response.full_name === "Riya K").source).toBe("template");
    const stats = (await svc.flowStats([flowId]))[flowId];
    expect(stats).toMatchObject({ sent: 1, completed: 2 });
    const { eq } = await import("drizzle-orm");
    const [f] = await db.select().from(schema.waFlows).where(eq(schema.waFlows.id, flowId));
    const csv = svc.responsesCsv(f, rows);
    expect(csv.split("\r\n")[0]).toContain("Full name");
    expect(csv).toContain("Website");
    expect(csv).toContain("Under ₹25,000");
  });
});
