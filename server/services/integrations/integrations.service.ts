/**
 * Integrations hub.
 *
 * INBOUND  (store/CRM/sheet → WhatsApp): each integration has a secret URL
 *   POST /api/integrations/hook/:id/:token
 * The event (Shopify X-Shopify-Topic, WooCommerce X-WC-Webhook-Topic, or
 * body.event / ?event= for Sheets & CRMs) is matched against rules; each rule
 * sends an approved template with variables taken from the payload.
 *
 * OUTBOUND (WhatsApp → Sheet/CRM): when a customer messages you or submits a
 * Flow, HoverChat POSTs JSON to the integration's outbound URL (e.g. a Google
 * Apps Script web app that appends a row, or a CRM webhook).
 */
import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { channels, contacts, conversations, integrationLogs, integrationRules, integrations, messages, templates } from "@shared/schema";
import { WhatsAppApiService } from "../whatsapp-api";
import { ensureOtpButton } from "../../utils/auth-template";
import { ensureFlowButton } from "../../utils/flow-template";

export const INTEGRATION_TYPES = ["shopify", "woocommerce", "google_sheets", "crm_webhook"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const EVENTS: Record<IntegrationType, Array<{ key: string; label: string }>> = {
  shopify: [
    { key: "orders/create", label: "Order placed" },
    { key: "orders/paid", label: "Order paid" },
    { key: "orders/fulfilled", label: "Order shipped / fulfilled" },
    { key: "orders/cancelled", label: "Order cancelled" },
    { key: "checkouts/create", label: "Checkout started (abandoned cart)" },
    { key: "customers/create", label: "New customer" },
  ],
  woocommerce: [
    { key: "order.created", label: "Order placed" },
    { key: "order.status.processing", label: "Order processing" },
    { key: "order.status.completed", label: "Order completed / shipped" },
    { key: "order.status.cancelled", label: "Order cancelled" },
    { key: "order.status.on-hold", label: "Order on hold (payment pending)" },
    { key: "customer.created", label: "New customer" },
  ],
  google_sheets: [
    { key: "row.added", label: "New row added to sheet" },
  ],
  crm_webhook: [
    { key: "lead.created", label: "New lead" },
    { key: "deal.won", label: "Deal won" },
    { key: "*", label: "Any event" },
  ],
};

export const OUTBOUND_EVENTS = [
  { key: "message.received", label: "Customer sends a message" },
  { key: "flow.response", label: "Customer submits a WhatsApp Flow form" },
  { key: "contact.created", label: "New contact (first message)" },
];

/** Default places to find the customer's phone, per source. */
const PHONE_PATHS: Record<IntegrationType, string[]> = {
  shopify: ["customer.phone", "phone", "shipping_address.phone", "billing_address.phone", "customer.default_address.phone"],
  woocommerce: ["billing.phone", "shipping.phone", "phone"],
  google_sheets: ["row.phone", "row.Phone", "row.mobile", "row.Mobile", "row.whatsapp", "row.WhatsApp", "phone"],
  crm_webhook: ["phone", "mobile", "contact.phone", "lead.phone", "data.phone", "customer.phone"],
};

export function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

/** "a.b.0.c" path lookup; "a|b" tries alternatives; "static:Text" returns Text. */
export function pick(obj: any, path?: string | null): string {
  if (!path) return "";
  if (path.startsWith("static:")) return path.slice(7);
  for (const alt of path.split("|").map((p) => p.trim()).filter(Boolean)) {
    if (alt.startsWith("static:")) return alt.slice(7);
    let cur: any = obj;
    for (const k of alt.split(".")) {
      if (cur == null) break;
      cur = Array.isArray(cur) && /^\d+$/.test(k) ? cur[Number(k)] : cur[k];
    }
    if (cur != null && cur !== "" && typeof cur !== "object") return String(cur);
  }
  return "";
}

export function normalizePhone(raw: string, defaultCc = "91"): string | null {
  let d = String(raw || "").replace(/[^\d+]/g, "");
  if (!d) return null;
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 11) d = defaultCc + d.slice(1);
  else if (d.length <= 10) d = defaultCc + d;
  d = d.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Work out which event a request represents. */
export function detectEvents(type: IntegrationType, headers: Record<string, any>, body: any, query: any): string[] {
  const h = (k: string) => String(headers[k] ?? headers[k.toLowerCase()] ?? "");
  if (type === "shopify") return [h("x-shopify-topic") || String(query.event || body?.event || "")].filter(Boolean);
  if (type === "woocommerce") {
    const topic = h("x-wc-webhook-topic") || String(query.event || body?.event || "");
    const out = topic ? [topic] : [];
    if (/^order\./.test(topic) && body?.status) out.push(`order.status.${String(body.status).toLowerCase()}`);
    return out;
  }
  const ev = String(body?.event || query.event || (type === "google_sheets" ? "row.added" : "")).trim();
  return ev ? [ev] : [];
}

function timingSafeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Optional HMAC check when a signing secret is configured. */
export function verifySignature(type: IntegrationType, secret: string | undefined, headers: Record<string, any>, rawBody?: Buffer): boolean {
  if (!secret) return true;
  if (!rawBody) return false;
  const digest = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  if (type === "shopify") return timingSafeEq(digest, String(headers["x-shopify-hmac-sha256"] || ""));
  if (type === "woocommerce") return timingSafeEq(digest, String(headers["x-wc-webhook-signature"] || ""));
  const hex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const sig = String(headers["x-hoverchat-signature"] || headers["x-signature"] || "").replace(/^sha256=/, "");
  return timingSafeEq(hex, sig) || timingSafeEq(digest, sig);
}

async function log(integrationId: string, entry: { direction?: "in" | "out"; event: string; status: string; phone?: string | null; detail?: string; payload?: any }) {
  let payload = entry.payload;
  try {
    const s = JSON.stringify(payload ?? null);
    if (s.length > 8000) payload = { truncated: true, preview: s.slice(0, 8000) };
  } catch { payload = null; }
  await db.insert(integrationLogs).values({
    integrationId, direction: entry.direction || "in", event: entry.event.slice(0, 80), status: entry.status,
    phone: entry.phone ?? null, detail: entry.detail?.slice(0, 1000) ?? null, payload,
  }).catch((e) => console.warn("[Integrations] log failed", e?.message));
}

/** Send one template and record it in the inbox like any other outbound message. */
export async function sendTemplateFromIntegration(channel: schema.Channel, phone: string, rule: schema.IntegrationRule, payload: any, ownerId: string) {
  const vars: string[] = Array.isArray(rule.variables) ? (rule.variables as string[]) : [];
  const values = vars.map((p) => pick(payload, p).slice(0, 1000));
  const missing = values.findIndex((v) => !v.trim());
  if (missing >= 0) throw new Error(`Variable {{${missing + 1}}} is empty (path "${vars[missing]}")`);

  const components: any[] = [];
  if (rule.headerVariable) {
    const hv = pick(payload, rule.headerVariable);
    if (hv) components.push({ type: "header", parameters: [{ type: "text", text: hv.slice(0, 60) }] });
  }
  if (values.length) components.push({ type: "body", parameters: values.map((text) => ({ type: "text", text })) });
  if (rule.buttonVariable) {
    const bv = pick(payload, rule.buttonVariable);
    if (bv) components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: bv.slice(0, 200) }] });
  }
  const [tpl] = await db.select().from(templates)
    .where(and(eq(templates.channelId, channel.id), eq(templates.name, rule.templateName))).limit(1);
  const finalComponents = ensureFlowButton(ensureOtpButton(components, tpl), tpl);

  // Contact + conversation so the send shows in Team Inbox
  const name = pick(payload, "customer.first_name|billing.first_name|row.name|row.Name|name|first_name") || phone;
  let [contact] = await db.select().from(contacts).where(and(eq(contacts.channelId, channel.id), eq(contacts.phone, phone))).limit(1);
  if (!contact) {
    [contact] = await db.insert(contacts).values({ channelId: channel.id, phone, name, source: "integration", createdBy: ownerId } as any).returning();
  }
  let [conv] = await db.select().from(conversations).where(and(eq(conversations.channelId, channel.id), eq(conversations.contactId, contact.id))).limit(1);
  if (!conv) {
    [conv] = await db.insert(conversations).values({ channelId: channel.id, contactId: contact.id, contactPhone: phone, contactName: contact.name, status: "open" } as any).returning();
  }

  const result = await WhatsAppApiService.sendTemplateMessage(channel, phone, rule.templateName, finalComponents, rule.language || "en_US");
  const waId = result?.messages?.[0]?.id;
  await db.insert(messages).values({
    conversationId: conv.id, fromUser: true, direction: "outbound", content: `[template: ${rule.templateName}]`,
    type: "template", messageType: "template", status: "sent", whatsappMessageId: waId, timestamp: new Date(),
    metadata: { templateName: rule.templateName, source: "integration", integrationRuleId: rule.id, components: finalComponents },
  } as any);
  await db.update(conversations).set({ lastMessageAt: new Date(), lastMessageText: `[template: ${rule.templateName}]` } as any).where(eq(conversations.id, conv.id));
  return waId as string | undefined;
}

export async function handleInbound(integration: schema.Integration, req: { headers: any; body: any; query: any; rawBody?: Buffer }) {
  const type = integration.type as IntegrationType;
  const cfg = (integration.config || {}) as any;
  const events = detectEvents(type, req.headers, req.body, req.query);
  const mainEvent = events[0] || "unknown";

  // Shopify/Woo send a test ping when the webhook is created
  if (type === "woocommerce" && req.body && req.body.webhook_id && Object.keys(req.body).length <= 2) {
    await log(integration.id, { event: "ping", status: "received", detail: "WooCommerce test ping" });
    return { ok: true, sent: 0, ping: true };
  }

  await db.update(integrations).set({ lastEventAt: new Date(), eventCount: sql`${integrations.eventCount} + 1`, updatedAt: new Date() } as any).where(eq(integrations.id, integration.id));

  if (integration.status !== "active") {
    await log(integration.id, { event: mainEvent, status: "skipped", detail: "Integration is paused", payload: req.body });
    return { ok: true, sent: 0, paused: true };
  }

  const rules = (await db.select().from(integrationRules).where(and(eq(integrationRules.integrationId, integration.id), eq(integrationRules.isActive, true))))
    .filter((r) => r.event === "*" || events.includes(r.event));
  if (!rules.length) {
    await log(integration.id, { event: mainEvent, status: "received", detail: `No rule for ${events.join(", ") || "this event"}`, payload: req.body });
    return { ok: true, sent: 0 };
  }

  const [channel] = await db.select().from(channels).where(eq(channels.id, integration.channelId)).limit(1);
  if (!channel) {
    await log(integration.id, { event: mainEvent, status: "failed", detail: "WhatsApp number no longer exists" });
    return { ok: false, sent: 0 };
  }

  let sent = 0;
  for (const rule of rules) {
    const rawPhone = rule.phonePath ? pick(req.body, rule.phonePath) : PHONE_PATHS[type].map((p) => pick(req.body, p)).find(Boolean) || "";
    const phone = normalizePhone(rawPhone, String(cfg.defaultCountryCode || "91"));
    if (!phone) {
      await log(integration.id, { event: mainEvent, status: "skipped", detail: `No valid phone number found${rule.phonePath ? ` at "${rule.phonePath}"` : ""}`, payload: req.body });
      continue;
    }
    try {
      const waId = await sendTemplateFromIntegration(channel, phone, rule, req.body, integration.ownerId);
      sent++;
      await log(integration.id, { event: mainEvent, status: "sent", phone, detail: `Template ${rule.templateName}${waId ? ` · ${waId}` : ""}`, payload: req.body });
    } catch (e: any) {
      await log(integration.id, { event: mainEvent, status: "failed", phone, detail: [e?.metaErrorTitle, e?.message].filter(Boolean).join(" — ") || "Send failed", payload: req.body });
    }
  }
  return { ok: true, sent };
}

/** Fire-and-forget outbound delivery to Sheets/CRMs for a channel's events. */
export function emitIntegrationEvent(channelId: string, event: string, data: Record<string, any>) {
  setImmediate(async () => {
    try {
      const list = await db.select().from(integrations).where(and(eq(integrations.channelId, channelId), eq(integrations.status, "active")));
      for (const it of list) {
        const cfg = (it.config || {}) as any;
        const url: string | undefined = cfg.outboundUrl;
        const wanted: string[] = Array.isArray(cfg.outboundEvents) ? cfg.outboundEvents : [];
        if (!url || !wanted.includes(event)) continue;
        const body = JSON.stringify({ event, integration: it.name, timestamp: new Date().toISOString(), ...data });
        const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "HoverChat-Integrations/1.0" };
        if (cfg.signingSecret) headers["X-HoverChat-Signature"] = "sha256=" + crypto.createHmac("sha256", cfg.signingSecret).update(body).digest("hex");
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 10_000);
          const r = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal, redirect: "follow" }).finally(() => clearTimeout(t));
          await log(it.id, { direction: "out", event, status: r.ok ? "delivered" : "failed", phone: data.phone ?? null, detail: `HTTP ${r.status}`, payload: JSON.parse(body) });
        } catch (e: any) {
          await log(it.id, { direction: "out", event, status: "failed", phone: data.phone ?? null, detail: e?.name === "AbortError" ? "Timed out after 10s" : e?.message });
        }
      }
    } catch (e: any) {
      console.warn("[Integrations] emit failed", e?.message);
    }
  });
}

export async function recentLogs(integrationId: string, limit = 50) {
  return db.select().from(integrationLogs).where(eq(integrationLogs.integrationId, integrationId)).orderBy(desc(integrationLogs.createdAt)).limit(limit);
}

/** Google Apps Script the user pastes into their sheet (two-way). */
export function appsScript(hookUrl: string) {
  return `/**
 * HoverChat ↔ Google Sheets
 * 1) Extensions → Apps Script → paste this → Save.
 * 2) Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
 *    Copy the Web app URL into HoverChat ("Sheet web app URL") to log incoming WhatsApp messages here.
 * 3) Triggers (clock icon) → Add trigger → sendNewRows → Time-driven → Every minute (or On change),
 *    to send WhatsApp messages for new rows. Your sheet needs a "phone" column.
 */
const HOVERCHAT_HOOK = "${hookUrl}";

// WhatsApp → Sheet: HoverChat posts events here
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const sheet = SpreadsheetApp.getActive().getSheetByName("WhatsApp Inbox") || SpreadsheetApp.getActive().insertSheet("WhatsApp Inbox");
  if (sheet.getLastRow() === 0) sheet.appendRow(["Time", "Event", "Name", "Phone", "Message", "Data"]);
  sheet.appendRow([new Date(), data.event, data.name || "", data.phone || "", data.text || "", JSON.stringify(data.flowResponse || data.data || "")]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}

// Sheet → WhatsApp: sends a row once, then marks it "Sent"
function sendNewRows() {
  const sheet = SpreadsheetApp.getActive().getSheets()[0];
  const values = sheet.getDataRange().getValues();
  const head = values[0].map(String);
  let statusCol = head.indexOf("HoverChat");
  if (statusCol < 0) { statusCol = head.length; sheet.getRange(1, statusCol + 1).setValue("HoverChat"); }
  for (let i = 1; i < values.length; i++) {
    if (values[i][statusCol]) continue;
    const row = {};
    head.forEach((h, j) => { if (h) row[h] = values[i][j]; });
    if (!row.phone && !row.Phone && !row.mobile && !row.Mobile) continue;
    const res = UrlFetchApp.fetch(HOVERCHAT_HOOK, {
      method: "post", contentType: "application/json", muteHttpExceptions: true,
      payload: JSON.stringify({ event: "row.added", row: row })
    });
    sheet.getRange(i + 1, statusCol + 1).setValue(res.getResponseCode() < 300 ? "Sent " + new Date().toLocaleString() : "Error " + res.getResponseCode());
  }
}
`;
}
