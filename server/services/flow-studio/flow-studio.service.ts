/**
 * Flow Studio service — keeps local no-code flows in step with Meta, sends them,
 * and turns Flow replies (nfm_reply) into contact updates, tags and notifications.
 *
 * Lifecycle on Meta: DRAFT (editable, test-send only) → PUBLISHED (frozen).
 * Editing a published flow creates a new Meta flow on the next push; the old id is
 * kept in meta_history so replies to earlier sends (and approved templates that
 * still point at it) keep mapping back to this flow.
 */
import crypto from "crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, contacts, notifications, sentNotifications, waFlows, waFlowSessions, type Channel, type WaFlow } from "@shared/schema";
import { compileFlow, listFields, formatAnswer, parseFlowJson, validateFlow, type FlowDefinition, type FlowSettings } from "@shared/flow-studio";
import { storage } from "../../storage";

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v25.0"}`;

export class FlowError extends Error {
  constructor(message: string, public status = 400, public details?: any) { super(message); }
}

async function graph(path: string, token: string, init: RequestInit & { form?: FormData } = {}) {
  const { form, ...rest } = init;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (!form) headers["Content-Type"] = "application/json";
  const r = await fetch(`${GRAPH()}${path}`, { ...rest, body: form || rest.body, headers: { ...headers, ...(rest.headers as any || {}) } });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) {
    const e = data?.error || {};
    throw new FlowError(e.error_user_msg || e.error_user_title || e.message || `Meta API error ${r.status}`, r.status >= 400 && r.status < 500 ? 400 : 502, { code: e.code, subcode: e.error_subcode });
  }
  return data;
}

export function makeToken(metaFlowId?: string | null) {
  return `hcf_${metaFlowId || "x"}_${crypto.randomBytes(9).toString("base64url")}`;
}

function needChannel(ch: Channel | undefined | null): asserts ch is Channel {
  if (!ch) throw new FlowError("WhatsApp number not found", 404);
  if (!ch.accessToken) throw new FlowError("This WhatsApp number has no access token. Reconnect it first.");
  if (!ch.whatsappBusinessAccountId) throw new FlowError("This WhatsApp number has no WhatsApp Business Account ID.");
}

const mapStatus = (s?: string) => (s ? String(s).toLowerCase() : "draft");

function metaErrors(list: any): Array<{ message: string; line?: number; pointer?: string }> {
  return (Array.isArray(list) ? list : []).map((v: any) => ({
    message: [v.error_type, v.message].filter(Boolean).join(": ") || "Validation error",
    line: v.line_start, pointer: v.pointers?.[0]?.path,
  }));
}

// ───────────────────────── push / publish ─────────────────────────

async function uploadJson(flowMetaId: string, token: string, json: any) {
  const form = new FormData();
  form.append("file", new Blob([JSON.stringify(json)], { type: "application/json" }), "flow.json");
  form.append("name", "flow.json");
  form.append("asset_type", "FLOW_JSON");
  return graph(`/${flowMetaId}/assets`, token, { method: "POST", form });
}

async function createOnMeta(ch: Channel, flow: WaFlow, json: any) {
  const base = flow.name.slice(0, 100);
  const names = flow.version > 0 ? [`${base} v${flow.version + 1}`] : [base];
  names.push(`${base} · ${crypto.randomBytes(2).toString("hex")}`);
  let lastErr: any;
  for (const name of names) {
    try {
      return await graph(`/${ch.whatsappBusinessAccountId}/flows`, ch.accessToken!, {
        method: "POST",
        body: JSON.stringify({ name, categories: flow.categories, flow_json: JSON.stringify(json) }),
      });
    } catch (e: any) {
      lastErr = e;
      if (!/name|exist|unique|already/i.test(e.message)) throw e; // only retry on name clashes
    }
  }
  throw lastErr;
}

/** Validate locally, then create/update the Meta draft. Optionally publish. */
export async function pushFlow(flowId: string, opts: { publish?: boolean } = {}) {
  const [flow] = await db.select().from(waFlows).where(eq(waFlows.id, flowId)).limit(1);
  if (!flow) throw new FlowError("Flow not found", 404);
  const [ch] = await db.select().from(channels).where(eq(channels.id, flow.channelId)).limit(1);
  needChannel(ch);
  const def = flow.definition as FlowDefinition;
  const issues = validateFlow(def).filter((i) => i.level === "error");
  if (issues.length) throw new FlowError("Fix the highlighted problems first.", 400, { issues });
  const json = compileFlow(def);

  const frozen = !flow.metaFlowId || !["draft", "local"].includes(flow.status);
  let metaId = flow.metaFlowId;
  const history = Array.isArray(flow.metaHistory) ? [...(flow.metaHistory as string[])] : [];
  let errors: any[] = [];

  if (frozen) {
    const created = await createOnMeta(ch, flow, json);
    if (metaId && !history.includes(metaId)) history.push(metaId);
    metaId = String(created.id);
    errors = metaErrors(created.validation_errors);
  } else {
    await graph(`/${metaId}`, ch.accessToken!, { method: "POST", body: JSON.stringify({ name: flow.version > 0 ? undefined : flow.name.slice(0, 100), categories: flow.categories }) }).catch(() => null);
    const up = await uploadJson(metaId!, ch.accessToken!, json);
    errors = metaErrors(up.validation_errors);
  }

  // If Meta refuses an explicit routing_model on a flow without an endpoint, fall back
  // to its auto-generated one so the flow still uploads (rules may then misbehave).
  if (json.routing_model && errors.some((e) => /routing/i.test(e.message))) {
    const { routing_model, ...plain } = json;
    const up = await uploadJson(metaId!, ch.accessToken!, plain);
    const retryErrors = metaErrors(up.validation_errors);
    if (!retryErrors.length) console.warn(`[FlowStudio] ${flow.id}: Meta rejected routing_model, uploaded without it`);
    errors = retryErrors;
  }

  let status = "draft";
  let previewUrl: string | null = flow.previewUrl;
  try {
    const info = await graph(`/${metaId}?fields=status,validation_errors,preview.invalidate(true)`, ch.accessToken!);
    status = mapStatus(info.status);
    previewUrl = info?.preview?.preview_url || previewUrl;
    if (!errors.length) errors = metaErrors(info.validation_errors);
  } catch { /* keep defaults */ }

  const patch: Partial<WaFlow> = {
    metaFlowId: metaId!, metaHistory: history as any, status, validationErrors: errors as any, previewUrl,
    dirty: false, lastSyncedAt: new Date(), updatedAt: new Date(),
  };

  if (opts.publish) {
    if (errors.length) {
      await db.update(waFlows).set(patch as any).where(eq(waFlows.id, flow.id));
      throw new FlowError("Meta found problems in this flow. Fix them and publish again.", 400, { metaErrors: errors });
    }
    await graph(`/${metaId}/publish`, ch.accessToken!, { method: "POST" });
    Object.assign(patch, { status: "published", publishedAt: new Date(), version: flow.version + 1 });
  }
  const [saved] = await db.update(waFlows).set(patch as any).where(eq(waFlows.id, flow.id)).returning();
  return saved;
}

export async function deprecateFlow(flow: WaFlow) {
  const [ch] = await db.select().from(channels).where(eq(channels.id, flow.channelId)).limit(1);
  needChannel(ch);
  if (!flow.metaFlowId || flow.status !== "published") throw new FlowError("Only published flows can be retired.");
  await graph(`/${flow.metaFlowId}/deprecate`, ch.accessToken!, { method: "POST" });
  const [saved] = await db.update(waFlows).set({ status: "deprecated", updatedAt: new Date() } as any).where(eq(waFlows.id, flow.id)).returning();
  return saved;
}

/** Delete locally; also delete the Meta copy when it is still a draft (published ones can't be deleted). */
export async function deleteFlow(flow: WaFlow) {
  if (flow.metaFlowId && flow.status === "draft") {
    const [ch] = await db.select().from(channels).where(eq(channels.id, flow.channelId)).limit(1);
    if (ch?.accessToken) await graph(`/${flow.metaFlowId}`, ch.accessToken, { method: "DELETE" }).catch(() => null);
  }
  await db.delete(waFlows).where(eq(waFlows.id, flow.id));
}

export async function refreshPreview(flow: WaFlow) {
  if (!flow.metaFlowId) throw new FlowError("Save to WhatsApp first to get a preview link.");
  const [ch] = await db.select().from(channels).where(eq(channels.id, flow.channelId)).limit(1);
  needChannel(ch);
  const info = await graph(`/${flow.metaFlowId}?fields=status,preview.invalidate(true)`, ch.accessToken!);
  const previewUrl = info?.preview?.preview_url || null;
  await db.update(waFlows).set({ previewUrl, status: mapStatus(info.status) } as any).where(eq(waFlows.id, flow.id));
  return previewUrl;
}

// ───────────────────────── Meta list / import ─────────────────────────

export async function listMetaFlows(ch: Channel) {
  needChannel(ch);
  const data = await graph(`/${ch.whatsappBusinessAccountId}/flows?fields=id,name,status,categories&limit=200`, ch.accessToken!);
  return (data.data || []) as Array<{ id: string; name: string; status: string; categories?: string[] }>;
}

/** Bring local statuses in line with Meta (published → throttled/blocked/deprecated happen on Meta's side). */
export async function reconcileStatuses(channelId: string, meta: Array<{ id: string; status: string }>) {
  const byId = new Map(meta.map((m) => [m.id, mapStatus(m.status)]));
  const local = await db.select({ id: waFlows.id, metaFlowId: waFlows.metaFlowId, status: waFlows.status }).from(waFlows).where(eq(waFlows.channelId, channelId));
  for (const f of local) {
    const st = f.metaFlowId ? byId.get(f.metaFlowId) : undefined;
    if (st && st !== f.status) await db.update(waFlows).set({ status: st } as any).where(eq(waFlows.id, f.id));
  }
}

export async function importFromMeta(ch: Channel, metaFlowId: string, ownerId: string) {
  needChannel(ch);
  if (!/^\d+$/.test(metaFlowId)) throw new FlowError("Invalid flow id");
  const info = await graph(`/${metaFlowId}?fields=id,name,status,categories,preview.invalidate(false)`, ch.accessToken!);
  let json: any = null;
  try {
    const assets = await graph(`/${metaFlowId}/assets`, ch.accessToken!);
    const url = assets?.data?.find((a: any) => a.asset_type === "FLOW_JSON")?.download_url;
    if (url) json = await (await fetch(url)).json();
  } catch { /* handled below */ }
  if (!json) throw new FlowError("Couldn't download this flow's JSON from Meta.");
  const parsed = parseFlowJson(json);
  const definition: FlowDefinition = parsed || { version: 1, screens: [], raw: json };
  const status = mapStatus(info.status);
  const [row] = await db.insert(waFlows).values({
    channelId: ch.id, ownerId, name: String(info.name || "Imported flow").slice(0, 120),
    categories: info.categories?.length ? info.categories : ["OTHER"], definition: definition as any, settings: {},
    metaFlowId: String(info.id), status, dirty: false, previewUrl: info?.preview?.preview_url || null,
    version: status === "published" ? 1 : 0, publishedAt: status === "published" ? new Date() : null, lastSyncedAt: new Date(),
  } as any).returning();
  return row;
}

// ───────────────────────── send ─────────────────────────

export async function sendFlow(flow: WaFlow, input: { to: string; body?: string; cta?: string; header?: string; footer?: string; conversationId?: string | null }) {
  const [ch] = await db.select().from(channels).where(eq(channels.id, flow.channelId)).limit(1);
  needChannel(ch);
  if (!flow.metaFlowId) throw new FlowError("Save this flow to WhatsApp before sending it.");
  if (["deprecated", "blocked"].includes(flow.status)) throw new FlowError(`This flow is ${flow.status} and can't be sent.`);
  const phone = String(input.to || "").replace(/\D/g, "");
  if (phone.length < 8 || phone.length > 15) throw new FlowError("Enter the number with country code, e.g. 919876543210");
  const body = String(input.body || flow.body || "").trim().slice(0, 1024);
  if (!body) throw new FlowError("Message text is required");
  const cta = String(input.cta || flow.cta || "Open").trim().slice(0, 20);
  const draft = flow.status !== "published" && flow.status !== "throttled";
  const token = makeToken(flow.metaFlowId);
  const def = flow.definition as FlowDefinition;
  const first = def.raw ? def.raw?.screens?.[0]?.id : def.screens[0]?.id;

  const interactive: any = {
    type: "flow",
    body: { text: body },
    action: {
      name: "flow",
      parameters: {
        flow_message_version: "3", flow_token: token, flow_id: flow.metaFlowId, flow_cta: cta,
        flow_action: "navigate", flow_action_payload: { screen: first },
        ...(draft ? { mode: "draft" } : {}),
      },
    },
  };
  if (input.header) interactive.header = { type: "text", text: String(input.header).slice(0, 60) };
  if (input.footer) interactive.footer = { text: String(input.footer).slice(0, 60) };

  let res: any;
  try {
    res = await graph(`/${ch.phoneNumberId}/messages`, ch.accessToken!, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "interactive", interactive }),
    });
  } catch (e: any) {
    if (e?.details?.code === 131047) throw new FlowError("This customer hasn't messaged you in the last 24 hours. Send the flow with a template that has a Flow button instead.");
    throw e;
  }

  const contact = await storage.getContactByPhoneAndChannel(phone, ch.id).catch(() => null);
  const conv = input.conversationId ? null : await storage.getConversationByPhoneAndChannel(phone, ch.id).catch(() => null);
  const conversationId = input.conversationId || conv?.id || null;
  await db.insert(waFlowSessions).values({
    flowId: flow.id, channelId: ch.id, metaFlowId: flow.metaFlowId, flowToken: token, phone,
    contactId: contact?.id || null, conversationId, status: "sent", source: "studio", sentAt: new Date(),
  } as any);
  if (conversationId) {
    try {
      await storage.createMessage({
        conversationId, content: `${body}\n[Flow: ${flow.name} · ${cta}]`, fromUser: true, direction: "outbound", status: "sent",
        whatsappMessageId: res?.messages?.[0]?.id || null, messageType: "interactive",
        metadata: JSON.stringify({ source: "flow_studio", flowId: flow.id }), timestamp: new Date(),
      } as any);
      await storage.updateConversation(conversationId, { lastMessageAt: new Date(), lastMessageText: `📝 ${flow.name}` } as any);
    } catch { /* logging only */ }
  }
  return { messageId: res?.messages?.[0]?.id, flowToken: token, draft };
}

// ───────────────────────── replies ─────────────────────────

function tokenMetaId(token: string) {
  const m = /^hcf_(\d+)_/.exec(token);
  return m ? m[1] : null;
}

async function flowForToken(channelId: string, token: string): Promise<WaFlow | null> {
  const metaId = tokenMetaId(token);
  if (!metaId) return null;
  const [f] = await db.select().from(waFlows).where(and(eq(waFlows.channelId, channelId), sql`(${waFlows.metaFlowId} = ${metaId} OR ${waFlows.metaHistory} @> ${JSON.stringify([metaId])}::jsonb)`)).limit(1);
  return f || null;
}

function fill(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

/**
 * Called from the WhatsApp webhook for every nfm_reply. Stores the answers,
 * applies the flow's completion actions and returns true when handled.
 */
export async function handleFlowReply(m: { channel: Channel; phone: string; contactId?: string | null; conversationId?: string | null; responseJson: unknown }) {
  let data: Record<string, any> = {};
  try { data = typeof m.responseJson === "string" ? JSON.parse(m.responseJson) : (m.responseJson as any) || {}; } catch { return false; }
  const token = String(data.flow_token || "");
  const answers = { ...data };
  delete answers.flow_token;

  let [session] = token ? await db.select().from(waFlowSessions).where(eq(waFlowSessions.flowToken, token)).limit(1) : [];
  let flow: WaFlow | null = null;
  if (session?.flowId) [flow] = await db.select().from(waFlows).where(eq(waFlows.id, session.flowId)).limit(1);
  if (!flow && token) flow = await flowForToken(m.channel.id, token);
  if (session && session.status === "completed") return true; // duplicate webhook

  const now = new Date();
  const values = {
    flowId: flow?.id || null, channelId: m.channel.id, metaFlowId: tokenMetaId(token) || flow?.metaFlowId || null,
    phone: m.phone, contactId: m.contactId || null, conversationId: m.conversationId || null,
    status: "completed", response: answers, completedAt: now,
  };
  if (session) await db.update(waFlowSessions).set(values as any).where(eq(waFlowSessions.id, session.id));
  else await db.insert(waFlowSessions).values({ ...values, flowToken: token || `anon_${crypto.randomUUID()}`, source: token.startsWith("hcf_") ? "template" : "unknown" } as any).onConflictDoNothing();

  if (!flow) return true;
  const settings = (flow.settings || {}) as FlowSettings;
  const def = flow.definition as FlowDefinition;
  const fields = listFields(def);

  // contact updates
  let contactName = "";
  if (m.contactId) {
    try {
      const contact = await storage.getContact(m.contactId);
      const patch: Record<string, any> = {};
      const name = settings.saveName ? String(answers[settings.saveName] || "").trim() : "";
      if (name && name.length <= 120) patch.name = name;
      const email = settings.saveEmail ? String(answers[settings.saveEmail] || "").trim() : "";
      if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) patch.email = email.toLowerCase();
      const tags = (settings.tags || []).map((t) => String(t).trim()).filter(Boolean);
      if (tags.length) {
        const cur: string[] = Array.isArray(contact?.tags) ? (contact!.tags as string[]) : [];
        patch.tags = [...new Set([...cur, ...tags])];
      }
      if (Object.keys(patch).length) await storage.updateContact(m.contactId, patch as any);
      contactName = patch.name || contact?.name || "";
    } catch (e) { console.warn("[FlowStudio] contact update failed", (e as Error).message); }
  }

  // thank-you message (the customer just interacted, so the 24h window is open)
  if (settings.thankYou?.trim()) {
    try {
      const { send, text } = await import("../store/store.service");
      const vars: Record<string, string> = { name: contactName || "there" };
      for (const f of fields) vars[f.name] = formatAnswer(f, answers[f.name]);
      await send(m.channel, m.conversationId || null, m.phone, text(fill(settings.thankYou, vars)), "Flow: thank-you");
    } catch (e) { console.warn("[FlowStudio] thank-you failed", (e as Error).message); }
  }

  // notify the account owner
  if (settings.notifyTeam && flow.ownerId) {
    try {
      const title = `New “${flow.name}” response`;
      const summary = fields.slice(0, 4).map((f) => `${f.label}: ${formatAnswer(f, answers[f.name]) || "—"}`).join(" · ");
      const message = `+${m.phone}${summary ? ` · ${summary}` : ""}`.slice(0, 500);
      const [n] = await db.insert(notifications).values({ title, message, type: "flow_response", createdBy: "system", targetType: "single", targetIds: [flow.ownerId], status: "sent", sentAt: now } as any).returning();
      await db.insert(sentNotifications).values({ notificationId: n.id, userId: flow.ownerId } as any);
      (global as any).io?.to(`user:${flow.ownerId}`).emit("notification:new", { id: n.id, title, message, type: "flow_response", link: `/whatsapp-flows/${flow.id}?tab=responses`, createdAt: n.createdAt });
    } catch (e) { console.warn("[FlowStudio] notify failed", (e as Error).message); }
  }
  (global as any).io?.to(`channel:${m.channel.id}`).emit("flow-response", { flowId: flow.id, phone: m.phone });
  return true;
}

// ───────────────────────── stats / responses ─────────────────────────

export async function flowStats(flowIds: string[]) {
  if (!flowIds.length) return {} as Record<string, { sent: number; completed: number; last: string | null }>;
  const rows = await db.select({
    flowId: waFlowSessions.flowId,
    sent: sql<number>`count(*) filter (where ${waFlowSessions.sentAt} is not null)::int`,
    completed: sql<number>`count(*) filter (where ${waFlowSessions.status} = 'completed')::int`,
    last: sql<string | null>`max(${waFlowSessions.completedAt})`,
  }).from(waFlowSessions).where(inArray(waFlowSessions.flowId, flowIds)).groupBy(waFlowSessions.flowId);
  return Object.fromEntries(rows.map((r) => [r.flowId!, { sent: r.sent, completed: r.completed, last: r.last }]));
}

export async function flowResponses(flowId: string, limit = 500) {
  const rows = await db.select({
    id: waFlowSessions.id, phone: waFlowSessions.phone, response: waFlowSessions.response, completedAt: waFlowSessions.completedAt,
    source: waFlowSessions.source, contactId: waFlowSessions.contactId, conversationId: waFlowSessions.conversationId,
    contactName: contacts.name,
  }).from(waFlowSessions)
    .leftJoin(contacts, eq(contacts.id, waFlowSessions.contactId))
    .where(and(eq(waFlowSessions.flowId, flowId), eq(waFlowSessions.status, "completed")))
    .orderBy(desc(waFlowSessions.completedAt)).limit(limit);
  return rows;
}

const csvCell = (v: unknown) => {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function responsesCsv(flow: WaFlow, rows: Awaited<ReturnType<typeof flowResponses>>) {
  const fields = listFields(flow.definition as FlowDefinition);
  const extra = new Set<string>();
  for (const r of rows) for (const k of Object.keys((r.response as any) || {})) if (!fields.some((f) => f.name === k)) extra.add(k);
  const head = ["Submitted at", "Phone", "Contact", ...fields.map((f) => f.label), ...extra];
  const lines = [head.map(csvCell).join(",")];
  for (const r of rows) {
    const a = (r.response || {}) as Record<string, any>;
    lines.push([
      r.completedAt ? new Date(r.completedAt).toISOString() : "", `+${r.phone}`, r.contactName || "",
      ...fields.map((f) => formatAnswer(f, a[f.name])), ...[...extra].map((k) => formatAnswer(undefined, a[k])),
    ].map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n");
}
