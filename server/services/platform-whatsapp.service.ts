/**
 * Platform WhatsApp — the super admin's own number sends approved templates to
 * people the platform onboards (customers created by resellers, new resellers).
 *
 * Settings map each {{n}} of the chosen template to a value we know at send time
 * (customer name, reseller name, plan, activation link…). Sends go through the
 * background job queue; every attempt is logged in platform_message_logs.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  channels, platformMessageLogs, platformWhatsappSettings, plans, resellerCustomers, resellerProfiles, subscriptions, templates, users,
} from "@shared/schema";
import { WhatsAppApiService } from "./whatsapp-api";

export const PLATFORM_EVENTS = {
  customer_onboarded: { label: "Reseller adds a customer", hint: "Sent to the customer's mobile right after a reseller creates the account." },
  reseller_onboarded: { label: "New reseller created", hint: "Sent to the reseller's mobile when you create a reseller." },
} as const;
export type PlatformEvent = keyof typeof PLATFORM_EVENTS;

export const PLATFORM_TOKENS: Record<string, string> = {
  customer_name: "Customer name",
  business_name: "Customer business name",
  customer_email: "Customer email (login)",
  reseller_name: "Reseller business name",
  reseller_contact: "Reseller contact person",
  reseller_phone: "Reseller mobile",
  plan_name: "Plan name",
  plan_end_date: "Plan valid until",
  activation_link: "Activation / set-password link",
  payment_link: "Payment link",
  login_url: "Login page link",
  platform_name: "Platform name",
};

export interface EventConfig { enabled?: boolean; templateName?: string; language?: string; body?: string[]; header?: string | null; button?: string | null }
export type Ctx = Partial<Record<keyof typeof PLATFORM_TOKENS, string>> & { phone?: string; userId?: string };

export async function getPlatformSettings() {
  const [row] = await db.select().from(platformWhatsappSettings).where(eq(platformWhatsappSettings.id, "default")).limit(1);
  return row || { id: "default", enabled: false, channelId: null, events: {}, updatedBy: null, updatedAt: new Date() };
}

export async function savePlatformSettings(input: { enabled: boolean; channelId: string | null; events: Record<string, EventConfig> }, userId: string) {
  const values = { id: "default", enabled: input.enabled, channelId: input.channelId, events: input.events as any, updatedBy: userId, updatedAt: new Date() };
  const [row] = await db.insert(platformWhatsappSettings).values(values)
    .onConflictDoUpdate({ target: platformWhatsappSettings.id, set: values }).returning();
  return row;
}

/** Placeholders of a stored template: how many body vars, header var, URL-button var. */
export function templateSlots(t: { body?: string | null; header?: string | null; buttons?: unknown }) {
  const count = (s?: string | null) => {
    const nums = [...String(s || "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : 0;
  };
  let buttons: any[] = [];
  try { buttons = Array.isArray(t.buttons) ? (t.buttons as any[]) : JSON.parse(String(t.buttons || "[]")); } catch { buttons = []; }
  const urlIndex = buttons.findIndex((b) => String(b?.type).toUpperCase() === "URL" && /\{\{\s*1\s*\}\}/.test(String(b?.url || "")));
  return { body: count(t.body), header: count(t.header) > 0, buttonIndex: urlIndex };
}

export function normalisePhone(raw?: string | null) {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10) d = `${process.env.PLATFORM_DEFAULT_COUNTRY_CODE || "91"}${d}`;
  return d.length >= 8 && d.length <= 15 ? d : "";
}

async function origin() {
  try {
    const { appOrigin } = await import("./reseller/common");
    return await appOrigin();
  } catch { return process.env.APP_URL || ""; }
}

/** Values for a reseller's customer. */
export async function customerContext(customerUserId: string, extra: Partial<Ctx> = {}): Promise<Ctx> {
  const [u] = await db.select().from(users).where(eq(users.id, customerUserId)).limit(1);
  if (!u) throw new Error("Customer not found");
  const [link] = await db.select({ businessName: resellerCustomers.businessName, mobile: resellerCustomers.mobile, resellerName: resellerProfiles.businessName, resellerContact: resellerProfiles.contactPerson, resellerMobile: resellerProfiles.mobile })
    .from(resellerCustomers).leftJoin(resellerProfiles, eq(resellerProfiles.id, resellerCustomers.resellerId))
    .where(eq(resellerCustomers.customerUserId, customerUserId)).limit(1);
  const [sub] = await db.select({ endDate: subscriptions.endDate, planName: plans.name })
    .from(subscriptions).leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, customerUserId)).orderBy(desc(subscriptions.createdAt)).limit(1);
  const base = await origin();
  return {
    userId: u.id,
    phone: link?.mobile || (u as any).phone || "",
    customer_name: [u.firstName, u.lastName].filter(Boolean).join(" ") || link?.businessName || u.email || "there",
    business_name: link?.businessName || "",
    customer_email: u.email || "",
    reseller_name: link?.resellerName || "",
    reseller_contact: link?.resellerContact || "",
    reseller_phone: link?.resellerMobile || "",
    plan_name: sub?.planName || "",
    plan_end_date: sub?.endDate ? new Date(sub.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "",
    login_url: `${base}/login`,
    activation_link: `${base}/login`,
    platform_name: process.env.PLATFORM_NAME || "HoverChat",
    ...extra,
  };
}

export async function resellerContext(resellerId: string, extra: Partial<Ctx> = {}): Promise<Ctx> {
  const [p] = await db.select().from(resellerProfiles).where(eq(resellerProfiles.id, resellerId)).limit(1);
  if (!p) throw new Error("Reseller not found");
  const base = await origin();
  return {
    userId: p.userId, phone: p.mobile,
    customer_name: p.contactPerson, business_name: p.businessName, customer_email: p.email,
    reseller_name: p.businessName, reseller_contact: p.contactPerson, reseller_phone: p.mobile,
    login_url: `${base}/login`, activation_link: `${base}/login`, platform_name: process.env.PLATFORM_NAME || "HoverChat",
    ...extra,
  };
}

const val = (ctx: Ctx, token?: string | null) => {
  const v = token ? String((ctx as any)[token] ?? "") : "";
  return v.trim() || "-"; // Meta rejects empty parameters
};

/** Builds template components for the event config + context. */
export function buildComponents(cfg: EventConfig, slots: ReturnType<typeof templateSlots>, ctx: Ctx) {
  const comps: any[] = [];
  if (slots.header && cfg.header) comps.push({ type: "header", parameters: [{ type: "text", text: val(ctx, cfg.header).slice(0, 60) }] });
  if (slots.body > 0) {
    comps.push({ type: "body", parameters: Array.from({ length: slots.body }, (_, i) => ({ type: "text", text: val(ctx, cfg.body?.[i]).slice(0, 1000) })) });
  }
  if (slots.buttonIndex >= 0 && cfg.button) {
    // URL buttons take only the dynamic suffix; for a full link token send the part after the template's base URL
    comps.push({ type: "button", sub_type: "url", index: String(slots.buttonIndex), parameters: [{ type: "text", text: val(ctx, cfg.button) }] });
  }
  return comps;
}

async function log(entry: typeof platformMessageLogs.$inferInsert) {
  try { await db.insert(platformMessageLogs).values(entry); } catch (e) { console.warn("[PlatformWA] log failed", (e as Error).message); }
}

/**
 * Send one platform event message now. Returns { status } and never throws for
 * "not configured" cases (those are logged as skipped). Throws on send errors so a
 * queued job can retry.
 */
export async function sendPlatformMessage(event: PlatformEvent, ctx: Ctx, opts: { trigger?: "auto" | "manual" | "test"; to?: string; throwOnError?: boolean } = {}) {
  const settings = await getPlatformSettings();
  const cfg = ((settings.events as any) || {})[event] as EventConfig | undefined;
  const to = normalisePhone(opts.to || ctx.phone);
  const trigger = opts.trigger || "auto";
  const skip = async (why: string) => {
    if (trigger !== "auto") throw Object.assign(new Error(why), { status: 400 });
    await log({ event, toPhone: to || "-", userId: ctx.userId, templateName: cfg?.templateName, status: "skipped", error: why, trigger });
    return { status: "skipped" as const, reason: why };
  };
  if (trigger === "auto" && (!settings.enabled || !cfg?.enabled)) return { status: "off" as const };
  if (!settings.channelId) return skip("Choose the WhatsApp number to send from.");
  if (!cfg?.templateName) return skip("Choose a template for this message.");
  if (!to) return skip("No valid mobile number.");

  const [ch] = await db.select().from(channels).where(eq(channels.id, settings.channelId)).limit(1);
  if (!ch?.accessToken) return skip("The platform WhatsApp number isn't connected.");
  const [tpl] = await db.select().from(templates)
    .where(and(eq(templates.channelId, ch.id), eq(templates.name, cfg.templateName), sql`lower(${templates.status}) = 'approved'`, cfg.language ? eq(templates.language, cfg.language) : sql`TRUE`))
    .limit(1);
  if (!tpl) return skip(`Template "${cfg.templateName}" isn't approved on this number.`);

  const comps = buildComponents(cfg, templateSlots(tpl as any), ctx);
  try {
    const res = await WhatsAppApiService.sendTemplateMessage(ch, to, tpl.name, comps, tpl.language || "en_US", false);
    const wamid = res?.messages?.[0]?.id;
    if (!wamid) throw new Error(res?.error?.message || "WhatsApp did not accept the message");
    await log({ event, toPhone: to, userId: ctx.userId, templateName: tpl.name, status: "sent", whatsappMessageId: wamid, trigger });
    return { status: "sent" as const, messageId: wamid, to };
  } catch (e: any) {
    const msg = e?.message || "Send failed";
    await log({ event, toPhone: to, userId: ctx.userId, templateName: tpl.name, status: "failed", error: msg.slice(0, 500), trigger });
    if (opts.throwOnError !== false) throw e;
    return { status: "failed" as const, error: msg };
  }
}

export async function recentPlatformLogs(limit = 50) {
  return db.select().from(platformMessageLogs).orderBy(desc(platformMessageLogs.createdAt)).limit(limit);
}
