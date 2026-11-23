# HoverChat — Reseller Management & Distribution (v3.10)

Three levels: **Super Admin → Reseller → Customer**. Resellers sell HoverChat subscriptions only. Customers still pay Meta directly for WhatsApp messaging. No Meta wallet or credit.

## 1. Audit findings

| Area | Found | Decision |
|---|---|---|
| Old reseller UI | `pages/reseller/panel.tsx`, `admin.tsx` called `/api/reseller/*`, `/api/resellers/*` — **no backend existed** (wallet-based) | Replaced with new backend + pages. Old files unrouted (safe to delete) |
| Roles | No `reseller` in `shared/roles.ts` | Added `Role.RESELLER` |
| Users/auth | Session login, bcrypt, `status`/`isEmailVerified` gate login | Reused. Reseller = `users` row (role `reseller`) + `reseller_profiles` |
| Customers | Customer = `users` role `admin`, channels by `createdBy` | Reseller customers are normal `admin` users → whole product works unchanged |
| Billing | `plans`, `subscriptions`, `transactions`, Razorpay **subscriptions** at fixed plan price | Reused tables. Reseller sales use Razorpay **Orders** (custom price) on HoverChat's Razorpay account |
| Webhooks | Generic `payment.captured` → `activateSubscriptionFromTransaction` | Reseller branch runs first → no double activation |
| Notifications | `notifications` + `sent_notifications` + SMTP (`sendNotificationEmail`) | Reused |
| ⚠ Security | `POST /api/auth/reset-password` never checked the OTP → account takeover | **Fixed**: needs matching, verified, ≤15-min-old OTP |
| ⚠ Security | Signup with an unverified email overwrote username/password/role | **Fixed** for invited accounts (reseller / reseller customers) → 409 |

## 2. Data model (`shared/schema.ts` + self-healing `server/startup-migration.ts`)

- `reseller_profiles` — code (unique `HCR-XXXXXX`), contact, status (`pending_activation/active/inactive/suspended/archived`), max customers, default pricing model, activation policy (`on_payment`/`immediate`), refund policy (`proportional/full/none`), payout hold days, permissions JSON, validity, notes.
- `reseller_plan_pricing` — per plan + cycle (+ optional customer override). Model `wholesale | commission_percent | fixed_commission`, SRP, min, max, version. One active row per key (partial unique index); edits = new version.
- `reseller_customers` — **unique customer_user_id** → permanent one-reseller link. Only super admin transfers.
- `reseller_sales` — one per new sale / renewal. Frozen: selling price, wholesale/commission, earning, platform share, pricing snapshot + version. Links `transactions` + `subscriptions`. Unique: transaction, Razorpay order, pay token, idempotency key; **one open (unpaid) invoice per customer**; one sale per period.
- `reseller_ledger_entries` — earning / reversal / payout / adjustment. Unique `(entry_type, reference)` → no duplicate commissions. **DB trigger blocks UPDATE/DELETE.**
- `reseller_audit_logs` — every create/edit/status/pricing/sale/refund/transfer/payout with before/after.
- `account_invitations` — one-time tokens, SHA-256 only stored, 72 h (2 h for reset).

## 3. Money rules

- Sale created → `transactions` row `pending`, subscription `pending` (or `active` if super admin chose `immediate`). Never marked paid automatically.
- Paid only by: Razorpay signature verify (pay page / customer billing page), Razorpay webhook (`payment.captured`, `order.paid`) with **amount check**, or super-admin manual verification with reference.
- Amount mismatch → `pending_verification`, no activation, no earning.
- Earning written once on settlement. Available after `payout_hold_days`.
- Refund (Razorpay `refund.created/processed`, admin refund endpoint, or manual record) → reversal per policy, keyed by refund id. Full refund cancels new sub / rolls back renewal period.
- Payouts manual only, cannot exceed withdrawable. Gross margin ≠ withdrawable.
- Pricing frozen per sale. Admin edits never change past sales; renewals use the active version.

## 4. Flows

1. SA creates reseller (+ plans/pricing, limits, permissions) → activation email (link also shown to SA once).
2. Reseller sets password via `/accept-invite` → profile `active` → logs in with email → `/reseller`.
3. Reseller adds customer (limit, plan authorisation, min/max price enforced server-side) → customer user + mapping + transaction + subscription + sale in **one DB transaction** → invite + invoice email with `/pay/<token>`.
4. Customer pays on HoverChat Razorpay checkout (pay link or Subscription & Billing page) → subscription active → reseller margin recorded → notifications.
5. Renewal: same-plan extends current subscription from its end date; plan change replaces it. Each renewal = separate sale + transaction.
6. Daily 09:15 IST cron: renewal-due (≤7 days) and expired notices, once per period.
7. Suspension: user set inactive + middleware re-checks DB each request → live sessions blocked. **Customers keep full access** (policy). Archive = soft delete; hard delete only if no history.
8. Transfer (SA only): history stays with old reseller, open invoices cancelled, future renewals belong to new owner.

## 5. API

Reseller (`requireAuth + requireReseller`): `GET/PATCH /api/reseller/me`, `GET dashboard|catalog|customers|subscriptions|sales|transactions|earnings`, `POST customers`, `GET/PATCH customers/:id`, `POST customers/:id/{status,resend-invite,renewals,reminder}`, `POST sales/:id/{pay-link,cancel}`.

Super admin (`requireSuperadmin`): `/api/admin/resellers` list/create, `summary`, `options`, `:id` get/patch/delete, `:id/{status,archive,reset-password,pricing,customers,sales,earnings,payouts,adjustments,audit}`, `customers/:customerId/{transfer,renewals}`, `sales/:saleId/{mark-paid,cancel,refund,pay-link}`.

Public: `/api/public/reseller-pay/:token` (+ `/order`, `/verify`), `/api/auth/invitation`, `/api/auth/accept-invite` (IP rate-limited). Customer: `/api/billing/reseller-invoice` (+ `/:saleId/order|verify`).

## 6. Tests

- `server/__tests__/reseller-pricing.test.ts` — Model A ₹1,499−₹799=₹700, Model B 30% → ₹449.70, fixed commission, min/max/SRP lock, negative-margin config rejected, snapshot, refund reversal (proportional/full/none), balances, month-end cycles.
- `server/__tests__/reseller-integration.test.ts` — real Postgres + real routes (auth, portal, admin, pay link, Razorpay webhook, admin refund): all 20 requested workflows + forged signature, amount mismatch, duplicate webhooks, idempotent retries, customer limit, unauthorised plan, append-only ledger, password-reset fix, signup hijack guard. Run with `RESELLER_TEST_DATABASE_URL` (throwaway DB).

## 7. Limits / next

- White-label, referral links, reseller domains: not built. Architecture ready (`reseller_code`, profile, per-reseller config).
- Reseller-collected (offline) payments not supported by design — customers pay HoverChat's Razorpay. SA can mark bank transfers paid manually.
- GST invoice PDFs not generated (invoice list only).
- Deleting a customer user who has reseller sales is blocked by FK (financial history).
- New menu labels English only (not in the 8 translation files).
