import type { Express, Request, Response } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { channels, storeOrders, storeProducts, storeSettings } from "@shared/schema";
import { requireAuth } from "../middlewares/auth.middleware";
import { resolveTenantChannels, verifyChannelOwnership } from "../middlewares/tenant.middleware";
import { markPaid, notifyStatus, refreshPaymentStatus, verifyRazorpaySignature } from "../services/store/store.service";
import { handleStorageUpload, upload, validateUploadedFiles } from "../middlewares/upload.middleware";
import { resolvePublicOrigin } from "../services/public-origin";
import fs from "fs";

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};
const mask = (v?: string | null) => (v ? "••••••" + v.slice(-4) : "");
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    console.error("[Store]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
function ch(req: Request, res: Response): string | null {
  const id = String(req.query.channelId || req.body?.channelId || "");
  if (!id) { res.status(400).json({ error: "channelId is required" }); return null; }
  if (!verifyChannelOwnership(req, id)) { res.status(403).json({ error: "WhatsApp number not accessible" }); return null; }
  return id;
}

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  storeName: z.string().trim().min(1).max(80).optional(),
  keywords: z.array(z.string().trim().min(1).max(30)).min(1).max(10).optional(),
  welcomeText: z.string().trim().min(1).max(900).optional(),
  currency: z.string().trim().length(3).optional(),
  askAddress: z.boolean().optional(),
  storeType: z.enum(["products", "services"]).optional(),
  checkoutPrompt: z.string().trim().max(500).optional().nullable(),
  codEnabled: z.boolean().optional(),
  upiId: z.string().trim().max(100).optional().nullable(),
  razorpayKeyId: z.string().trim().max(100).optional().nullable(),
  razorpayKeySecret: z.string().trim().max(200).optional().nullable(),
  razorpayWebhookSecret: z.string().trim().max(200).optional().nullable(),
  deliveryFee: z.coerce.number().min(0).max(1e7).optional(),
  minOrder: z.coerce.number().min(0).max(1e7).optional(),
});

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  category: z.string().trim().max(60).optional(),
  price: z.coerce.number().min(0).max(1e8),
  imageUrl: z.string().trim().max(1000).refine((u) => !u || /^https:\/\//.test(u), "Image URL must start with https://").optional().nullable(),
  stock: z.coerce.number().int().min(0).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export function registerStoreRoutes(app: Express) {
  // Razorpay → payment_link.paid (per WhatsApp number, signed with the store's webhook secret)
  app.post("/api/webhooks/store/razorpay/:channelId", async (req, res) => {
    try {
      const [s] = await db.select().from(storeSettings).where(eq(storeSettings.channelId, req.params.channelId)).limit(1);
      if (!s?.razorpayWebhookSecret) return res.status(404).json({ error: "Not configured" });
      if (!verifyRazorpaySignature(s.razorpayWebhookSecret, (req as any).rawBody, String(req.headers["x-razorpay-signature"] || ""))) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      const ev = req.body?.event;
      const link = req.body?.payload?.payment_link?.entity;
      if (ev === "payment_link.paid" && link?.id) {
        const [o] = await db.select().from(storeOrders).where(and(eq(storeOrders.channelId, s.channelId), eq(storeOrders.paymentLinkId, String(link.id)))).limit(1);
        if (o) await markPaid(o.id);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("[Store] razorpay webhook", e);
      res.status(500).json({ error: "failed" });
    }
  });

  // Razorpay sends the customer here after paying (callback_url on the payment link).
  // Confirm with Razorpay (never trust the query string), send the WhatsApp receipt, reopen the chat.
  app.get("/api/store/pay/return/:orderId", async (req, res) => {
    let waLink = "";
    try {
      const [o] = await db.select().from(storeOrders).where(eq(storeOrders.id, req.params.orderId)).limit(1);
      if (o) {
        await refreshPaymentStatus(o);
        const [c] = await db.select().from(channels).where(eq(channels.id, o.channelId)).limit(1);
        const num = String((c as any)?.phoneNumber || "").replace(/\D/g, "");
        if (num) waLink = `https://wa.me/${num}?text=${encodeURIComponent("track")}`;
      }
    } catch (e) { console.error("[Store] pay return", e); }
    if (waLink) return res.redirect(302, waLink);
    res.type("html").send(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><body style="font-family:system-ui;text-align:center;padding:48px 16px"><h2>Thank you!</h2><p>Your payment is being confirmed. You'll get a WhatsApp message shortly.</p></body>`);
  });

  const auth = [requireAuth, resolveTenantChannels];

  app.get("/api/store/settings", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [s] = await db.select().from(storeSettings).where(eq(storeSettings.channelId, id)).limit(1);
    const [c] = await db.select({ phone: channels.phoneNumber }).from(channels).where(eq(channels.id, id)).limit(1);
    const base = (process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const digits = String(c?.phone || "").replace(/\D/g, "");
    const keyword = (Array.isArray(s?.keywords) ? (s!.keywords as string[])[0] : "shop") || "shop";
    res.json({
      data: s ? { ...s, razorpayKeySecret: mask(s.razorpayKeySecret), razorpayWebhookSecret: mask(s.razorpayWebhookSecret) } : null,
      storeLink: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(keyword)}` : null,
      razorpayWebhookUrl: `${base}/api/webhooks/store/razorpay/${id}`,
    });
  }));

  app.put("/api/store/settings", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = settingsSchema.parse(req.body);
    const [cur] = await db.select().from(storeSettings).where(eq(storeSettings.channelId, id)).limit(1);
    const keep = (v: any, old: any) => (typeof v === "string" && v.startsWith("••••") ? old : v);
    const values: any = {
      ...b,
      ...(b.deliveryFee != null ? { deliveryFee: String(b.deliveryFee) } : {}),
      ...(b.minOrder != null ? { minOrder: String(b.minOrder) } : {}),
      razorpayKeySecret: keep(b.razorpayKeySecret, cur?.razorpayKeySecret),
      razorpayWebhookSecret: keep(b.razorpayWebhookSecret, cur?.razorpayWebhookSecret),
      updatedAt: new Date(),
    };
    for (const k of Object.keys(values)) if (values[k] === undefined) delete values[k];
    if (cur) await db.update(storeSettings).set(values).where(eq(storeSettings.channelId, id));
    else await db.insert(storeSettings).values({ channelId: id, ownerId: owner(req), ...values });
    res.json({ success: true });
  }));

  // Product photo → active storage (S3/R2/Cloudinary/DO) or local /uploads.
  app.post("/api/store/upload-image", ...auth, upload.single("image"), validateUploadedFiles, handleStorageUpload, wrap(async (req, res) => {
    const file = (req as any).file as (Express.Multer.File & { cloudUrl?: string }) | undefined;
    if (!file) return res.status(400).json({ error: (req as any).fileFilterError || "Choose an image to upload" });
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: "WhatsApp accepts JPG or PNG product photos" });
    }
    if (file.size > 5 * 1024 * 1024) {
      try { fs.unlinkSync(file.path); } catch { /* ignore */ }
      return res.status(400).json({ error: "Photo must be 5 MB or smaller" });
    }
    let url = file.cloudUrl;
    if (!url) {
      const origin = ((await resolvePublicOrigin()) || process.env.APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
      url = `${origin}/${file.path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/")}`;
    }
    res.json({ url, storage: file.cloudUrl ? "cloud" : "local" });
  }));

  app.get("/api/store/products", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    res.json({ data: await db.select().from(storeProducts).where(eq(storeProducts.channelId, id)).orderBy(asc(storeProducts.sortOrder), asc(storeProducts.name)) });
  }));

  app.post("/api/store/products", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = productSchema.parse(req.body);
    const [row] = await db.insert(storeProducts).values({
      channelId: id, name: b.name, description: b.description || null, category: b.category || "All", price: String(b.price),
      imageUrl: b.imageUrl || null, stock: b.stock ?? null, isActive: b.isActive ?? true, sortOrder: b.sortOrder ?? 0,
    }).returning();
    res.status(201).json({ data: row });
  }));

  app.put("/api/store/products/:id", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = productSchema.partial().parse(req.body);
    const set: any = { ...b, updatedAt: new Date() };
    if (b.price != null) set.price = String(b.price);
    if ("stock" in b) set.stock = b.stock ?? null;
    if ("category" in b) set.category = b.category || "All";
    const [row] = await db.update(storeProducts).set(set).where(and(eq(storeProducts.id, req.params.id), eq(storeProducts.channelId, id))).returning();
    if (!row) return res.status(404).json({ error: "Product not found" });
    res.json({ data: row });
  }));

  app.delete("/api/store/products/:id", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    await db.delete(storeProducts).where(and(eq(storeProducts.id, req.params.id), eq(storeProducts.channelId, id)));
    res.json({ success: true });
  }));

  app.get("/api/store/orders", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const status = String(req.query.status || "");
    const where = status && status !== "all" ? and(eq(storeOrders.channelId, id), eq(storeOrders.status, status)) : eq(storeOrders.channelId, id);
    const rows = await db.select().from(storeOrders).where(where).orderBy(desc(storeOrders.createdAt)).limit(200);
    const [stats] = await db.select({
      orders: sql<number>`count(*)::int`,
      revenue: sql<string>`coalesce(sum(${storeOrders.total}) filter (where ${storeOrders.paymentStatus} = 'paid' or ${storeOrders.paymentMethod} = 'cod' and ${storeOrders.status} = 'delivered'),0)`,
      open: sql<number>`count(*) filter (where ${storeOrders.status} in ('pending','confirmed','packed','shipped'))::int`,
      unpaid: sql<number>`count(*) filter (where ${storeOrders.paymentStatus} <> 'paid' and coalesce(${storeOrders.paymentMethod},'') <> 'cod' and ${storeOrders.status} <> 'cancelled')::int`,
    }).from(storeOrders).where(eq(storeOrders.channelId, id));
    res.json({ data: rows, stats });
  }));

  app.patch("/api/store/orders/:id", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const b = z.object({
      status: z.enum(["pending", "confirmed", "packed", "shipped", "delivered", "cancelled"]).optional(),
      trackingUrl: z.string().trim().max(1000).optional().nullable(),
      notes: z.string().trim().max(1000).optional().nullable(),
      paymentStatus: z.enum(["paid"]).optional(),
      notify: z.boolean().optional(),
    }).parse(req.body);
    const [cur] = await db.select().from(storeOrders).where(and(eq(storeOrders.id, req.params.id), eq(storeOrders.channelId, id))).limit(1);
    if (!cur) return res.status(404).json({ error: "Order not found" });
    if (b.paymentStatus === "paid") await markPaid(cur.id, b.notify !== false);
    const set: any = { updatedAt: new Date() };
    if (b.status) set.status = b.status;
    if ("trackingUrl" in b) set.trackingUrl = b.trackingUrl || null;
    if ("notes" in b) set.notes = b.notes || null;
    const [row] = await db.update(storeOrders).set(set).where(eq(storeOrders.id, cur.id)).returning();
    // Put stock back when an order is cancelled
    if (b.status === "cancelled" && cur.status !== "cancelled") {
      for (const it of (cur.items as any[]) || []) {
        await db.update(storeProducts).set({ stock: sql`CASE WHEN ${storeProducts.stock} IS NULL THEN NULL ELSE ${storeProducts.stock} + ${Number(it.qty) || 0} END` } as any).where(eq(storeProducts.id, it.productId));
      }
    }
    let notified = false, notifyError: string | undefined;
    if (b.status && b.status !== cur.status && b.notify !== false) {
      try { await notifyStatus(row); notified = true; }
      catch (e: any) { notifyError = /24|re-engagement|131047/i.test(e?.message || "") ? "Customer hasn't messaged in 24 hours, so WhatsApp blocked the free-form update. Send an approved template instead." : e?.message; }
    }
    res.json({ data: row, notified, notifyError });
  }));

  app.post("/api/store/orders/:id/refresh-payment", ...auth, wrap(async (req, res) => {
    const id = ch(req, res); if (!id) return;
    const [cur] = await db.select().from(storeOrders).where(and(eq(storeOrders.id, req.params.id), eq(storeOrders.channelId, id))).limit(1);
    if (!cur) return res.status(404).json({ error: "Order not found" });
    res.json({ data: await refreshPaymentStatus(cur) });
  }));
}
