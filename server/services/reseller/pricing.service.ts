/**
 * Reseller plan pricing — configured by super admin only. Every change
 * deactivates the old row and inserts a new version (history kept), and
 * is audited. Sales freeze the row they used in pricing_snapshot, so
 * existing subscriptions keep their agreed price.
 */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { plans, resellerPlanPricing, type ResellerPlanPricing } from "@shared/schema";
import { BILLING_CYCLES, PRICING_MODELS, validatePricingRow } from "@shared/reseller-pricing";
import { audit, HttpError, type Actor } from "./common";

const num = z.union([z.number(), z.string().trim()]).transform((v) => (v === "" ? null : Number(v))).nullable().optional();

export const pricingInputSchema = z.object({
  planId: z.string().min(1).max(64),
  billingCycle: z.enum(BILLING_CYCLES),
  customerUserId: z.string().max(64).nullable().optional(),
  pricingModel: z.enum(PRICING_MODELS),
  wholesalePrice: num,
  commissionPercent: num,
  fixedCommission: num,
  suggestedRetailPrice: z.coerce.number().positive(),
  minSellingPrice: z.coerce.number().positive(),
  maxSellingPrice: num,
  currency: z.string().trim().length(3).transform((v) => v.toUpperCase()).default("INR"),
});
export type PricingInput = z.infer<typeof pricingInputSchema>;

const s = (v: number | null | undefined) => (v === null || v === undefined ? null : String(v));

export async function listPricing(resellerId: string, includeHistory = false) {
  const rows = await db
    .select({ p: resellerPlanPricing, planName: plans.name })
    .from(resellerPlanPricing)
    .leftJoin(plans, eq(plans.id, resellerPlanPricing.planId))
    .where(includeHistory ? eq(resellerPlanPricing.resellerId, resellerId) : and(eq(resellerPlanPricing.resellerId, resellerId), eq(resellerPlanPricing.isActive, true)))
    .orderBy(desc(resellerPlanPricing.isActive), resellerPlanPricing.planId, resellerPlanPricing.billingCycle, desc(resellerPlanPricing.version));
  return rows.map((r) => ({ ...r.p, planName: r.planName }));
}

/** Upsert = new version; previous active row for the same key is retired. */
export async function upsertPricing(resellerId: string, input: PricingInput, actor: Actor) {
  validatePricingRow(input as any);
  const [plan] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, input.planId));
  if (!plan) throw new HttpError(404, "Plan not found");
  return db.transaction(async (tx) => {
    const keyCond = and(
      eq(resellerPlanPricing.resellerId, resellerId),
      eq(resellerPlanPricing.planId, input.planId),
      eq(resellerPlanPricing.billingCycle, input.billingCycle),
      input.customerUserId ? eq(resellerPlanPricing.customerUserId, input.customerUserId) : isNull(resellerPlanPricing.customerUserId),
    );
    const [prev] = await tx.select().from(resellerPlanPricing).where(and(keyCond, eq(resellerPlanPricing.isActive, true))).for("update");
    const [{ maxV }] = await tx.select({ maxV: sql<number>`coalesce(max(${resellerPlanPricing.version}),0)::int` }).from(resellerPlanPricing).where(keyCond);
    if (prev) await tx.update(resellerPlanPricing).set({ isActive: false, updatedAt: new Date() }).where(eq(resellerPlanPricing.id, prev.id));
    const [row] = await tx
      .insert(resellerPlanPricing)
      .values({
        resellerId,
        planId: input.planId,
        billingCycle: input.billingCycle,
        customerUserId: input.customerUserId || null,
        pricingModel: input.pricingModel,
        wholesalePrice: input.pricingModel === "wholesale" ? s(input.wholesalePrice) : null,
        commissionPercent: input.pricingModel === "commission_percent" ? s(input.commissionPercent) : null,
        fixedCommission: input.pricingModel === "fixed_commission" ? s(input.fixedCommission) : null,
        suggestedRetailPrice: String(input.suggestedRetailPrice),
        minSellingPrice: String(input.minSellingPrice),
        maxSellingPrice: s(input.maxSellingPrice),
        currency: input.currency,
        version: maxV + 1,
        updatedBy: actor.id,
      })
      .returning();
    await audit(tx, { resellerId, actor, action: prev ? "pricing.updated" : "pricing.created", entityType: "pricing", entityId: row.id, before: prev ?? null, after: row });
    return row;
  });
}

export async function deactivatePricing(resellerId: string, pricingId: string, actor: Actor) {
  const [row] = await db
    .update(resellerPlanPricing)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(resellerPlanPricing.id, pricingId), eq(resellerPlanPricing.resellerId, resellerId), eq(resellerPlanPricing.isActive, true)))
    .returning();
  if (!row) throw new HttpError(404, "Active pricing row not found");
  await audit(db, { resellerId, actor, action: "pricing.deactivated", entityType: "pricing", entityId: row.id, before: row });
  return row;
}

/** Applicable row: customer override first, then reseller default. */
export async function findApplicablePricing(
  exec: Pick<typeof db, "select">,
  resellerId: string,
  planId: string,
  billingCycle: string,
  customerUserId?: string | null,
): Promise<ResellerPlanPricing | null> {
  if (customerUserId) {
    const [o] = await exec.select().from(resellerPlanPricing).where(and(
      eq(resellerPlanPricing.resellerId, resellerId), eq(resellerPlanPricing.planId, planId),
      eq(resellerPlanPricing.billingCycle, billingCycle), eq(resellerPlanPricing.customerUserId, customerUserId),
      eq(resellerPlanPricing.isActive, true)));
    if (o) return o;
  }
  const [d] = await exec.select().from(resellerPlanPricing).where(and(
    eq(resellerPlanPricing.resellerId, resellerId), eq(resellerPlanPricing.planId, planId),
    eq(resellerPlanPricing.billingCycle, billingCycle), isNull(resellerPlanPricing.customerUserId),
    eq(resellerPlanPricing.isActive, true)));
  return d ?? null;
}

/** Reseller-facing catalog: authorised plans with their price bounds (no other resellers' data). */
export async function resellerCatalog(resellerId: string) {
  const rows = await db
    .select({ p: resellerPlanPricing, planName: plans.name, planDescription: plans.description })
    .from(resellerPlanPricing)
    .innerJoin(plans, eq(plans.id, resellerPlanPricing.planId))
    .where(and(eq(resellerPlanPricing.resellerId, resellerId), eq(resellerPlanPricing.isActive, true), isNull(resellerPlanPricing.customerUserId)));
  return rows.map(({ p, planName, planDescription }) => ({
    pricingId: p.id, planId: p.planId, planName, planDescription, billingCycle: p.billingCycle,
    pricingModel: p.pricingModel,
    wholesalePrice: p.wholesalePrice === null ? null : Number(p.wholesalePrice),
    commissionPercent: p.commissionPercent === null ? null : Number(p.commissionPercent),
    fixedCommission: p.fixedCommission === null ? null : Number(p.fixedCommission),
    suggestedRetailPrice: Number(p.suggestedRetailPrice), minSellingPrice: Number(p.minSellingPrice),
    maxSellingPrice: p.maxSellingPrice === null ? null : Number(p.maxSellingPrice), currency: p.currency, version: p.version,
  }));
}
