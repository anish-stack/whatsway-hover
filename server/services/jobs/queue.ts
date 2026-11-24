/**
 * Background jobs (BullMQ + Redis) for everything that isn't a campaign message:
 * emails, onboarding WhatsApp messages, … Work is spread out instead of running
 * inside the HTTP request, with retries and a per-second rate limit.
 *
 *   enqueue("email.notification", { mailOptions })
 *
 * Two queues so a burst of emails can't starve other jobs:
 *   hc-email  — EMAIL_CONCURRENCY (3), EMAIL_RATE_PER_SEC (5)
 *   hc-jobs   — JOBS_CONCURRENCY (5),  JOBS_RATE_PER_SEC (20)
 *
 * Without Redis, jobs run in-process through a small concurrency-limited queue
 * (same retries, not durable across restarts) — or inline when the caller asks.
 */
import { Queue, Worker, type Job, type JobsOptions } from "bullmq";
import { bullConnection, isRedisAvailable, onRedisStateChange, waitForRedis } from "../redis";

export type JobHandler = (data: any, ctx: { attempt: number; name: string }) => Promise<unknown>;
const handlers = new Map<string, JobHandler>();

/** Register what a job name does. Call at module load (see jobs/handlers.ts). */
export function defineJob(name: string, handler: JobHandler) {
  handlers.set(name, handler);
}

type Lane = "email" | "default";
const LANES: Record<Lane, { queue: string; concurrency: () => number; rate: () => number }> = {
  email: { queue: "hc-email", concurrency: () => num("EMAIL_CONCURRENCY", 3), rate: () => num("EMAIL_RATE_PER_SEC", 5) },
  default: { queue: "hc-jobs", concurrency: () => num("JOBS_CONCURRENCY", 5), rate: () => num("JOBS_RATE_PER_SEC", 20) },
};
const laneOf = (name: string): Lane => (name.startsWith("email.") ? "email" : "default");
function num(env: string, d: number) {
  const v = parseInt(process.env[env] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : d;
}

const DEFAULTS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { count: 500, age: 24 * 3600 },
  removeOnFail: { count: 2000, age: 7 * 24 * 3600 },
};

const producers = new Map<Lane, Queue>();
const workers = new Map<Lane, Worker>();

function producer(lane: Lane): Queue | null {
  const existing = producers.get(lane);
  if (existing) return isRedisAvailable() ? existing : null;
  if (!isRedisAvailable()) return null;
  const connection = bullConnection();
  if (!connection) return null;
  try {
    const q = new Queue(LANES[lane].queue, { connection, defaultJobOptions: DEFAULTS });
    q.on("error", (e) => console.error(`[Jobs] ${LANES[lane].queue} producer error:`, e.message));
    producers.set(lane, q);
    return q;
  } catch (e: any) {
    console.error("[Jobs] producer init failed:", e.message);
    return null;
  }
}

let handlersLoaded: Promise<unknown> | null = null;
async function run(name: string, data: any, attempt: number) {
  if (!handlers.has(name)) await (handlersLoaded ??= import("./handlers"));
  const h = handlers.get(name);
  if (!h) throw new Error(`No handler for job "${name}"`);
  return h(data, { attempt, name });
}

// ───────────────────────── in-process fallback ─────────────────────────

type MemJob = { name: string; data: any; attempt: number; attempts: number };
const mem = { pending: [] as MemJob[], running: 0, done: 0, failed: 0 };
const BACKOFF = [5_000, 20_000, 60_000];

function pump() {
  const limit = num("JOBS_FALLBACK_CONCURRENCY", 2);
  while (mem.running < limit && mem.pending.length) {
    const j = mem.pending.shift()!;
    mem.running++;
    run(j.name, j.data, j.attempt)
      .then(() => { mem.done++; })
      .catch((e) => {
        if (j.attempt < j.attempts) {
          const wait = BACKOFF[Math.min(j.attempt - 1, BACKOFF.length - 1)];
          setTimeout(() => { mem.pending.push({ ...j, attempt: j.attempt + 1 }); pump(); }, wait).unref?.();
        } else {
          mem.failed++;
          console.error(`[Jobs] ${j.name} failed after ${j.attempt} attempt(s): ${(e as Error).message}`);
        }
      })
      .finally(() => { mem.running--; pump(); });
  }
}

// ───────────────────────── public API ─────────────────────────

export interface EnqueueOptions {
  delayMs?: number;
  /** 1 = highest. OTP emails use 1 so they jump ahead of bulk mail. */
  priority?: number;
  /** Idempotency: the same jobId is only queued once while it exists. */
  jobId?: string;
  attempts?: number;
  /** Without Redis: "memory" (default) runs it in the background here; "inline" runs it now and throws on failure. */
  fallback?: "memory" | "inline";
}

export async function enqueue(name: string, data: any, opts: EnqueueOptions = {}): Promise<{ via: "redis" | "memory" | "inline"; id?: string }> {
  const q = producer(laneOf(name));
  if (q) {
    try {
      const job = await q.add(name, data, {
        ...(opts.delayMs ? { delay: opts.delayMs } : {}),
        ...(opts.priority ? { priority: opts.priority } : {}),
        ...(opts.jobId ? { jobId: opts.jobId } : {}),
        ...(opts.attempts ? { attempts: opts.attempts } : {}),
      });
      return { via: "redis", id: job.id };
    } catch (e: any) {
      console.error(`[Jobs] enqueue ${name} to Redis failed, running locally:`, e.message);
    }
  }
  if (opts.fallback === "inline") {
    await run(name, data, 1);
    return { via: "inline" };
  }
  const start = () => { mem.pending.push({ name, data, attempt: 1, attempts: opts.attempts ?? 4 }); pump(); };
  if (opts.delayMs) setTimeout(start, opts.delayMs).unref?.();
  else start();
  return { via: "memory" };
}

function startWorker(lane: Lane) {
  if (workers.has(lane)) return;
  const connection = bullConnection();
  if (!connection || !isRedisAvailable()) return;
  const cfg = LANES[lane];
  const w = new Worker(cfg.queue, (job: Job) => run(job.name, job.data, job.attemptsMade + 1), {
    connection,
    concurrency: cfg.concurrency(),
    limiter: { max: cfg.rate(), duration: 1000 },
  });
  w.on("failed", (job, err) => {
    const final = job && job.attemptsMade >= (job.opts.attempts ?? 1);
    console.error(`[Jobs] ${job?.name} ${final ? "failed permanently" : `attempt ${job?.attemptsMade} failed`}: ${err.message}`);
  });
  w.on("error", (e) => console.error(`[Jobs] ${cfg.queue} worker error:`, e.message));
  workers.set(lane, w);
  console.log(`[Jobs] worker on ${cfg.queue} (concurrency ${cfg.concurrency()}, ${cfg.rate()}/s)`);
}

let listening = false;
/** Start workers (the cron leader by default; set JOBS_WORKERS_ALL_INSTANCES=1 to run them everywhere). */
export async function startJobWorkers() {
  await (handlersLoaded ??= import("./handlers"));
  const up = await waitForRedis(parseInt(process.env.REDIS_BOOT_WAIT_MS || "5000", 10));
  if (up) (Object.keys(LANES) as Lane[]).forEach(startWorker);
  else console.warn(`[Jobs] ${process.env.REDIS_URL ? "Redis not reachable" : "REDIS_URL not set"} — background jobs run in-process (not durable)`);
  if (!listening) {
    listening = true;
    onRedisStateChange((available) => {
      if (available) (Object.keys(LANES) as Lane[]).forEach(startWorker);
    });
  }
}

export async function jobStats() {
  const out: Record<string, any> = {};
  for (const lane of Object.keys(LANES) as Lane[]) {
    const q = producer(lane);
    if (!q) { out[LANES[lane].queue] = null; continue; }
    try {
      const connected = await q.getWorkers().then((w) => w.length).catch(() => 0);
      out[LANES[lane].queue] = { ...(await q.getJobCounts("waiting", "active", "delayed", "completed", "failed", "prioritized")), workers: connected };
    } catch { out[LANES[lane].queue] = null; }
  }
  return { redis: isRedisAvailable(), queues: out, inProcess: { pending: mem.pending.length, running: mem.running, done: mem.done, failed: mem.failed } };
}

export async function recentFailed(limit = 20) {
  const rows: any[] = [];
  for (const lane of Object.keys(LANES) as Lane[]) {
    const q = producer(lane);
    if (!q) continue;
    const jobs = await q.getFailed(0, limit - 1).catch(() => []);
    for (const j of jobs) rows.push({ queue: LANES[lane].queue, id: j.id, name: j.name, attempts: j.attemptsMade, error: j.failedReason, at: j.finishedOn ? new Date(j.finishedOn).toISOString() : null });
  }
  return rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}

export async function retryFailed(queueName?: string) {
  let n = 0;
  for (const lane of Object.keys(LANES) as Lane[]) {
    if (queueName && LANES[lane].queue !== queueName) continue;
    const q = producer(lane);
    if (!q) continue;
    const jobs = await q.getFailed(0, 999).catch(() => []);
    for (const j of jobs) { await j.retry().catch(() => {}); n++; }
  }
  return n;
}

export async function shutdownJobs() {
  for (const w of workers.values()) await w.close().catch(() => {});
  for (const q of producers.values()) await q.close().catch(() => {});
  workers.clear(); producers.clear();
}
