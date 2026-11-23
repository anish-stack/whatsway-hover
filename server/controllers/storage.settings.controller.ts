import { Request, Response } from "express";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { storageSettings } from "@shared/schema";
import {
  invalidateStorageCache,
  buildStorageTarget,
  packRegion,
  unpackRegion,
  STORAGE_PROVIDERS,
  type StorageProvider,
} from "../config/storageConfig";

// ✅ List all provider configs
export const getStorageSettings = async (_req: Request, res: Response) => {
  try {
    const rows = await db.select().from(storageSettings);
    res.json(rows.map((r) => ({ ...r, ...unpackRegion(r.region) })));
  } catch {
    res.status(500).json({ error: "Failed to fetch storage settings" });
  }
};

// ✅ Active config
export const getActiveStorage = async (_req: Request, res: Response) => {
  try {
    const active = await db
      .select()
      .from(storageSettings)
      .where(eq(storageSettings.isActive, true))
      .limit(1);
    res.json(active[0] ? { ...active[0], ...unpackRegion(active[0].region) } : null);
  } catch {
    res.status(500).json({ error: "Failed to fetch active storage" });
  }
};

// ✅ Create / update one provider config (one row per provider)
export const updateStorageSetting = async (req: Request, res: Response) => {
  try {
    const { id, provider, spaceName, endpoint, region, accessKey, secretKey, publicUrl, isActive } = req.body;

    if (!STORAGE_PROVIDERS.includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }
    if (!spaceName || !accessKey || !secretKey) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if ((provider === "r2" || provider === "digitalocean") && !endpoint) {
      return res.status(400).json({ error: "Endpoint required for this provider" });
    }
    if (provider === "r2" && !publicUrl) {
      return res.status(400).json({ error: "Public URL required for Cloudflare R2 (enable the r2.dev subdomain or connect a custom domain on the bucket)" });
    }

    const values = {
      provider,
      spaceName,
      endpoint: endpoint || "",
      region: packRegion(region, publicUrl),
      accessKey,
      secretKey,
      isActive: !!isActive,
      updatedAt: new Date(),
    };

    if (values.isActive) {
      await db.update(storageSettings).set({ isActive: false });
    }

    // one row per provider: reuse id, else existing row of same provider
    let targetId: string | undefined = id || undefined;
    if (!targetId) {
      const [existing] = await db
        .select()
        .from(storageSettings)
        .where(eq(storageSettings.provider, provider))
        .limit(1);
      targetId = existing?.id;
    }

    if (targetId) {
      await db.update(storageSettings).set(values).where(eq(storageSettings.id, targetId));
    } else {
      await db.insert(storageSettings).values(values);
    }

    invalidateStorageCache();
    res.json({ success: true });
  } catch (error) {
    console.error("Storage update error:", error);
    res.status(500).json({ error: "Failed to update storage" });
  }
};

// ✅ Set a provider active (others off)
export const activateStorage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await db.update(storageSettings).set({ isActive: false });
    await db.update(storageSettings).set({ isActive: true, updatedAt: new Date() }).where(eq(storageSettings.id, id));
    invalidateStorageCache();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to activate storage" });
  }
};

// ✅ Test connection. body.id => that config, else active one.
export const testStorageConnection = async (req: Request, res: Response) => {
  try {
    const id: string | undefined = req.body?.id;
    const [config] = id
      ? await db.select().from(storageSettings).where(eq(storageSettings.id, id)).limit(1)
      : await db.select().from(storageSettings).where(eq(storageSettings.isActive, true)).limit(1);

    if (!config) {
      return res.json({ success: false, status: "offline", error: "No storage configuration found" });
    }

    const { region, publicUrl } = unpackRegion(config.region);
    const target = buildStorageTarget({
      provider: (config.provider as StorageProvider) || "digitalocean",
      spaceName: config.spaceName,
      endpoint: config.endpoint,
      region,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      publicUrl,
    });

    try {
      await target.test();
      return res.json({ success: true, status: "online" });
    } finally {
      target.destroy();
    }
  } catch (error: any) {
    const message =
      error?.name === "NotFound"
        ? "Bucket not found"
        : error?.name === "CredentialsProviderError" || error?.Code === "InvalidAccessKeyId"
          ? "Invalid credentials"
          : error?.message || "Connection failed";
    return res.json({ success: false, status: "offline", error: message });
  }
};

// ✅ Delete
export const deleteStorageSetting = async (req: Request, res: Response) => {
  try {
    await db.delete(storageSettings).where(eq(storageSettings.id, req.params.id));
    invalidateStorageCache();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete storage" });
  }
};
