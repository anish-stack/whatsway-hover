/**
 * Queues against a real Redis + Postgres (REDIS_URL, DATABASE_URL, QUEUE_TEST=1):
 *  - background jobs run through BullMQ with retries
 *  - a campaign message row is sent exactly once even if two jobs/engines try
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

const sends: any[] = [];
vi.mock("../services/whatsapp-api", () => ({
  WhatsAppApiService: class {
    static async checkRateLimit() { return true; }
    static async sendTemplateMessage(_ch: any, to: string, name: string, comps: any[], lang: string) {
      sends.push({ to, name, comps, lang });
      return { messages: [{ id: `wamid.q${sends.length}` }] };
    }
  },
}));

const RUN = !!process.env.REDIS_URL && !!process.env.DATABASE_URL && process.env.QUEUE_TEST === "1";
const wait = async (fn: () => boolean | Promise<boolean>, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
};

describe.skipIf(!RUN)("queues (redis)", () => {
  let jobs: typeof import("../services/jobs/queue");
  beforeAll(async () => {
    jobs = await import("../services/jobs/queue");
    const { waitForRedis } = await import("../services/redis");
    expect(await waitForRedis(5000)).toBe(true);
  });
  afterAll(async () => { await jobs.shutdownJobs(); const bq = await import("../services/bull-queue"); await bq.shutdownBullQueue(); });

  it("runs background jobs through BullMQ and retries failures", async () => {
    const seen: number[] = [];
    let flaky = 0;
    jobs.defineJob("test.echo", async (d) => { seen.push(d.n); });
    jobs.defineJob("test.flaky", async () => { flaky++; if (flaky < 2) throw new Error("boom"); });
    await jobs.startJobWorkers();
    const r = await jobs.enqueue("test.echo", { n: 7 });
    expect(r.via).toBe("redis");
    await jobs.enqueue("test.flaky", {}, { attempts: 3 });
    // default backoff is 5s; the second attempt happens after that
    expect(await wait(() => seen.includes(7))).toBe(true);
    expect(await wait(() => flaky >= 2, 12000)).toBe(true);
    const stats = await jobs.jobStats();
    expect(stats.redis).toBe(true);
    expect(stats.queues["hc-jobs"].workers).toBeGreaterThan(0);
  }, 20000);

  it("sends a queued message once, with the row's language, even if enqueued twice", async () => {
    const { db } = await import("../db");
    const { messageQueue } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const bq = await import("../services/bull-queue");
    const [row] = await db.insert(messageQueue).values({ channelId: "demo-ch", recipientPhone: "919800000001", templateName: "hello_hi", templateLanguage: "hi", templateParams: [], messageType: "utility", status: "queued" } as any).returning();
    expect(await bq.initBullQueue()).toBe(true);
    // two different job ids for the same row (e.g. two instances) — only one may send
    await bq.addMessageToBullQueue({ messageId: row.id, channelId: "demo-ch", recipientPhone: "919800000001", templateName: "hello_hi", messageType: "utility" });
    await bq.processMessageJob({ id: "dup", data: { messageId: row.id }, attemptsMade: 0, opts: {} } as any);
    expect(await wait(async () => (await db.select().from(messageQueue).where(eq(messageQueue.id, row.id)))[0]?.status === "sent")).toBe(true);
    await new Promise((r) => setTimeout(r, 1000));
    const mine = sends.filter((s) => s.to === "919800000001");
    expect(mine).toHaveLength(1);
    expect(mine[0].lang).toBe("hi");
    expect(await bq.countBullWorkers()).toBeGreaterThan(0);
    await db.delete(messageQueue).where(eq(messageQueue.id, row.id));
  }, 20000);
});
