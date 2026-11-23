/**
 * Shared helpers for the reseller module: errors, tokens, audit log,
 * notifications (in-app + email through the existing infrastructure).
 */
import crypto from "crypto";
import { db } from "../../db";
import { notifications, resellerAuditLogs, sentNotifications, users } from "@shared/schema";
import { inArray } from "drizzle-orm";
import { sendNotificationEmail } from "../notification.service";
import { resolvePublicOrigin } from "../public-origin";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
export const newToken = () => crypto.randomBytes(32).toString("base64url");

/** Unusable password hash placeholder until the invitation is accepted. */
export const lockedPassword = () => `!invite:${crypto.randomBytes(24).toString("hex")}`;

export interface Actor {
  id: string;
  role: string;
  ip?: string | null;
}

type Exec = Pick<typeof db, "insert">;

export async function audit(
  exec: Exec,
  e: { resellerId?: string | null; actor: Actor | null; action: string; entityType: string; entityId?: string | null; before?: unknown; after?: unknown },
) {
  await exec.insert(resellerAuditLogs).values({
    resellerId: e.resellerId ?? null,
    actorUserId: e.actor?.id ?? null,
    actorRole: e.actor?.role ?? "system",
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId ?? null,
    before: (e.before as any) ?? null,
    after: (e.after as any) ?? null,
    ipAddress: e.actor?.ip ?? null,
  });
}

export async function appOrigin(): Promise<string> {
  return (process.env.PUBLIC_APP_URL || (await resolvePublicOrigin()) || "").replace(/\/$/, "");
}

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function emailLayout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f6f7f6;margin:0;padding:24px;color:#1f2937">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <div style="font-size:20px;font-weight:700;color:#08a957;margin-bottom:16px">HoverChat</div>
    <h1 style="font-size:18px;margin:0 0 12px">${escapeHtml(title)}</h1>
    <div style="font-size:15px;line-height:1.6;color:#374151">${bodyHtml}</div>
    ${cta ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="background:#08a957;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>
    <p style="font-size:12px;color:#6b7280;word-break:break-all">If the button does not work, open: ${escapeHtml(cta.url)}</p>` : ""}
    <p style="font-size:12px;color:#9ca3af;margin-top:28px;border-top:1px solid #f0f0f0;padding-top:12px">WhatsApp messaging charges are billed directly by Meta to your WhatsApp Business Account. HoverChat does not collect these charges.</p>
  </div></body></html>`;
}

/**
 * In-app notification + optional email for each user. Never throws:
 * notifications must not roll back business operations.
 */
export async function notifyUsers(
  userIds: string[],
  n: { title: string; message: string; type: string; email?: { subject: string; html: string } },
) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    const [notif] = await db
      .insert(notifications)
      .values({
        title: n.title, message: n.message, type: n.type, createdBy: "system",
        targetType: ids.length === 1 ? "single" : "multiple", targetIds: ids, status: "sent", sentAt: new Date(),
      })
      .returning();
    await db.insert(sentNotifications).values(ids.map((userId) => ({ notificationId: notif.id, userId })));
    const io = (global as any).io;
    if (io) for (const id of ids) io.to(`user:${id}`).emit("notification:new", { id: notif.id, title: n.title, message: n.message, type: n.type, createdAt: notif.createdAt });
  } catch (e) {
    console.error("[Reseller] in-app notification failed:", (e as Error).message);
  }
  if (n.email) {
    try {
      const rows = await db.select({ email: users.email }).from(users).where(inArray(users.id, ids));
      for (const r of rows) if (r.email) await sendNotificationEmail(r.email, n.email.subject, n.email.html);
    } catch (e) {
      console.error("[Reseller] email notification failed:", (e as Error).message);
    }
  }
}

export async function sendEmailTo(to: string, subject: string, html: string) {
  try {
    await sendNotificationEmail(to, subject, html);
  } catch (e) {
    console.error("[Reseller] email failed:", (e as Error).message);
  }
}
