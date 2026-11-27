/**
 * WhatsApp profile from the panel: photo (logo), about, description, address, email,
 * websites, category — plus number info (display name status, quality, limit) and
 * business hours with an away message.
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import fs from "fs";
import { z } from "zod";
import { db } from "../db";
import { growthSettings } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import { storage } from "../storage";
import { resolveMetaAppId, WHATSAPP_API_VERSION } from "../services/whatsapp-api";
import { DEFAULT_AWAY, isOpen } from "../services/growth/business-hours.service";
import { getGrowth } from "../services/growth/cart-recovery.service";

const upload = multer({ dest: "uploads/profile-photos/", limits: { fileSize: 5 * 1024 * 1024 } });
const G = () => `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
export const VERTICALS = ["UNDEFINED", "OTHER", "AUTO", "BEAUTY", "APPAREL", "EDU", "ENTERTAIN", "EVENT_PLAN", "FINANCE", "GROCERY", "GOVT", "HOTEL", "HEALTH", "NONPROFIT", "PROF_SERVICES", "RETAIL", "TRAVEL", "RESTAURANT", "NOT_A_BIZ"];

const owner = (req: Request) => { const u = (req.session as any)?.user; return u?.role === "team" && u.createdBy ? u.createdBy : u?.id; };

async function channelFor(req: Request, res: Response) {
  const id = req.params.channelId;
  if (!verifyChannelOwnership(req, id)) { res.status(403).json({ error: "WhatsApp number not accessible" }); return null; }
  const ch = await storage.getChannel(id);
  if (!ch) { res.status(404).json({ error: "WhatsApp number not found" }); return null; }
  if (!ch.accessToken || !ch.phoneNumberId) { res.status(400).json({ error: "This number isn't connected to WhatsApp Cloud API yet." }); return null; }
  return ch;
}

async function meta(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${G()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers || {}) } });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    const e = j?.error || {};
    const perm = [10, 200, 190].includes(e.code);
    throw Object.assign(new Error(perm ? "Meta says the access token can't do this. Reconnect the number (needs whatsapp_business_management)." : e.error_user_msg || e.message || `Meta error ${r.status}`), { status: perm ? 403 : 400 });
  }
  return j;
}

const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    res.status(e?.status || 500).json({ error: e?.message || "Something went wrong" });
  }
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const hoursSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().max(64).default("Asia/Kolkata"),
  days: z.record(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), z.array(z.tuple([hhmm, hhmm])).max(3)).default({}),
  awayMessage: z.string().trim().max(1000).optional(),
  cooldownHours: z.coerce.number().int().min(1).max(72).default(12),
});

export function registerWhatsAppProfileRoutes(app: Express) {
  const auth = [requireAuth, resolveTenantChannels];

  app.get("/api/whatsapp-profile/:channelId", ...auth, wrap(async (req, res) => {
    const ch = await channelFor(req, res); if (!ch) return;
    const [profile, phone] = await Promise.all([
      meta(`/${ch.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`, ch.accessToken!)
        .then((j) => j.data?.[0] || {})
        .catch((e) => ({ __error: /fetch failed/i.test(e.message) ? "Couldn't reach WhatsApp right now. Try again in a minute." : e.message })),
      meta(`/${ch.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,name_status,new_name_status,messaging_limit_tier,code_verification_status,throughput,platform_type`, ch.accessToken!).catch((e) => ({ error: e.message })),
    ]);
    const g = await getGrowth(ch.id);
    const hours = { enabled: false, timezone: "Asia/Kolkata", days: { mon: [["10:00", "19:00"]], tue: [["10:00", "19:00"]], wed: [["10:00", "19:00"]], thu: [["10:00", "19:00"]], fri: [["10:00", "19:00"]], sat: [["10:00", "16:00"]] }, awayMessage: DEFAULT_AWAY, cooldownHours: 12, ...((g as any)?.businessHours || {}) };
    const profileError = (profile as any).__error || null;
    res.json({ profile: profileError ? {} : profile, profileError, phone, hours, openNow: isOpen(hours), verticals: VERTICALS, channel: { id: ch.id, name: ch.name, phoneNumber: ch.phoneNumber } });
  }));

  app.put("/api/whatsapp-profile/:channelId", ...auth, wrap(async (req, res) => {
    const ch = await channelFor(req, res); if (!ch) return;
    const b = z.object({
      about: z.string().trim().min(1, "About can't be empty").max(139, "About: max 139 characters"),
      description: z.string().trim().max(512, "Description: max 512 characters").optional().default(""),
      address: z.string().trim().max(256, "Address: max 256 characters").optional().default(""),
      email: z.string().trim().max(128).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email").optional().default(""),
      websites: z.array(z.string().trim().max(256).refine((v) => !v || /^https?:\/\//.test(v), "Websites must start with http:// or https://")).max(2, "Max 2 websites").default([]),
      vertical: z.enum(VERTICALS as [string, ...string[]]).optional(),
    }).parse(req.body);
    await meta(`/${ch.phoneNumberId}/whatsapp_business_profile`, ch.accessToken!, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", ...b, websites: b.websites.filter(Boolean) }),
    });
    res.json({ success: true });
  }));

  app.post("/api/whatsapp-profile/:channelId/photo", ...auth, upload.single("photo"), wrap(async (req, res) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    const cleanup = () => { try { if (file?.path) fs.unlinkSync(file.path); } catch { /* ignore */ } };
    try {
      const ch = await channelFor(req, res); if (!ch) return;
      if (!file) return res.status(400).json({ error: "Choose a photo" });
      if (!["image/jpeg", "image/png"].includes(file.mimetype)) return res.status(400).json({ error: "Use a JPG or PNG image" });
      const appId = await resolveMetaAppId(ch);
      if (!appId) return res.status(400).json({ error: "Meta App ID missing. Add it in WhatsApp embedded-signup settings or FACEBOOK_APP_ID." });
      const buf = fs.readFileSync(file.path);
      const sess = await meta(`/${appId}/uploads?file_name=${encodeURIComponent(file.originalname || "logo.jpg")}&file_length=${buf.length}&file_type=${encodeURIComponent(file.mimetype)}`, ch.accessToken!, { method: "POST" });
      const up = await fetch(`${G()}/${sess.id}`, { method: "POST", headers: { Authorization: `OAuth ${ch.accessToken}`, file_offset: "0", "Content-Type": file.mimetype } as any, body: buf });
      const uj: any = await up.json().catch(() => ({}));
      if (!uj?.h) return res.status(400).json({ error: uj?.error?.message || "Meta didn't accept the photo" });
      await meta(`/${ch.phoneNumberId}/whatsapp_business_profile`, ch.accessToken!, { method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: uj.h }) });
      const fresh = await meta(`/${ch.phoneNumberId}/whatsapp_business_profile?fields=profile_picture_url`, ch.accessToken!);
      res.json({ success: true, profilePictureUrl: fresh.data?.[0]?.profile_picture_url || null });
    } finally { cleanup(); }
  }));

  app.put("/api/whatsapp-profile/:channelId/hours", ...auth, wrap(async (req, res) => {
    if (!verifyChannelOwnership(req, req.params.channelId)) return res.status(403).json({ error: "WhatsApp number not accessible" });
    const b = hoursSchema.parse(req.body);
    try { new Intl.DateTimeFormat("en-US", { timeZone: b.timezone }); } catch { return res.status(400).json({ error: "Unknown time zone" }); }
    const values = { channelId: req.params.channelId, ownerId: owner(req), businessHours: b as any, updatedAt: new Date() };
    await db.insert(growthSettings).values(values as any).onConflictDoUpdate({ target: growthSettings.channelId, set: { businessHours: b as any, updatedAt: new Date() } as any });
    res.json({ success: true, openNow: isOpen(b as any) });
  }));
}
