/**
 * Super-admin reseller account management: create/invite, edit, status,
 * archive/delete, password reset, customer ownership transfer.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { resellerCustomers, resellerProfiles, resellerSales, subscriptions, transactions, users, type ResellerProfile } from "@shared/schema";
import {
  ACTIVATION_POLICIES,
  DEFAULT_RESELLER_PERMISSIONS,
  generateResellerCode,
  PRICING_MODELS,
  REFUND_POLICIES,
  RESELLER_PERMISSION_KEYS,
} from "@shared/reseller-pricing";
import { audit, emailLayout, escapeHtml, HttpError, lockedPassword, notifyUsers, type Actor } from "./common";
import { issueToken, sendInviteEmail } from "./invitations.service";
import { pricingInputSchema, upsertPricing } from "./pricing.service";

const permsSchema = z.object(
  Object.fromEntries(Object.keys(RESELLER_PERMISSION_KEYS).map((k) => [k, z.boolean().optional()])) as Record<string, z.ZodOptional<z.ZodBoolean>>,
).partial();

const baseProfile = {
  businessName: z.string().trim().min(2).max(160),
  contactPerson: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  mobile: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid mobile number"),
  companyName: z.string().trim().max(160).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  maxCustomers: z.coerce.number().int().min(1).max(100000),
  defaultPricingModel: z.enum(PRICING_MODELS).default("wholesale"),
  activationPolicy: z.enum(ACTIVATION_POLICIES).default("on_payment"),
  refundPolicy: z.enum(REFUND_POLICIES).default("proportional"),
  payoutHoldDays: z.coerce.number().int().min(0).max(120).default(7),
  permissions: permsSchema.optional(),
  validUntil: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
};

export const createResellerSchema = z.object({
  ...baseProfile,
  pricing: z.array(pricingInputSchema).max(20).optional().default([]),
  sendInvite: z.boolean().optional().default(true),
});
export const updateResellerSchema = z.object(baseProfile).partial();

async function uniqueCode(tx: Pick<typeof db, "select">) {
  for (let i = 0; i < 25; i++) {
    const code = generateResellerCode();
    const [hit] = await tx.select({ id: resellerProfiles.id }).from(resellerProfiles).where(eq(resellerProfiles.resellerCode, code));
    if (!hit) return code;
  }
  throw new HttpError(500, "Could not generate a unique reseller code");
}

export async function getProfile(id: string) {
  const [p] = await db.select().from(resellerProfiles).where(eq(resellerProfiles.id, id));
  if (!p) throw new HttpError(404, "Reseller not found");
  return p;
}

export async function createReseller(input: z.infer<typeof createResellerSchema>, actor: Actor) {
  const { profile, token } = await db.transaction(async (tx) => {
    const [exists] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${input.email} OR lower(${users.username}) = ${input.email}`);
    if (exists) throw new HttpError(409, "A user with this email already exists");
    const [u] = await tx.insert(users).values({
      username: input.email, email: input.email, password: lockedPassword(), firstName: input.contactPerson,
      role: "reseller", status: "active", permissions: [], isEmailVerified: false,
    }).returning({ id: users.id });
    const [profile] = await tx.insert(resellerProfiles).values({
      userId: u.id, resellerCode: await uniqueCode(tx), businessName: input.businessName, contactPerson: input.contactPerson,
      email: input.email, mobile: input.mobile, companyName: input.companyName ?? null, address: input.address ?? null,
      status: "pending_activation", maxCustomers: input.maxCustomers, defaultPricingModel: input.defaultPricingModel,
      activationPolicy: input.activationPolicy, refundPolicy: input.refundPolicy, payoutHoldDays: input.payoutHoldDays,
      permissions: { ...DEFAULT_RESELLER_PERMISSIONS, ...(input.permissions ?? {}) } as Record<string, boolean>,
      validUntil: input.validUntil ?? null, notes: input.notes ?? null, createdBy: actor.id,
    }).returning();
    await audit(tx, { resellerId: profile.id, actor, action: "reseller.created", entityType: "reseller", entityId: profile.id, after: profile });
    const token = input.sendInvite ? await issueToken(tx, u.id, "reseller_invite", actor.id) : null;
    return { profile, token };
  });
  for (const p of input.pricing) await upsertPricing(profile.id, p, actor);
  const inviteUrl = token ? await sendInviteEmail({ to: profile.email, name: profile.contactPerson, token, purpose: "reseller_invite" }) : null;
  try {
    const { enqueue } = await import("../jobs/queue");
    await enqueue("whatsapp.platform", { event: "reseller_onboarded", resellerId: profile.id, extra: inviteUrl ? { activation_link: inviteUrl } : {} }, { jobId: `onboard-reseller-${profile.id}`, attempts: 3, delayMs: 3000 });
  } catch (e) { console.warn("[Reseller] WhatsApp welcome not queued:", (e as Error).message); }
  return { profile, inviteUrl };
}

export async function updateReseller(id: string, patch: z.infer<typeof updateResellerSchema>, actor: Actor) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, id)).for("update");
    if (!before) throw new HttpError(404, "Reseller not found");
    if (patch.email && patch.email !== before.email) {
      const [clash] = await tx.select({ id: users.id }).from(users).where(and(sql`lower(${users.email}) = ${patch.email}`, sql`${users.id} <> ${before.userId}`));
      if (clash) throw new HttpError(409, "Email already in use");
      await tx.update(users).set({ email: patch.email, username: patch.email, updatedAt: new Date() }).where(eq(users.id, before.userId));
    }
    if (patch.maxCustomers !== undefined) {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, id));
      if (patch.maxCustomers < n) throw new HttpError(409, `Limit cannot be below current customers (${n})`);
    }
    const next: Partial<ResellerProfile> = { ...patch, updatedAt: new Date() } as any;
    if (patch.permissions) next.permissions = { ...(before.permissions as any), ...patch.permissions };
    if (patch.contactPerson) await tx.update(users).set({ firstName: patch.contactPerson }).where(eq(users.id, before.userId));
    const [after] = await tx.update(resellerProfiles).set(next).where(eq(resellerProfiles.id, id)).returning();
    await audit(tx, { resellerId: id, actor, action: "reseller.updated", entityType: "reseller", entityId: id, before, after });
    return after;
  });
}

const STATUS_TO_USER: Record<string, string> = { active: "active", inactive: "inactive", suspended: "inactive", archived: "inactive" };

/**
 * active ↔ inactive/suspended. Suspension blocks reseller login and all
 * reseller APIs immediately (middleware re-checks DB on every request).
 * Platform policy: the reseller's customers keep full access to HoverChat.
 */
export async function setStatus(id: string, status: "active" | "inactive" | "suspended", reason: string | null, actor: Actor) {
  const res = await db.transaction(async (tx) => {
    const [before] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, id)).for("update");
    if (!before) throw new HttpError(404, "Reseller not found");
    if (before.status === "archived") throw new HttpError(409, "Archived resellers cannot be reactivated");
    if (status === "active" && before.status === "pending_activation") throw new HttpError(409, "Reseller has not accepted the invitation yet. Resend the invite.");
    const [after] = await tx.update(resellerProfiles).set({ status, suspendedReason: status === "suspended" ? reason : null, updatedAt: new Date() }).where(eq(resellerProfiles.id, id)).returning();
    await tx.update(users).set({ status: STATUS_TO_USER[status], updatedAt: new Date() }).where(eq(users.id, before.userId));
    await audit(tx, { resellerId: id, actor, action: `reseller.${status}`, entityType: "reseller", entityId: id, before: { status: before.status }, after: { status, reason } });
    return after;
  });
  const msg = status === "active" ? "Your HoverChat reseller account is active." : `Your HoverChat reseller account is ${status}.${reason ? ` Reason: ${reason}` : ""}`;
  await notifyUsers([res.userId], {
    type: "reseller_status", title: `Reseller account ${status}`, message: msg,
    email: { subject: `HoverChat reseller account ${status}`, html: emailLayout(`Reseller account ${status}`, `<p>${escapeHtml(msg)}</p><p>Your customers' HoverChat accounts are not affected.</p>`) },
  });
  return res;
}

/** Soft delete. Customers stay linked (and keep access); super admin can transfer them. */
export async function archiveReseller(id: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, id)).for("update");
    if (!before) throw new HttpError(404, "Reseller not found");
    const [after] = await tx.update(resellerProfiles).set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() }).where(eq(resellerProfiles.id, id)).returning();
    await tx.update(users).set({ status: "inactive", updatedAt: new Date() }).where(eq(users.id, before.userId));
    await audit(tx, { resellerId: id, actor, action: "reseller.archived", entityType: "reseller", entityId: id, before: { status: before.status } });
    return after;
  });
}

/** Hard delete only when there is no financial or customer history. */
export async function deleteReseller(id: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const p = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, id)).for("update");
    if (!p[0]) throw new HttpError(404, "Reseller not found");
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, id));
    const [{ s }] = await tx.select({ s: sql<number>`count(*)::int` }).from(resellerSales).where(eq(resellerSales.resellerId, id));
    if (c > 0 || s > 0) throw new HttpError(409, "Reseller has customers or sales history. Archive instead of deleting.");
    await audit(tx, { resellerId: null, actor, action: "reseller.deleted", entityType: "reseller", entityId: id, before: p[0] });
    await tx.delete(resellerProfiles).where(eq(resellerProfiles.id, id));
    await tx.delete(users).where(eq(users.id, p[0].userId));
    return { deleted: true };
  });
}

export async function sendPasswordReset(id: string, actor: Actor) {
  const p = await getProfile(id);
  const token = await issueToken(db, p.userId, p.status === "pending_activation" ? "reseller_invite" : "password_reset", actor.id);
  const url = await sendInviteEmail({ to: p.email, name: p.contactPerson, token, purpose: p.status === "pending_activation" ? "reseller_invite" : "password_reset" });
  await audit(db, { resellerId: id, actor, action: p.status === "pending_activation" ? "reseller.invite_resent" : "reseller.password_reset_sent", entityType: "reseller", entityId: id });
  return { link: url };
}

/**
 * Ownership transfer (super admin only). Past sales/earnings stay with the
 * original reseller; open unpaid invoices of the old reseller are cancelled.
 * toResellerId = null detaches (customer becomes direct).
 */
export async function transferCustomer(customerUserId: string, toResellerId: string | null, reason: string, actor: Actor) {
  if (!reason?.trim()) throw new HttpError(400, "Transfer reason is required");
  return db.transaction(async (tx) => {
    const [cust] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, customerUserId));
    if (!cust || cust.role !== "admin") throw new HttpError(404, "Customer not found");
    const [map] = await tx.select().from(resellerCustomers).where(eq(resellerCustomers.customerUserId, customerUserId)).for("update");
    if (toResellerId) {
      const [target] = await tx.select().from(resellerProfiles).where(eq(resellerProfiles.id, toResellerId)).for("update");
      if (!target) throw new HttpError(404, "Target reseller not found");
      if (target.status !== "active") throw new HttpError(409, "Target reseller is not active");
      if (map?.resellerId === toResellerId) throw new HttpError(409, "Customer already belongs to this reseller");
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(resellerCustomers).where(eq(resellerCustomers.resellerId, toResellerId));
      if (n >= target.maxCustomers) throw new HttpError(409, "Target reseller has reached its customer limit");
    }
    // cancel open invoices of the previous owner
    if (map) {
      const open = await tx.select().from(resellerSales).where(and(eq(resellerSales.customerUserId, customerUserId), inArray(resellerSales.paymentStatus, ["pending", "pending_verification"])));
      for (const s of open) {
        await tx.update(resellerSales).set({ paymentStatus: "cancelled", cancelledAt: new Date(), payTokenHash: null, notes: `${s.notes ?? ""}\n[transfer] cancelled on ownership transfer`.trim(), updatedAt: new Date() }).where(eq(resellerSales.id, s.id));
        if (s.transactionId) await tx.update(transactions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(transactions.id, s.transactionId));
        if (s.saleType === "new" && s.subscriptionId) await tx.update(subscriptions).set({ status: "cancelled", updatedAt: new Date() }).where(and(eq(subscriptions.id, s.subscriptionId), eq(subscriptions.status, "pending")));
      }
    }
    let after: any = null;
    if (!toResellerId) {
      if (map) await tx.delete(resellerCustomers).where(eq(resellerCustomers.id, map.id));
    } else if (map) {
      [after] = await tx.update(resellerCustomers).set({ resellerId: toResellerId, previousResellerId: map.resellerId, source: "transfer", attributedAt: new Date(), updatedAt: new Date() }).where(eq(resellerCustomers.id, map.id)).returning();
    } else {
      [after] = await tx.insert(resellerCustomers).values({ resellerId: toResellerId, customerUserId, source: "admin_attached" }).returning();
    }
    const details = { customerUserId, from: map?.resellerId ?? null, to: toResellerId, reason };
    if (map?.resellerId) await audit(tx, { resellerId: map.resellerId, actor, action: "customer.transferred_out", entityType: "customer", entityId: customerUserId, before: map, after: details });
    if (toResellerId) await audit(tx, { resellerId: toResellerId, actor, action: "customer.transferred_in", entityType: "customer", entityId: customerUserId, before: map ?? null, after: details });
    return after ?? { detached: true };
  });
}
