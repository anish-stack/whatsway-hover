/**
 * Abandoned cart reminders for the WhatsApp Mini Store.
 * A cart with items that hasn't changed for `delayMinutes` (default 60) gets ONE reminder:
 *  - inside the 24 h window → cart summary with "View cart" / "Checkout" buttons (+ your text)
 *  - outside the window → your approved template ({{1}} name, {{2}} items, {{3}} total), if set
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, growthSettings, storeCarts, storeSettings, type CartRecoveryConfig } from "@shared/schema";
import { cartLines, money } from "../store/store.service";
import { fillVars, insideWindow, isOptedOut, sendInteractive, sendTemplate } from "./send";

export const DEFAULT_CART_TEXT = "Hi {{name}}, you left something in your cart 🛒\n\n{{items}}\n*Total: {{total}}*\n\nTap below to finish your order.";

export async function getGrowth(channelId: string) {
  const [row] = await db.select().from(growthSettings).where(eq(growthSettings.channelId, channelId)).limit(1);
  return row || null;
}

export async function saveCartRecovery(channelId: string, ownerId: string, cfg: CartRecoveryConfig) {
  const [row] = await db.insert(growthSettings).values({ channelId, ownerId, cartRecovery: cfg, updatedAt: new Date() })
    .onConflictDoUpdate({ target: growthSettings.channelId, set: { cartRecovery: cfg, updatedAt: new Date() } }).returning();
  return row;
}

export async function markRecovered(channelId: string) {
  await db.update(growthSettings).set({ cartRecovered: sql`${growthSettings.cartRecovered} + 1` } as any).where(eq(growthSettings.channelId, channelId));
}

export async function processAbandonedCarts(limit = 100): Promise<number> {
  const enabled = await db.select({ g: growthSettings, c: channels, s: storeSettings })
    .from(growthSettings)
    .innerJoin(channels, eq(channels.id, growthSettings.channelId))
    .innerJoin(storeSettings, eq(storeSettings.channelId, growthSettings.channelId))
    .where(sql`(${growthSettings.cartRecovery}->>'enabled')::boolean IS TRUE AND ${storeSettings.enabled}`);
  let sent = 0;
  for (const { g, c, s } of enabled) {
    const cfg = (g.cartRecovery || {}) as CartRecoveryConfig;
    const delay = Math.min(Math.max(Number(cfg.delayMinutes) || 60, 15), 7 * 24 * 60);
    // claim carts atomically
    const claimed = await db.execute(sql`
      UPDATE store_carts SET reminder_sent_at = now(), last_reminder_at = now()
      WHERE ctid IN (
        SELECT ctid FROM store_carts
        WHERE channel_id = ${c.id} AND reminder_sent_at IS NULL
          AND jsonb_array_length(items) > 0
          AND updated_at < now() - (${delay} || ' minutes')::interval
          AND updated_at > now() - interval '7 days'
        LIMIT ${limit} FOR UPDATE SKIP LOCKED
      )
      RETURNING phone, items`);
    for (const cart of ((claimed as any).rows || claimed) as Array<{ phone: string; items: any[] }>) {
      try {
        if (await isOptedOut(c.id, cart.phone)) continue;
        const { lines, subtotal } = await cartLines(c.id, cart.items || []);
        if (!lines.length) continue;
        const items = lines.map((l) => `${l.qty} × ${l.p.name}`).join("\n");
        const total = money(subtotal, s.currency);
        const [conv] = await db.execute(sql`SELECT contact_name FROM conversations WHERE channel_id = ${c.id} AND contact_phone = ${cart.phone} LIMIT 1`).then((r: any) => r.rows || r);
        const vars = { name: conv?.contact_name || "", items, total, phone: cart.phone };
        if (await insideWindow(c.id, cart.phone)) {
          const body = fillVars(cfg.text?.trim() || DEFAULT_CART_TEXT, vars).slice(0, 1024);
          await sendInteractive(c, cart.phone, {
            type: "interactive",
            interactive: {
              type: "button",
              body: { text: body },
              action: { buttons: [{ type: "reply", reply: { id: "st:checkout", title: "Checkout" } }, { type: "reply", reply: { id: "st:cart", title: "View cart" } }] },
            },
          }, "Abandoned cart reminder", "cart_recovery");
        } else if (cfg.templateName) {
          await sendTemplate(c, cart.phone, cfg.templateName, cfg.language, [vars.name || "there", items.replace(/\n/g, ", "), total], "cart_recovery");
        } else {
          continue; // can't message outside 24 h without a template
        }
        sent++;
        await db.update(growthSettings).set({ cartRemindersSent: sql`${growthSettings.cartRemindersSent} + 1` } as any).where(eq(growthSettings.channelId, c.id));
      } catch (e) {
        console.warn(`[CartRecovery] ${cart.phone} failed:`, (e as Error).message);
      }
    }
  }
  return sent;
}

export async function abandonedCartsList(channelId: string) {
  const rows = await db.select().from(storeCarts)
    .where(and(eq(storeCarts.channelId, channelId), sql`jsonb_array_length(${storeCarts.items}) > 0`))
    .orderBy(sql`${storeCarts.updatedAt} DESC`).limit(100);
  return rows;
}
