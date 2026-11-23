import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import path from "path";
import { storageSettings } from "@shared/schema";
import { eq, desc } from "drizzle-orm";
import { db } from "server/db";

/**
 * Multi-provider storage resolver.
 *
 * Resolution order (first one with keys wins):
 *   1. DB row marked isActive
 *   2. Any other DB row that has keys (latest updated)
 *   3. ENV keys: S3 -> R2 -> Cloudinary
 *   4. null  => files stay on local disk (/uploads)
 */

export type StorageProvider = "s3" | "r2" | "cloudinary" | "digitalocean";

export const STORAGE_PROVIDERS: StorageProvider[] = ["s3", "r2", "cloudinary", "digitalocean"];

export type StorageConfigInput = {
  provider: StorageProvider;
  spaceName: string; // bucket / cloudinary cloud name
  endpoint?: string | null;
  region?: string | null;
  accessKey: string; // access key id / cloudinary api key
  secretKey: string; // secret / cloudinary api secret
  publicUrl?: string | null;
};

export type StorageTarget = {
  provider: StorageProvider;
  bucket: string;
  /** Uploads buffer, returns public URL (or null if URL can't be built) */
  upload: (buffer: Buffer, key: string, mime: string) => Promise<string | null>;
  /** Throws on failure */
  test: () => Promise<void>;
  /** Hostnames this provider serves public files from (for media allow-lists) */
  hosts: string[];
  destroy: () => void;
};

const CACHE_TTL_MS = 600_000;
let cache: { value: StorageTarget | null; expiresAt: number } | null = null;

export const invalidateStorageCache = (): void => {
  if (cache?.value) {
    try { cache.value.destroy(); } catch { /* ignore */ }
  }
  cache = null;
};

// No DB schema change: optional publicUrl is packed into the existing `region`
// column as "<region>||<publicUrl>". Endpoint/region are NOT NULL, so "" is used when empty.
const PACK_SEP = "||";
export const packRegion = (region?: string | null, publicUrl?: string | null): string =>
  publicUrl ? `${region || ""}${PACK_SEP}${publicUrl}` : region || "";
export const unpackRegion = (packed?: string | null): { region: string; publicUrl: string } => {
  const [region = "", ...rest] = (packed || "").split(PACK_SEP);
  return { region, publicUrl: rest.join(PACK_SEP) };
};

const trimSlash = (v: string) => v.trim().replace(/\/+$/, "");
const withProtocol = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

// ---------------------------------------------------------------------------
// S3 compatible (AWS S3, Cloudflare R2, DigitalOcean Spaces, others)
// ---------------------------------------------------------------------------
function buildS3Target(cfg: StorageConfigInput): StorageTarget {
  const provider = cfg.provider;
  const bucket = cfg.spaceName.trim();
  let endpoint = cfg.endpoint ? trimSlash(withProtocol(cfg.endpoint)) : "";
  let region = (cfg.region || "").trim();

  if (provider === "r2") {
    region = region || "auto";
    const raw = (cfg.endpoint || "").trim();
    // Accept a bare Account ID, or an endpoint that includes the bucket path.
    if (/^[a-f0-9]{32}$/i.test(raw)) endpoint = `https://${raw}.r2.cloudflarestorage.com`;
    else if (endpoint) { try { const u = new URL(endpoint); endpoint = `${u.protocol}//${u.host}`; } catch { /* keep */ } }
    if (!endpoint) throw new Error("R2 endpoint required (https://<accountid>.r2.cloudflarestorage.com)");
  } else if (provider === "digitalocean") {
    // legacy behaviour: user may paste "bucket.region.digitaloceanspaces.com"
    if (!endpoint) throw new Error("DigitalOcean endpoint required");
    const u = new URL(endpoint);
    const parts = u.host.split(".");
    if (parts.length > 3) {
      parts.shift();
      u.host = parts.join(".");
      endpoint = trimSlash(u.toString());
    }
  } else {
    region = region || "us-east-1";
  }

  const client = new S3Client({
    region: region || "us-east-1",
    ...(endpoint ? { endpoint } : {}),
    credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    // R2 + generic endpoints use path style; AWS & DO use virtual-host style
    forcePathStyle: provider === "r2",
  });

  const buildUrl = (key: string): string | null => {
    if (cfg.publicUrl && cfg.publicUrl.trim()) {
      return `${trimSlash(withProtocol(cfg.publicUrl))}/${key}`;
    }
    if (provider === "s3") {
      return endpoint
        ? `${endpoint}/${bucket}/${key}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
    }
    if (provider === "digitalocean") {
      return `https://${bucket}.${new URL(endpoint).host}/${key}`;
    }
    // r2 without public domain => not publicly reachable
    return null;
  };

  const put = async (buffer: Buffer, key: string, mime: string, acl: boolean) =>
    client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        ...(acl ? { ACL: "public-read" as const } : {}),
      })
    );

  const hosts = new Set<string>();
  const addHost = (u?: string | null) => { try { if (u) hosts.add(new URL(withProtocol(u)).hostname); } catch { /* ignore */ } };
  addHost(cfg.publicUrl);
  if (provider === "s3") {
    hosts.add(`${bucket}.s3.${region}.amazonaws.com`);
    hosts.add(`${bucket}.s3.amazonaws.com`);
    addHost(endpoint);
  }
  if (provider === "digitalocean" && endpoint) {
    const h = new URL(endpoint).host;
    hosts.add(h); hosts.add(`${bucket}.${h}`); hosts.add(`${bucket}.${h.replace(".digitaloceanspaces.com", ".cdn.digitaloceanspaces.com")}`);
  }

  return {
    provider,
    bucket,
    hosts: [...hosts],
    upload: async (buffer, key, mime) => {
      // R2 has no ACLs. Newer AWS buckets block ACLs -> retry without.
      const useAcl = provider === "s3" || provider === "digitalocean";
      try {
        await put(buffer, key, mime, useAcl);
      } catch (err: any) {
        if (useAcl && (err?.Code === "AccessControlListNotSupported" || err?.name === "AccessControlListNotSupported")) {
          await put(buffer, key, mime, false);
        } else {
          throw err;
        }
      }
      const url = buildUrl(key);
      if (!url) {
        console.warn(`[Storage] ${provider}: no publicUrl set, file uploaded but URL unavailable. Set "Public URL" in storage settings.`);
      }
      return url;
    },
    test: async () => {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    },
    destroy: () => client.destroy(),
  };
}

// ---------------------------------------------------------------------------
// Cloudinary (REST, no extra dependency)
// ---------------------------------------------------------------------------
function buildCloudinaryTarget(cfg: StorageConfigInput): StorageTarget {
  const cloudName = cfg.spaceName.trim();
  const apiKey = cfg.accessKey.trim();
  const apiSecret = cfg.secretKey.trim();

  const resourceType = (mime: string): "image" | "video" | "raw" => {
    if (mime.startsWith("image/")) return "image";
    if (mime.startsWith("video/") || mime.startsWith("audio/")) return "video";
    return "raw";
  };

  return {
    provider: "cloudinary",
    bucket: cloudName,
    hosts: ["res.cloudinary.com"],
    upload: async (buffer, key, mime) => {
      const type = resourceType(mime);
      // raw files keep extension in public_id; image/video get it from format
      const publicId = type === "raw" ? key : key.replace(/\.[^./]+$/, "");
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const toSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto.createHash("sha1").update(toSign).digest("hex");

      const form = new FormData();
      form.append("file", new Blob([buffer], { type: mime }), path.basename(key));
      form.append("api_key", apiKey);
      form.append("timestamp", timestamp);
      form.append("public_id", publicId);
      form.append("signature", signature);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${type}/upload`, {
        method: "POST",
        body: form,
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Cloudinary upload failed (${res.status})`);
      return (data.secure_url as string) || null;
    },
    test: async () => {
      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/resources/image?max_results=1`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) {
        const data: any = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Cloudinary auth failed (${res.status})`);
      }
    },
    destroy: () => {},
  };
}

export const buildStorageTarget = (cfg: StorageConfigInput): StorageTarget =>
  cfg.provider === "cloudinary" ? buildCloudinaryTarget(cfg) : buildS3Target(cfg);

// ---------------------------------------------------------------------------
// ENV fallback
// ---------------------------------------------------------------------------
function configFromEnv(): StorageConfigInput | null {
  const e = process.env;
  if (e.S3_BUCKET && (e.S3_ACCESS_KEY_ID || e.AWS_ACCESS_KEY_ID) && (e.S3_SECRET_ACCESS_KEY || e.AWS_SECRET_ACCESS_KEY)) {
    return {
      provider: "s3",
      spaceName: e.S3_BUCKET,
      region: e.S3_REGION || e.AWS_REGION || "us-east-1",
      endpoint: e.S3_ENDPOINT || null,
      accessKey: (e.S3_ACCESS_KEY_ID || e.AWS_ACCESS_KEY_ID)!,
      secretKey: (e.S3_SECRET_ACCESS_KEY || e.AWS_SECRET_ACCESS_KEY)!,
      publicUrl: e.S3_PUBLIC_URL || null,
    };
  }
  if (e.R2_BUCKET && e.R2_ACCESS_KEY_ID && e.R2_SECRET_ACCESS_KEY && (e.R2_ENDPOINT || e.R2_ACCOUNT_ID)) {
    return {
      provider: "r2",
      spaceName: e.R2_BUCKET,
      region: "auto",
      endpoint: e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKey: e.R2_ACCESS_KEY_ID,
      secretKey: e.R2_SECRET_ACCESS_KEY,
      publicUrl: e.R2_PUBLIC_URL || null,
    };
  }
  if (e.CLOUDINARY_CLOUD_NAME && e.CLOUDINARY_API_KEY && e.CLOUDINARY_API_SECRET) {
    return {
      provider: "cloudinary",
      spaceName: e.CLOUDINARY_CLOUD_NAME,
      accessKey: e.CLOUDINARY_API_KEY,
      secretKey: e.CLOUDINARY_API_SECRET,
    };
  }
  return null;
}

const hasKeys = (r: { spaceName?: string | null; accessKey?: string | null; secretKey?: string | null }) =>
  !!(r.spaceName && r.accessKey && r.secretKey);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export const getStorageTarget = async (): Promise<StorageTarget | null> => {
  const now = Date.now();
  if (cache && now < cache.expiresAt) return cache.value;

  try {
    const rows = await db
      .select()
      .from(storageSettings)
      .orderBy(desc(storageSettings.isActive), desc(storageSettings.updatedAt));

    const row = rows.find((r) => r.isActive && hasKeys(r)) || rows.find((r) => hasKeys(r));

    let cfg: StorageConfigInput | null = null;
    if (row) {
      const { region, publicUrl } = unpackRegion(row.region);
      cfg = {
        // legacy rows (default "digitalocean") keep DO behaviour
        provider: (row.provider as StorageProvider) || "digitalocean",
        spaceName: row.spaceName,
        endpoint: row.endpoint,
        region,
        accessKey: row.accessKey,
        secretKey: row.secretKey,
        publicUrl,
      };
    } else {
      cfg = configFromEnv();
    }

    if (!cfg) {
      console.log("⚠️ No storage keys configured (DB/ENV). Using local disk.");
      cache = { value: null, expiresAt: now + CACHE_TTL_MS };
      return null;
    }

    const target = buildStorageTarget(cfg);
    console.log(`✅ Storage provider in use: ${cfg.provider} (${cfg.spaceName})`);
    cache = { value: target, expiresAt: now + CACHE_TTL_MS };
    return target;
  } catch (error) {
    console.error("❌ Error resolving storage provider:", error);
    cache = { value: null, expiresAt: now + 30_000 };
    return null;
  }
};


/** Hostnames of the active storage provider (empty when using local disk). */
export const getStorageHosts = async (): Promise<string[]> => {
  const t = await getStorageTarget();
  return t?.hosts || [];
};

/** Object key safe for S3/R2/Cloudinary and for use in a URL. */
export const safeStorageKey = (prefix: string, originalName: string): string => {
  const ext = path.extname(originalName || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 10);
  const base = path.basename(originalName || "file", path.extname(originalName || ""))
    .normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "file";
  return `${prefix.replace(/\/+$/, "")}/${Date.now()}-${base}${ext}`;
};
