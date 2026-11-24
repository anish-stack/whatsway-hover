import Redis from "ioredis";

let redisClient: Redis | null = null;
let connectionAttempted = false;
let isConnected = false;

// Subscribers notified whenever Redis flips between available / unavailable.
// Used by other services (e.g. MessageQueueService) to switch engines at
// runtime without restarting the process.
type RedisStateListener = (available: boolean) => void;
const redisStateListeners = new Set<RedisStateListener>();

export function onRedisStateChange(listener: RedisStateListener): () => void {
  redisStateListeners.add(listener);
  return () => redisStateListeners.delete(listener);
}

function emitRedisState(available: boolean): void {
  for (const listener of redisStateListeners) {
    try {
      listener(available);
    } catch (err) {
      console.error("[Redis] State listener threw:", (err as Error).message);
    }
  }
}

function initRedis(): Redis | null {
  if (connectionAttempted) return redisClient;
  connectionAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("[Redis] REDIS_URL not set — running without Redis");
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      // keep reconnecting (a Redis restart must not leave the app on the fallback forever)
      retryStrategy(times: number) {
        return Math.min(times * 500, 10_000);
      },
      lazyConnect: false,
    });

    redisClient.on("connect", () => {
      const wasConnected = isConnected;
      isConnected = true;
      console.log("[Redis] Connected successfully");
      if (!wasConnected) emitRedisState(true);
    });

    let redisErrorLogged = false;
    redisClient.on("error", (err: Error) => {
      if (!redisErrorLogged) {
        redisErrorLogged = true;
        console.error("[Redis] Connection error:", err.message);
      }
      const wasConnected = isConnected;
      isConnected = false;
      if (wasConnected) emitRedisState(false);
    });

    redisClient.on("close", () => {
      const wasConnected = isConnected;
      isConnected = false;
      if (wasConnected) emitRedisState(false);
    });
  } catch (err: any) {
    console.error("[Redis] Failed to initialize:", err.message);
    redisClient = null;
  }

  return redisClient;
}

/** Resolves true once Redis is connected (or false after `timeoutMs`). Used at boot so the
 *  queue engine isn't chosen before the first connection attempt finishes. */
export async function waitForRedis(timeoutMs = 5000): Promise<boolean> {
  if (!process.env.REDIS_URL) return false;
  if (!connectionAttempted) initRedis();
  const start = Date.now();
  while (!isConnected && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 100));
  return isConnected;
}

/** Plain connection options for BullMQ (it opens its own connections). */
export function bullConnection(): Record<string, any> | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: url.pathname && url.pathname.length > 1 ? parseInt(url.pathname.slice(1), 10) || 0 : 0,
      ...(url.protocol === "rediss:" ? { tls: {} } : {}),
      maxRetriesPerRequest: null, // required by BullMQ workers
    };
  } catch {
    return null;
  }
}

export function getRedisClient(): Redis | null {
  if (!connectionAttempted) initRedis();
  return isConnected ? redisClient : null;
}

export function isRedisAvailable(): boolean {
  if (!connectionAttempted) initRedis();
  return isConnected && redisClient !== null;
}

export async function cacheGet(key: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    if (ttlSeconds) {
      await client.set(key, value, "EX", ttlSeconds);
    } else {
      await client.set(key, value);
    }
    return true;
  } catch {
    return false;
  }
}

export async function cacheSetNX(key: string, value: string, ttlSeconds: number): Promise<boolean | null> {
  const client = getRedisClient();
  if (!client) return null;
  try {
    const result = await client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  } catch {
    return null;
  }
}

export async function cacheDel(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch {
    return false;
  }
}

export async function cacheGetJSON<T>(key: string): Promise<T | null> {
  const raw = await cacheGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSetJSON(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  try {
    return await cacheSet(key, JSON.stringify(value), ttlSeconds);
  } catch {
    return false;
  }
}
