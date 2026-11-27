/** AI Ads Manager routes (customer's own Meta ad account). */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth.middleware";
import * as ads from "../services/ads/ads.service";
import { appOrigin } from "../services/reseller/common";

const originOf = async (req: Request) => (await appOrigin()) || `${req.protocol}://${req.get("host")}`;
import { db } from "../db";
import { adConnections } from "@shared/schema";
import { eq } from "drizzle-orm";

const owner = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};
const wrap = (fn: (req: Request, res: Response) => Promise<any>) => async (req: Request, res: Response) => {
  try { await fn(req, res); } catch (e: any) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0]?.message || "Invalid input" });
    if (e instanceof ads.AdsError || e?.status) return res.status(e.status || 400).json({ error: e.message, code: e.code });
    console.error("[Ads]", e); res.status(500).json({ error: "Something went wrong" });
  }
};
const redirectUri = async (req: Request) => `${await originOf(req)}/api/ads/oauth/callback`;
async function conn(req: Request) {
  const c = await ads.connectionFor(owner(req));
  if (!c) throw new ads.AdsError("Connect your Facebook ad account first.", 400);
  return c;
}

export function registerAdsRoutes(app: Express) {
  app.get("/api/ads/connect", requireAuth, wrap(async (req, res) => {
    res.json({ url: await ads.authorizeUrl(owner(req), await redirectUri(req)) });
  }));

  app.get("/api/ads/oauth/callback", async (req, res) => {
    const back = (q: string) => res.redirect(`/ads-manager?${q}`);
    if (req.query.error) return back(`error=${encodeURIComponent(String(req.query.error_description || req.query.error))}`);
    try {
      await ads.completeOAuth(String(req.query.code || ""), String(req.query.state || ""), await redirectUri(req));
      back("connected=1");
    } catch (e: any) { back(`error=${encodeURIComponent(e?.message || "Couldn't connect Facebook")}`); }
  });

  app.get("/api/ads/connection", requireAuth, wrap(async (req, res) => {
    let configured = true;
    try { await ads.fbApp(); } catch { configured = false; }
    res.json({ configured, data: ads.safe(await ads.connectionFor(owner(req))) });
  }));

  app.delete("/api/ads/connection", requireAuth, wrap(async (req, res) => {
    await db.delete(adConnections).where(eq(adConnections.ownerId, owner(req)));
    res.json({ success: true });
  }));

  app.get("/api/ads/accounts", requireAuth, wrap(async (req, res) => {
    res.json(await ads.adAccountsAndPages(await conn(req)));
  }));

  app.put("/api/ads/selection", requireAuth, wrap(async (req, res) => {
    const b = z.object({ adAccountId: z.string().max(40).optional(), pageId: z.string().max(40).optional() }).parse(req.body);
    res.json({ data: ads.safe(await ads.choose(await conn(req), b)) });
  }));

  app.get("/api/ads/overview", requireAuth, wrap(async (req, res) => {
    res.json(await ads.overview(await conn(req), String(req.query.preset || "last_7d")));
  }));

  app.post("/api/ads/campaigns/:id/status", requireAuth, wrap(async (req, res) => {
    const { status } = z.object({ status: z.enum(["ACTIVE", "PAUSED"]) }).parse(req.body);
    res.json({ data: await ads.setStatus(await conn(req), req.params.id, status) });
  }));

  app.post("/api/ads/campaigns/:id/budget", requireAuth, wrap(async (req, res) => {
    const { dailyBudget } = z.object({ dailyBudget: z.coerce.number().min(1).max(10_000_000) }).parse(req.body);
    res.json({ data: await ads.setDailyBudget(await conn(req), req.params.id, dailyBudget) });
  }));

  app.post("/api/ads/ai/review", requireAuth, wrap(async (req, res) => {
    const c = await conn(req);
    const data = await ads.overview(c, String(req.body?.preset || "last_7d"));
    res.json({ review: await ads.aiReview(owner(req), data, req.body?.goal ? String(req.body.goal).slice(0, 300) : undefined) });
  }));

  app.post("/api/ads/ai/copy", requireAuth, wrap(async (req, res) => {
    const b = z.object({
      business: z.string().trim().min(2, "Describe your business").max(300),
      offer: z.string().trim().min(2, "What are you promoting?").max(300),
      audience: z.string().trim().max(200).optional(),
      language: z.string().trim().max(30).optional(),
      tone: z.string().trim().max(30).optional(),
    }).parse(req.body);
    res.json(await ads.aiCopy(owner(req), b));
  }));

  app.get("/api/ads/cities", requireAuth, wrap(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json({ data: [] });
    res.json({ data: await ads.searchCities(await conn(req), q) });
  }));

  app.post("/api/ads/ctwa", requireAuth, wrap(async (req, res) => {
    const b = z.object({
      name: z.string().trim().min(2).max(80),
      dailyBudget: z.coerce.number().min(100, "Minimum ₹100 per day").max(1_000_000),
      countries: z.array(z.string().length(2)).max(10).default(["IN"]),
      cities: z.array(z.object({ key: z.string(), radius: z.number().min(1).max(80).optional() })).max(20).optional(),
      ageMin: z.coerce.number().int().min(18).max(65).default(18),
      ageMax: z.coerce.number().int().min(18).max(65).default(55),
      primaryText: z.string().trim().min(10).max(2000),
      headline: z.string().trim().min(2).max(255),
      imageUrl: z.string().trim().url(),
    }).parse(req.body);
    if (b.ageMax < b.ageMin) return res.status(400).json({ error: "Max age must be above min age" });
    res.json({ data: await ads.createCtwaDraft(await conn(req), b) });
  }));
}
