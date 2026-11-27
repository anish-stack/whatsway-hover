/**
 * Encrypts secrets we must store (2FA seeds, Instagram / Facebook tokens, app secrets).
 * AES-256-GCM; key from SECRETS_KEY (preferred) or SESSION_SECRET.
 * Format: v1:<iv b64>:<tag b64>:<data b64>
 */
import crypto from "crypto";

function key() {
  const raw = process.env.SECRETS_KEY || process.env.SESSION_SECRET || "hoverchat-dev-only-key";
  return crypto.createHash("sha256").update(raw).digest();
}

export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${data.toString("base64")}`;
}

export function open(sealed?: string | null): string {
  if (!sealed) return "";
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) return "";
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
