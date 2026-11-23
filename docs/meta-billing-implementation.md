# HoverChat — Meta usage, account health & billing (v3.9)

Business rule: customer pays HoverChat ₹999/month. Meta bills WhatsApp messaging **directly** to the customer's WABA. HoverChat tracks usage and shows **estimates** only. No Meta wallet, credit, prepaid balance or card storage.

## 1. Audit summary (before changes)

| Area | Found | Used / changed |
|---|---|---|
| Stack | Express + TS + Drizzle/Postgres, Vite React + wouter + shadcn + react-query, BullMQ (optional Redis) | Reused as-is |
| Tenancy | Channel `createdBy` = owner; team users via `createdBy`; `resolveTenantChannels` middleware | All new customer APIs go through it |
| Subscriptions | `plans`, `subscriptions`, `transactions`, multi-gateway webhooks, `BillingSubscriptionPage` (cancel/plan cards) | Read-only reuse; payment flow untouched |
| Webhooks | `webhooks.controller.handleMessageStatuses` with wamid dedup, queue/campaign counters | One non-blocking hook added for usage |
| Health | `channels.healthDetails` + daily cron (phone fields only); `/health-monitor` page was hard-coded mock data | New WABA+phone health service; `/health-monitor` now shows real data |
| Campaign send | `createCampaign` / `startCampaign` / resume / scheduled cron → `startCampaignExecution`; queue via BullMQ or DB poller | Readiness gate + pause-on-account-block |
| Templates | Status webhook mapped everything except APPROVED/REJECTED to PENDING | Now maps PAUSED / DISABLED / REINSTATED |
| Orphans | `/wallet`, `/billing/rates`, `/billing/caps` pages called `/api/billing/*` endpoints that **do not exist** on the server | `/wallet` route + menu removed (violates no-wallet rule); `/billing/rates` now the real rate-card admin; `caps` left untouched |
| Error codes | `131042` described as "account restricted" | Corrected to Meta's payment-eligibility meaning; added 141006, 141010, 138024 |

## 2. Database (self-healing via `server/startup-migration.ts`, also in `shared/schema.ts` for `db:push`)

- `meta_rate_cards` — country (ISO-2 or `*` = Other), category, rate, currency, free monthly allowance (per number), volume tiers (JSON), effective from/to, active, source, version. Seeded **once, only if empty**, with India reference rates (marketing 0.8631, utility 0.115, authentication 0.115, service 0 → 0.115 + 1000 free from 1 Oct 2026 *marked VERIFY*).
- `whatsapp_message_usage` — one row per Meta wamid (unique index = idempotency). customer, channel, WABA, phone number id, country, category, pricing type/model, billable flag, status + sent/delivered/read/failed timestamps, campaign, template, rate card id, applied rate, estimated cost, currency, pricing version. Indexed on customer+created, customer+delivered, WABA, phone, delivered, category, campaign.
- `whatsapp_account_health` — one snapshot per channel (unique), classified issues, calling issues, overall status.

## 3. Usage tracking rules

1. Only Meta **status webhooks** create usage. Send-API success is never "delivered".
2. Billability comes from Meta's `pricing.billable`. Missing pricing → recorded as non-billable (`pricing_type=unknown`), never charged.
3. Cost fixed once, at first delivered/read, using the rate valid **at delivery time**. Rate edits never reprice history.
4. Retries / concurrent deliveries: unique wamid + absolute values + guarded pricing update ⇒ no double counting (covered by tests with 5–8 parallel deliveries).
5. Status never regresses (read ≠> delivered, delivered ≠> failed, late `sent` ≠> undo failed).

## 4. APIs

Customer (`requireAuth` + tenant scope): `GET /api/billing/overview`, `/api/billing/subscription`, `/api/whatsapp/usage/{summary,timeseries,breakdown,history,filters}`, `/api/whatsapp/account-health[?refresh=1]`, `/api/whatsapp/readiness`, `/api/whatsapp/cost-estimate`, `/api/whatsapp/rate-card`.

Super admin: `GET /api/admin/billing/overview` (revenue and Meta estimates as separate objects), `GET /api/admin/whatsapp/usage`, `GET /api/admin/whatsapp/accounts`, `POST /api/admin/whatsapp/accounts/:channelId/refresh-health`, `GET|POST /api/admin/meta-rate-cards`, `PUT /api/admin/meta-rate-cards/:id`, `PATCH /api/admin/meta-rate-cards/:id/active`.

Campaign endpoints now return `409 { code: "WHATSAPP_NOT_READY", error, readiness }` when blocked.

## 5. Campaign protection

Checked on immediate create, `POST /start`, resume (`paused → sending`) and when the scheduler fires: subscription active, channel owned/connected, phone registered, Meta `can_send_message` not BLOCKED / no blocking issue, template approved, recipients within tier. Graph outage = warning, not block. Calling (138xxx) never blocks.
During sending, account-level errors (131042, 141006, 131031, 368, 190, 133010) pause **only that campaign** and refresh health. Subscription and inbound messaging are untouched. Scheduled campaigns blocked at fire time are paused; resuming one that never queued runs the normal start path.

## 6. Environment

`USAGE_TIMEZONE` (default Asia/Kolkata), `WA_HEALTH_TTL_MS` (default 600000), `HOVERCHAT_SUBSCRIPTION_PRICE` (default 999), optional `META_BILLING_TEST_DATABASE_URL`.

## 7. Tests

- `server/__tests__/meta-billing-pure.test.ts` (always runs): rate history, fallback, tiers, free allowance, Meta pricing decisions, status ordering, country detection, health classification (141006 / 141010 / 138024 / pending verification / display name / templates), IST date ranges.
- `server/__tests__/meta-billing-integration.test.ts` (needs a throwaway DB): seed, sent≠delivered, duplicate + concurrent webhooks, free/unknown pricing, failed, rate change history, tenant isolation (incl. `customerId`/`channelId` tampering), all analytics queries, readiness scenarios (subscription expired, other tenant, pending template, tier limit, payment block, Graph outage, calling error), pause-on-block, every HTTP route incl. admin gate.

## 8. Known limitations

- Volume-tier discounts are applied in the calculator only. Meta aggregates tiers per business portfolio and does not send tier info in webhooks, so recorded per-message estimates use the base rate.
- Payment-method presence relies on `primary_funding_id`, which Meta may not return for every token; the UI then says "check in Meta" rather than guessing.
- India service-message charging from Oct 2026 appears in press reports but was not found on Meta's developer pricing page at build time. Seed row is marked VERIFY; recorded charges still follow Meta's `billable` flag.
- Send-API failures that never get a wamid are not in usage (they stay in campaign/message logs).
- `/billing/caps` page still calls a non-existent `/api/billing/caps` (pre-existing; untouched). `client/src/pages/billing/wallet.tsx` and `rates.tsx` are now unrouted and can be deleted.
- New sidebar labels are plain English (not yet in the 8 translation files).
