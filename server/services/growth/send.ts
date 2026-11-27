/** Small senders for growth automations; every message is also logged in the Team Inbox. */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { contacts, templates, type Channel } from "@shared/schema";
import { WhatsAppApiService } from "../whatsapp-api";
import { templateVarKeys, textParam } from "../../utils/template-params";

export function fillVars(text: string, v: { name?: string | null; phone?: string | null; [k: string]: any }) {
  return String(text || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
    const val = v[k];
    return val == null || val === "" ? (k === "name" ? "there" : "") : String(val);
  });
}

async function logOutbound(channel: Channel, phone: string, preview: string, wamid: string | null, type: string, source: string) {
  try {
    const conv = await storage.getConversationByPhoneAndChannel(phone, channel.id);
    if (!conv) return;
    await storage.createMessage({
      conversationId: conv.id, content: preview, fromUser: true, direction: "outbound", status: "sent",
      whatsappMessageId: wamid, messageType: type, metadata: JSON.stringify({ source }), timestamp: new Date(),
    } as any);
    await storage.updateConversation(conv.id, { lastMessageAt: new Date(), lastMessageText: preview.slice(0, 200) } as any);
  } catch (e) { console.warn(`[${source}] inbox log failed`, (e as Error).message); }
}

/** Contact said STOP / was blocked → never send automated messages. */
export async function isOptedOut(channelId: string, phone: string) {
  const [c] = await db.select({ status: contacts.status }).from(contacts)
    .where(and(eq(contacts.channelId, channelId), eq(contacts.phone, phone))).limit(1);
  return c?.status === "unsubscribed" || c?.status === "blocked";
}

/** Free-form messages only work within 24 h of the customer's last message. */
export async function insideWindow(channelId: string, phone: string) {
  const conv = await storage.getConversationByPhoneAndChannel(phone, channelId);
  const last = (conv as any)?.lastIncomingMessageAt;
  return !!last && Date.now() - new Date(last).getTime() < 23.5 * 3600_000;
}

export async function sendText(channel: Channel, phone: string, text: string, source: string) {
  const api = new WhatsAppApiService(channel);
  const res = await api.sendDirectMessage({ recipient_type: "individual", to: phone, type: "text", text: { body: text.slice(0, 4096), preview_url: true } });
  const wamid = res?.messages?.[0]?.id || null;
  if (!wamid) throw new Error(res?.error?.message || "WhatsApp did not accept the message");
  await logOutbound(channel, phone, text, wamid, "text", source);
  return wamid;
}

export async function sendInteractive(channel: Channel, phone: string, payload: any, preview: string, source: string) {
  const api = new WhatsAppApiService(channel);
  const res = await api.sendDirectMessage({ recipient_type: "individual", to: phone, ...payload });
  const wamid = res?.messages?.[0]?.id || null;
  if (!wamid) throw new Error(res?.error?.message || "WhatsApp did not accept the message");
  await logOutbound(channel, phone, preview, wamid, payload.type || "interactive", source);
  return wamid;
}

/** Approved template by name; body values fill {{1}}, {{2}}… in order (missing → "-"). */
export async function sendTemplate(channel: Channel, phone: string, name: string, language: string | undefined, values: string[], source: string) {
  const [tpl] = await db.select().from(templates)
    .where(and(eq(templates.channelId, channel.id), eq(templates.name, name), sql`lower(${templates.status}) = 'approved'`, language ? eq(templates.language, language) : sql`TRUE`))
    .limit(1);
  if (!tpl) throw new Error(`Template "${name}" isn't approved on this number`);
  const keys = templateVarKeys(tpl.body);
  const comps: any[] = [];
  if (keys.keys.length) comps.push({ type: "body", parameters: keys.keys.map((k, i) => textParam(k, values[i], keys.named)) });
  const res = await WhatsAppApiService.sendTemplateMessage(channel as any, phone, tpl.name, comps, tpl.language || language || "en_US", false);
  const wamid = res?.messages?.[0]?.id || null;
  if (!wamid) throw new Error(res?.error?.message || "WhatsApp did not accept the message");
  await logOutbound(channel, phone, `[Template: ${tpl.name}] ${fillBody(tpl.body, keys.keys, values)}`.slice(0, 1000), wamid, "template", source);
  return wamid;
}

function fillBody(body: string, keys: string[], values: string[]) {
  let out = body || "";
  keys.forEach((k, i) => { out = out.split(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "g")).join(values[i] || "-"); });
  return out;
}
