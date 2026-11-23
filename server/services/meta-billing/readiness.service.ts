/**
 * Server-side WhatsApp readiness gate for campaigns.
 *
 * Blocks only on explicit signals (subscription inactive, channel missing,
 * template not approved, Meta says messaging is BLOCKED / account-level
 * error, limit exceeded). An unreachable Graph API is a warning, not a
 * block. Never touches the HoverChat subscription or inbound messaging.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { campaigns, subscriptions, templates, users, type Channel } from "@shared/schema";
import { normalizeTemplateStatus } from "@shared/meta-billing";
import { storage } from "../../storage";
import { parseMessagingTier } from "../../utils/messaging-tiers";
import { getOrRefreshHealth } from "./account-health.service";

export type CheckState = "pass" | "warn" | "fail";
export interface ReadinessCheck {
  key: "subscription" | "channel" | "phone" | "messaging" | "template" | "limit" | "restrictions";
  label: string;
  state: CheckState;
  message: string;
  code?: string | null;
}
export interface ReadinessResult {
  ready: boolean;
  checks: ReadinessCheck[];
  blockingReason: string | null;
  healthStatus: string | null;
  checkedAt: string;
}

export async function resolveOwnerId(userId: string): Promise<string> {
  const [u] = await db.select({ id: users.id, role: users.role, createdBy: users.createdBy }).from(users).where(eq(users.id, userId)).limit(1);
  if (u?.role === "team" && u.createdBy) return u.createdBy;
  return userId;
}

export async function getSubscriptionState(ownerId: string) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, ownerId))
    .orderBy(sql`CASE WHEN ${subscriptions.status} = 'active' THEN 0 ELSE 1 END`, desc(subscriptions.endDate))
    .limit(1);
  if (!sub) return { active: false, reason: "No HoverChat subscription found.", sub: null };
  const expired = new Date(sub.endDate).getTime() < Date.now();
  if (sub.status !== "active") return { active: false, reason: `HoverChat subscription is ${sub.status}.`, sub };
  if (expired) return { active: false, reason: "HoverChat subscription has expired. Renew to send campaigns.", sub };
  return { active: true, reason: null, sub };
}

export interface ReadinessInput {
  channelId: string;
  templateId?: string | null;
  recipientCount?: number | null;
  /** owner (tenant) id of the requester; superadmin passes null to skip subscription check */
  ownerId: string | null;
  forceHealthRefresh?: boolean;
}

export async function checkCampaignReadiness(input: ReadinessInput): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  // 1. Subscription (HoverChat) — independent of Meta billing
  if (input.ownerId) {
    const s = await getSubscriptionState(input.ownerId);
    add({ key: "subscription", label: "HoverChat subscription", state: s.active ? "pass" : "fail", message: s.active ? "Active" : s.reason! });
  }

  // 2. Channel connected
  const channel: Channel | undefined = await storage.getChannel(input.channelId);
  if (!channel || (input.ownerId && channel.createdBy !== input.ownerId)) {
    add({ key: "channel", label: "WhatsApp account", state: "fail", message: "WhatsApp account not found or not connected to this workspace." });
    return finalize(checks, null);
  }
  if (channel.isActive === false || !channel.accessToken || !channel.phoneNumberId) {
    add({ key: "channel", label: "WhatsApp account", state: "fail", message: "WhatsApp account is inactive or missing credentials. Reconnect via Embedded Signup." });
    return finalize(checks, null);
  }
  add({ key: "channel", label: "WhatsApp account", state: "pass", message: channel.name || channel.phoneNumber || "Connected" });

  // 3–7 from Meta health snapshot
  let health: Awaited<ReturnType<typeof getOrRefreshHealth>> | null = null;
  try {
    health = await getOrRefreshHealth(channel, { force: input.forceHealthRefresh });
  } catch (e) {
    console.warn("[Readiness] health refresh failed:", (e as Error).message);
  }

  if (!health || (!health.phoneStatus && !health.wabaCanSend && health.lastError)) {
    add({ key: "messaging", label: "Meta messaging status", state: "warn", message: `Could not confirm status with Meta${health?.lastError ? `: ${health.lastError}` : ""}. Sending will be attempted.` });
  } else {
    const ps = (health.phoneStatus || "").toUpperCase();
    if (["BANNED", "DELETED", "DISCONNECTED"].includes(ps)) {
      add({ key: "phone", label: "Phone number", state: "fail", message: `Phone number is ${ps.toLowerCase()} on Meta.` });
    } else if (["PENDING", "UNVERIFIED", "NOT_VERIFIED"].includes(ps)) {
      add({ key: "phone", label: "Phone number", state: "fail", message: "Phone number is not registered/verified with the Cloud API yet." });
    } else {
      add({ key: "phone", label: "Phone number", state: ps ? "pass" : "warn", message: ps ? `Status ${ps}` : "Status not reported by Meta" });
    }

    const issues = ((health.issues as any[]) ?? []).filter((i) => i.affectsMessaging && i.category !== "calling");
    const blocking = issues.find((i) => i.severity === "blocked");
    if (health.messagingAvailability === "BLOCKED" || blocking) {
      const i = blocking ?? issues[0];
      add({
        key: "messaging",
        label: "Meta messaging status",
        state: "fail",
        code: i?.code ?? null,
        message: i
          ? `WhatsApp messaging is currently blocked: ${i.title}. ${i.action}`
          : "WhatsApp messaging is currently blocked by Meta. Check WhatsApp Manager for the reason.",
      });
    } else if (health.messagingAvailability === "LIMITED") {
      const i = issues.find((x) => x.severity === "restricted") ?? issues[0];
      add({ key: "messaging", label: "Meta messaging status", state: "warn", code: i?.code ?? null, message: `Messaging is limited by Meta${i ? `: ${i.title}` : ""}.` });
    } else {
      add({ key: "messaging", label: "Meta messaging status", state: "pass", message: health.messagingAvailability === "AVAILABLE" ? "Available" : "No restriction reported" });
    }

    const restricted = issues.filter((i) => i.severity === "restricted");
    if (restricted.length) {
      add({ key: "restrictions", label: "Account restrictions", state: "warn", code: restricted[0].code, message: restricted.map((r) => r.title).join("; ") });
    }
  }

  // Template approved
  if (input.templateId) {
    const [t] = await db.select({ id: templates.id, status: templates.status, channelId: templates.channelId, name: templates.name })
      .from(templates).where(eq(templates.id, input.templateId)).limit(1);
    if (!t || t.channelId !== channel.id) {
      add({ key: "template", label: "Template", state: "fail", message: "Template not found for this WhatsApp account." });
    } else {
      const st = normalizeTemplateStatus(t.status);
      add({ key: "template", label: "Template", state: st === "approved" ? "pass" : "fail", message: st === "approved" ? `"${t.name}" approved` : `Template "${t.name}" is ${st}. Only approved templates can be sent.` });
    }
  }

  // Messaging limit
  if (input.recipientCount && input.recipientCount > 0) {
    const tier = health?.messagingLimit ?? (channel.healthDetails as any)?.messaging_limit;
    const limit = parseMessagingTier(tier ?? undefined);
    if (limit !== Infinity && input.recipientCount > limit) {
      add({ key: "limit", label: "Messaging limit", state: "fail", message: `Recipients (${input.recipientCount.toLocaleString()}) exceed the ${limit.toLocaleString()}/24h messaging limit.` });
    } else {
      add({ key: "limit", label: "Messaging limit", state: "pass", message: limit === Infinity ? "Unlimited or not reported" : `${limit.toLocaleString()} per 24h` });
    }
  }

  return finalize(checks, health?.overallStatus ?? null);
}

function finalize(checks: ReadinessCheck[], healthStatus: string | null): ReadinessResult {
  const fail = checks.find((c) => c.state === "fail");
  return { ready: !fail, checks, blockingReason: fail?.message ?? null, healthStatus, checkedAt: new Date().toISOString() };
}

/** Readiness for an existing campaign row. */
export async function checkCampaignRowReadiness(campaignId: string, opts: { force?: boolean } = {}) {
  const [c] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!c || !c.channelId) {
    return finalize([{ key: "channel", label: "WhatsApp account", state: "fail", message: "Campaign or its WhatsApp account not found." }], null);
  }
  const channel = await storage.getChannel(c.channelId);
  return checkCampaignReadiness({
    channelId: c.channelId,
    templateId: c.templateId,
    recipientCount: null, // limit already validated at creation; do not re-block resumes on it
    ownerId: channel?.createdBy || (await resolveOwnerId(c.createdBy)),
    forceHealthRefresh: opts.force,
  });
}

/**
 * Called when a send fails mid-campaign with an account-level Meta error
 * (payment, lock, policy block, token). Pauses ONLY that campaign; does not
 * touch the subscription or inbound messaging. Health is refreshed so the
 * UI shows the real reason.
 */
export async function pauseCampaignForAccountBlock(campaignId: string, channelId: string | null, code: string) {
  try {
    const res = await db
      .update(campaigns)
      .set({ status: "paused", updatedAt: new Date() })
      .where(and(eq(campaigns.id, campaignId), sql`${campaigns.status} IN ('sending','queued','active')`))
      .returning({ id: campaigns.id });
    if (res.length) console.warn(`[CampaignGuard] Paused campaign ${campaignId} — Meta account-level error ${code}`);
    if (channelId) {
      const ch = await storage.getChannel(channelId);
      if (ch) void getOrRefreshHealth(ch, { force: true }).catch(() => {});
    }
  } catch (e) {
    console.error("[CampaignGuard] pause failed:", (e as Error).message);
  }
}
