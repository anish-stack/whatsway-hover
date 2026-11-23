/**
 * Reseller pricing & earnings math (pure — shared by server, client, tests).
 *
 * Money is handled in paise (integers) internally to avoid float drift,
 * and returned as rupee numbers rounded to 2 decimals.
 *
 * Models (never mixed on one sale):
 *  - wholesale          earning = selling − wholesale       (platform keeps wholesale)
 *  - commission_percent earning = selling × pct / 100       (platform keeps the rest)
 *  - fixed_commission   earning = fixed amount per cycle    (platform keeps the rest)
 */

export const PRICING_MODELS = ["wholesale", "commission_percent", "fixed_commission"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const RESELLER_STATUSES = ["pending_activation", "active", "inactive", "suspended", "archived"] as const;
export type ResellerStatus = (typeof RESELLER_STATUSES)[number];

export const PAYMENT_STATUSES = ["pending", "pending_verification", "paid", "failed", "refunded", "partially_refunded", "cancelled"] as const;
export type SalePaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ACTIVATION_POLICIES = ["on_payment", "immediate"] as const;
export const REFUND_POLICIES = ["proportional", "full", "none"] as const;
export type RefundPolicy = (typeof REFUND_POLICIES)[number];

/** Feature flags a super admin can toggle per reseller. */
export const RESELLER_PERMISSION_KEYS = {
  createCustomers: "Add customers",
  editCustomers: "Edit customer contact details",
  setSellingPrice: "Set own selling price (within min/max)",
  renewSubscriptions: "Create renewals",
  sendReminders: "Send renewal reminders",
  viewTransactions: "View invoices / transactions",
  suspendCustomers: "Activate / deactivate own customers",
} as const;
export type ResellerPermissionKey = keyof typeof RESELLER_PERMISSION_KEYS;

export const DEFAULT_RESELLER_PERMISSIONS: Record<ResellerPermissionKey, boolean> = {
  createCustomers: true,
  editCustomers: true,
  setSellingPrice: true,
  renewSubscriptions: true,
  sendReminders: true,
  viewTransactions: true,
  suspendCustomers: false,
};

export function resolvePermissions(stored: Record<string, boolean> | null | undefined) {
  const out = { ...DEFAULT_RESELLER_PERMISSIONS };
  for (const k of Object.keys(out) as ResellerPermissionKey[]) {
    if (stored && typeof stored[k] === "boolean") out[k] = stored[k];
  }
  return out;
}

export const toPaise = (n: number | string | null | undefined) => Math.round(Number(n ?? 0) * 100);
export const fromPaise = (p: number) => Math.round(p) / 100;
export const money = (n: number | string | null | undefined) => fromPaise(toPaise(n));

export interface PricingRowLike {
  id?: string | null;
  version?: number | null;
  pricingModel: string;
  wholesalePrice?: number | string | null;
  commissionPercent?: number | string | null;
  fixedCommission?: number | string | null;
  suggestedRetailPrice: number | string;
  minSellingPrice: number | string;
  maxSellingPrice?: number | string | null;
  currency?: string | null;
  planId?: string;
  billingCycle?: string;
  customerUserId?: string | null;
}

export class PricingError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
  }
}

/** Validate a pricing row as configured by super admin. Throws PricingError. */
export function validatePricingRow(r: PricingRowLike) {
  const model = r.pricingModel as PricingModel;
  if (!PRICING_MODELS.includes(model)) throw new PricingError("Unknown pricing model");
  const min = toPaise(r.minSellingPrice);
  const srp = toPaise(r.suggestedRetailPrice);
  const max = r.maxSellingPrice === null || r.maxSellingPrice === undefined || r.maxSellingPrice === "" ? null : toPaise(r.maxSellingPrice);
  if (min <= 0) throw new PricingError("Minimum selling price must be greater than 0");
  if (srp < min) throw new PricingError("Suggested retail price cannot be below the minimum selling price");
  if (max !== null && max < srp) throw new PricingError("Maximum selling price cannot be below the suggested retail price");
  if (model === "wholesale") {
    const w = toPaise(r.wholesalePrice);
    if (r.wholesalePrice === null || r.wholesalePrice === undefined || r.wholesalePrice === "" || w < 0) throw new PricingError("Wholesale price is required for the wholesale model");
    if (w > min) throw new PricingError("Minimum selling price must be at least the wholesale price (no negative margin)");
  } else if (model === "commission_percent") {
    const pct = Number(r.commissionPercent);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) throw new PricingError("Commission percent must be between 0 and 100");
  } else {
    const f = toPaise(r.fixedCommission);
    if (f <= 0) throw new PricingError("Fixed commission must be greater than 0");
    if (f > min) throw new PricingError("Fixed commission cannot exceed the minimum selling price");
  }
}

export interface SaleEconomics {
  pricingModel: PricingModel;
  cycles: number;
  unitSellingPrice: number;
  sellingPrice: number;
  wholesaleCost: number | null;
  commissionAmount: number | null;
  resellerEarning: number;
  platformRevenue: number;
  currency: string;
  snapshot: Record<string, unknown>;
}

/**
 * Economics for a sale at `unitSellingPrice` per cycle × `cycles`.
 * Enforces min/max; without `canSetPrice` the price must equal the SRP.
 */
export function computeSaleEconomics(
  row: PricingRowLike,
  unitSellingPrice: number | string | null | undefined,
  cycles = 1,
  opts: { canSetPrice?: boolean } = {},
): SaleEconomics {
  validatePricingRow(row);
  const n = Math.floor(Number(cycles));
  if (!Number.isFinite(n) || n < 1 || n > 36) throw new PricingError("Duration must be between 1 and 36 billing cycles");
  const srp = toPaise(row.suggestedRetailPrice);
  const unit = unitSellingPrice === null || unitSellingPrice === undefined || unitSellingPrice === "" ? srp : toPaise(unitSellingPrice);
  if (opts.canSetPrice === false && unit !== srp) throw new PricingError("Your account must sell at the suggested retail price");
  const min = toPaise(row.minSellingPrice);
  const max = row.maxSellingPrice === null || row.maxSellingPrice === undefined || row.maxSellingPrice === "" ? null : toPaise(row.maxSellingPrice);
  if (unit < min) throw new PricingError(`Selling price cannot be below the minimum of ${fromPaise(min).toFixed(2)}`);
  if (max !== null && unit > max) throw new PricingError(`Selling price cannot exceed the maximum of ${fromPaise(max).toFixed(2)}`);

  const total = unit * n;
  const model = row.pricingModel as PricingModel;
  let wholesale: number | null = null;
  let commission: number | null = null;
  let earning: number;
  if (model === "wholesale") {
    wholesale = toPaise(row.wholesalePrice) * n;
    earning = total - wholesale;
  } else if (model === "commission_percent") {
    commission = Math.round((total * Number(row.commissionPercent)) / 100);
    earning = commission;
  } else {
    commission = toPaise(row.fixedCommission) * n;
    earning = commission;
  }
  const platform = total - earning;
  return {
    pricingModel: model,
    cycles: n,
    unitSellingPrice: fromPaise(unit),
    sellingPrice: fromPaise(total),
    wholesaleCost: wholesale === null ? null : fromPaise(wholesale),
    commissionAmount: commission === null ? null : fromPaise(commission),
    resellerEarning: fromPaise(earning),
    platformRevenue: fromPaise(platform),
    currency: row.currency || "INR",
    snapshot: {
      pricingRowId: row.id ?? null,
      version: row.version ?? null,
      pricingModel: model,
      wholesalePrice: row.wholesalePrice === null || row.wholesalePrice === undefined ? null : money(row.wholesalePrice),
      commissionPercent: row.commissionPercent === null || row.commissionPercent === undefined ? null : Number(row.commissionPercent),
      fixedCommission: row.fixedCommission === null || row.fixedCommission === undefined ? null : money(row.fixedCommission),
      suggestedRetailPrice: money(row.suggestedRetailPrice),
      minSellingPrice: money(row.minSellingPrice),
      maxSellingPrice: row.maxSellingPrice === null || row.maxSellingPrice === undefined || row.maxSellingPrice === "" ? null : money(row.maxSellingPrice),
      currency: row.currency || "INR",
      customerOverride: !!row.customerUserId,
    },
  };
}

/** Margin to reverse for a refund of `refundAmount` on a sale. */
export function refundReversal(
  policy: RefundPolicy | string,
  sale: { sellingPrice: number | string; resellerEarning: number | string },
  refundAmount: number | string,
  alreadyRefunded: number | string = 0,
): number {
  const total = toPaise(sale.sellingPrice);
  const earning = toPaise(sale.resellerEarning);
  const prior = toPaise(alreadyRefunded);
  const refund = Math.min(toPaise(refundAmount), Math.max(0, total - prior));
  if (refund <= 0 || earning <= 0 || policy === "none") return 0;
  if (policy === "full") {
    // reverse entire earning once (on the first refund)
    return prior > 0 ? 0 : -fromPaise(earning);
  }
  // proportional; final refund reverses any remaining rounding
  const before = Math.round((earning * prior) / total);
  const after = prior + refund >= total ? earning : Math.round((earning * (prior + refund)) / total);
  return -fromPaise(after - before);
}

/** Add billing cycles to a date (month-end safe). */
export function addCycles(start: Date, cycle: BillingCycle | string, cycles: number): Date {
  const d = new Date(start.getTime());
  const months = (cycle === "annual" ? 12 : 1) * cycles;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Reseller code like "HCR-7K2Q9M" (no ambiguous chars). */
export function generateResellerCode(rand: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return `HCR-${s}`;
}

export interface LedgerRowLike {
  entryType: string;
  amount: number | string;
  availableAt: Date | string;
}

/** Balance summary. Gross margin ≠ withdrawable. No automatic payouts. */
export function ledgerBalances(rows: LedgerRowLike[], now = new Date()) {
  let earned = 0, reversed = 0, paidOut = 0, adjustments = 0, onHold = 0;
  for (const r of rows) {
    const a = toPaise(r.amount);
    if (r.entryType === "earning") {
      earned += a;
      if (new Date(r.availableAt).getTime() > now.getTime()) onHold += a;
    } else if (r.entryType === "reversal") reversed += a;
    else if (r.entryType === "payout") paidOut += a;
    else adjustments += a;
  }
  const grossMargin = earned + reversed;
  const withdrawable = Math.max(0, earned - onHold + reversed + adjustments + paidOut);
  return {
    grossMargin: fromPaise(grossMargin),
    earned: fromPaise(earned),
    reversed: fromPaise(reversed),
    adjustments: fromPaise(adjustments),
    paidOut: fromPaise(-paidOut),
    onHold: fromPaise(onHold),
    withdrawable: fromPaise(withdrawable),
  };
}
