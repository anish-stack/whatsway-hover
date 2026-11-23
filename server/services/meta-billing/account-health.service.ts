/**
 * WhatsApp account health — reads Meta Graph API (WABA + phone number
 * health_status, verification, display name, quality, limits) and the
 * local template table, classifies it and stores a snapshot per channel.
 *
 * Payment setup, business verification, display-name review and template
 * approval are DIFFERENT Meta processes and are reported separately.
 * Calling/SIP errors (138xxx) are reported apart from messaging.
 */
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, templates, whatsappAccountHealth, type Channel, type WhatsappAccountHealth } from "@shared/schema";
import {
  classifyHealth,
  metaBillingUrl,
  metaSecurityCentreUrl,
  metaWhatsAppManagerUrl,
  normalizeTemplateStatus,
  type HealthInput,
} from "@shared/meta-billing";

const GRAPH_VERSION = () => process.env.WHATSAPP_API_VERSION || "v25.0";
export const HEALTH_TTL_MS = Number(process.env.WA_HEALTH_TTL_MS || 10 * 60 * 1000);

type GraphResult = { ok: boolean; data: any; error: { code?: number; message?: string } | null };

async function graphGet(path: string, fields: string, token: string): Promise<GraphResult> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION()}/${path}?fields=${encodeURIComponent(fields)}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (res.ok && !data?.error) return { ok: true, data, error: null };
    return { ok: false, data, error: { code: data?.error?.code, message: data?.error?.message || `HTTP ${res.status}` } };
  } catch (e: any) {
    return { ok: false, data: null, error: { message: e?.name === "AbortError" ? "Meta Graph API timed out" : e?.message || "Network error" } };
  }
}

/** Try a rich field list; if Meta rejects a field (code 100) or permission (200/10), fall back. */
async function graphGetWithFallback(path: string, fieldSets: string[], token: string): Promise<GraphResult & { usedFields: string }> {
  let last: GraphResult = { ok: false, data: null, error: { message: "not requested" } };
  for (const f of fieldSets) {
    last = await graphGet(path, f, token);
    if (last.ok) return { ...last, usedFields: f };
    const code = Number(last.error?.code);
    if (![100, 10, 200].includes(code)) break; // auth/network: no point retrying with fewer fields
  }
  return { ...last, usedFields: "" };
}

const WABA_FIELDS = [
  "id,name,account_review_status,business_verification_status,currency,timezone_id,ownership_type,health_status,owner_business_info,primary_funding_id",
  "id,name,account_review_status,business_verification_status,currency,timezone_id,health_status,owner_business_info",
  "id,name,account_review_status,currency",
];
const PHONE_FIELDS = [
  "id,display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,status,code_verification_status,account_mode,platform_type,health_status,throughput",
  "id,display_phone_number,verified_name,name_status,quality_rating,messaging_limit_tier,status,code_verification_status,account_mode",
];

export async function templateCountsForChannel(channelId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ status: templates.status, n: sql<number>`count(*)::int` })
    .from(templates)
    .where(eq(templates.channelId, channelId))
    .groupBy(templates.status);
  const out: Record<string, number> = { approved: 0, pending: 0, rejected: 0, disabled: 0, paused: 0 };
  for (const r of rows) {
    const k = normalizeTemplateStatus(r.status);
    out[k] = (out[k] ?? 0) + Number(r.n);
  }
  return out;
}

export async function refreshChannelHealth(channel: Channel): Promise<WhatsappAccountHealth> {
  const token = channel.accessToken;
  const wabaId = channel.whatsappBusinessAccountId;
  const [waba, phone, tpl] = await Promise.all([
    wabaId && token ? graphGetWithFallback(wabaId, WABA_FIELDS, token) : Promise.resolve(null),
    channel.phoneNumberId && token ? graphGetWithFallback(channel.phoneNumberId, PHONE_FIELDS, token) : Promise.resolve(null),
    templateCountsForChannel(channel.id),
  ]);

  const w = waba?.data ?? {};
  const p = phone?.data ?? {};
  const input: HealthInput = {
    waba: waba
      ? {
          ok: waba.ok,
          businessVerificationStatus: w.business_verification_status ?? null,
          accountReviewStatus: w.account_review_status ?? null,
          canSendMessage: w.health_status?.can_send_message ?? null,
          entities: w.health_status?.entities ?? [],
          primaryFundingId: w.primary_funding_id ?? null,
          fundingFieldReadable: waba.ok && waba.usedFields.includes("primary_funding_id"),
          error: waba.error,
        }
      : { ok: false, error: { message: "No WhatsApp Business Account ID stored for this channel" } },
    phone: phone
      ? {
          ok: phone.ok,
          status: p.status ?? null,
          nameStatus: p.name_status ?? null,
          qualityRating: p.quality_rating ?? null,
          messagingLimit: p.messaging_limit_tier ?? null,
          codeVerificationStatus: p.code_verification_status ?? null,
          canSendMessage: p.health_status?.can_send_message ?? null,
          entities: p.health_status?.entities ?? [],
          error: phone.error,
        }
      : { ok: false, error: { message: "Missing phone number ID or token" } },
    templates: tpl,
  };
  const result = classifyHealth(input);

  const businessId = w.owner_business_info?.id ?? null;
  const values = {
    channelId: channel.id,
    customerId: channel.createdBy || null,
    wabaId: wabaId ?? null,
    phoneNumberId: channel.phoneNumberId,
    businessId,
    businessName: w.owner_business_info?.name ?? null,
    businessVerificationStatus: w.business_verification_status ?? null,
    wabaName: w.name ?? null,
    wabaReviewStatus: w.account_review_status ?? null,
    wabaCanSend: w.health_status?.can_send_message ?? null,
    accountMode: p.account_mode ?? null,
    phoneNumber: p.display_phone_number ?? channel.phoneNumber ?? null,
    verifiedName: typeof p.verified_name === "string" ? p.verified_name : null,
    nameStatus: p.name_status ?? null,
    qualityRating: p.quality_rating ?? null,
    messagingLimit: p.messaging_limit_tier ?? null,
    phoneStatus: p.status ?? null,
    codeVerificationStatus: p.code_verification_status ?? null,
    phoneCanSend: p.health_status?.can_send_message ?? null,
    messagingAvailability: result.messagingAvailability,
    billingStatus: result.billingStatus,
    templateCounts: tpl,
    issues: result.issues,
    callingIssues: result.callingIssues,
    overallStatus: result.overall,
    // Raw Meta payload minus anything payment-related beyond presence.
    raw: { waba: waba ? { ...w, primary_funding_id: w.primary_funding_id ? "present" : undefined } : null, phone: phone ? p : null },
    lastError: [waba?.error?.message, phone?.error?.message].filter(Boolean).join(" | ") || null,
    checkedAt: new Date(),
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(whatsappAccountHealth)
    .values(values)
    .onConflictDoUpdate({ target: whatsappAccountHealth.channelId, set: values })
    .returning();

  // Keep the legacy channel health fields roughly in sync for existing screens.
  try {
    if (phone?.ok) {
      const existing = (channel.healthDetails as Record<string, unknown>) || {};
      await db
        .update(channels)
        .set({
          healthStatus: result.overall === "healthy" ? "healthy" : result.overall === "blocked" ? "error" : "warning",
          lastHealthCheck: new Date(),
          healthDetails: {
            ...existing,
            quality_rating: p.quality_rating ?? existing.quality_rating,
            messaging_limit: p.messaging_limit_tier ?? existing.messaging_limit,
            name_status: p.name_status ?? existing.name_status,
            verified_name: typeof p.verified_name === "string" ? p.verified_name : existing.verified_name,
            status: p.account_mode ?? existing.status,
          },
        })
        .where(eq(channels.id, channel.id));
    }
  } catch (e) {
    console.warn("[AccountHealth] legacy channel sync failed:", (e as Error).message);
  }
  return row;
}

export async function getHealthSnapshots(channelIds: string[]): Promise<WhatsappAccountHealth[]> {
  if (channelIds.length === 0) return [];
  return db.select().from(whatsappAccountHealth).where(inArray(whatsappAccountHealth.channelId, channelIds));
}

/** Return a fresh-enough snapshot; refresh from Meta when stale or forced. */
export async function getOrRefreshHealth(channel: Channel, opts: { force?: boolean; maxAgeMs?: number } = {}) {
  const maxAge = opts.maxAgeMs ?? HEALTH_TTL_MS;
  if (!opts.force) {
    const [snap] = await getHealthSnapshots([channel.id]);
    if (snap?.checkedAt && Date.now() - new Date(snap.checkedAt).getTime() < maxAge) return snap;
  }
  return refreshChannelHealth(channel);
}

export function healthLinks(h: Pick<WhatsappAccountHealth, "businessId" | "wabaId">) {
  return {
    billing: metaBillingUrl(h.businessId),
    whatsappManager: metaWhatsAppManagerUrl(h.wabaId, h.businessId),
    businessVerification: metaSecurityCentreUrl(h.businessId),
  };
}

/** Customer-facing shape; strips raw Graph payload. */
export function presentHealth(h: WhatsappAccountHealth, channel?: Pick<Channel, "id" | "name" | "phoneNumber" | "isActive">) {
  const { raw, ...rest } = h;
  void raw;
  return {
    ...rest,
    channelName: channel?.name ?? null,
    channelActive: channel?.isActive ?? null,
    links: healthLinks(h),
  };
}
