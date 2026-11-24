/**
 * "Make with AI" for WhatsApp templates.
 * A short interview: the model asks up to 3 quick questions (business,
 * purpose, details), then returns a Meta-compliant template with numbered
 * variables and sample values. Output is validated and repaired here so the
 * form never receives something Meta will reject for structure reasons.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { aiSettings } from "@shared/schema";
import { chatComplete, type AISettingLike } from "../utils/ai-provider";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export interface AiTemplate {
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  language: string;
  header: string;
  headerSample: string;
  body: string;
  footer: string;
  samples: string[];
  variableNames: string[];
  buttons: Array<{ type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phoneNumber?: string }>;
}

export type AiTurn =
  | { type: "question"; question: string; options: string[] }
  | { type: "template"; template: AiTemplate; notes: string[] };

const SYSTEM = `You are HoverChat's WhatsApp template expert. You help a business owner create ONE WhatsApp Business message template that Meta will approve.

Interview style:
- Ask SHORT, friendly questions, ONE at a time, at most 3 questions in total. Skip anything the user already told you.
- Good things to learn: business name/type, the exact purpose (e.g. order shipped, appointment reminder, festive offer), which details change per customer (these become variables), and whether they want buttons (website link, call, quick replies).
- Give 2-4 short tappable "options" with each question when it helps.
- If the user's first message already has enough detail, skip questions and produce the template immediately.
- Reply in the same language the user writes in (Hindi/Hinglish is fine), but the template itself uses the language they want (default English).

Meta rules you MUST follow:
- category: UTILITY only for transactional updates about an existing order/account/booking (no promotion). Offers, discounts, greetings, announcements = MARKETING. OTP codes = AUTHENTICATION (body must be exactly "{{1}} is your verification code." style, no buttons other than OTP — avoid unless asked).
- name: lowercase letters, numbers, underscores only, max 50 chars, descriptive (e.g. order_shipped_update).
- body: max 550 characters, natural and polite, may use *bold* and emojis sparingly.
- variables: {{1}}, {{2}}, ... numbered in order of first appearance, no gaps; never two variables next to each other; the body must NOT start or end with a variable; at most 1 variable per ~3 words.
- Provide a realistic sample value for every variable (Indian context by default: names like Rahul, ₹ amounts, dd Mon dates).
- header: optional plain text max 60 chars, at most one variable {{1}} (give headerSample if used). footer: optional max 60 chars, no variables.
- buttons: either up to 3 QUICK_REPLY (text max 25), or up to 2 call-to-action (URL with https:// and optional {{1}} at the very end, or PHONE_NUMBER with country code). Never mix both kinds.

Output format — ALWAYS reply with a single JSON object and nothing else:
{"type":"question","question":"...","options":["...","..."]}
or
{"type":"template","template":{"name":"","category":"UTILITY","language":"en_US","header":"","headerSample":"","body":"","footer":"","variables":[{"name":"customer_name","sample":"Rahul"}],"buttons":[{"type":"URL","text":"Track order","url":"https://example.com/track/{{1}}"}]},"notes":["one short tip"]}`;

export async function resolveSetting(channelId?: string): Promise<AISettingLike | null> {
  if (channelId) {
    const [row] = await db.select().from(aiSettings)
      .where(and(eq(aiSettings.channelId, channelId), eq(aiSettings.isActive, true)))
      .orderBy(desc(aiSettings.updatedAt)).limit(1);
    if (row?.apiKey) return row as any;
    const [any] = await db.select().from(aiSettings).where(eq(aiSettings.channelId, channelId)).orderBy(desc(aiSettings.updatedAt)).limit(1);
    if (any?.apiKey) return any as any;
  }
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", apiKey: process.env.GEMINI_API_KEY };
  if (process.env.OPENAI_API_KEY && !/^x+$/i.test(process.env.OPENAI_API_KEY)) return { provider: "openai", apiKey: process.env.OPENAI_API_KEY };
  return null;
}

export function extractJson(text: string): any {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  try { return JSON.parse(t); } catch { /* fallthrough */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch { /* ignore */ } }
  return null;
}

const clip = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);

/** Renumber {{x}} placeholders 1..n by first appearance; returns mapping old→new. */
function renumber(body: string): { body: string; order: string[] } {
  const order: string[] = [];
  const out = body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, key) => {
    let i = order.indexOf(key);
    if (i < 0) { order.push(key); i = order.length - 1; }
    return `{{${i + 1}}}`;
  });
  return { body: out, order };
}

export function sanitizeTemplate(raw: any): { template: AiTemplate; notes: string[] } {
  const notes: string[] = [];
  const catRaw = String(raw?.category || "UTILITY").toUpperCase();
  const category = (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(catRaw) ? catRaw : "UTILITY") as AiTemplate["category"];

  let name = String(raw?.name || "my_template").toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "my_template";

  // Body + variables
  const vars: Array<{ name?: string; sample?: string }> = Array.isArray(raw?.variables) ? raw.variables : [];
  let { body, order } = renumber(clip(raw?.body, 1200));
  // Map samples: model may key variables by number or name
  const samples: string[] = order.map((key, i) => {
    const byIndex = vars[Number(key) - 1];
    const byName = vars.find((v) => v?.name === key);
    return clip((byIndex || byName || vars[i])?.sample || `sample${i + 1}`, 60);
  });
  const variableNames = order.map((key, i) => {
    const byIndex = vars[Number(key) - 1];
    const byName = vars.find((v) => v?.name === key);
    return clip((byIndex || byName || vars[i])?.name || `var_${i + 1}`, 40);
  });
  // Meta: body cannot start/end with a variable
  if (/^\s*\{\{\d+\}\}/.test(body)) { body = `Hi ${body.trimStart()}`; notes.push("Added a greeting so the message doesn't start with a variable."); }
  if (/\{\{\d+\}\}\s*[.!?]?\s*$/.test(body)) { body = `${body.trimEnd().replace(/[.!?]$/, "")}. Thank you!`; notes.push("Added a closing line so the message doesn't end with a variable."); }
  // Adjacent variables
  body = body.replace(/(\{\{\d+\}\})\s*(\{\{\d+\}\})/g, "$1 - $2");
  if (body.length > 550) { body = body.slice(0, 547).trimEnd() + "..."; notes.push("Shortened the body to 550 characters."); }

  // Header
  let header = clip(raw?.header, 60);
  let headerSample = "";
  const hv = header.match(/\{\{\s*[^}]+\s*\}\}/g) || [];
  if (hv.length) {
    header = header.replace(/\{\{\s*[^}]+\s*\}\}/, "{{1}}").replace(/\{\{\s*[^}]+\s*\}\}/g, "");
    headerSample = clip(raw?.headerSample || "Sample", 40);
  }
  const footer = clip(raw?.footer, 60).replace(/\{\{[^}]*\}\}/g, "").trim();

  // Buttons
  let buttons: AiTemplate["buttons"] = (Array.isArray(raw?.buttons) ? raw.buttons : []).map((b: any) => {
    const type = String(b?.type || "").toUpperCase().replace("PHONE", "PHONE_NUMBER").replace("PHONE_NUMBER_NUMBER", "PHONE_NUMBER");
    const text = clip(b?.text, 25) || "Open";
    if (type === "URL") {
      let url = clip(b?.url, 2000);
      if (!/^https:\/\//.test(url)) url = url ? `https://${url.replace(/^https?:\/\//, "")}` : "https://example.com";
      url = url.replace(/\{\{\s*[^}]+\s*\}\}/g, "").replace(/\/+$/, "") + (/\{\{/.test(String(b?.url)) ? "/{{1}}" : "");
      return { type: "URL" as const, text, url };
    }
    if (type === "PHONE_NUMBER") {
      const phone = String(b?.phoneNumber || b?.phone_number || "").replace(/[^\d+]/g, "");
      return { type: "PHONE_NUMBER" as const, text, phoneNumber: phone.startsWith("+") ? phone : phone ? `+${phone}` : "+91" };
    }
    return { type: "QUICK_REPLY" as const, text };
  });
  const hasQR = buttons.some((b) => b.type === "QUICK_REPLY");
  const hasCTA = buttons.some((b) => b.type !== "QUICK_REPLY");
  if (hasQR && hasCTA) { buttons = buttons.filter((b) => b.type !== "QUICK_REPLY"); notes.push("Kept only link/call buttons (Meta doesn't allow mixing with quick replies here)."); }
  buttons = buttons[0]?.type === "QUICK_REPLY" ? buttons.slice(0, 3) : buttons.slice(0, 2);
  if (category === "AUTHENTICATION") buttons = [];

  if (!body) body = "Hello! Thank you for choosing us.";
  name = name || "my_template";
  return {
    template: { name, category, language: clip(raw?.language, 10) || "en_US", header, headerSample, body, footer, samples, variableNames, buttons },
    notes,
  };
}

export async function aiTemplateTurn(channelId: string | undefined, messages: ChatMsg[], language?: string): Promise<AiTurn> {
  const setting = await resolveSetting(channelId);
  if (!setting) throw Object.assign(new Error("No AI key found. Add a Gemini or OpenAI key in Settings → AI Assistant."), { status: 400 });

  const history = messages.slice(-12).map((m) => ({ role: m.role, content: clip(m.content, 2000) }));
  const userTurns = history.filter((m) => m.role === "user").length;
  const force = userTurns >= 4 ? "\nYou have enough information now. Return the final template JSON (type=template)." : "";
  const sys = SYSTEM + (language ? `\nPreferred template language code: ${language}.` : "") + force;

  const text = await chatComplete(setting, [{ role: "system", content: sys }, ...history], { maxTokens: 1500, temperature: 0.5 });
  const parsed = extractJson(text);
  if (!parsed) throw Object.assign(new Error("AI returned an unexpected answer. Please try again."), { status: 502 });

  if (parsed.type === "question" && userTurns < 4) {
    return {
      type: "question",
      question: clip(parsed.question, 400) || "Tell me a bit more about this message.",
      options: (Array.isArray(parsed.options) ? parsed.options : []).map((o: any) => clip(o, 60)).filter(Boolean).slice(0, 4),
    };
  }
  const raw = parsed.template || parsed;
  const { template, notes } = sanitizeTemplate(raw);
  return { type: "template", template, notes: [...(Array.isArray(parsed.notes) ? parsed.notes.map((n: any) => clip(n, 200)) : []), ...notes].slice(0, 4) };
}
