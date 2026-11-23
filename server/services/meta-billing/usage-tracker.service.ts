/**
 * Meta message usage tracker.
 *
 * Fed ONLY by Meta status webhooks (sent / delivered / read / failed).
 * A successful send API call is never counted as delivered.
 *
 * Idempotency: one row per Meta message id (unique index). Every webhook
 * retry maps onto the same row; all values are absolute (no counters),
 * so replaying an event can never double count. Cost is fixed the first
 * time the message is seen as delivered, using the rate that was valid at
 * that delivery instant — later rate-card edits never reprice history.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  messageQueue,
  messages,
  templates,
  whatsappMessageUsage,
  type Channel,
} from "@shared/schema";
import {
  countryFromPhone,
  decidePricing,
  round6,
  shouldAdvanceStatus,
  type MetaPricingObject,
} from "@shared/meta-billing";
import { findApplicableRate } from "./rate-card.service";

const TRACKED = new Set(["sent", "delivered", "read", "failed"]);

export interface MetaStatusUpdate {
  id: string;
  status: string;
  timestamp?: string | number;
  recipient_id?: string;
  pricing?: MetaPricingObject;
  errors?: { code?: number | string }[];
}

interface MessageContext {
  campaignId: string | null;
  templateId: string | null;
  templateName: string | null;
  templateCategory: string | null;
  isTemplate: boolean;
}

async function loadContext(channel: Channel, wamid: string): Promise<MessageContext> {
  const ctx: MessageContext = { campaignId: null, templateId: null, templateName: null, templateCategory: null, isTemplate: false };

  const [q] = await db
    .select({ campaignId: messageQueue.campaignId, templateName: messageQueue.templateName })
    .from(messageQueue)
    .where(eq(messageQueue.whatsappMessageId, wamid))
    .limit(1);
  if (q) {
    ctx.campaignId = q.campaignId ?? null;
    ctx.templateName = q.templateName ?? null;
    ctx.isTemplate = !!q.templateName;
  }

  if (!ctx.campaignId || !ctx.isTemplate) {
    const [m] = await db
      .select({ campaignId: messages.campaignId, type: messages.type, messageType: messages.messageType, metadata: messages.metadata })
      .from(messages)
      .where(eq(messages.whatsappMessageId, wamid))
      .limit(1);
    if (m) {
      ctx.campaignId = ctx.campaignId ?? m.campaignId ?? null;
      if (m.type === "template" || m.messageType === "template") ctx.isTemplate = true;
      const meta = (m.metadata ?? {}) as Record<string, any>;
      if (!ctx.templateName && typeof meta.templateName === "string") ctx.templateName = meta.templateName;
    }
  }

  if (ctx.templateName) {
    const [t] = await db
      .select({ id: templates.id, category: templates.category })
      .from(templates)
      .where(and(eq(templates.channelId, channel.id), eq(templates.name, ctx.templateName)))
      .limit(1);
    if (t) {
      ctx.templateId = t.id;
      ctx.templateCategory = t.category;
    }
  }
  return ctx;
}

function eventDate(ts: string | number | undefined): Date {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

async function priceFor(country: string, category: string, deliveredAt: Date) {
  const rate = await findApplicableRate(country, category as any, deliveredAt);
  if (!rate) return { rateCardId: null, appliedRate: null, estimatedCost: "0", currency: null, pricingVersion: null };
  const r = Number(rate.rate);
  return {
    rateCardId: rate.id,
    appliedRate: String(r),
    estimatedCost: String(round6(r)),
    currency: rate.currency,
    pricingVersion: rate.pricingVersion ?? null,
  };
}

/**
 * Record / advance usage for one status update. Never throws into the
 * webhook path — callers wrap it, but it is also defensive internally.
 */
export async function recordStatusUsage(channel: Channel, update: MetaStatusUpdate): Promise<"inserted" | "updated" | "skipped"> {
  const wamid = update?.id;
  const status = String(update?.status || "").toLowerCase();
  if (!wamid || !TRACKED.has(status) || !channel?.createdBy) return "skipped";

  const at = eventDate(update.timestamp);
  const errCode = update.errors?.[0]?.code !== undefined ? String(update.errors[0].code) : null;
  const isDeliveredish = status === "delivered" || status === "read";

  const [existing] = await db
    .select()
    .from(whatsappMessageUsage)
    .where(eq(whatsappMessageUsage.messageId, wamid))
    .limit(1);

  if (!existing) {
    const ctx = await loadContext(channel, wamid);
    const fallbackCategory = ctx.templateCategory ?? (ctx.isTemplate ? null : "service");
    const decision = decidePricing(update.pricing, fallbackCategory);
    const country = countryFromPhone(update.recipient_id);
    const deliveredAt = isDeliveredish ? at : null;
    const price =
      deliveredAt && decision.billable
        ? await priceFor(country.iso, decision.category, deliveredAt)
        : { rateCardId: null, appliedRate: null, estimatedCost: "0", currency: null, pricingVersion: null };

    const inserted = await db
      .insert(whatsappMessageUsage)
      .values({
        customerId: channel.createdBy,
        channelId: channel.id,
        wabaId: channel.whatsappBusinessAccountId ?? null,
        phoneNumberId: channel.phoneNumberId,
        messageId: wamid,
        recipientCountry: country.iso,
        recipientDialCode: country.dialCode,
        category: decision.category,
        pricingType: decision.pricingType,
        pricingModel: decision.pricingModel,
        billable: decision.billable,
        status,
        sentAt: status === "sent" ? at : null,
        deliveredAt,
        readAt: status === "read" ? at : null,
        failedAt: status === "failed" ? at : null,
        errorCode: status === "failed" ? errCode : null,
        campaignId: ctx.campaignId,
        templateId: ctx.templateId,
        templateName: ctx.templateName,
        ...price,
        // Bucket by Meta's event time of the first status seen (≈ send time),
        // not by when our server processed the webhook.
        createdAt: at,
      })
      .onConflictDoNothing({ target: whatsappMessageUsage.messageId })
      .returning({ id: whatsappMessageUsage.id });
    if (inserted.length > 0) return "inserted";
    // Lost a race with a concurrent delivery of the same webhook — apply as update.
    return recordStatusUsage(channel, update);
  }

  const patch: Record<string, any> = {};
  if (shouldAdvanceStatus(existing.status, status)) patch.status = status;

  if (status === "sent" && !existing.sentAt) patch.sentAt = at;
  if (isDeliveredish && !existing.deliveredAt) patch.deliveredAt = at;
  if (status === "read" && !existing.readAt) patch.readAt = at;
  if (status === "failed" && !existing.failedAt && !existing.deliveredAt) {
    patch.failedAt = at;
    patch.errorCode = errCode;
  }

  // Pricing info can arrive on a later status than the first one we saw.
  let billable = existing.billable;
  let category = existing.category;
  if (update.pricing && (existing.pricingType === "unknown" || !existing.pricingType)) {
    const d = decidePricing(update.pricing, existing.category);
    patch.category = category = d.category;
    patch.billable = billable = d.billable;
    patch.pricingType = d.pricingType;
    patch.pricingModel = d.pricingModel;
  }

  const deliveredAt: Date | null = existing.deliveredAt ?? patch.deliveredAt ?? null;
  const needsPricing = billable && deliveredAt && !existing.rateCardId && !existing.appliedRate;
  if (needsPricing) Object.assign(patch, await priceFor(existing.recipientCountry || "*", category, deliveredAt!));

  if (Object.keys(patch).length === 0) return "skipped";
  patch.updatedAt = new Date();

  // Guard pricing against concurrent writers: only the first one sets it.
  const where = needsPricing
    ? and(eq(whatsappMessageUsage.id, existing.id), isNull(whatsappMessageUsage.rateCardId))
    : eq(whatsappMessageUsage.id, existing.id);
  const res = await db.update(whatsappMessageUsage).set(patch).where(where).returning({ id: whatsappMessageUsage.id });
  if (res.length === 0 && needsPricing) {
    // Someone priced it first — still apply status/timestamps without pricing fields.
    const { rateCardId, appliedRate, estimatedCost, currency, pricingVersion, ...rest } = patch;
    void rateCardId; void appliedRate; void estimatedCost; void currency; void pricingVersion;
    if (Object.keys(rest).length > 1) await db.update(whatsappMessageUsage).set(rest).where(eq(whatsappMessageUsage.id, existing.id));
  }
  return "updated";
}

/** Safe wrapper for the webhook path: usage tracking must never break messaging. */
export async function trackStatusUsageSafe(channel: Channel, update: MetaStatusUpdate): Promise<void> {
  try {
    await recordStatusUsage(channel, update);
  } catch (err) {
    console.error(`[UsageTracker] failed for ${update?.id} (${update?.status}):`, (err as Error)?.message || err);
  }
}
