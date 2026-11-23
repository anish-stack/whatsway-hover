/**
 * Meta rate card storage + cached lookup.
 * Rates are configuration, never constants. Historical usage keeps the
 * rate it was priced at (see usage-tracker), so editing a row only
 * affects messages delivered after the change.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { metaRateCards, type MetaRateCard } from "@shared/schema";
import {
  META_CATEGORIES,
  OTHER_COUNTRY,
  countryName,
  pickRate,
  type MetaCategory,
  type RateCardRow,
} from "@shared/meta-billing";

const CACHE_TTL_MS = 60_000;
let cache: { rows: RateCardRow[]; at: number } | null = null;

export function invalidateRateCache() {
  cache = null;
}

function toRow(r: MetaRateCard): RateCardRow {
  return {
    id: r.id,
    countryCode: r.countryCode,
    countryName: r.countryName,
    category: r.category,
    rate: Number(r.rate),
    currency: r.currency,
    freeMonthlyAllowance: r.freeMonthlyAllowance,
    volumeTiers: (r.volumeTiers as any) ?? null,
    effectiveFrom: r.effectiveFrom,
    effectiveTo: r.effectiveTo,
    isActive: r.isActive,
    pricingVersion: r.pricingVersion,
    pricingSource: r.pricingSource,
  };
}

/** All active rows (small table, cached 60s). */
export async function getActiveRates(): Promise<RateCardRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await db.select().from(metaRateCards).where(eq(metaRateCards.isActive, true));
  cache = { rows: rows.map(toRow), at: Date.now() };
  return cache.rows;
}

export async function findApplicableRate(
  country: string,
  category: MetaCategory,
  at: Date,
): Promise<RateCardRow | null> {
  return pickRate(await getActiveRates(), country || OTHER_COUNTRY, category, at);
}

// ── Admin CRUD ───────────────────────────────────────────────

const tierSchema = z.object({
  fromVolume: z.coerce.number().int().min(1),
  rate: z.coerce.number().min(0),
});

export const rateCardInputSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .transform((v) => (v === "*" ? v : v.toUpperCase())),
    countryName: z.string().trim().max(120).optional().nullable(),
    category: z.enum(META_CATEGORIES),
    rate: z.coerce.number().min(0).max(100000),
    currency: z.string().trim().min(3).max(8).transform((v) => v.toUpperCase()).default("INR"),
    freeMonthlyAllowance: z.coerce.number().int().min(0).optional().nullable(),
    volumeTiers: z.array(tierSchema).max(20).optional().nullable(),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional().nullable(),
    isActive: z.boolean().optional().default(true),
    pricingSource: z.string().trim().max(500).optional().nullable(),
    pricingVersion: z.string().trim().max(64).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => !v.effectiveTo || v.effectiveTo > v.effectiveFrom, {
    message: "effectiveTo must be after effectiveFrom",
    path: ["effectiveTo"],
  })
  .refine((v) => !v.volumeTiers?.length || v.category === "utility" || v.category === "authentication" || v.category === "authentication_international", {
    message: "Volume tiers apply to utility and authentication only",
    path: ["volumeTiers"],
  });

export type RateCardInput = z.infer<typeof rateCardInputSchema>;

/** Overlapping active windows for the same country+category make pricing ambiguous. */
async function assertNoOverlap(input: RateCardInput, excludeId?: string) {
  if (input.isActive === false) return;
  const from = input.effectiveFrom;
  const rows = await db
    .select({ id: metaRateCards.id, from: metaRateCards.effectiveFrom, to: metaRateCards.effectiveTo })
    .from(metaRateCards)
    .where(
      and(
        eq(metaRateCards.countryCode, input.countryCode),
        eq(metaRateCards.category, input.category),
        eq(metaRateCards.isActive, true),
        sql`${metaRateCards.effectiveFrom} = ${from}`,
      ),
    );
  const clash = rows.find((r) => r.id !== excludeId);
  if (clash) {
    const err: any = new Error(
      "An active rate for this country and category already starts at the same effective date. Change the date or deactivate the other row.",
    );
    err.status = 409;
    throw err;
  }
}

export async function listRateCards(filter: { countryCode?: string; category?: string; includeInactive?: boolean }) {
  const conds = [] as any[];
  if (filter.countryCode) conds.push(eq(metaRateCards.countryCode, filter.countryCode.toUpperCase()));
  if (filter.category) conds.push(eq(metaRateCards.category, filter.category));
  if (!filter.includeInactive) conds.push(eq(metaRateCards.isActive, true));
  return db
    .select()
    .from(metaRateCards)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(metaRateCards.countryCode), asc(metaRateCards.category), desc(metaRateCards.effectiveFrom));
}

export async function createRateCard(input: RateCardInput, userId: string) {
  await assertNoOverlap(input);
  const [row] = await db
    .insert(metaRateCards)
    .values({
      ...input,
      countryName: input.countryName || countryName(input.countryCode),
      rate: String(input.rate),
      volumeTiers: input.volumeTiers ?? null,
      createdBy: userId,
    })
    .returning();
  invalidateRateCache();
  return row;
}

/**
 * Updating a rate that has already priced messages does NOT reprice them:
 * each usage row stores applied_rate + pricing_version at delivery time.
 */
export async function updateRateCard(id: string, input: RateCardInput) {
  await assertNoOverlap(input, id);
  const [row] = await db
    .update(metaRateCards)
    .set({
      ...input,
      countryName: input.countryName || countryName(input.countryCode),
      rate: String(input.rate),
      volumeTiers: input.volumeTiers ?? null,
      updatedAt: new Date(),
    })
    .where(eq(metaRateCards.id, id))
    .returning();
  invalidateRateCache();
  return row ?? null;
}

export async function setRateCardActive(id: string, isActive: boolean) {
  const [row] = await db
    .update(metaRateCards)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(metaRateCards.id, id))
    .returning();
  invalidateRateCache();
  return row ?? null;
}
