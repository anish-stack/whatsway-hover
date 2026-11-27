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

/**
 * Last check before a template message is queued: make the components match the
 * live Meta definition exactly (one header param for media/text vars, LTO only when
 * the offer has an expiry, body count = distinct vars, button params only where the
 * button is dynamic). Anything Meta doesn't expect is dropped; anything missing is
 * filled ("-", sample media, example coupon) so we never hit #132000.
 */
export function reconcileComponents(meta: any, components: any[], opts: { mediaId?: string | null; expirationMs?: number | null } = {}): any[] {
  const live: any[] = Array.isArray(meta?.components) ? meta.components : [];
  if (!live.length) return components;
  if (live.some((c) => c.type === "CAROUSEL")) return components; // carousel built separately
  const named = meta.parameter_format === "NAMED";
  const find = (type: string) => components.find((c) => String(c.type).toLowerCase() === type);
  const out: any[] = [];

  const header = live.find((c) => c.type === "HEADER");
  if (header) {
    const fmt = String(header.format || "TEXT").toUpperCase();
    const given = find("header");
    if (fmt === "TEXT") {
      const keys = templateVarKeys(header.text).keys;
      if (keys.length) {
        const params = keys.map((k, i) => {
          const p = given?.parameters?.[i];
          return textParam(k, p?.text, named);
        });
        out.push({ type: "header", parameters: params });
      }
    } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
      const kind = fmt.toLowerCase();
      const p = given?.parameters?.[0];
      let media = p?.[kind] || p?.image || p?.video || p?.document;
      // an "id" that is really a URL/path is not a Meta media id
      if (media?.id && /^https?:\/\//.test(String(media.id))) media = { link: media.id };
      else if (media?.id && /[\/.]/.test(String(media.id))) media = undefined;
      if (!media) {
        if (opts.mediaId && /^https?:\/\//.test(opts.mediaId)) media = { link: opts.mediaId };
        else if (opts.mediaId && !/[\/.]/.test(opts.mediaId)) media = { id: opts.mediaId };
        if (!media) {
          const sample = header.example?.header_handle?.[0] || header.example?.header_url?.[0];
          if (sample) media = { link: sample };
        }
      }
      if (media) out.push({ type: "header", parameters: [{ type: kind, [kind]: media }] });
    } else if (given) {
      out.push(given); // LOCATION etc.
    }
  }

  const lto = live.find((c) => c.type === "LIMITED_TIME_OFFER");
  if (lto && lto.limited_time_offer?.has_expiration !== false) {
    const exp = Number(opts.expirationMs) > Date.now() ? Number(opts.expirationMs) : Date.now() + 24 * 3600_000;
    out.push({ type: "limited_time_offer", parameters: [{ type: "limited_time_offer", limited_time_offer: { expiration_time_ms: exp } }] });
  }

  const body = live.find((c) => c.type === "BODY");
  const bodyKeys = templateVarKeys(body?.text).keys;
  if (bodyKeys.length) {
    const given = find("body");
    out.push({
      type: "body",
      parameters: bodyKeys.map((k, i) => {
        const p = given?.parameters?.find((x: any) => x?.parameter_name === k) || given?.parameters?.[i];
        return textParam(k, p?.text, named);
      }),
    });
  }

  const btns: any[] = live.find((c) => c.type === "BUTTONS")?.buttons || [];
  const givenBtns = components.filter((c) => String(c.type).toLowerCase() === "button");
  btns.forEach((b, index) => {
    const t = String(b.type || "").toUpperCase();
    const given = givenBtns.find((c) => String(c.index) === String(index));
    if (t === "URL" && /\{\{/.test(String(b.url || ""))) {
      const v = given?.parameters?.[0]?.text;
      const ex = Array.isArray(b.example) ? b.example[0] : b.example;
      const sample = typeof ex === "string" && b.url ? ex.replace(String(b.url).split("{{")[0], "") : "";
      out.push({ type: "button", sub_type: "url", index: String(index), parameters: [{ type: "text", text: String(v || "").trim() || sample || "-" }] });
    } else if (t === "COPY_CODE") {
      const v = given?.parameters?.[0]?.coupon_code;
      const ex = Array.isArray(b.example) ? b.example[0] : b.example;
      out.push({ type: "button", sub_type: "copy_code", index: String(index), parameters: [{ type: "coupon_code", coupon_code: String(v || ex || "OFFER").slice(0, 15) }] });
    } else if (t === "FLOW" || t === "OTP" || t === "CATALOG" || t === "MPM") {
      if (given) out.push(given);
    }
  });
  return out;
}

/** Meta's error message plus its detail line (e.g. "body: number of localizable_params (2) does not match… (1)"). */
export function metaErrorText(err: any): string {
  const msg = err?.message || "Send failed";
  const det = err?.error_data?.details || err?.metaErrorDetails;
  return det && !String(msg).includes(det) ? `${msg} — ${det}` : msg;
}
