/**
 * WhatsApp AUTHENTICATION templates (OTP) need the code TWICE:
 *  1. body parameter  → {{1}} in "*{{1}}* is your verification code"
 *  2. button parameter → the OTP button (copy code / one-tap / zero-tap)
 *     is sent as sub_type "url" with the same code.
 * Omitting (2) makes Meta reject the send with
 * "(#131008) Required parameter is missing".
 */

const OTP_MAX_LEN = 15; // Meta limit for authentication codes

function parseButtons(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  return [];
}

export function isAuthTemplate(template: { category?: string | null; buttons?: unknown } | null | undefined): boolean {
  if (!template) return false;
  if (String(template.category || "").toUpperCase() === "AUTHENTICATION") return true;
  return parseButtons(template.buttons).some((b) => String(b?.type || "").toUpperCase() === "OTP");
}

/** Index of the OTP button (authentication templates have it first; default 0). */
export function otpButtonIndex(template: { buttons?: unknown } | null | undefined): number {
  const i = parseButtons(template?.buttons).findIndex((b) => String(b?.type || "").toUpperCase() === "OTP");
  return i >= 0 ? i : 0;
}

/**
 * Adds the OTP button component when the template is an authentication
 * template and it is missing. `code` defaults to the first body parameter.
 * Throws a user-readable error when no code is available or it is too long.
 */
export function ensureOtpButton(components: any[], template: any, code?: string | null): any[] {
  if (!isAuthTemplate(template)) return components;
  const hasButton = components.some((c) => c?.type === "button" && (c.sub_type === "url" || c.sub_type === "copy_code"));
  const body = components.find((c) => c?.type === "body");
  const otp = String(code ?? body?.parameters?.[0]?.text ?? "").trim();
  if (!otp) throw Object.assign(new Error("Authentication template needs the OTP code as its first variable"), { status: 400 });
  if (otp.length > OTP_MAX_LEN) throw Object.assign(new Error(`OTP code must be at most ${OTP_MAX_LEN} characters`), { status: 400 });
  const out = components.filter((c) => !(c?.type === "button" && c.sub_type === "copy_code")); // coupon-style copy_code is wrong for OTP
  if (!hasButton || out.length !== components.length) {
    out.push({ type: "button", sub_type: "url", index: String(otpButtonIndex(template)), parameters: [{ type: "text", text: otp }] });
  }
  return out;
}
