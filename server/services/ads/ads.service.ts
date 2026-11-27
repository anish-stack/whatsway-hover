/**
 * AI Ads Manager — the customer's own Meta ad account (Facebook Login).
 *  - connect: OAuth (ads_management, ads_read, pages) → long-lived token
 *  - overview: spend / reach / clicks / WhatsApp conversations, per campaign
 *  - pause / resume, change daily budget (always an explicit user action)
 *  - AI: read the numbers and suggest what to change; write ad copy
 *  - new Click-to-WhatsApp ad: created PAUSED — nothing spends until the user turns it on
 */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { adConnections, channels, whatsappBusinessAccountsConfig, type AdConnection } from "@shared/schema";
import { open, seal } from "../../utils/secret-box";
import { getSocialSettings, readState, signState } from "../instagram/instagram.service";

export const FB_API = process.env.FB_GRAPH_VERSION || "v23.0";
const GRAPH = `https://graph.facebook.com/${FB_API}`;
export const ADS_SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement"];

export class AdsError extends Error {
  constructor(message: string, public status = 400, public code?: number) { super(message); }
}

export async function fbApp() {
  const s = await getSocialSettings();
  let appId = s?.fbAppId || "";
  let secret = open(s?.fbAppSecretEnc);
  if (!appId || !secret) {
    const [cfg] = await db.select().from(whatsappBusinessAccountsConfig).limit(1);
    appId = appId || cfg?.appId || process.env.FACEBOOK_APP_ID || "";
    secret = secret || cfg?.appSecret || process.env.FACEBOOK_APP_SECRET || "";
  }
  if (!appId || !secret) throw new AdsError("Ads isn't set up on this platform yet. Ask the admin to add the Facebook app in Social apps.", 503);
  return { appId, secret };
}

async function fb(path: string, token: string, init: { method?: string; query?: Record<string, any>; form?: Record<string, any> } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${GRAPH}${path}`);
  for (const [k, v] of Object.entries(init.query || {})) url.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  if (token) url.searchParams.set("access_token", token);
  let body: any;
  if (init.form) {
    const f = new URLSearchParams();
    for (const [k, v] of Object.entries(init.form)) if (v !== undefined && v !== null) f.set(k, typeof v === "string" ? v : JSON.stringify(v));
    body = f;
  }
  const r = await fetch(url, { method: init.method || (init.form ? "POST" : "GET"), body });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) {
    const e = j?.error || {};
    throw new AdsError(e.error_user_msg || e.error_user_title || e.message || `Facebook error (${r.status})`, e.code === 190 ? 401 : 400, e.code);
  }
  return j;
}

const tok = (c: AdConnection) => {
  const t = open(c.accessTokenEnc);
  if (!t) throw new AdsError("Reconnect your Facebook account.", 401);
  return t;
};

async function call(c: AdConnection, path: string, init?: Parameters<typeof fb>[2]) {
  try { return await fb(path, tok(c), init); } catch (e) {
    if (e instanceof AdsError && e.status === 401) await db.update(adConnections).set({ status: "expired", updatedAt: new Date() }).where(eq(adConnections.id, c.id));
    throw e;
  }
}

// ───────────── connect ─────────────

export async function authorizeUrl(ownerId: string, redirectUri: string) {
  const { appId, secret } = await fbApp();
  const u = new URL(`https://www.facebook.com/${FB_API}/dialog/oauth`);
  u.searchParams.set("client_id", appId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("scope", ADS_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", signState(ownerId, secret));
  return u.toString();
}

export async function completeOAuth(code: string, state: string, redirectUri: string) {
  const { appId, secret } = await fbApp();
  const ownerId = readState(state, secret);
  if (!ownerId) throw new AdsError("This Facebook login link expired. Try connecting again.");
  const short = await fb("/oauth/access_token", "", { query: { client_id: appId, client_secret: secret, redirect_uri: redirectUri, code } });
  const long = await fb("/oauth/access_token", "", { query: { grant_type: "fb_exchange_token", client_id: appId, client_secret: secret, fb_exchange_token: short.access_token } });
  const token = long.access_token || short.access_token;
  const me = await fb("/me", token, { query: { fields: "id,name" } });
  const values = {
    ownerId, fbUserId: me.id, fbUserName: me.name || null, accessTokenEnc: seal(token),
    tokenExpiresAt: long.expires_in ? new Date(Date.now() + Number(long.expires_in) * 1000) : null,
    status: "active", updatedAt: new Date(),
  };
  const [row] = await db.insert(adConnections).values(values)
    .onConflictDoUpdate({ target: adConnections.ownerId, set: values }).returning();
  return row;
}

export async function connectionFor(ownerId: string) {
  const [c] = await db.select().from(adConnections).where(eq(adConnections.ownerId, ownerId)).limit(1);
  return c || null;
}

export function safe(c: AdConnection | null) {
  if (!c) return null;
  const { accessTokenEnc, ...rest } = c;
  return rest;
}

export async function adAccountsAndPages(c: AdConnection) {
  const [acc, pages] = await Promise.all([
    call(c, "/me/adaccounts", { query: { fields: "id,account_id,name,currency,account_status,amount_spent,business_name", limit: "100" } }),
    call(c, "/me/accounts", { query: { fields: "id,name,picture{url}", limit: "100" } }),
  ]);
  return {
    adAccounts: (acc.data || []).map((a: any) => ({ id: a.id, name: a.name, currency: a.currency, active: a.account_status === 1, business: a.business_name || null })),
    pages: (pages.data || []).map((p: any) => ({ id: p.id, name: p.name, picture: p.picture?.data?.url || null })),
  };
}

export async function choose(c: AdConnection, input: { adAccountId?: string; pageId?: string }) {
  const { adAccounts, pages } = await adAccountsAndPages(c);
  const a = input.adAccountId ? adAccounts.find((x: any) => x.id === input.adAccountId) : null;
  const p = input.pageId ? pages.find((x: any) => x.id === input.pageId) : null;
  if (input.adAccountId && !a) throw new AdsError("That ad account isn't available to this Facebook user.");
  if (input.pageId && !p) throw new AdsError("That Page isn't available to this Facebook user.");
  const [row] = await db.update(adConnections).set({
    ...(a ? { adAccountId: a.id, adAccountName: a.name, currency: a.currency } : {}),
    ...(p ? { pageId: p.id, pageName: p.name } : {}),
    updatedAt: new Date(),
  }).where(eq(adConnections.id, c.id)).returning();
  return row;
}

// ───────────── reporting ─────────────

export const PRESETS = ["today", "yesterday", "last_7d", "last_14d", "last_30d", "this_month", "last_month", "maximum"] as const;
const INSIGHT_FIELDS = "spend,impressions,reach,clicks,ctr,cpc,cpm,frequency,actions,cost_per_action_type";

function actionCount(actions: any[] | undefined, types: string[]) {
  return (actions || []).filter((a) => types.includes(a.action_type)).reduce((s, a) => s + Number(a.value || 0), 0);
}
const CONVO = ["onsite_conversion.messaging_conversation_started_7d", "onsite_conversion.total_messaging_connection"];
const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

export function summarise(i: any) {
  const spend = Number(i?.spend || 0);
  const conversations = actionCount(i?.actions, CONVO.slice(0, 1)) || actionCount(i?.actions, CONVO.slice(1));
  const leads = actionCount(i?.actions, LEADS);
  const linkClicks = actionCount(i?.actions, ["link_click"]);
  return {
    spend, impressions: Number(i?.impressions || 0), reach: Number(i?.reach || 0), clicks: Number(i?.clicks || 0),
    linkClicks, ctr: Number(i?.ctr || 0), cpc: Number(i?.cpc || 0), cpm: Number(i?.cpm || 0), frequency: Number(i?.frequency || 0),
    conversations, costPerConversation: conversations ? spend / conversations : null, leads, costPerLead: leads ? spend / leads : null,
  };
}

function needAccount(c: AdConnection) {
  if (!c.adAccountId) throw new AdsError("Choose an ad account first.");
  return c.adAccountId;
}

export async function overview(c: AdConnection, preset: string) {
  const act = needAccount(c);
  const datePreset = (PRESETS as readonly string[]).includes(preset) ? preset : "last_7d";
  const [total, daily, camps] = await Promise.all([
    call(c, `/${act}/insights`, { query: { date_preset: datePreset, fields: INSIGHT_FIELDS } }),
    call(c, `/${act}/insights`, { query: { date_preset: datePreset, fields: "spend,clicks,impressions,actions", time_increment: "1", limit: "90" } }),
    call(c, `/${act}/campaigns`, {
      query: {
        fields: `id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,created_time,insights.date_preset(${datePreset}){${INSIGHT_FIELDS}}`,
        limit: "100",
        filtering: [{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES", "CAMPAIGN_PAUSED", "PENDING_REVIEW", "DISAPPROVED"] }],
      },
    }),
  ]);
  return {
    preset: datePreset,
    currency: c.currency || "INR",
    totals: summarise(total.data?.[0]),
    daily: (daily.data || []).map((d: any) => ({ date: d.date_start, ...summarise(d) })),
    campaigns: (camps.data || []).map((k: any) => ({
      id: k.id, name: k.name, status: k.status, effectiveStatus: k.effective_status, objective: k.objective,
      dailyBudget: k.daily_budget ? Number(k.daily_budget) / 100 : null,
      lifetimeBudget: k.lifetime_budget ? Number(k.lifetime_budget) / 100 : null,
      createdAt: k.created_time, ...summarise(k.insights?.data?.[0]),
    })),
  };
}

async function assertCampaign(c: AdConnection, campaignId: string) {
  const act = needAccount(c);
  const k = await call(c, `/${campaignId}`, { query: { fields: "id,account_id,name,daily_budget,lifetime_budget" } });
  if (`act_${k.account_id}` !== act) throw new AdsError("Campaign not found in this ad account", 404);
  return k;
}

export async function setStatus(c: AdConnection, campaignId: string, status: "ACTIVE" | "PAUSED") {
  await assertCampaign(c, campaignId);
  await call(c, `/${campaignId}`, { form: { status } });
  return { id: campaignId, status };
}

/** Daily budget in major units (₹). Campaign budget when the campaign has one, else every ad set's. */
export async function setDailyBudget(c: AdConnection, campaignId: string, amount: number) {
  if (!(amount >= 1)) throw new AdsError("Enter a daily budget.");
  const minor = Math.round(amount * 100);
  const k = await assertCampaign(c, campaignId);
  if (k.daily_budget) { await call(c, `/${campaignId}`, { form: { daily_budget: String(minor) } }); return { updated: "campaign" }; }
  if (k.lifetime_budget) throw new AdsError("This campaign uses a lifetime budget — change it in Meta Ads Manager.");
  const sets = await call(c, `/${campaignId}/adsets`, { query: { fields: "id,daily_budget", limit: "50" } });
  const withDaily = (sets.data || []).filter((s: any) => s.daily_budget);
  if (!withDaily.length) throw new AdsError("No daily budget found on this campaign's ad sets.");
  const each = Math.max(100, Math.round(minor / withDaily.length));
  for (const s of withDaily) await call(c, `/${s.id}`, { form: { daily_budget: String(each) } });
  return { updated: `${withDaily.length} ad set(s)` };
}

// ───────────── Click-to-WhatsApp ad (created PAUSED) ─────────────

export interface CtwaInput {
  name: string;
  dailyBudget: number; // ₹ per day
  countries: string[]; // ["IN"]
  cities?: Array<{ key: string; radius?: number }>;
  ageMin: number;
  ageMax: number;
  primaryText: string;
  headline: string;
  imageUrl: string;
  greeting?: string;
}

export async function createCtwaDraft(c: AdConnection, i: CtwaInput) {
  const act = needAccount(c);
  if (!c.pageId) throw new AdsError("Choose the Facebook Page linked to your WhatsApp number first.");
  // image → ad image hash
  const img = await fetch(i.imageUrl);
  if (!img.ok) throw new AdsError("Couldn't download the image. Use a public JPG/PNG link.");
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > 8 * 1024 * 1024) throw new AdsError("Image must be 8 MB or smaller.");
  const up = await call(c, `/${act}/adimages`, { form: { bytes: buf.toString("base64") } });
  const imageHash = (Object.values(up.images || {})[0] as any)?.hash;
  if (!imageHash) throw new AdsError("Facebook didn't accept the image.");

  const suffix = crypto.randomBytes(2).toString("hex");
  const campaign = await call(c, `/${act}/campaigns`, {
    form: { name: `${i.name} — WhatsApp`, objective: "OUTCOME_ENGAGEMENT", status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" },
  });
  const geo: any = i.cities?.length ? { cities: i.cities.map((x) => ({ key: x.key, radius: x.radius || 10, distance_unit: "kilometer" })) } : { countries: i.countries.length ? i.countries : ["IN"] };
  const adset = await call(c, `/${act}/adsets`, {
    form: {
      name: `${i.name} — audience ${suffix}`, campaign_id: campaign.id, status: "PAUSED",
      daily_budget: String(Math.round(i.dailyBudget * 100)), billing_event: "IMPRESSIONS",
      optimization_goal: "CONVERSATIONS", destination_type: "WHATSAPP", bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      promoted_object: { page_id: c.pageId },
      targeting: { geo_locations: geo, age_min: i.ageMin, age_max: i.ageMax, targeting_automation: { advantage_audience: 1 } },
    },
  });
  const creative = await call(c, `/${act}/adcreatives`, {
    form: {
      name: `${i.name} — creative ${suffix}`,
      object_story_spec: {
        page_id: c.pageId,
        link_data: {
          link: "https://api.whatsapp.com/send",
          message: i.primaryText.slice(0, 2000),
          name: i.headline.slice(0, 255),
          image_hash: imageHash,
          call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
        },
      },
    },
  });
  const ad = await call(c, `/${act}/ads`, {
    form: { name: `${i.name} — ad ${suffix}`, adset_id: adset.id, creative: { creative_id: creative.id }, status: "PAUSED" },
  });
  return { campaignId: campaign.id, adsetId: adset.id, adId: ad.id, status: "PAUSED" };
}

export async function searchCities(c: AdConnection, q: string) {
  const j = await call(c, "/search", { query: { type: "adgeolocation", location_types: ["city"], q, limit: "10" } });
  return (j.data || []).map((x: any) => ({ key: x.key, name: x.name, region: x.region, country: x.country_code }));
}

// ───────────── AI ─────────────

async function aiSettingFor(ownerId: string) {
  const { resolveSetting } = await import("../ai-template.service");
  const [ch] = await db.select({ id: channels.id }).from(channels).where(eq(channels.createdBy, ownerId)).limit(1);
  const s = await resolveSetting(ch?.id);
  if (!s) throw new AdsError("No AI key found. Add a Gemini API key in Settings → AI Assistant.");
  return s;
}

export async function aiReview(ownerId: string, data: Awaited<ReturnType<typeof overview>>, goal?: string) {
  const { chatComplete } = await import("../../utils/ai-provider");
  const s = await aiSettingFor(ownerId);
  const compact = {
    period: data.preset, currency: data.currency, totals: data.totals,
    campaigns: data.campaigns.slice(0, 25).map((k: any) => ({ name: k.name, status: k.effectiveStatus, objective: k.objective, dailyBudget: k.dailyBudget, spend: k.spend, reach: k.reach, ctr: k.ctr, cpc: k.cpc, frequency: k.frequency, conversations: k.conversations, costPerConversation: k.costPerConversation, leads: k.leads })),
  };
  const sys = `You are a senior Meta (Facebook/Instagram) ads strategist for small Indian businesses that sell over WhatsApp.
Read the numbers and give a short, practical review. Reply in the user's language (Hinglish is fine if they write it).
Use this structure in Markdown:
**Summary** — 2 sentences.
**What's working** — up to 3 bullets with the numbers.
**Fix now** — up to 4 bullets; each names the campaign and the exact action (pause, raise/lower daily budget by X%, refresh creative when frequency > 3, narrow/widen audience, switch to Click-to-WhatsApp).
**Next test** — 1-2 ideas.
Rules: never invent numbers; say when data is too thin (spend < ₹500 or < 1,000 impressions). Benchmarks for India: CTR 1-2% ok, CPM ₹80-250, cost per WhatsApp conversation ₹10-60 depending on niche. Never tell them to spend without a reason.`;
  const text = await chatComplete(s, [
    { role: "system", content: sys },
    { role: "user", content: `${goal ? `My goal: ${goal}\n` : ""}Ad account data:\n${JSON.stringify(compact)}` },
  ], { maxTokens: 1800, temperature: 0.4 });
  return text.trim();
}

export async function aiCopy(ownerId: string, input: { business: string; offer: string; audience?: string; language?: string; tone?: string }) {
  const { chatComplete } = await import("../../utils/ai-provider");
  const { extractJson } = await import("../ai-template.service");
  const s = await aiSettingFor(ownerId);
  const text = await chatComplete(s, [
    { role: "system", content: `You write Click-to-WhatsApp ad copy for Facebook & Instagram. Return ONLY JSON:
{"primaryTexts":["","",""],"headlines":["","",""],"greeting":"","imagePrompt":""}
primaryTexts: 3 options, 90-250 characters, hook in the first line, 1-2 emojis max, end with a reason to tap "Send message". headlines: max 40 characters. greeting: the first WhatsApp message the business sends (max 200 chars). imagePrompt: one sentence describing an image to use. No false claims, no "guaranteed", follow Meta ad policies.` },
    { role: "user", content: `Business: ${input.business}\nOffer: ${input.offer}\nAudience: ${input.audience || "-"}\nLanguage: ${input.language || "English"}\nTone: ${input.tone || "friendly"}` },
  ], { maxTokens: 1500, temperature: 0.8 });
  const j = extractJson(text);
  if (!j?.primaryTexts) throw new AdsError("AI didn't return ad copy, try again.");
  return {
    primaryTexts: (j.primaryTexts as string[]).slice(0, 3).map((t) => String(t).slice(0, 500)),
    headlines: (j.headlines as string[] || []).slice(0, 3).map((t) => String(t).slice(0, 40)),
    greeting: String(j.greeting || "").slice(0, 300),
    imagePrompt: String(j.imagePrompt || "").slice(0, 300),
  };
}
