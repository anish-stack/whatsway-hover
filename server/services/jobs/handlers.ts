/** Job handlers for the background queue (see ./queue.ts). Imported lazily. */
import { defineJob } from "./queue";

defineJob("email.notification", async ({ mailOptions }) => {
  const { deliverNotificationEmail } = await import("../notification.service");
  return deliverNotificationEmail(mailOptions);
});

defineJob("email.system", async ({ mailOptions }) => {
  const { deliverSystemEmail } = await import("../email.service");
  return deliverSystemEmail(mailOptions);
});

/** Automatic platform WhatsApp message (customer / reseller onboarding). */
defineJob("whatsapp.platform", async ({ event, customerUserId, resellerId, extra }) => {
  const svc = await import("../platform-whatsapp.service");
  const ctx = customerUserId ? await svc.customerContext(customerUserId, extra || {}) : await svc.resellerContext(resellerId, extra || {});
  return svc.sendPlatformMessage(event, ctx, { trigger: "auto" });
});
