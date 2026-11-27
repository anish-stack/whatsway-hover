/**
 * STOP / START keywords on the live WhatsApp webhook.
 * STOP → contact unsubscribed, queued marketing cancelled, drips stopped, confirmation sent.
 * START → subscribed again. Plain "cancel"/"end" are NOT opt-out words (appointment & store flows use them).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { contacts, messageQueue, type Channel } from "@shared/schema";
import { WhatsAppApiService } from "../whatsapp-api";
import { stopForPhone } from "./drip.service";

export const STOP_WORDS = ["stop", "stopall", "stop all", "unsubscribe", "optout", "opt out", "opt-out", "stop promotions", "band karo", "बंद करो", "बंद"];
export const START_WORDS = ["start", "unstop", "subscribe", "optin", "opt in", "opt-in", "resume promotions"];

export const normaliseKeyword = (t: string) => String(t || "").trim().toLowerCase().replace(/[.!?,]+$/g, "").replace(/\s+/g, " ");

/** Returns true when the message was an opt-out/opt-in keyword and has been handled. */
export async function handleOptKeyword(channel: Channel, phone: string, text: string): Promise<boolean> {
  const t = normaliseKeyword(text);
  const stop = STOP_WORDS.includes(t);
  const start = START_WORDS.includes(t);
  if (!stop && !start) return false;
  const [c] = await db.select().from(contacts).where(and(eq(contacts.channelId, channel.id), eq(contacts.phone, phone))).limit(1);
  if (!c) return false;
  const api = new WhatsAppApiService(channel);
  if (stop) {
    if (c.status !== "unsubscribed") {
      await db.update(contacts).set({ status: "unsubscribed", updatedAt: new Date() }).where(eq(contacts.id, c.id));
    }
    await db.update(messageQueue).set({ status: "failed", errorMessage: "Cancelled: contact unsubscribed" })
      .where(and(eq(messageQueue.channelId, channel.id), eq(messageQueue.recipientPhone, phone), eq(messageQueue.status, "queued"), eq(messageQueue.messageType, "marketing")));
    await db.execute(sql`UPDATE campaign_recipients SET status = 'failed', error_message = 'Skipped: contact unsubscribed', updated_at = now()
      WHERE phone = ${phone} AND status = 'pending' AND campaign_id IN (SELECT id FROM campaigns WHERE channel_id = ${channel.id})`).catch(() => {});
    await stopForPhone(channel.id, phone, "Contact opted out");
    await api.sendTextMessage(phone, "You're unsubscribed and won't get promotional messages from us. Reply START anytime to subscribe again.").catch(() => {});
    return true;
  }
  if (c.status === "unsubscribed") {
    await db.update(contacts).set({ status: "active", updatedAt: new Date() }).where(eq(contacts.id, c.id));
    await api.sendTextMessage(phone, "Welcome back! You're subscribed again ✅").catch(() => {});
    return true;
  }
  return false;
}
