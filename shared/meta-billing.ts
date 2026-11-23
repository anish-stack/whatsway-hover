/**
 * ============================================================
 *  © 2026 Hover Business Services LLP
 *  Meta WhatsApp usage, pricing and account-health helpers.
 *
 *  Pure functions only (no DB / network) so the same logic is used by
 *  the webhook usage tracker, the analytics APIs, the cost calculator
 *  and the unit tests.
 *
 *  BUSINESS RULE: HoverChat never collects Meta messaging charges.
 *  Everything computed here is an ESTIMATE of what Meta will bill the
 *  customer directly. Final amounts are on the customer's Meta invoice.
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────

export const META_CATEGORIES = [
  "marketing",
  "utility",
  "authentication",
  "authentication_international",
  "service",
] as const;
export type MetaCategory = (typeof META_CATEGORIES)[number];

/** The four categories shown on dashboards (auth-international rolls into authentication). */
export const DASHBOARD_CATEGORIES = ["marketing", "utility", "authentication", "service"] as const;
export type DashboardCategory = (typeof DASHBOARD_CATEGORIES)[number];

export const ESTIMATE_DISCLAIMER =
  "Estimated Meta usage cost – Actual charges are determined by Meta.";
export const META_DIRECT_BILLING_NOTICE =
  "WhatsApp messaging charges are billed directly by Meta to your WhatsApp Business Account. HoverChat does not collect these charges.";
export const TAX_DISCLAIMER =
  "Estimates exclude taxes (e.g. 18% GST in India) and any invoice-level adjustments Meta applies.";

/**
 * Normalise a category string coming from Meta webhooks, template rows or
 * user input. Unknown values return null.
 */
export function normalizeCategory(raw: unknown): MetaCategory | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  switch (v) {
    case "marketing":
    case "marketing_lite": // MM Lite API — billed at marketing rate
    case "promotional":
      return "marketing";
    case "utility":
    case "transactional":
      return "utility";
    case "authentication":
    case "otp":
      return "authentication";
    case "authentication_international":
    case "authentication-international":
      return "authentication_international";
    case "service":
    case "user_initiated":
    case "referral_conversion":
      return "service";
    default:
      return null;
  }
}

/** Collapse to the 4 dashboard buckets. */
export function dashboardCategory(c: MetaCategory | string | null | undefined): DashboardCategory {
  const n = normalizeCategory(c ?? "") ?? "service";
  return n === "authentication_international" ? "authentication" : n;
}

// ─────────────────────────────────────────────────────────────
// Recipient country from phone number (E.164 without "+")
// ─────────────────────────────────────────────────────────────

/**
 * Calling code → ISO-3166 alpha-2. Covers the markets Meta prices
 * individually plus the most common ones in each pricing region.
 * Anything not listed resolves to "*" (the "Other" rate-card row).
 * Longest prefix wins, so "1" (US) never shadows a longer code.
 */
export const DIAL_CODE_TO_ISO: Record<string, { iso: string; name: string }> = {
  "1": { iso: "US", name: "United States / Canada" },
  "7": { iso: "RU", name: "Russia / Kazakhstan" },
  "20": { iso: "EG", name: "Egypt" },
  "27": { iso: "ZA", name: "South Africa" },
  "30": { iso: "GR", name: "Greece" },
  "31": { iso: "NL", name: "Netherlands" },
  "32": { iso: "BE", name: "Belgium" },
  "33": { iso: "FR", name: "France" },
  "34": { iso: "ES", name: "Spain" },
  "36": { iso: "HU", name: "Hungary" },
  "39": { iso: "IT", name: "Italy" },
  "40": { iso: "RO", name: "Romania" },
  "41": { iso: "CH", name: "Switzerland" },
  "43": { iso: "AT", name: "Austria" },
  "44": { iso: "GB", name: "United Kingdom" },
  "45": { iso: "DK", name: "Denmark" },
  "46": { iso: "SE", name: "Sweden" },
  "47": { iso: "NO", name: "Norway" },
  "48": { iso: "PL", name: "Poland" },
  "49": { iso: "DE", name: "Germany" },
  "51": { iso: "PE", name: "Peru" },
  "52": { iso: "MX", name: "Mexico" },
  "54": { iso: "AR", name: "Argentina" },
  "55": { iso: "BR", name: "Brazil" },
  "56": { iso: "CL", name: "Chile" },
  "57": { iso: "CO", name: "Colombia" },
  "60": { iso: "MY", name: "Malaysia" },
  "61": { iso: "AU", name: "Australia" },
  "62": { iso: "ID", name: "Indonesia" },
  "63": { iso: "PH", name: "Philippines" },
  "64": { iso: "NZ", name: "New Zealand" },
  "65": { iso: "SG", name: "Singapore" },
  "66": { iso: "TH", name: "Thailand" },
  "81": { iso: "JP", name: "Japan" },
  "82": { iso: "KR", name: "South Korea" },
  "84": { iso: "VN", name: "Vietnam" },
  "86": { iso: "CN", name: "China" },
  "90": { iso: "TR", name: "Turkey" },
  "91": { iso: "IN", name: "India" },
  "92": { iso: "PK", name: "Pakistan" },
  "93": { iso: "AF", name: "Afghanistan" },
  "94": { iso: "LK", name: "Sri Lanka" },
  "95": { iso: "MM", name: "Myanmar" },
  "98": { iso: "IR", name: "Iran" },
  "212": { iso: "MA", name: "Morocco" },
  "213": { iso: "DZ", name: "Algeria" },
  "216": { iso: "TN", name: "Tunisia" },
  "234": { iso: "NG", name: "Nigeria" },
  "233": { iso: "GH", name: "Ghana" },
  "254": { iso: "KE", name: "Kenya" },
  "255": { iso: "TZ", name: "Tanzania" },
  "256": { iso: "UG", name: "Uganda" },
  "351": { iso: "PT", name: "Portugal" },
  "353": { iso: "IE", name: "Ireland" },
  "358": { iso: "FI", name: "Finland" },
  "380": { iso: "UA", name: "Ukraine" },
  "420": { iso: "CZ", name: "Czech Republic" },
  "880": { iso: "BD", name: "Bangladesh" },
  "852": { iso: "HK", name: "Hong Kong" },
  "886": { iso: "TW", name: "Taiwan" },
  "960": { iso: "MV", name: "Maldives" },
  "961": { iso: "LB", name: "Lebanon" },
  "962": { iso: "JO", name: "Jordan" },
  "964": { iso: "IQ", name: "Iraq" },
  "965": { iso: "KW", name: "Kuwait" },
  "966": { iso: "SA", name: "Saudi Arabia" },
  "968": { iso: "OM", name: "Oman" },
  "971": { iso: "AE", name: "United Arab Emirates" },
  "972": { iso: "IL", name: "Israel" },
  "973": { iso: "BH", name: "Bahrain" },
  "974": { iso: "QA", name: "Qatar" },
  "975": { iso: "BT", name: "Bhutan" },
  "977": { iso: "NP", name: "Nepal" },
};

export const OTHER_COUNTRY = "*";

const DIAL_CODES_DESC = Object.keys(DIAL_CODE_TO_ISO).sort((a, b) => b.length - a.length);

export function countryFromPhone(phone: string | null | undefined): {
  iso: string;
  dialCode: string | null;
  name: string;
} {
  const digits = String(phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return { iso: OTHER_COUNTRY, dialCode: null, name: "Other" };
  for (const code of DIAL_CODES_DESC) {
    if (digits.startsWith(code)) {
      const hit = DIAL_CODE_TO_ISO[code];
      return { iso: hit.iso, dialCode: code, name: hit.name };
    }
  }
  return { iso: OTHER_COUNTRY, dialCode: null, name: "Other" };
}

export function countryName(iso: string | null | undefined): string {
  if (!iso || iso === OTHER_COUNTRY) return "Other";
  for (const v of Object.values(DIAL_CODE_TO_ISO)) if (v.iso === iso) return v.name;
  return iso;
}

/** Distinct ISO list for dropdowns. */
export const KNOWN_COUNTRIES: { iso: string; name: string }[] = Array.from(
  new Map(Object.values(DIAL_CODE_TO_ISO).map((v) => [v.iso, v])).values(),
).sort((a, b) => a.name.localeCompare(b.name));

// ─────────────────────────────────────────────────────────────
// Rate card
// ─────────────────────────────────────────────────────────────

export interface VolumeTier {
  /** Monthly billable volume (inclusive) from which this rate applies. */
  fromVolume: number;
  rate: number;
}

export interface RateCardRow {
  id: string;
  countryCode: string;
  countryName?: string | null;
  category: string;
  rate: number | string;
  currency: string;
  freeMonthlyAllowance?: number | null;
  volumeTiers?: VolumeTier[] | null;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
  isActive?: boolean | null;
  pricingVersion?: string | null;
  pricingSource?: string | null;
}

function toTime(d: Date | string | null | undefined): number | null {
  if (d === null || d === undefined || d === "") return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Choose the rate row valid for `country` + `category` at instant `at`.
 * Preference: exact country over "*" (Other), then most recent effectiveFrom.
 * authentication_international falls back to authentication when no
 * specific row exists.
 */
export function pickRate(
  rows: RateCardRow[],
  country: string,
  category: MetaCategory,
  at: Date | string = new Date(),
): RateCardRow | null {
  const atMs = toTime(at) ?? Date.now();
  const valid = (r: RateCardRow, cat: string) => {
    if (r.isActive === false) return false;
    if (r.category !== cat) return false;
    const from = toTime(r.effectiveFrom);
    const to = toTime(r.effectiveTo);
    if (from === null || from > atMs) return false;
    if (to !== null && to <= atMs) return false;
    return true;
  };
  const best = (cat: string) => {
    const pool = rows.filter((r) => valid(r, cat) && (r.countryCode === country || r.countryCode === OTHER_COUNTRY));
    pool.sort((a, b) => {
      const exact = Number(b.countryCode === country) - Number(a.countryCode === country);
      if (exact !== 0) return exact;
      return (toTime(b.effectiveFrom) ?? 0) - (toTime(a.effectiveFrom) ?? 0);
    });
    return pool[0] ?? null;
  };
  const hit = best(category);
  if (hit) return hit;
  if (category === "authentication_international") return best("authentication");
  return null;
}

/** Rate for a given monthly volume after Meta volume tiers (utility/auth only). */
export function tieredRate(baseRate: number, tiers: VolumeTier[] | null | undefined, monthlyVolume: number): number {
  if (!tiers || tiers.length === 0) return baseRate;
  const sorted = [...tiers].sort((a, b) => a.fromVolume - b.fromVolume);
  let rate = baseRate;
  for (const t of sorted) if (monthlyVolume >= t.fromVolume) rate = Number(t.rate);
  return rate;
}

/**
 * Cost of `count` messages where tiers apply marginally (each message
 * priced at the tier the running monthly total has reached).
 */
export function marginalTieredCost(
  baseRate: number,
  tiers: VolumeTier[] | null | undefined,
  count: number,
): number {
  if (count <= 0) return 0;
  if (!tiers || tiers.length === 0) return round6(baseRate * count);
  const bands = [{ fromVolume: 0, rate: baseRate }, ...tiers]
    .map((t) => ({ fromVolume: Number(t.fromVolume), rate: Number(t.rate) }))
    .sort((a, b) => a.fromVolume - b.fromVolume);
  let total = 0;
  for (let i = 0; i < bands.length; i++) {
    const start = bands[i].fromVolume;
    const end = i + 1 < bands.length ? bands[i + 1].fromVolume : Infinity;
    if (count <= start) break;
    const inBand = Math.min(count, end) - start;
    total += inBand * bands[i].rate;
  }
  return round6(total);
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Usage pricing decision for one Meta status webhook
// ─────────────────────────────────────────────────────────────

export interface MetaPricingObject {
  billable?: boolean;
  pricing_model?: string;
  category?: string;
  type?: string;
}

export interface UsagePricingDecision {
  category: MetaCategory;
  billable: boolean;
  pricingType: string;
  pricingModel: string | null;
}

/**
 * Meta is the source of truth for billability: the `pricing` object on
 * status webhooks says whether the message is billable (free customer
 * service window, free entry point and in-window utility templates come
 * through as billable:false). When Meta omits pricing we never invent a
 * charge — the message is recorded as non-billable with pricingType
 * "unknown".
 */
export function decidePricing(
  pricing: MetaPricingObject | null | undefined,
  fallbackCategory: string | null | undefined,
): UsagePricingDecision {
  if (pricing && typeof pricing === "object") {
    const cat = normalizeCategory(pricing.category) ?? normalizeCategory(fallbackCategory) ?? "service";
    return {
      category: cat,
      billable: pricing.billable === true,
      pricingType: String(pricing.type || (pricing.billable ? "regular" : "free")),
      pricingModel: pricing.pricing_model ? String(pricing.pricing_model) : null,
    };
  }
  return {
    category: normalizeCategory(fallbackCategory) ?? "service",
    billable: false,
    pricingType: "unknown",
    pricingModel: null,
  };
}

export const STATUS_RANK: Record<string, number> = { failed: 0, sent: 1, delivered: 2, read: 3 };

/** Whether an incoming status should overwrite the stored one. */
export function shouldAdvanceStatus(current: string | null | undefined, incoming: string): boolean {
  if (!current) return true;
  if (incoming === "failed") return current === "sent"; // never mark delivered/read as failed
  if (current === "failed") return incoming === "delivered" || incoming === "read"; // late "sent" must not undo a failure
  return (STATUS_RANK[incoming] ?? -1) > (STATUS_RANK[current] ?? -1);
}

// ─────────────────────────────────────────────────────────────
// Cost calculator
// ─────────────────────────────────────────────────────────────

export interface CalculatorInput {
  country: string;
  counts: Partial<Record<DashboardCategory, number>>;
  /** Number of business phone numbers (scales service free allowance). */
  phoneNumbers?: number;
  at?: Date;
}

export interface CalculatorLine {
  category: DashboardCategory;
  count: number;
  freeAllowance: number;
  billableCount: number;
  baseRate: number | null;
  effectiveRate: number | null;
  cost: number;
  volumeDiscountApplied: boolean;
  rateCardId: string | null;
  pricingVersion: string | null;
  note?: string;
}

export interface CalculatorResult {
  country: string;
  countryName: string;
  currency: string | null;
  lines: CalculatorLine[];
  total: number;
  disclaimer: string;
  taxDisclaimer: string;
  mixedCurrencies: boolean;
}

export function calculateEstimate(rows: RateCardRow[], input: CalculatorInput): CalculatorResult {
  const at = input.at ?? new Date();
  const phones = Math.max(1, Math.floor(input.phoneNumbers ?? 1));
  const lines: CalculatorLine[] = [];
  const currencies = new Set<string>();
  for (const cat of DASHBOARD_CATEGORIES) {
    const count = Math.max(0, Math.floor(Number(input.counts[cat] ?? 0)));
    const row = pickRate(rows, input.country, cat, at);
    if (!row) {
      lines.push({
        category: cat, count, freeAllowance: 0, billableCount: count,
        baseRate: null, effectiveRate: null, cost: 0, volumeDiscountApplied: false,
        rateCardId: null, pricingVersion: null,
        note: count > 0 ? "No active rate configured for this country/category." : undefined,
      });
      continue;
    }
    currencies.add(row.currency);
    const free = cat === "service" ? Math.max(0, Number(row.freeMonthlyAllowance ?? 0)) * phones : 0;
    const billableCount = Math.max(0, count - free);
    const base = Number(row.rate);
    const tiers = cat === "utility" || cat === "authentication" ? row.volumeTiers ?? null : null;
    const cost = marginalTieredCost(base, tiers, billableCount);
    const effective = billableCount > 0 ? round6(cost / billableCount) : base;
    lines.push({
      category: cat, count, freeAllowance: free, billableCount,
      baseRate: base, effectiveRate: effective, cost: round2(cost),
      volumeDiscountApplied: !!tiers && tiers.length > 0 && effective < base,
      rateCardId: row.id, pricingVersion: row.pricingVersion ?? null,
    });
  }
  return {
    country: input.country,
    countryName: countryName(input.country),
    currency: currencies.size === 1 ? [...currencies][0] : currencies.size === 0 ? null : "MIXED",
    lines,
    total: round2(lines.reduce((s, l) => s + l.cost, 0)),
    disclaimer: ESTIMATE_DISCLAIMER,
    taxDisclaimer: TAX_DISCLAIMER,
    mixedCurrencies: currencies.size > 1,
  };
}

// ─────────────────────────────────────────────────────────────
// Meta error codes relevant to account health
// ─────────────────────────────────────────────────────────────

export type IssueCategory =
  | "billing"
  | "business_verification"
  | "display_name"
  | "policy"
  | "quality"
  | "registration"
  | "calling"
  | "templates"
  | "access"
  | "other";

export type IssueSeverity = "info" | "warning" | "restricted" | "blocked";

export interface HealthIssue {
  scope: "business" | "waba" | "phone" | "templates" | "app" | "token";
  code: string | null;
  category: IssueCategory;
  severity: IssueSeverity;
  title: string;
  description: string;
  action: string;
  /** False for calling/SIP and other non-messaging problems. */
  affectsMessaging: boolean;
}

interface KnownCode {
  category: IssueCategory;
  title: string;
  action: string;
  affectsMessaging: boolean;
}

/**
 * Codes Meta returns in `health_status.entities[].errors` and send errors.
 * Calling codes (138xxx) are deliberately marked affectsMessaging:false.
 */
export const META_HEALTH_CODES: Record<string, KnownCode> = {
  "141006": {
    category: "billing",
    title: "Payment method issue",
    action: "Ask the customer to add or update the payment method for this WhatsApp Business Account inside Meta Business Manager → Billing.",
    affectsMessaging: true,
  },
  "131042": {
    category: "billing",
    title: "Business eligibility payment issue",
    action: "Meta could not charge the payment method linked to this WhatsApp Business Account. Update it in Meta Business Manager → Billing, then retry.",
    affectsMessaging: true,
  },
  "141010": {
    category: "business_verification",
    title: "Business verification incomplete",
    action: "Complete Business Verification in Meta Business Manager → Security Centre. This is a separate process from payment setup.",
    affectsMessaging: true,
  },
  "131031": {
    category: "policy",
    title: "Business account locked",
    action: "Meta has locked this account (policy or integrity). Review the notice in WhatsApp Manager and request a review.",
    affectsMessaging: true,
  },
  "368": {
    category: "policy",
    title: "Temporarily blocked for policy violations",
    action: "Review policy notices in WhatsApp Manager. Sending resumes when Meta lifts the block.",
    affectsMessaging: true,
  },
  "131056": {
    category: "quality",
    title: "Pair rate limit hit",
    action: "Too many messages to the same recipient in a short time. Slow down sends to that number.",
    affectsMessaging: false,
  },
  "131048": {
    category: "quality",
    title: "Spam rate limit hit",
    action: "Meta restricted sends because of low quality signals. Improve template relevance and opt-in quality.",
    affectsMessaging: true,
  },
  "133010": {
    category: "registration",
    title: "Phone number not registered",
    action: "Register the phone number with the Cloud API (re-run Embedded Signup or register from WhatsApp Manager).",
    affectsMessaging: true,
  },
  "190": {
    category: "access",
    title: "Access token expired or invalid",
    action: "Reconnect this WhatsApp account through Embedded Signup to refresh the token.",
    affectsMessaging: true,
  },
  "138024": {
    category: "calling",
    title: "WhatsApp Business calling / SIP configuration issue",
    action: "Fix the calling or SIP settings for this number. This does not affect normal messaging unless Meta also reports a messaging restriction.",
    affectsMessaging: false,
  },
};

export function isCallingCode(code: string | number | null | undefined): boolean {
  const s = String(code ?? "");
  return /^138\d{3}$/.test(s);
}

/** Send-time errors that mean the whole account cannot send (pause campaigns). */
export const ACCOUNT_BLOCKING_SEND_CODES = new Set(["131042", "141006", "131031", "368", "190", "133010"]);

export function isAccountBlockingSendError(code: string | number | null | undefined): boolean {
  return ACCOUNT_BLOCKING_SEND_CODES.has(String(code ?? ""));
}

export function describeMetaCode(
  code: string | number | null | undefined,
  metaDescription?: string | null,
  metaSolution?: string | null,
): { category: IssueCategory; title: string; description: string; action: string; affectsMessaging: boolean } {
  const key = String(code ?? "");
  const known = META_HEALTH_CODES[key];
  if (known) {
    return {
      category: known.category,
      title: known.title,
      description: metaDescription || known.title,
      action: metaSolution || known.action,
      affectsMessaging: known.affectsMessaging,
    };
  }
  if (isCallingCode(key)) {
    return {
      category: "calling",
      title: "WhatsApp Business calling issue",
      description: metaDescription || "Meta reported a calling-related problem.",
      action: metaSolution || "Review calling settings in WhatsApp Manager. Messaging is not affected by this error alone.",
      affectsMessaging: false,
    };
  }
  return {
    category: "other",
    title: metaDescription ? "Meta reported an issue" : "Unknown Meta issue",
    description: metaDescription || "No description returned by Meta.",
    action: metaSolution || "Open WhatsApp Manager for details.",
    affectsMessaging: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Health classification
// ─────────────────────────────────────────────────────────────

export type OverallHealth = "healthy" | "action_required" | "restricted" | "blocked" | "unknown";

export interface MetaHealthEntity {
  entity_type?: string;
  id?: string;
  can_send_message?: string;
  errors?: { error_code?: number | string; error_description?: string; possible_solution?: string }[];
  additional_info?: string[];
}

export interface HealthInput {
  waba?: {
    ok: boolean;
    businessVerificationStatus?: string | null;
    accountReviewStatus?: string | null;
    canSendMessage?: string | null;
    entities?: MetaHealthEntity[];
    primaryFundingId?: string | null;
    fundingFieldReadable?: boolean;
    error?: { code?: string | number; message?: string } | null;
  };
  phone?: {
    ok: boolean;
    status?: string | null;
    nameStatus?: string | null;
    qualityRating?: string | null;
    messagingLimit?: string | null;
    codeVerificationStatus?: string | null;
    canSendMessage?: string | null;
    entities?: MetaHealthEntity[];
    error?: { code?: string | number; message?: string } | null;
  };
  templates?: Record<string, number>;
}

export interface HealthResult {
  overall: OverallHealth;
  messagingAvailability: "AVAILABLE" | "LIMITED" | "BLOCKED" | "UNKNOWN";
  billingStatus: "ok" | "attention" | "not_detected" | "unknown";
  issues: HealthIssue[];
  callingIssues: HealthIssue[];
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { info: 0, warning: 1, restricted: 2, blocked: 3 };

function scopeOf(entityType?: string): HealthIssue["scope"] {
  switch ((entityType || "").toUpperCase()) {
    case "BUSINESS": return "business";
    case "WABA": return "waba";
    case "PHONE_NUMBER": return "phone";
    case "APP": return "app";
    default: return "waba";
  }
}

export function classifyHealth(input: HealthInput): HealthResult {
  const issues: HealthIssue[] = [];
  const seen = new Set<string>();
  const push = (i: HealthIssue) => {
    const k = `${i.scope}:${i.code}:${i.title}`;
    if (seen.has(k)) return;
    seen.add(k);
    issues.push(i);
  };

  // 1. Meta health_status entities (authoritative for sending availability)
  const entities = [...(input.waba?.entities ?? []), ...(input.phone?.entities ?? [])];
  for (const e of entities) {
    const can = (e.can_send_message || "").toUpperCase();
    for (const err of e.errors ?? []) {
      const d = describeMetaCode(err.error_code, err.error_description, err.possible_solution);
      let severity: IssueSeverity = "warning";
      if (d.affectsMessaging && can === "BLOCKED") severity = "blocked";
      else if (d.affectsMessaging && can === "LIMITED") severity = "restricted";
      else if (!d.affectsMessaging) severity = "info";
      push({
        scope: scopeOf(e.entity_type),
        code: err.error_code !== undefined ? String(err.error_code) : null,
        category: d.category,
        severity,
        title: d.title,
        description: d.description,
        action: d.action,
        affectsMessaging: d.affectsMessaging,
      });
    }
    if ((can === "BLOCKED" || can === "LIMITED") && (e.errors ?? []).length === 0) {
      push({
        scope: scopeOf(e.entity_type),
        code: null,
        category: "other",
        severity: can === "BLOCKED" ? "blocked" : "restricted",
        title: can === "BLOCKED" ? "Messaging blocked by Meta" : "Messaging limited by Meta",
        description: (e.additional_info ?? []).join(" ") || `Meta reports can_send_message=${can} for ${e.entity_type ?? "entity"}.`,
        action: "Open WhatsApp Manager to see the reason Meta gives.",
        affectsMessaging: true,
      });
    }
  }

  // 2. Graph errors fetching the assets
  for (const [scope, part] of [["waba", input.waba], ["phone", input.phone]] as const) {
    if (part && !part.ok && part.error) {
      const d = describeMetaCode(part.error.code, part.error.message, null);
      push({
        scope: d.category === "access" ? "token" : scope,
        code: part.error.code !== undefined ? String(part.error.code) : null,
        category: d.category === "other" ? "access" : d.category,
        severity: d.category === "access" ? "blocked" : "warning",
        title: d.category === "other" ? `Could not read ${scope === "waba" ? "WhatsApp Business Account" : "phone number"} from Meta` : d.title,
        description: d.description,
        action: d.category === "other" ? "Check the token permissions or reconnect via Embedded Signup." : d.action,
        affectsMessaging: d.category === "access",
      });
    }
  }

  // 3. Business verification — independent of payment and display name
  const bv = (input.waba?.businessVerificationStatus || "").toLowerCase();
  if (bv === "rejected") {
    push({ scope: "business", code: null, category: "business_verification", severity: "warning",
      title: "Business verification rejected", description: "Meta rejected the business verification submission.",
      action: "Resubmit Business Verification in Meta Business Manager → Security Centre.", affectsMessaging: false });
  } else if (bv === "pending" || bv === "pending_submission" || bv === "pending_need_more_info") {
    push({ scope: "business", code: null, category: "business_verification", severity: "info",
      title: "Business verification pending", description: `Status: ${bv}.`,
      action: "Wait for Meta's review or provide requested documents in Security Centre.", affectsMessaging: false });
  } else if (bv === "not_verified" || bv === "unverified") {
    push({ scope: "business", code: null, category: "business_verification", severity: "info",
      title: "Business not verified", description: "Unverified businesses stay on lower messaging limits.",
      action: "Start Business Verification in Meta Business Manager to unlock higher limits.", affectsMessaging: false });
  }

  // 4. WABA review
  const review = (input.waba?.accountReviewStatus || "").toUpperCase();
  if (review === "REJECTED") {
    push({ scope: "waba", code: null, category: "policy", severity: "restricted",
      title: "WhatsApp Business Account review rejected", description: "Meta rejected the WABA review.",
      action: "Request a review in WhatsApp Manager → Account quality.", affectsMessaging: true });
  } else if (review === "PENDING") {
    push({ scope: "waba", code: null, category: "policy", severity: "info",
      title: "WhatsApp Business Account under review", description: "Meta is reviewing the account.",
      action: "No action needed unless Meta requests information.", affectsMessaging: false });
  }

  // 5. Phone number
  const ps = (input.phone?.status || "").toUpperCase();
  if (["BANNED", "DELETED", "DISCONNECTED"].includes(ps)) {
    push({ scope: "phone", code: null, category: "registration", severity: "blocked",
      title: `Phone number ${ps.toLowerCase()}`, description: `Meta reports phone status ${ps}.`,
      action: ps === "BANNED" ? "Appeal the ban in WhatsApp Manager." : "Reconnect or re-register the number.", affectsMessaging: true });
  } else if (["FLAGGED", "RESTRICTED", "RATE_LIMITED"].includes(ps)) {
    push({ scope: "phone", code: null, category: "quality", severity: "restricted",
      title: `Phone number ${ps.toLowerCase().replace("_", " ")}`, description: `Meta reports phone status ${ps}.`,
      action: "Improve message quality; Meta lifts the flag after quality recovers.", affectsMessaging: true });
  } else if (["PENDING", "UNVERIFIED", "NOT_VERIFIED"].includes(ps)) {
    push({ scope: "phone", code: null, category: "registration", severity: "warning",
      title: "Phone number not fully registered", description: `Meta reports phone status ${ps}.`,
      action: "Complete registration / OTP verification for this number.", affectsMessaging: true });
  }

  const ns = (input.phone?.nameStatus || "").toUpperCase();
  if (ns === "DECLINED" || ns === "EXPIRED") {
    push({ scope: "phone", code: null, category: "display_name", severity: "warning",
      title: `Display name ${ns.toLowerCase()}`, description: "The verified display name was not approved.",
      action: "Submit a compliant display name in WhatsApp Manager → Phone numbers. This is separate from payment setup.", affectsMessaging: false });
  } else if (ns === "PENDING_REVIEW") {
    push({ scope: "phone", code: null, category: "display_name", severity: "info",
      title: "Display name under review", description: "Meta is reviewing the display name.",
      action: "No action needed. Review usually completes within a few days.", affectsMessaging: false });
  }

  const q = (input.phone?.qualityRating || "").toUpperCase();
  if (q === "RED") {
    push({ scope: "phone", code: null, category: "quality", severity: "warning",
      title: "Quality rating low (red)", description: "Recipients are blocking or reporting messages.",
      action: "Pause marketing sends, tighten opt-in and template relevance.", affectsMessaging: false });
  } else if (q === "YELLOW") {
    push({ scope: "phone", code: null, category: "quality", severity: "info",
      title: "Quality rating medium (yellow)", description: "Quality is trending down.",
      action: "Review recent campaign feedback.", affectsMessaging: false });
  }

  // 6. Templates
  const t = input.templates ?? {};
  const approved = t.approved ?? 0;
  const total = Object.values(t).reduce((s, n) => s + n, 0);
  if (total > 0 && approved === 0) {
    push({ scope: "templates", code: null, category: "templates", severity: "warning",
      title: "No approved templates", description: "Business-initiated messages need an approved template.",
      action: "Create or fix templates until at least one is approved.", affectsMessaging: false });
  }
  if ((t.paused ?? 0) + (t.disabled ?? 0) > 0) {
    push({ scope: "templates", code: null, category: "templates", severity: "info",
      title: "Some templates paused or disabled", description: `${t.paused ?? 0} paused, ${t.disabled ?? 0} disabled.`,
      action: "Edit or replace low-quality templates.", affectsMessaging: false });
  }

  // Billing status — never assume; only report what Meta signals
  const billingIssue = issues.some((i) => i.category === "billing");
  let billingStatus: HealthResult["billingStatus"] = "unknown";
  if (billingIssue) billingStatus = "attention";
  else if (input.waba?.primaryFundingId) billingStatus = "ok";
  else if (input.waba?.ok && input.waba.fundingFieldReadable) billingStatus = "not_detected";

  if (billingStatus === "not_detected") {
    push({ scope: "waba", code: null, category: "billing", severity: "info",
      title: "No payment method detected via API",
      description: "Meta did not return a primary payment method for this WhatsApp Business Account. Free service replies still work; paid template messages need a payment method.",
      action: "Add a payment method in Meta Business Manager → Billing. This is separate from business verification, display name review and template approval.",
      affectsMessaging: false });
  }

  const callingIssues = issues.filter((i) => i.category === "calling");
  const messagingIssues = issues.filter((i) => i.category !== "calling");

  const canValues = [input.waba?.canSendMessage, input.phone?.canSendMessage].map((v) => (v || "").toUpperCase());
  let availability: HealthResult["messagingAvailability"] = "UNKNOWN";
  if (canValues.includes("BLOCKED")) availability = "BLOCKED";
  else if (canValues.includes("LIMITED")) availability = "LIMITED";
  else if (canValues.includes("AVAILABLE")) availability = "AVAILABLE";

  const worst = messagingIssues.reduce<IssueSeverity>((w, i) => (SEVERITY_RANK[i.severity] > SEVERITY_RANK[w] ? i.severity : w), "info");
  let overall: OverallHealth;
  if (availability === "BLOCKED" || worst === "blocked") overall = "blocked";
  else if (availability === "LIMITED" || worst === "restricted") overall = "restricted";
  else if (worst === "warning") overall = "action_required";
  else if (!input.waba?.ok && !input.phone?.ok) overall = "unknown";
  else overall = "healthy";

  issues.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return { overall, messagingAvailability: availability, billingStatus, issues: messagingIssues.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]), callingIssues };
}

export const OVERALL_LABEL: Record<OverallHealth, string> = {
  healthy: "Healthy",
  action_required: "Action Required",
  restricted: "Restricted",
  blocked: "Messaging Blocked",
  unknown: "Unknown",
};

/** Normalise template status strings (webhook stores upper, UI lower). */
export function normalizeTemplateStatus(s: string | null | undefined): string {
  const v = String(s ?? "").toLowerCase();
  if (v === "reinstated") return "approved";
  if (v === "pending_deletion") return "disabled";
  if (v === "flagged") return "paused";
  return v || "draft";
}

// ─────────────────────────────────────────────────────────────
// Meta Business links (no payment details ever pass through HoverChat)
// ─────────────────────────────────────────────────────────────

export function metaBillingUrl(businessId?: string | null): string {
  return businessId
    ? `https://business.facebook.com/billing_hub/accounts?business_id=${encodeURIComponent(businessId)}`
    : "https://business.facebook.com/billing_hub/accounts";
}
export function metaWhatsAppManagerUrl(wabaId?: string | null, businessId?: string | null): string {
  const q = new URLSearchParams();
  if (businessId) q.set("business_id", businessId);
  if (wabaId) q.set("waba_id", wabaId);
  const qs = q.toString();
  return `https://business.facebook.com/wa/manage/home/${qs ? `?${qs}` : ""}`;
}
export function metaSecurityCentreUrl(businessId?: string | null): string {
  return businessId
    ? `https://business.facebook.com/settings/security?business_id=${encodeURIComponent(businessId)}`
    : "https://business.facebook.com/settings/security";
}
