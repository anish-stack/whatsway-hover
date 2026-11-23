/**
 * Meta Template Library + WhatsApp Flows.
 *
 * Template Library: pre-written UTILITY / AUTHENTICATION templates from Meta.
 * Templates created from the library skip normal review (usually APPROVED
 * immediately) because Meta wrote the text.
 *
 * Flows: forms built in WhatsApp Manager → Flows. HoverChat lists them,
 * lets you attach one to a template (FLOW button) or send it directly as an
 * interactive message inside the 24h customer service window. Replies arrive
 * as `nfm_reply` interactive messages (already stored by the webhook).
 */
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { verifyChannelOwnership } from "../middlewares/tenant.middleware";

const GRAPH = () => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v25.0"}`;

async function loadChannel(req: Request, res: Response, channelId?: string) {
  if (!channelId) { res.status(400).json({ error: "channelId is required" }); return null; }
  if (!verifyChannelOwnership(req, channelId)) { res.status(403).json({ error: "Channel not accessible" }); return null; }
  const channel = await storage.getChannel(channelId);
  if (!channel) { res.status(404).json({ error: "Channel not found" }); return null; }
  if (!channel.accessToken) { res.status(400).json({ error: "Channel has no access token" }); return null; }
  return channel;
}

async function graph(path: string, token: string, init: RequestInit = {}) {
  const r = await fetch(`${GRAPH()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok || data?.error) {
    const e = data?.error || {};
    const msg = e.error_user_msg || e.error_user_title || e.message || `Meta API error ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status >= 400 && r.status < 500 ? 400 : 502, meta: e });
  }
  return data;
}

function fail(res: Response, e: any) {
  res.status(e?.status || 500).json({ error: e?.message || "Request failed", meta: e?.meta?.code ? { code: e.meta.code, subcode: e.meta.error_subcode } : undefined });
}

// ───────────────────────── Template Library ─────────────────────────

export async function listLibraryTemplates(req: Request, res: Response) {
  try {
    const channel = await loadChannel(req, res, String(req.query.channelId || ""));
    if (!channel) return;
    const qs = new URLSearchParams();
    for (const k of ["search", "topic", "usecase", "industry", "language", "after"]) {
      const v = req.query[k];
      if (typeof v === "string" && v.trim()) qs.set(k, v.trim());
    }
    qs.set("limit", String(Math.min(parseInt(String(req.query.limit || "30"), 10) || 30, 100)));
    const data = await graph(`/message_template_library?${qs}`, channel.accessToken!);
    res.json({ data: data.data || [], after: data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : null });
  } catch (e) { fail(res, e); }
}

function extractFields(t: any) {
  const comps: any[] = t.components || [];
  const header = comps.find((c) => c.type === "HEADER");
  const body = comps.find((c) => c.type === "BODY");
  const footer = comps.find((c) => c.type === "FOOTER");
  const buttons = comps.find((c) => c.type === "BUTTONS")?.buttons || [];
  let mediaType = "text";
  if (header?.format === "IMAGE") mediaType = "image";
  else if (header?.format === "VIDEO") mediaType = "video";
  else if (header?.format === "DOCUMENT") mediaType = "document";
  return {
    category: String(t.category || "UTILITY").toUpperCase(),
    language: t.language || "en_US",
    header: header?.format === "TEXT" ? header.text || "" : "",
    body: body?.text || "",
    footer: footer?.text || "",
    buttons,
    mediaType,
  };
}

const NAME_RE = /^[a-z0-9_]{1,512}$/;

export async function createFromLibrary(req: Request, res: Response) {
  try {
    const { channelId, name, language, libraryTemplateName, category, buttonInputs, bodyInputs } = req.body || {};
    const channel = await loadChannel(req, res, channelId);
    if (!channel) return;
    if (!channel.whatsappBusinessAccountId) return res.status(400).json({ error: "Channel has no WhatsApp Business Account ID" });
    if (!libraryTemplateName) return res.status(400).json({ error: "libraryTemplateName is required" });
    const tplName = String(name || "").trim().toLowerCase();
    if (!NAME_RE.test(tplName)) return res.status(400).json({ error: "Template name: lowercase letters, numbers and underscores only" });

    const cat = String(category || "UTILITY").toUpperCase() === "AUTHENTICATION" ? "AUTHENTICATION" : "UTILITY";
    const payload: Record<string, any> = {
      name: tplName,
      category: cat,
      language: language || "en_US",
      library_template_name: String(libraryTemplateName),
    };

    const btns = Array.isArray(buttonInputs) ? buttonInputs : [];
    const cleanBtns = btns.map((b: any) => {
      const type = String(b?.type || "").toUpperCase();
      if (type === "URL") {
        const base = String(b?.url?.base_url || b?.baseUrl || "").trim();
        if (!/^https:\/\/.+/.test(base)) throw Object.assign(new Error("URL buttons need a website starting with https://"), { status: 400 });
        const out: any = { type: "URL", url: { base_url: base } };
        const ex = String(b?.url?.url_suffix_example || b?.urlExample || "").trim();
        if (base.includes("{{1}}")) out.url.url_suffix_example = ex || base.replace("{{1}}", "123");
        return out;
      }
      if (type === "PHONE_NUMBER") {
        const phone = String(b?.phone_number || b?.phoneNumber || "").replace(/[^\d+]/g, "");
        if (!/^\+\d{8,15}$/.test(phone)) throw Object.assign(new Error("Phone buttons need a number with country code, e.g. +919876543210"), { status: 400 });
        return { type: "PHONE_NUMBER", phone_number: phone };
      }
      if (type === "OTP") return { type: "OTP", otp_type: b?.otp_type || "COPY_CODE" };
      return { type };
    });
    if (cleanBtns.length) payload.library_template_button_inputs = cleanBtns;
    if (cat === "AUTHENTICATION") {
      const bi = bodyInputs || {};
      payload.library_template_body_inputs = {
        add_security_recommendation: bi.add_security_recommendation !== false,
        ...(bi.code_expiration_minutes ? { code_expiration_minutes: Math.min(Math.max(parseInt(bi.code_expiration_minutes, 10) || 10, 1), 90) } : {}),
      };
      if (!cleanBtns.length) payload.library_template_button_inputs = [{ type: "OTP", otp_type: "COPY_CODE" }];
    }

    const created = await graph(`/${channel.whatsappBusinessAccountId}/message_templates`, channel.accessToken!, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Pull the final template (text/buttons Meta generated) and store it locally.
    let full: any = { id: created.id, name: tplName, language: payload.language, category: created.category || cat, status: created.status, components: [] };
    try {
      full = await graph(`/${created.id}?fields=id,name,status,category,language,components`, channel.accessToken!);
    } catch { /* keep minimal record; Sync will fill it */ }

    const fields = extractFields(full);
    const user = (req.session as any)?.user;
    const existing = await storage.getTemplateByNameAndChannel(tplName, channel.id).catch(() => null);
    const record: any = {
      name: tplName,
      ...fields,
      status: String(full.status || created.status || "PENDING").toUpperCase(),
      whatsappTemplateId: String(created.id),
      channelId: channel.id,
    };
    const saved = existing
      ? await storage.updateTemplate((existing as any).id, { ...record, updatedAt: new Date() })
      : await storage.createTemplate({ ...record, variables: [], createdBy: channel.createdBy || user?.id || "" });

    res.status(201).json({ template: saved, meta: { id: created.id, status: created.status, category: created.category } });
  } catch (e) { fail(res, e); }
}

// ───────────────────────── WhatsApp Flows ─────────────────────────

export async function listFlows(req: Request, res: Response) {
  try {
    const channel = await loadChannel(req, res, String(req.query.channelId || ""));
    if (!channel) return;
    if (!channel.whatsappBusinessAccountId) return res.status(400).json({ error: "Channel has no WhatsApp Business Account ID" });
    const data = await graph(`/${channel.whatsappBusinessAccountId}/flows?fields=id,name,status,categories,validation_errors&limit=100`, channel.accessToken!);
    res.json({ data: data.data || [] });
  } catch (e) { fail(res, e); }
}

/** Screens + preview link for one Flow (screens come from the Flow JSON asset). */
export async function getFlowDetails(req: Request, res: Response) {
  try {
    const channel = await loadChannel(req, res, String(req.query.channelId || ""));
    if (!channel) return;
    const flowId = String(req.params.flowId || "");
    if (!/^\d+$/.test(flowId)) return res.status(400).json({ error: "Invalid flow id" });
    const flow = await graph(`/${flowId}?fields=id,name,status,categories,preview.invalidate(false)`, channel.accessToken!);
    let screens: Array<{ id: string; title?: string }> = [];
    try {
      const assets = await graph(`/${flowId}/assets`, channel.accessToken!);
      const url = assets?.data?.find((a: any) => a.asset_type === "FLOW_JSON")?.download_url;
      if (url) {
        const json: any = await (await fetch(url)).json();
        screens = (json?.screens || []).map((s: any) => ({ id: s.id, title: s.title }));
      }
    } catch { /* screens optional */ }
    res.json({ ...flow, previewUrl: flow?.preview?.preview_url || null, screens });
  } catch (e) { fail(res, e); }
}

/** Send a Flow as an interactive message (only inside the 24h customer service window). */
export async function sendFlowMessage(req: Request, res: Response) {
  try {
    const { channelId, to, flowId, cta, body, header, footer, screen, draft } = req.body || {};
    const channel = await loadChannel(req, res, channelId);
    if (!channel) return;
    const phone = String(to || "").replace(/\D/g, "");
    if (phone.length < 8) return res.status(400).json({ error: "Valid recipient number required" });
    if (!flowId) return res.status(400).json({ error: "flowId is required" });
    const ctaText = String(cta || "Open").trim().slice(0, 20);
    const bodyText = String(body || "").trim();
    if (!bodyText) return res.status(400).json({ error: "Message body is required" });

    const flowToken = `hc-${randomUUID()}`;
    const parameters: Record<string, any> = {
      flow_message_version: "3",
      flow_token: flowToken,
      flow_id: String(flowId),
      flow_cta: ctaText,
      ...(draft ? { mode: "draft" } : {}),
    };
    if (screen) {
      parameters.flow_action = "navigate";
      parameters.flow_action_payload = { screen: String(screen) };
    }
    const interactive: Record<string, any> = {
      type: "flow",
      body: { text: bodyText.slice(0, 1024) },
      action: { name: "flow", parameters },
    };
    if (header) interactive.header = { type: "text", text: String(header).slice(0, 60) };
    if (footer) interactive.footer = { text: String(footer).slice(0, 60) };

    const data = await graph(`/${channel.phoneNumberId}/messages`, channel.accessToken!, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "interactive", interactive }),
    });
    res.json({ success: true, messageId: data?.messages?.[0]?.id, flowToken });
  } catch (e: any) {
    if (e?.meta?.code === 131047) e.message = "24-hour window closed. Send the Flow through an approved template with a Flow button instead.";
    fail(res, e);
  }
}
