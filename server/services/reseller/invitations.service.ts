/**
 * One-time account tokens for invitations and admin-initiated password
 * resets. Only the SHA-256 of the token is stored; the raw token lives in
 * the emailed link. Passwords are never emailed or shown to admins.
 */
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db";
import { accountInvitations, resellerProfiles, users } from "@shared/schema";
import { HttpError, appOrigin, emailLayout, escapeHtml, newToken, sendEmailTo, sha256 } from "./common";

export type InvitePurpose = "reseller_invite" | "customer_invite" | "password_reset";
const TTL_HOURS: Record<InvitePurpose, number> = { reseller_invite: 72, customer_invite: 72, password_reset: 2 };

type Exec = Pick<typeof db, "insert" | "update">;

/** Create a token (invalidating earlier unused tokens of the same purpose). */
export async function issueToken(exec: Exec, userId: string, purpose: InvitePurpose, createdBy?: string | null) {
  const token = newToken();
  await exec
    .update(accountInvitations)
    .set({ usedAt: new Date() })
    .where(and(eq(accountInvitations.userId, userId), eq(accountInvitations.purpose, purpose), isNull(accountInvitations.usedAt)));
  await exec.insert(accountInvitations).values({
    userId,
    tokenHash: sha256(token),
    purpose,
    expiresAt: new Date(Date.now() + TTL_HOURS[purpose] * 3600_000),
    createdBy: createdBy ?? null,
  });
  return token;
}

export async function inviteLink(token: string) {
  return `${await appOrigin()}/accept-invite?token=${encodeURIComponent(token)}`;
}

export async function sendInviteEmail(opts: { to: string; name?: string | null; token: string; purpose: InvitePurpose; resellerName?: string | null }) {
  const url = await inviteLink(opts.token);
  const hello = `<p>Hello ${escapeHtml(opts.name || "there")},</p>`;
  if (opts.purpose === "password_reset") {
    await sendEmailTo(opts.to, "Set a new HoverChat password",
      emailLayout("Set a new password", `${hello}<p>A password reset was requested for your HoverChat account. The link is valid for 2 hours and works once.</p>`, { label: "Set new password", url }));
  } else if (opts.purpose === "reseller_invite") {
    await sendEmailTo(opts.to, "You're invited to the HoverChat Reseller Portal",
      emailLayout("Activate your reseller account", `${hello}<p>Your HoverChat reseller account is ready. Set your password to sign in to the reseller portal. The link is valid for 72 hours.</p>`, { label: "Activate account", url }));
  } else {
    await sendEmailTo(opts.to, "Your HoverChat account is ready",
      emailLayout("Activate your HoverChat account", `${hello}<p>${opts.resellerName ? `${escapeHtml(opts.resellerName)} has created` : "We have created"} a HoverChat account for you. Set your password to sign in and connect your WhatsApp Business number.</p><p>WhatsApp messaging is billed directly by Meta to your own WhatsApp Business Account.</p>`, { label: "Set password & sign in", url }));
  }
  return url;
}

async function findValid(token: string) {
  if (!token || token.length < 20 || token.length > 200) throw new HttpError(400, "Invalid or expired link");
  const [row] = await db
    .select()
    .from(accountInvitations)
    .where(and(eq(accountInvitations.tokenHash, sha256(token)), isNull(accountInvitations.usedAt), gt(accountInvitations.expiresAt, new Date())))
    .limit(1);
  if (!row) throw new HttpError(400, "This link is invalid, already used or expired. Ask for a new one.");
  return row;
}

export async function describeToken(token: string) {
  const row = await findValid(token);
  const [u] = await db.select({ email: users.email, firstName: users.firstName, role: users.role, username: users.username }).from(users).where(eq(users.id, row.userId));
  if (!u) throw new HttpError(400, "Invalid or expired link");
  return { purpose: row.purpose, email: u.email, username: u.username, firstName: u.firstName, role: u.role, expiresAt: row.expiresAt };
}

export function assertStrongPassword(pw: unknown): string {
  const p = String(pw ?? "");
  if (p.length < 8 || p.length > 128) throw new HttpError(400, "Password must be 8–128 characters");
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) throw new HttpError(400, "Password must contain letters and numbers");
  return p;
}

/** Consume token atomically, set password, verify email, activate reseller profile. */
export async function acceptToken(token: string, password: string) {
  const pw = assertStrongPassword(password);
  const hash = await bcrypt.hash(pw, 10);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(accountInvitations)
      .set({ usedAt: new Date() })
      .where(and(eq(accountInvitations.tokenHash, sha256(token)), isNull(accountInvitations.usedAt), gt(accountInvitations.expiresAt, new Date())))
      .returning();
    if (!row) throw new HttpError(400, "This link is invalid, already used or expired. Ask for a new one.");
    const [u] = await tx
      .update(users)
      .set({ password: hash, isEmailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, row.userId))
      .returning({ id: users.id, role: users.role, username: users.username, status: users.status });
    if (row.purpose === "reseller_invite") {
      await tx
        .update(resellerProfiles)
        .set({ status: "active", updatedAt: new Date() })
        .where(and(eq(resellerProfiles.userId, row.userId), eq(resellerProfiles.status, "pending_activation")));
    }
    return { purpose: row.purpose, username: u?.username, role: u?.role };
  });
}
