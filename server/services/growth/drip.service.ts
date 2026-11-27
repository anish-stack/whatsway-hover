/**
 * Drip / follow-up sequences: Day 1 → Day 3 → Day 7 messages.
 * Start: manually (pick contacts), a keyword, a WhatsApp Flow submit, or a new contact.
 * Each step waits `delayMinutes` after the previous one. Stops on reply (optional),
 * on STOP/opt-out, or when the steps run out.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { channels, contacts, dripEnrollments, dripSequences, type DripSequence, type DripStep } from "@shared/schema";
import { fillVars, insideWindow, isOptedOut, sendTemplate, sendText } from "./send";

const MIN = 60_000;

function firstRunAt(seq: DripSequence, from = Date.now()) {
  const steps = (seq.steps || []) as DripStep[];
  return new Date(from + Math.max(0, Number(steps[0]?.delayMinutes || 0)) * MIN);
}

export async function enroll(seq: DripSequence, people: Array<{ phone: string; name?: string | null; contactId?: string | null }>, source = "manual") {
  if (!seq.isActive || !(seq.steps as DripStep[])?.length) return { added: 0, skipped: people.length };
  let added = 0;
  for (const p of people) {
    const phone = String(p.phone || "").replace(/\D/g, "");
    if (!phone) continue;
    if (await isOptedOut(seq.channelId, phone)) continue;
    const r = await db.insert(dripEnrollments).values({
      sequenceId: seq.id, channelId: seq.channelId, contactId: p.contactId || null, phone, name: p.name || null,
      stepIndex: 0, nextRunAt: firstRunAt(seq), status: "active", source,
    }).onConflictDoNothing().returning({ id: dripEnrollments.id });
    if (r.length) added++;
  }
  return { added, skipped: people.length - added };
}

export async function enrollContacts(seq: DripSequence, contactIds: string[]) {
  if (!contactIds.length) return { added: 0, skipped: 0 };
  const rows = await db.select().from(contacts).where(and(eq(contacts.channelId, seq.channelId), inArray(contacts.id, contactIds)));
  return enroll(seq, rows.map((c) => ({ phone: c.phone, name: c.name, contactId: c.id })), "manual");
}

async function activeSequences(channelId: string, trigger: string) {
  return db.select().from(dripSequences)
    .where(and(eq(dripSequences.channelId, channelId), eq(dripSequences.trigger, trigger), eq(dripSequences.isActive, true)));
}

/** Called for every incoming WhatsApp message (from the webhook). */
export async function onIncomingMessage(m: { channelId: string; phone: string; name?: string | null; contactId?: string | null; text?: string | null; isNewContact?: boolean }) {
  // 1. a reply stops sequences that ask for it
  await db.execute(sql`
    UPDATE drip_enrollments e SET status = 'stopped', stop_reason = 'Customer replied', updated_at = now()
    FROM drip_sequences s
    WHERE e.sequence_id = s.id AND s.stop_on_reply = true AND e.status = 'active'
      AND e.channel_id = ${m.channelId} AND e.phone = ${m.phone} AND e.step_index > 0`);

  // 2. keyword / new-contact starts
  const text = String(m.text || "").trim().toLowerCase();
  if (text) {
    for (const seq of await activeSequences(m.channelId, "keyword")) {
      const kws = String(seq.triggerValue || "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
      if (kws.some((k) => text === k || (k.length > 3 && text.includes(k)))) await enroll(seq, [m], "keyword");
    }
  }
  if (m.isNewContact) {
    for (const seq of await activeSequences(m.channelId, "new_contact")) await enroll(seq, [m], "new_contact");
  }
}

/** Called when a WhatsApp Flow form is submitted. metaFlowId parsed from the flow token when available. */
export async function onFlowSubmit(m: { channelId: string; phone: string; name?: string | null; contactId?: string | null; metaFlowId?: string | null }) {
  for (const seq of await activeSequences(m.channelId, "flow_submit")) {
    const want = String(seq.triggerValue || "").trim();
    if (!want || (m.metaFlowId && want === m.metaFlowId)) await enroll(seq, [m], "flow_submit");
  }
}

export async function stopForPhone(channelId: string, phone: string, reason: string) {
  await db.update(dripEnrollments).set({ status: "stopped", stopReason: reason, updatedAt: new Date() })
    .where(and(eq(dripEnrollments.channelId, channelId), eq(dripEnrollments.phone, phone), eq(dripEnrollments.status, "active")));
}

/** Runs due steps (cron, every minute). Returns how many messages were sent. */
export async function processDueDrips(limit = 200): Promise<number> {
  // claim rows so two instances never send the same step
  const due = await db.execute(sql`
    UPDATE drip_enrollments SET locked_at = now()
    WHERE id IN (
      SELECT id FROM drip_enrollments
      WHERE status = 'active' AND next_run_at <= now() AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
      ORDER BY next_run_at LIMIT ${limit} FOR UPDATE SKIP LOCKED
    ) RETURNING id`);
  const ids = ((due as any).rows || due).map((r: any) => r.id);
  if (!ids.length) return 0;
  const rows = await db.select({ e: dripEnrollments, s: dripSequences, c: channels })
    .from(dripEnrollments)
    .innerJoin(dripSequences, eq(dripSequences.id, dripEnrollments.sequenceId))
    .innerJoin(channels, eq(channels.id, dripEnrollments.channelId))
    .where(inArray(dripEnrollments.id, ids))
    .orderBy(asc(dripEnrollments.nextRunAt));

  let sent = 0;
  for (const { e, s, c } of rows) {
    const steps = (s.steps || []) as DripStep[];
    const done = (patch: Partial<typeof dripEnrollments.$inferInsert>) =>
      db.update(dripEnrollments).set({ ...patch, lockedAt: null, updatedAt: new Date() } as any).where(eq(dripEnrollments.id, e.id));
    if (!s.isActive) { await done({ status: "stopped", stopReason: "Sequence paused" }); continue; }
    const step = steps[e.stepIndex];
    if (!step) { await done({ status: "completed" }); continue; }
    if (await isOptedOut(e.channelId, e.phone)) { await done({ status: "stopped", stopReason: "Contact opted out" }); continue; }
    try {
      const vars = { name: e.name, phone: e.phone };
      if (step.kind === "template" && step.templateName) {
        await sendTemplate(c, e.phone, step.templateName, step.language, (step.params || []).map((p) => fillVars(p, vars)), "drip");
      } else {
        if (!(await insideWindow(e.channelId, e.phone))) {
          throw new Error("Outside the 24-hour window — use an approved template for this step");
        }
        await sendText(c, e.phone, fillVars(step.text || "", vars), "drip");
      }
      sent++;
      const next = steps[e.stepIndex + 1];
      if (next) await done({ stepIndex: e.stepIndex + 1, nextRunAt: new Date(Date.now() + Math.max(1, Number(next.delayMinutes || 0)) * MIN), lastError: null });
      else await done({ stepIndex: e.stepIndex + 1, status: "completed", lastError: null });
    } catch (err) {
      const msg = (err as Error).message || "Send failed";
      // skip this step, keep going with the next one
      const next = steps[e.stepIndex + 1];
      if (next) await done({ stepIndex: e.stepIndex + 1, nextRunAt: new Date(Date.now() + Math.max(1, Number(next.delayMinutes || 0)) * MIN), lastError: `Step ${e.stepIndex + 1}: ${msg}`.slice(0, 500) });
      else await done({ status: "failed", lastError: `Step ${e.stepIndex + 1}: ${msg}`.slice(0, 500) });
    }
  }
  return sent;
}

export async function sequenceStats(sequenceIds: string[]) {
  if (!sequenceIds.length) return {} as Record<string, Record<string, number>>;
  const rows = await db.select({ id: dripEnrollments.sequenceId, status: dripEnrollments.status, n: sql<number>`count(*)::int` })
    .from(dripEnrollments).where(inArray(dripEnrollments.sequenceId, sequenceIds))
    .groupBy(dripEnrollments.sequenceId, dripEnrollments.status);
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.id] ||= {})[r.status] = Number(r.n);
  return out;
}


