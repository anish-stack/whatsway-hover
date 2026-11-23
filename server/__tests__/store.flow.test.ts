/**
 * Mini Store chat flow against a real Postgres (DATABASE_URL), with the
 * WhatsApp send mocked so we can inspect every message the bot would send.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

const sent: any[] = [];
vi.mock("../services/whatsapp-api", () => ({
  WhatsAppApiService: class {
    constructor(_c: any) {}
    async sendDirectMessage(p: any) { sent.push(p); return { messages: [{ id: `wamid.${sent.length}` }] }; }
  },
}));

const RUN = !!process.env.DATABASE_URL && process.env.STORE_TEST === "1";

describe.skipIf(!RUN)("mini store flow", () => {
  let db: any, schema: any, svc: any, channel: any;
  const phone = "919811100000";

  beforeAll(async () => {
    ({ db } = await import("../db"));
    schema = await import("@shared/schema");
    svc = await import("../services/store/store.service");
    const { eq } = await import("drizzle-orm");
    [channel] = await db.select().from(schema.channels).where(eq(schema.channels.id, "demo-ch"));
    await db.delete(schema.storeOrders).where(eq(schema.storeOrders.channelId, channel.id));
    await db.delete(schema.storeProducts).where(eq(schema.storeProducts.channelId, channel.id));
    await db.delete(schema.storeCarts).where(eq(schema.storeCarts.channelId, channel.id));
    await db.delete(schema.storeSettings).where(eq(schema.storeSettings.channelId, channel.id));
    await db.insert(schema.storeSettings).values({ channelId: channel.id, ownerId: "demo-admin", enabled: true, storeName: "Demo Bakery", codEnabled: true, upiId: "demo@upi", deliveryFee: "40" });
    await db.insert(schema.storeProducts).values([
      { channelId: channel.id, name: "Chocolate Cake", price: "499", category: "Cakes", stock: 2 },
      { channelId: channel.id, name: "Red Velvet", price: "599", category: "Cakes" },
      { channelId: channel.id, name: "Cookies Box", price: "199", category: "Cookies" },
    ]);
  });

  const say = (text: string) => svc.handleStoreMessage({ channel, conversationId: null, phone, name: "Riya", type: "text", text });
  const tap = (id: string) => svc.handleStoreMessage({ channel, conversationId: null, phone, name: "Riya", type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: "x" } } });

  it("ignores normal chat, opens catalogue on keyword", async () => {
    expect(await say("hello there")).toBe(false);
    expect(await say("Shop")).toBe(true);
    const m = sent.at(-1);
    expect(m.interactive.type).toBe("list");
    expect(m.interactive.action.sections[0].rows.map((r: any) => r.title)).toEqual(["Cakes", "Cookies"]);
  });

  it("browses a category, opens a product, adds to cart with stock limit", async () => {
    await tap("st:cat:Cakes");
    const rows = sent.at(-1).interactive.action.sections[0].rows;
    const cake = rows.find((r: any) => r.title === "Chocolate Cake");
    expect(cake.description).toContain("499");
    await tap(cake.id);
    expect(sent.at(-1).interactive.action.buttons[0].reply.title).toBe("Add to cart");
    const pid = cake.id.replace("st:p:", "");
    await tap(`st:add:${pid}`); await tap(`st:add:${pid}`);
    expect(sent.at(-1).interactive.body.text).toContain("2 items");
    await tap(`st:add:${pid}`);
    expect(sent.at(-1).interactive.body.text).toContain("only 2");
  });

  it("checkout asks for address, places order with payment options", async () => {
    await tap("st:checkout");
    expect(sent.at(-1).text.body).toContain("delivery address");
    expect(await say("12 MG Road, Sector 5, Gurugram 122001")).toBe(true);
    const m = sent.at(-1);
    expect(m.interactive.body.text).toContain("Total: ₹1,038.00"); // 2×499 + 40
    const titles = m.interactive.action.buttons.map((b: any) => b.reply.title);
    expect(titles).toEqual(["Pay by UPI", "Cash on delivery"]);
    const codId = m.interactive.action.buttons[1].reply.id;
    await tap(codId);
    expect(sent.at(-1).text.body).toContain("confirmed");
  });

  it("track shows the order and stock was reserved", async () => {
    await say("track");
    expect(sent.at(-1).interactive.body.text).toMatch(/OD\d+/);
    expect(sent.at(-1).interactive.body.text).toContain("Confirmed");
    const { eq } = await import("drizzle-orm");
    const [p] = await db.select().from(schema.storeProducts).where(eq(schema.storeProducts.name, "Chocolate Cake"));
    expect(p.stock).toBe(0);
  });
});
