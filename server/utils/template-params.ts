/**
 * Exact parameter lists for WhatsApp templates.
 *
 * Meta error #132000 ("Number of parameters does not match the expected number")
 * happened when we counted every `{{n}}` occurrence — a template that uses {{1}}
 * twice expects ONE parameter — or when the local copy of the template was out of
 * date / used named parameters ({{customer_name}}). Here we take distinct keys and,
 * when possible, the live definition from Meta.
 */

export interface TemplateVarKeys { keys: string[]; named: boolean }

/** Distinct variable keys in a text: numeric ones sorted (1,2,3…), named ones in order of appearance. */
export function templateVarKeys(text: string | null | undefined): TemplateVarKeys {
  const found = [...String(text || "").matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  const distinct = [...new Set(found)];
  const named = distinct.some((k) => !/^\d+$/.test(k));
  const keys = named ? distinct : distinct.sort((a, b) => Number(a) - Number(b));
  return { keys, named };
}

/** One text parameter (adds parameter_name for named-parameter templates). Meta rejects empty text. */
export function textParam(key: string, value: string | null | undefined, named: boolean) {
  const text = String(value ?? "").trim() || "-";
  return named ? { type: "text", parameter_name: key, text } : { type: "text", text };
}

/**
 * Overlay the live Meta definition (GET /{template-id} or the WABA template list)
 * on our stored template: header text/format, body, buttons, parameter format.
 */
export function mergeLiveTemplate<T extends Record<string, any>>(local: T, meta: any): T & { headerFormat?: string; parameterFormat?: string; liveFromMeta?: boolean } {
  const comps: any[] = Array.isArray(meta?.components) ? meta.components : [];
  if (!comps.length) return local as any;
  const out: any = { ...local, liveFromMeta: true, parameterFormat: meta.parameter_format || undefined };
  const header = comps.find((c) => c.type === "HEADER");
  if (header) {
    out.headerFormat = String(header.format || "TEXT").toUpperCase();
    out.header = out.headerFormat === "TEXT" ? header.text || "" : "";
  } else {
    out.headerFormat = undefined;
    out.header = "";
  }
  const body = comps.find((c) => c.type === "BODY");
  if (body?.text !== undefined) out.body = body.text;
  const buttons = comps.find((c) => c.type === "BUTTONS");
  out.buttons = buttons?.buttons
    ? buttons.buttons.map((b: any) => ({ ...b, type: String(b.type || "").toUpperCase(), example: b.example }))
    : [];
  return out;
}

/** Live template by name + language from the WABA (when we don't have Meta's template id). */
export async function fetchLiveTemplate(opts: { apiVersion: string; wabaId?: string | null; templateId?: string | null; token: string; name: string; language?: string | null }) {
  const headers = { Authorization: `Bearer ${opts.token}` };
  const base = `https://graph.facebook.com/${opts.apiVersion}`;
  if (opts.templateId) {
    const r = await fetch(`${base}/${opts.templateId}?fields=name,language,status,category,components,parameter_format`, { headers });
    const j: any = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j?.components)) return j;
  }
  if (!opts.wabaId) return null;
  const r = await fetch(`${base}/${opts.wabaId}/message_templates?name=${encodeURIComponent(opts.name)}&fields=name,language,status,category,components,parameter_format&limit=50`, { headers });
  const j: any = await r.json().catch(() => ({}));
  const list: any[] = Array.isArray(j?.data) ? j.data.filter((t: any) => t.name === opts.name) : [];
  return list.find((t) => !opts.language || t.language === opts.language) || list[0] || null;
}
