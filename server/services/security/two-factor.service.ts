/**
 * Two-factor login.
 *  - totp: authenticator app (Google Authenticator, Authy, Microsoft Authenticator…), RFC 6238, 30 s, 6 digits
 *  - email: 6-digit code mailed at login
 * Backup codes (8) work once each. Roles in REQUIRE_2FA_ROLES (e.g. "superadmin,admin")
 * get an email code at login even when they haven't set up 2FA themselves.
 */
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { userTwoFactor, users } from "@shared/schema";
import { open, seal, sha256 } from "../../utils/secret-box";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}

/** Returns the matched time step (±1 window) or null. */
export function verifyTotp(secretB32: string, code: string, now = Date.now(), lastUsedStep?: number | null) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const step = Math.floor(now / 30_000);
  for (const s of [step, step - 1, step + 1]) {
    if (lastUsedStep != null && s <= lastUsedStep) continue; // no replay
    const a = Buffer.from(totpAt(secretB32, s));
    if (crypto.timingSafeEqual(a, Buffer.from(c))) return s;
  }
  return null;
}

export function requiredRoles(): string[] {
  return String(process.env.REQUIRE_2FA_ROLES || "").split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
}

export async function getTwoFactor(userId: string) {
  const [row] = await db.select().from(userTwoFactor).where(eq(userTwoFactor.userId, userId)).limit(1);
  return row || null;
}

export async function status(userId: string, role: string) {
  const row = await getTwoFactor(userId);
  return {
    enabled: !!row?.enabled,
    method: row?.enabled ? row.method : null,
    backupCodesLeft: row?.enabled ? (row.backupCodes || []).length : 0,
    requiredByPlatform: requiredRoles().includes(String(role).toLowerCase()),
    enabledAt: row?.enabledAt || null,
  };
}

/** What a login needs: null = no 2FA. */
export async function loginRequirement(user: { id: string; role: string }): Promise<null | { method: "totp" | "email" }> {
  const row = await getTwoFactor(user.id);
  if (row?.enabled) return { method: row.method === "email" ? "email" : "totp" };
  if (requiredRoles().includes(String(user.role).toLowerCase())) return { method: "email" };
  return null;
}

async function upsert(userId: string, set: Partial<typeof userTwoFactor.$inferInsert>) {
  await db.insert(userTwoFactor).values({ userId, ...set, updatedAt: new Date() } as any)
    .onConflictDoUpdate({ target: userTwoFactor.userId, set: { ...set, updatedAt: new Date() } as any });
}

export async function startTotpSetup(user: { id: string; username: string; email?: string | null }) {
  const secret = base32Encode(crypto.randomBytes(20));
  await upsert(user.id, { pendingSecretEnc: seal(secret) });
  const issuer = process.env.PLATFORM_NAME || "HoverChat";
  const label = encodeURIComponent(`${issuer}:${user.email || user.username}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return { secret, otpauth };
}

function newBackupCodes() {
  const plain = Array.from({ length: 8 }, () => {
    const s = crypto.randomBytes(5).toString("hex").toUpperCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { plain, hashed: plain.map((c) => sha256(c.replace(/-/g, ""))) };
}

export async function confirmTotpSetup(userId: string, code: string) {
  const row = await getTwoFactor(userId);
  const secret = open(row?.pendingSecretEnc);
  if (!secret) throw Object.assign(new Error("Start the setup again — the QR code expired."), { status: 400 });
  const step = verifyTotp(secret, code);
  if (step == null) throw Object.assign(new Error("That code didn't match. Check the time on your phone and try the newest code."), { status: 400 });
  const codes = newBackupCodes();
  await upsert(userId, {
    method: "totp", secretEnc: seal(secret), pendingSecretEnc: null, enabled: true,
    backupCodes: codes.hashed, lastUsedStep: step, enabledAt: new Date(),
  });
  return { backupCodes: codes.plain };
}

export async function enableEmailMethod(userId: string) {
  const codes = newBackupCodes();
  await upsert(userId, { method: "email", secretEnc: null, pendingSecretEnc: null, enabled: true, backupCodes: codes.hashed, enabledAt: new Date() });
  return { backupCodes: codes.plain };
}

export async function disable(userId: string) {
  await db.delete(userTwoFactor).where(eq(userTwoFactor.userId, userId));
}

export async function regenerateBackupCodes(userId: string) {
  const row = await getTwoFactor(userId);
  if (!row?.enabled) throw Object.assign(new Error("Turn on two-step login first."), { status: 400 });
  const codes = newBackupCodes();
  await upsert(userId, { backupCodes: codes.hashed });
  return { backupCodes: codes.plain };
}

/** Verifies a login code: authenticator code, emailed code (hash in session) or a backup code. */
export async function verifyLoginCode(userId: string, code: string, emailCodeHash?: string | null): Promise<{ ok: boolean; usedBackup?: boolean }> {
  const c = String(code || "").trim().toUpperCase();
  const row = await getTwoFactor(userId);
  if (row?.enabled && row.method === "totp") {
    const secret = open(row.secretEnc);
    const step = secret ? verifyTotp(secret, c, Date.now(), row.lastUsedStep) : null;
    if (step != null) { await upsert(userId, { lastUsedStep: step }); return { ok: true }; }
  }
  if (emailCodeHash && /^\d{6}$/.test(c)) {
    const a = Buffer.from(sha256(c)), b = Buffer.from(emailCodeHash);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true };
  }
  if (row?.enabled) {
    const h = sha256(c.replace(/-/g, ""));
    const list = row.backupCodes || [];
    if (list.includes(h)) {
      await upsert(userId, { backupCodes: list.filter((x) => x !== h) });
      return { ok: true, usedBackup: true };
    }
  }
  return { ok: false };
}

/** Sends a 6-digit login code by email; returns its hash for the session. */
export async function sendEmailCode(userId: string) {
  const [u] = await db.select({ email: users.email, firstName: users.firstName }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.email) throw Object.assign(new Error("No email address on this account."), { status: 400 });
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const { emailLayout } = await import("../reseller/common");
  const { sendNotificationEmail } = await import("../notification.service");
  const name = process.env.PLATFORM_NAME || "HoverChat";
  await sendNotificationEmail(u.email, `${code} is your ${name} login code`, emailLayout("Your login code",
    `<p>Hi ${u.firstName || "there"},</p><p>Use this code to finish signing in:</p>
     <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p>
     <p>It expires in 10 minutes. If you didn't try to sign in, change your password now.</p>`));
  const [local, domain] = u.email.split("@");
  return { hash: sha256(code), hint: `${local.slice(0, 2)}${"•".repeat(Math.max(1, local.length - 2))}@${domain}` };
}
