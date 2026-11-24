/** Platform WhatsApp onboarding messages (Postgres; WhatsApp API mocked). */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const sends: any[] = [];
vi.mock("../services/whatsapp-api", () => ({
  WhatsAppApiService: class {
    static async sendTemplateMessage(_ch: any, to: string, name: string, comps: any[], lang: string, marketing: boolean) {
      sends.push({ to, name, comps, lang, marketing });
      return { messages: [{ id: `wamid.p${sends.length}` }] };
    }
  },
}));

const RUN = !!process.env.DATABASE_URL && process.env.STORE_TEST === "1";

describe.skipIf(!RUN)("platform whatsapp", () => {
  let db: any, schema: any, svc: any, eq: any, customerId: string, tplId: string, resellerId: string;
  beforeAll(async () => {
    ({ db } = await import("../db"));
    schema = await import("@shared/schema");
    ({ eq } = await import("drizzle-orm"));
    svc = await import("../services/platform-whatsapp.service");
    const [t] = await db.insert(schema.templates).values({ channelId: "demo-ch", name: "welcome_customer", category: "UTILITY", language: "en_US", status: "APPROVED", header: "Hi {{1}}", body: "Hello {{1}}, {{2}} set up your {{3}} account. Activate: {{4}}", buttons: [{ type: "URL", text: "Activate", url: "https://x.com/{{1}}" }], createdBy: "demo-admin" } as any).returning();
    tplId = t.id;
    const [r] = await db.select().from(schema.resellerProfiles).limit(1);
    resellerId = r.id;
    const [u] = await db.insert(schema.users).values({ username: "pw.cust@example.com", email: "pw.cust@example.com", password: "!invite:x", role: "admin", firstName: "Riya", isEmailVerified: false, permissions: [] } as any).returning();
    customerId = u.id;
    await db.insert(schema.resellerCustomers).values({ resellerId, customerUserId: customerId, businessName: "Riya Foods", mobile: "98765 43210" });
  });
  afterAll(async () => {
    await db.delete(schema.platformMessageLogs).where(eq(schema.platformMessageLogs.userId, customerId));
    await db.delete(schema.resellerCustomers).where(eq(schema.resellerCustomers.customerUserId, customerId));
    await db.delete(schema.users).where(eq(schema.users.id, customerId));
    await db.delete(schema.templates).where(eq(schema.templates.id, tplId));
    await db.delete(schema.platformWhatsappSettings);
  });

  it("does nothing automatically while off, explains why on manual send", async () => {
    await db.delete(schema.platformWhatsappSettings);
    const ctx = await svc.customerContext(customerId);
    expect(await svc.sendPlatformMessage("customer_onboarded", ctx)).toEqual({ status: "off" });
    await expect(svc.sendPlatformMessage("customer_onboarded", ctx, { trigger: "manual" })).rejects.toThrow(/number/);
  });

  it("sends the mapped template to the customer's mobile", async () => {
    await svc.savePlatformSettings({ enabled: true, channelId: "demo-ch", events: { customer_onboarded: { enabled: true, templateName: "welcome_customer", language: "en_US", header: "customer_name", body: ["customer_name", "reseller_name", "plan_name", "activation_link"], button: "platform_name" } } }, "demo-admin");
    const ctx = await svc.customerContext(customerId, { activation_link: "https://app/accept-invite?token=abc" });
    const r = await svc.sendPlatformMessage("customer_onboarded", ctx);
    expect(r.status).toBe("sent");
    const s = sends.at(-1);
    expect(s.to).toBe("919876543210");          // 10-digit mobile → +91
    expect(s.marketing).toBe(false);
    expect(s.comps[0]).toEqual({ type: "header", parameters: [{ type: "text", text: "Riya" }] });
    const body = s.comps[1].parameters.map((p: any) => p.text);
    expect(body[0]).toBe("Riya");
    expect(body[3]).toBe("https://app/accept-invite?token=abc");
    expect(body[2]).toBe("-");                  // no plan yet → placeholder, Meta rejects empty params
    expect(s.comps[2]).toMatchObject({ type: "button", sub_type: "url", index: "0" });
    const logs = await db.select().from(schema.platformMessageLogs).where(eq(schema.platformMessageLogs.userId, customerId));
    expect(logs.some((l: any) => l.status === "sent" && l.whatsappMessageId)).toBe(true);
  });

  it("the queued job handler sends it too", async () => {
    const before = sends.length;
    await import("../services/jobs/handlers");
    const { enqueue } = await import("../services/jobs/queue");
    const r = await enqueue("whatsapp.platform", { event: "customer_onboarded", customerUserId: customerId, extra: {} }, { fallback: "inline" });
    expect(["redis", "inline"]).toContain(r.via);
    if (r.via === "inline") expect(sends.length).toBe(before + 1);
  });
});
