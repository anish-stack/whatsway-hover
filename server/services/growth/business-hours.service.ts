/** Business hours + away message (WhatsApp has no "hours" field in the API, so we keep them here). */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import type { BusinessHoursConfig, Channel } from "@shared/schema";
import { getGrowth } from "./cart-recovery.service";
import { sendText } from "./send";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Local weekday + minutes since midnight in a time zone. */
export function localTime(tz: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || "Asia/Kolkata", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const day = get("weekday").toLowerCase().slice(0, 3) as (typeof DAY_KEYS)[number];
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMin = (s: string) => { const [h, m] = String(s || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export function isOpen(cfg: BusinessHoursConfig, now = new Date()) {
  if (!cfg?.enabled) return true;
  const { day, minutes } = localTime(cfg.timezone || "Asia/Kolkata", now);
  const slots = cfg.days?.[day] || [];
  return slots.some(([a, b]) => {
    const s = toMin(a), e = toMin(b);
    return e > s ? minutes >= s && minutes < e : minutes >= s || minutes < e; // overnight slot
  });
}

export const DEFAULT_AWAY = "Thanks for your message! 🙏 We're closed right now and will reply as soon as we're back.";

/** Sends the away message when closed (once per cooldown per number). Returns true when sent. */
export async function maybeSendAway(channel: Channel, phone: string): Promise<boolean> {
  const g = await getGrowth(channel.id);
  const cfg = (g as any)?.businessHours as BusinessHoursConfig | undefined;
  if (!cfg?.enabled || isOpen(cfg)) return false;
  const hours = Math.min(Math.max(Number(cfg.cooldownHours) || 12, 1), 72);
  const claimed = await db.execute(sql`
    INSERT INTO away_message_log (channel_id, phone, sent_at) VALUES (${channel.id}, ${phone}, now())
    ON CONFLICT (channel_id, phone) DO UPDATE SET sent_at = now()
      WHERE away_message_log.sent_at < now() - (${hours} || ' hours')::interval
    RETURNING phone`);
  if (!((claimed as any).rows || claimed).length) return false;
  await sendText(channel, phone, (cfg.awayMessage || DEFAULT_AWAY).slice(0, 4096), "away_message");
  return true;
}
