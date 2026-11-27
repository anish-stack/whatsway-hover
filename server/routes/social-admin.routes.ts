/** Super admin: Instagram app + Facebook (ads) app credentials, webhook verify token. */
import type { Express, Request } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "../db";
import { socialAppSettings } from "@shared/schema";
import { requireAuth, requireSuperadmin } from "../middlewares/auth.middleware";
import { getSocialSettings } from "../services/instagram/instagram.service";
import { seal } from "../utils/secret-box";
import { appOrigin } from "../services/reseller/common";

const originOf = async (req: Request) => (await appOrigin()) || `${req.protocol}://${req.get("host")}`;

export function registerSocialAdminRoutes(app: Express) {
  app.get("/api/admin/social-apps", requireAuth, requireSuperadmin, async (req, res) => {
    const s = await getSocialSettings();
    const base = await originOf(req);
    res.json({
      igAppId: s?.igAppId || "", igSecretSet: !!s?.igAppSecretEnc,
      fbAppId: s?.fbAppId || "", fbSecretSet: !!s?.fbAppSecretEnc,
      webhookVerifyToken: s?.webhookVerifyToken || "",
      urls: {
        igRedirect: `${base}/api/instagram/oauth/callback`,
        igWebhook: `${base}/api/webhooks/instagram`,
        adsRedirect: `${base}/api/ads/oauth/callback`,
        shortLinks: `${base}/l/`,
      },
    });
  });

  app.put("/api/admin/social-apps", requireAuth, requireSuperadmin, async (req, res) => {
    const p = z.object({
      igAppId: z.string().trim().max(40).optional(),
      igAppSecret: z.string().trim().max(200).optional(),
      fbAppId: z.string().trim().max(40).optional(),
      fbAppSecret: z.string().trim().max(200).optional(),
      webhookVerifyToken: z.string().trim().max(80).optional(),
    }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message || "Invalid input" });
    const b = p.data;
    const cur = await getSocialSettings();
    const values: any = {
      id: "default",
      igAppId: b.igAppId ?? cur?.igAppId ?? null,
      igAppSecretEnc: b.igAppSecret ? seal(b.igAppSecret) : cur?.igAppSecretEnc ?? null,
      fbAppId: b.fbAppId ?? cur?.fbAppId ?? null,
      fbAppSecretEnc: b.fbAppSecret ? seal(b.fbAppSecret) : cur?.fbAppSecretEnc ?? null,
      webhookVerifyToken: b.webhookVerifyToken || cur?.webhookVerifyToken || crypto.randomBytes(16).toString("hex"),
      updatedBy: (req.session as any)?.user?.id, updatedAt: new Date(),
    };
    await db.insert(socialAppSettings).values(values).onConflictDoUpdate({ target: socialAppSettings.id, set: values });
    res.json({ success: true });
  });
}
