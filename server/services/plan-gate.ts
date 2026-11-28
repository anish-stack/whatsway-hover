/** Plan limits for Instagram / Facebook / Ads features. Superadmin is never limited. */
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { checkSubscriptionAllowance, type AllowanceResult, type SubscriptionFeature } from "../middlewares/requireSubscription";

export class PlanLimitError extends Error {
  status = 403;
  code: string;
  constructor(public result: AllowanceResult) { super(result.error || "Not included in your plan"); this.code = result.code || "PLAN_LIMIT"; }
}

async function isSuperadmin(userId: string) {
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.role === "superadmin";
}

/** Allowance for the account owner (team members use their owner's plan). */
export async function allowanceFor(ownerId: string, feature: SubscriptionFeature): Promise<AllowanceResult> {
  if (await isSuperadmin(ownerId)) return { allowed: true, limit: "unlimited" };
  return checkSubscriptionAllowance(ownerId, feature);
}

export async function assertPlan(ownerId: string, feature: SubscriptionFeature): Promise<AllowanceResult> {
  const r = await allowanceFor(ownerId, feature);
  if (!r.allowed) throw new PlanLimitError(r);
  return r;
}

export const ownerOf = (req: Request) => {
  const u = (req.session as any)?.user;
  return u?.role === "team" && u.createdBy ? u.createdBy : u?.id;
};

/** How many more of a counted feature (Infinity = unlimited, 0 = none). */
export async function remaining(ownerId: string, feature: SubscriptionFeature): Promise<number> {
  const r = await allowanceFor(ownerId, feature);
  if (r.limit === "unlimited") return Infinity;
  if (!r.allowed) return 0;
  return Math.max(0, Number(r.limit) - Number(r.used || 0));
}
