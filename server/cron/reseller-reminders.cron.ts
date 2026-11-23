/**
 * Daily reseller lifecycle notifications (leader instance only):
 *  - renewal approaching (≤7 days) → customer email + reseller in-app
 *  - subscription expired          → customer email + reseller in-app
 * Each notice is sent once per sale period (timestamps on reseller_sales).
 */
import cron from "node-cron";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { resellerProfiles, resellerSales, subscriptions, users } from "@shared/schema";
import { emailLayout, escapeHtml, notifyUsers } from "../services/reseller/common";

const PAID = ["paid", "partially_refunded"];

export async function runResellerReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 7 * 86400_000);
  let reminders = 0, expiries = 0;

  // latest paid sale per customer whose period ends within 7 days
  const dueSoon = await db.select({ sale: resellerSales, resellerUserId: resellerProfiles.userId, resellerName: resellerProfiles.businessName, email: users.email, firstName: users.firstName })
    .from(resellerSales)
    .innerJoin(resellerProfiles, eq(resellerProfiles.id, resellerSales.resellerId))
    .innerJoin(users, eq(users.id, resellerSales.customerUserId))
    .innerJoin(subscriptions, eq(subscriptions.id, resellerSales.subscriptionId))
    .where(and(
      inArray(resellerSales.paymentStatus, PAID), isNull(resellerSales.renewalReminderSentAt),
      sql`${resellerSales.periodEnd} > ${now} AND ${resellerSales.periodEnd} <= ${soon}`,
      eq(subscriptions.status, "active"),
      sql`${subscriptions.endDate} = ${resellerSales.periodEnd}`,
    ));
  for (const r of dueSoon) {
    const claimed = await db.update(resellerSales).set({ renewalReminderSentAt: now }).where(and(eq(resellerSales.id, r.sale.id), isNull(resellerSales.renewalReminderSentAt))).returning({ id: resellerSales.id });
    if (!claimed.length) continue;
    const end = new Date(r.sale.periodEnd).toDateString();
    await notifyUsers([r.sale.customerUserId], {
      type: "subscription_expiry_reminder", title: "Subscription renews soon", message: `${r.sale.planName} ends on ${end}.`,
      email: { subject: "Your HoverChat subscription ends soon", html: emailLayout("Renewal reminder", `<p>Hello ${escapeHtml(r.firstName || "there")},</p><p>Your ${escapeHtml(r.sale.planName)} subscription ends on <strong>${end}</strong>. Contact ${escapeHtml(r.resellerName)} to renew.</p>`) },
    });
    await notifyUsers([r.resellerUserId], { type: "reseller_renewal_due", title: "Customer renewal due", message: `${r.email}: ${r.sale.planName} ends ${end}.` });
    reminders++;
  }

  const expired = await db.select({ sale: resellerSales, resellerUserId: resellerProfiles.userId, resellerName: resellerProfiles.businessName, email: users.email, firstName: users.firstName })
    .from(resellerSales)
    .innerJoin(resellerProfiles, eq(resellerProfiles.id, resellerSales.resellerId))
    .innerJoin(users, eq(users.id, resellerSales.customerUserId))
    .innerJoin(subscriptions, eq(subscriptions.id, resellerSales.subscriptionId))
    .where(and(
      inArray(resellerSales.paymentStatus, PAID), isNull(resellerSales.expiryNoticeSentAt),
      sql`${resellerSales.periodEnd} <= ${now} AND ${resellerSales.periodEnd} > ${new Date(now.getTime() - 30 * 86400_000)}`,
      sql`${subscriptions.endDate} = ${resellerSales.periodEnd}`,
    ));
  for (const r of expired) {
    const claimed = await db.update(resellerSales).set({ expiryNoticeSentAt: now }).where(and(eq(resellerSales.id, r.sale.id), isNull(resellerSales.expiryNoticeSentAt))).returning({ id: resellerSales.id });
    if (!claimed.length) continue;
    await notifyUsers([r.sale.customerUserId], {
      type: "subscription_expired", title: "Subscription expired", message: `${r.sale.planName} has expired.`,
      email: { subject: "Your HoverChat subscription has expired", html: emailLayout("Subscription expired", `<p>Hello ${escapeHtml(r.firstName || "there")},</p><p>Your ${escapeHtml(r.sale.planName)} subscription has expired. Contact ${escapeHtml(r.resellerName)} to renew. Your WhatsApp Business Account and data stay connected.</p>`) },
    });
    await notifyUsers([r.resellerUserId], { type: "reseller_subscription_expired", title: "Customer subscription expired", message: `${r.email}: ${r.sale.planName} expired.` });
    expiries++;
  }
  return { reminders, expiries };
}

export function startResellerRemindersCron() {
  // 09:15 IST daily
  cron.schedule("15 9 * * *", () => {
    runResellerReminders().then((r) => console.log(`[ResellerReminders] sent ${r.reminders} reminders, ${r.expiries} expiry notices`))
      .catch((e) => console.error("[ResellerReminders]", e));
  }, { timezone: "Asia/Kolkata" });
}
