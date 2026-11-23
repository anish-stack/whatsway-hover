/**
 * Safety net for template approval status.
 *
 * Meta normally pushes approval/rejection through the
 * `message_template_status_update` webhook. If that field is not
 * subscribed (or a delivery is lost) templates stay "PENDING" in
 * HoverChat forever even after Meta approved them. Every 15 minutes this
 * polls Meta for templates still pending (created in the last 14 days)
 * and stores the real status, rejection reason and category
 * (Meta may re-categorise e.g. UTILITY → MARKETING).
 */
import cron from "node-cron";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../db";
import { channels, templates } from "@shared/schema";

const VERSION = () => process.env.WHATSAPP_API_VERSION || "v25.0";
const OPEN = ["PENDING", "IN_APPEAL", "PENDING_REVIEW"];

function mapStatus(s: string): string {
  const v = s.toUpperCase();
  if (v === "APPROVED" || v === "REINSTATED") return "APPROVED";
  if (v === "REJECTED") return "REJECTED";
  if (v === "PAUSED" || v === "FLAGGED") return "PAUSED";
  if (v === "DISABLED" || v === "PENDING_DELETION" || v === "DELETED") return "DISABLED";
  return "PENDING";
}

export async function pollPendingTemplates(limit = 50) {
  const rows = await db
    .select({ id: templates.id, waId: templates.whatsappTemplateId, status: templates.status, category: templates.category, token: channels.accessToken })
    .from(templates)
    .innerJoin(channels, eq(channels.id, templates.channelId))
    .where(and(
      isNotNull(templates.whatsappTemplateId),
      inArray(sql`upper(${templates.status})`, OPEN),
      gt(templates.createdAt, sql`now() - interval '14 days'`),
    ))
    .limit(limit);

  let updated = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`https://graph.facebook.com/${VERSION()}/${r.waId}?fields=status,rejected_reason,category`, {
        headers: { Authorization: `Bearer ${r.token}` },
      });
      const data: any = await res.json();
      if (!res.ok || !data?.status) continue;
      const status = mapStatus(String(data.status));
      const patch: Record<string, any> = {};
      if (status !== String(r.status).toUpperCase()) patch.status = status;
      if (status === "REJECTED" && data.rejected_reason && data.rejected_reason !== "NONE") patch.rejectionReason = String(data.rejected_reason);
      if (data.category && String(data.category).toUpperCase() !== String(r.category).toUpperCase()) patch.category = String(data.category).toUpperCase();
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(templates).set(patch).where(eq(templates.id, r.id));
        updated++;
      }
    } catch (e) {
      console.warn("[TemplatePoller]", r.waId, (e as Error).message);
    }
  }
  return { checked: rows.length, updated };
}

export function startTemplateStatusPoller() {
  cron.schedule("*/15 * * * *", () => {
    pollPendingTemplates()
      .then((r) => r.updated && console.log(`[TemplatePoller] updated ${r.updated}/${r.checked} pending template(s)`))
      .catch((e) => console.error("[TemplatePoller]", e));
  });
}
