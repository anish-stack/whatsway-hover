/**
 * ============================================================
 *  © 2026 Hover Business Services LLP — a brand of Hover Business Services LLP
 * ============================================================
 *
 * Idempotent startup migration — runs on every server boot.
 * Uses raw SQL with IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards
 * so it is always safe to re-run and never breaks a fresh install.
 *
 * Background: the project uses `db:push` for schema changes, which
 * means any client that did not run `db:push` after an update will
 * have a stale database.  This file self-heals those databases.
 */

import type { Pool } from "pg";
import { precheckCleanupSteps } from "./db-precheck-cleanup";
import { PROVIDER_CURRENCY_OPTIONS } from "@shared/payment-currencies";

interface MigrationStep {
  description: string;
  sql: string;
  /**
   * When true, the row count returned by the SQL is logged at INFO level
   * (only when > 0). Useful for one-shot data backfills so operators can
   * see how many legacy rows were repaired during an upgrade.
   */
  logRowCount?: boolean;
}

function addColumnIfNotExists(
  table: string,
  column: string,
  definition: string
): MigrationStep {
  return {
    description: `Add ${table}.${column}`,
    sql: `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition};`,
  };
}

const steps: MigrationStep[] = [
  // ────────────────────────────────────────────────────
  // Data cleanup — must run BEFORE any unique-index / FK
  // step further down so they can succeed on legacy data.
  //
  // Shared with the in-app updater precheck step
  // (see server/db-precheck-cleanup.ts) so the two paths can
  // never drift apart.
  // ────────────────────────────────────────────────────
  ...precheckCleanupSteps,

  // ────────────────────────────────────────────────────
  // campaigns
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "campaigns",
    "population_started_at",
    "TIMESTAMP"
  ),

  // ────────────────────────────────────────────────────
  // automation_edges
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "automation_edges",
    "source_handle",
    "VARCHAR"
  ),
  {
    description: "Recreate automation_edges unique constraint to include source_handle",
    sql: `
      ALTER TABLE automation_edges DROP CONSTRAINT IF EXISTS automation_edges_unique_idx;
      CREATE UNIQUE INDEX IF NOT EXISTS automation_edges_unique_handle_idx
        ON automation_edges (automation_id, source_node_id, target_node_id, COALESCE(source_handle, ''));
    `,
  },

  // ────────────────────────────────────────────────────
  // automation_executions
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "automation_executions",
    "trigger_message_id",
    "VARCHAR(200)"
  ),
  {
    description: "Create automation_executions_message_unique_idx",
    sql: `
      CREATE UNIQUE INDEX IF NOT EXISTS automation_executions_message_unique_idx
        ON automation_executions (automation_id, conversation_id, trigger_message_id);
    `,
  },

  // ────────────────────────────────────────────────────
  // channels
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "channels",
    "is_coexistence",
    "BOOLEAN DEFAULT false"
  ),
  addColumnIfNotExists(
    "channels",
    "health_status",
    "TEXT DEFAULT 'unknown'"
  ),
  addColumnIfNotExists("channels", "last_health_check", "TIMESTAMP"),
  addColumnIfNotExists(
    "channels",
    "health_details",
    "JSONB DEFAULT '{}'"
  ),
  addColumnIfNotExists(
    "channels",
    "connection_method",
    "VARCHAR(20) DEFAULT 'embedded'"
  ),

  // ────────────────────────────────────────────────────
  // conversations
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "conversations",
    "last_incoming_message_at",
    "TIMESTAMP"
  ),
  addColumnIfNotExists("conversations", "last_message_text", "TEXT"),
  addColumnIfNotExists("conversations", "chatbot_id", "VARCHAR"),
  addColumnIfNotExists("conversations", "session_id", "TEXT"),
  addColumnIfNotExists(
    "conversations",
    "unread_count",
    "INTEGER DEFAULT 0"
  ),

  // ────────────────────────────────────────────────────
  // messages
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("messages", "error_details", "JSONB"),
  addColumnIfNotExists("messages", "media_sha256", "VARCHAR(128)"),
  addColumnIfNotExists("messages", "delivered_at", "TIMESTAMP"),
  addColumnIfNotExists("messages", "read_at", "TIMESTAMP"),
  addColumnIfNotExists("messages", "error_code", "VARCHAR(50)"),
  addColumnIfNotExists("messages", "error_message", "TEXT"),
  addColumnIfNotExists("messages", "campaign_id", "VARCHAR"),

  // ────────────────────────────────────────────────────
  // users
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("users", "fcm_token", "VARCHAR(512)"),
  addColumnIfNotExists(
    "users",
    "is_email_verified",
    "BOOLEAN DEFAULT false"
  ),
  addColumnIfNotExists("users", "stripe_customer_id", "VARCHAR"),
  addColumnIfNotExists("users", "razorpay_customer_id", "VARCHAR"),
  addColumnIfNotExists("users", "paypal_customer_id", "VARCHAR"),
  addColumnIfNotExists("users", "paystack_customer_code", "VARCHAR"),
  addColumnIfNotExists("users", "mercadopago_customer_id", "VARCHAR"),

  // ────────────────────────────────────────────────────
  // plans
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("plans", "stripe_product_id", "VARCHAR"),
  addColumnIfNotExists("plans", "stripe_price_id_monthly", "VARCHAR"),
  addColumnIfNotExists("plans", "stripe_price_id_annual", "VARCHAR"),
  addColumnIfNotExists("plans", "razorpay_plan_id_monthly", "VARCHAR"),
  addColumnIfNotExists("plans", "razorpay_plan_id_annual", "VARCHAR"),
  addColumnIfNotExists("plans", "paypal_product_id", "VARCHAR"),
  addColumnIfNotExists("plans", "paypal_plan_id_monthly", "VARCHAR"),
  addColumnIfNotExists("plans", "paypal_plan_id_annual", "VARCHAR"),
  addColumnIfNotExists(
    "plans",
    "paystack_plan_code_monthly",
    "VARCHAR"
  ),
  addColumnIfNotExists(
    "plans",
    "paystack_plan_code_annual",
    "VARCHAR"
  ),
  addColumnIfNotExists(
    "plans",
    "mercadopago_plan_id_monthly",
    "VARCHAR"
  ),
  addColumnIfNotExists(
    "plans",
    "mercadopago_plan_id_annual",
    "VARCHAR"
  ),

  // ────────────────────────────────────────────────────
  // subscriptions
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "subscriptions",
    "gateway_subscription_id",
    "VARCHAR"
  ),
  addColumnIfNotExists("subscriptions", "gateway_provider", "VARCHAR"),
  addColumnIfNotExists("subscriptions", "gateway_status", "VARCHAR"),

  // Stripe checkout writes these columns immediately after creating a
  // gateway subscription. Older installs may not have them yet, which causes
  // checkout to fail after Stripe has already created the subscription.
  addColumnIfNotExists("transactions", "provider_subscription_id", "VARCHAR"),
  addColumnIfNotExists("transactions", "provider_payment_intent_id", "VARCHAR"),
  addColumnIfNotExists("transactions", "provider_setup_intent_id", "VARCHAR"),
  addColumnIfNotExists("transactions", "provider_invoice_id", "VARCHAR"),
  addColumnIfNotExists("transactions", "provider_customer_id", "VARCHAR"),

  // ────────────────────────────────────────────────────
  // message_queue
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "message_queue",
    "template_language",
    "VARCHAR(20) DEFAULT 'en_US'"
  ),
  addColumnIfNotExists("message_queue", "sent_via", "VARCHAR(20)"),
  addColumnIfNotExists("message_queue", "cost", "VARCHAR(20)"),
  addColumnIfNotExists("message_queue", "delivered_at", "TIMESTAMP"),
  addColumnIfNotExists("message_queue", "read_at", "TIMESTAMP"),

  // ────────────────────────────────────────────────────
  // ai_settings
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "ai_settings",
    "words",
    "TEXT[] DEFAULT ARRAY[]::text[]"
  ),
  // Diagnostic columns: webhook handler writes the reason any time it
  // skips an AI auto-reply, so support can answer "why isn't my bot
  // replying?" from the diagnostics endpoint without DB access.
  addColumnIfNotExists("ai_settings", "last_skip_reason", "TEXT"),
  addColumnIfNotExists(
    "ai_settings",
    "last_skip_at",
    "TIMESTAMP WITH TIME ZONE"
  ),

  // ────────────────────────────────────────────────────
  // templates
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("templates", "rejection_reason", "TEXT"),
  addColumnIfNotExists(
    "templates",
    "media_type",
    "TEXT DEFAULT 'text'"
  ),
  addColumnIfNotExists("templates", "media_url", "TEXT"),
  addColumnIfNotExists("templates", "media_handle", "TEXT"),
  addColumnIfNotExists(
    "templates",
    "carousel_cards",
    "JSONB DEFAULT '[]'"
  ),
  addColumnIfNotExists("templates", "whatsapp_template_id", "TEXT"),
  addColumnIfNotExists(
    "templates",
    "usage_count",
    "INTEGER DEFAULT 0"
  ),
  addColumnIfNotExists("templates", "header_type", "TEXT"),
  addColumnIfNotExists("templates", "body_variables", "INTEGER"),

  // ────────────────────────────────────────────────────
  // campaigns
  // ────────────────────────────────────────────────────
  addColumnIfNotExists(
    "campaigns",
    "replied_count",
    "INTEGER DEFAULT 0"
  ),

  // ────────────────────────────────────────────────────
  // contacts — multi-tenant scoping column + index + backfill
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("contacts", "tenant_id", "VARCHAR"),
  {
    description: "Create contacts_tenant_idx on contacts(tenant_id)",
    sql: `CREATE INDEX IF NOT EXISTS contacts_tenant_idx ON contacts(tenant_id);`,
  },
  {
    description:
      "Backfill contacts.tenant_id from creator (team users -> their parent, otherwise self)",
    sql: `
      UPDATE contacts c
         SET tenant_id = COALESCE(
           NULLIF(u.created_by, ''),
           u.id
         )
        FROM users u
       WHERE c.tenant_id IS NULL
         AND c.created_by IS NOT NULL
         AND c.created_by = u.id;
    `,
  },

  // ────────────────────────────────────────────────────
  // webhook_dedup — shared dedup store used when Redis is unavailable.
  // Replaces the previous in-process Map fallback so dedup remains
  // consistent across multiple server instances.
  // ────────────────────────────────────────────────────
  {
    description: "Create webhook_dedup (if not exists) for cross-instance fallback",
    sql: `
      CREATE TABLE IF NOT EXISTS webhook_dedup (
        wamid       VARCHAR(255) PRIMARY KEY,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS webhook_dedup_created_at_idx
        ON webhook_dedup (created_at);
    `,
  },

  // ────────────────────────────────────────────────────
  // New tables — CREATE TABLE IF NOT EXISTS guards
  // ────────────────────────────────────────────────────
  {
    description: "Create table channel_signup_logs (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS channel_signup_logs (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       VARCHAR NOT NULL,
        status        VARCHAR(20) NOT NULL DEFAULT 'incomplete',
        step          VARCHAR(50) NOT NULL DEFAULT 'token_exchange',
        error_message TEXT,
        error_details JSONB,
        phone_number  TEXT,
        waba_id       TEXT,
        channel_id    VARCHAR,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    description: "Create table client_api_keys (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS client_api_keys (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               VARCHAR NOT NULL,
        channel_id            VARCHAR,
        name                  VARCHAR(100) NOT NULL,
        api_key               VARCHAR(64) NOT NULL UNIQUE,
        secret_hash           VARCHAR(256) NOT NULL,
        permissions           JSONB DEFAULT '[]',
        is_active             BOOLEAN DEFAULT true,
        last_used_at          TIMESTAMP,
        request_count         INTEGER DEFAULT 0,
        monthly_request_count INTEGER DEFAULT 0,
        monthly_reset_at      TIMESTAMP,
        created_at            TIMESTAMP DEFAULT NOW(),
        revoked_at            TIMESTAMP
      );
    `,
  },
  {
    description: "Create table client_api_usage_logs (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS client_api_usage_logs (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key_id    VARCHAR NOT NULL,
        user_id       VARCHAR NOT NULL,
        channel_id    VARCHAR,
        endpoint      VARCHAR(255) NOT NULL,
        method        VARCHAR(10) NOT NULL,
        status_code   INTEGER,
        response_time INTEGER,
        ip_address    VARCHAR(45),
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    description: "Create table client_webhooks (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS client_webhooks (
        id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id            VARCHAR NOT NULL,
        channel_id         VARCHAR,
        url                TEXT NOT NULL,
        secret             VARCHAR(256),
        events             JSONB DEFAULT '[]',
        is_active          BOOLEAN DEFAULT true,
        last_triggered_at  TIMESTAMP,
        failure_count      INTEGER DEFAULT 0,
        created_at         TIMESTAMP DEFAULT NOW(),
        updated_at         TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    description: "Create table platform_languages (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS platform_languages (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        code         VARCHAR(10) NOT NULL UNIQUE,
        name         VARCHAR(100) NOT NULL,
        native_name  VARCHAR(100) NOT NULL,
        icon         VARCHAR(10),
        direction    VARCHAR(3) NOT NULL DEFAULT 'ltr',
        is_enabled   BOOLEAN NOT NULL DEFAULT true,
        is_default   BOOLEAN NOT NULL DEFAULT false,
        translations JSONB DEFAULT '{}',
        sort_order   INTEGER DEFAULT 0,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    description: "Repair English platform_languages row if seeded with placeholder values",
    sql: `
      UPDATE platform_languages
      SET name = 'English',
          native_name = 'English',
          icon = '🇺🇸',
          direction = 'ltr'
      WHERE code = 'en'
        AND (name = 'en' OR native_name = 'en' OR icon = 'en' OR icon IS NULL OR icon = '');
    `,
  },
  {
    description: "Remove stray sample platform_languages row",
    sql: `
      DELETE FROM platform_languages WHERE code = 'sample';
    `,
  },
  {
    description: "Create table update_runs (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS update_runs (
        id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        triggered_by           VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        triggered_by_username  TEXT,
        from_version           TEXT,
        to_version             TEXT,
        status                 VARCHAR(20) NOT NULL DEFAULT 'running',
        final_message          TEXT,
        started_at             TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at            TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS update_runs_started_at_idx
        ON update_runs (started_at);
    `,
  },
  {
    description: "Create table update_run_events (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS update_run_events (
        id          SERIAL PRIMARY KEY,
        run_id      VARCHAR NOT NULL REFERENCES update_runs(id) ON DELETE CASCADE,
        step        VARCHAR(50) NOT NULL,
        status      VARCHAR(20) NOT NULL,
        message     TEXT NOT NULL,
        progress    INTEGER,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS update_run_events_run_id_idx
        ON update_run_events (run_id, id);
    `,
  },
  // ────────────────────────────────────────────────────
  // panel_config — public_origin column captured from real HTTP traffic
  // (used to build absolute URLs in notification emails). Auto-detected,
  // never hardcoded. See server/services/public-origin.ts.
  // ────────────────────────────────────────────────────
  addColumnIfNotExists("panel_config", "public_origin", "TEXT"),

  // ────────────────────────────────────────────────────
  // payment_providers — backfill empty supported_currencies
  // for legacy rows that were saved by an older version of
  // Gateway Settings which always shipped `supportedCurrencies: []`.
  // Only fills rows that are currently empty/null; never overwrites
  // a list the operator has explicitly chosen.
  // ────────────────────────────────────────────────────
  ...Object.entries(PROVIDER_CURRENCY_OPTIONS).map(([key, currencies]) => ({
    description: `Backfill payment_providers.supported_currencies for ${key} (when empty)`,
    sql: `
      UPDATE payment_providers
         SET supported_currencies = '${JSON.stringify(currencies)}'::jsonb
       WHERE provider_key = '${key}'
         AND (
           supported_currencies IS NULL
           OR jsonb_typeof(supported_currencies) <> 'array'
           OR jsonb_array_length(supported_currencies) = 0
         );
    `,
  })),

  // ────────────────────────────────────────────────────
  // payment_providers — backfill missing config.isLive flag
  // for legacy rows created before the Live/Test toggle existed.
  //
  // Webhook signature verification now branches strictly on
  // config.isLive, so any row that has live API credentials but
  // no isLive field would silently be treated as Test mode after
  // upgrade and reject Live webhook events. Mark those rows as
  // Live so existing Live deployments keep working untouched.
  //
  // Idempotent: only runs on rows where the key is absent. New
  // rows always get the flag from the admin form.
  // ────────────────────────────────────────────────────
  {
    description:
      "Backfill payment_providers.config.isLive=true for legacy rows with live API credentials",
    logRowCount: true,
    sql: `
      UPDATE payment_providers
         SET config = COALESCE(config, '{}'::jsonb)
                      || jsonb_build_object('isLive', true)
       WHERE config IS NOT NULL
         AND NOT (config ? 'isLive')
         AND (
           COALESCE(NULLIF(config->>'apiKey', ''), '') <> ''
           OR COALESCE(NULLIF(config->>'apiSecret', ''), '') <> ''
         );
    `,
  },

  {
    description:
      "Create table whatsapp_business_accounts_config (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_business_accounts_config (
        id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        app_id     TEXT NOT NULL,
        app_secret TEXT NOT NULL,
        config_id  TEXT NOT NULL,
        created_by VARCHAR DEFAULT '',
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },

  // ────────────────────────────────────────────────────
  // v3.9 — Meta usage tracking, rate card, account health.
  // HoverChat only TRACKS and ESTIMATES Meta charges; no wallet.
  // ────────────────────────────────────────────────────
  {
    description: "Create table meta_rate_cards (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS meta_rate_cards (
        id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code           VARCHAR(8)  NOT NULL,
        country_name           TEXT,
        category               VARCHAR(40) NOT NULL,
        rate                   NUMERIC(12,6) NOT NULL,
        currency               VARCHAR(8)  NOT NULL DEFAULT 'INR',
        free_monthly_allowance INTEGER,
        volume_tiers           JSONB,
        effective_from         TIMESTAMPTZ NOT NULL,
        effective_to           TIMESTAMPTZ,
        is_active              BOOLEAN NOT NULL DEFAULT true,
        pricing_source         TEXT,
        pricing_version        VARCHAR(64),
        notes                  TEXT,
        created_by             VARCHAR,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS meta_rate_cards_lookup_idx
        ON meta_rate_cards (country_code, category, effective_from);
    `,
  },
  {
    // Seeded ONLY when the table is empty so admin edits are never overwritten.
    // Initial reference values — validate against Meta's official INR rate card.
    description: "Seed initial India Meta rate card (only if table empty)",
    sql: `
      INSERT INTO meta_rate_cards
        (country_code, country_name, category, rate, currency, free_monthly_allowance,
         effective_from, effective_to, is_active, pricing_source, pricing_version, notes)
      SELECT * FROM (VALUES
        ('IN', 'India', 'marketing',      0.8631::numeric, 'INR', NULL::int, '2026-01-01T00:00:00Z'::timestamptz, NULL::timestamptz, true,
          'Meta WhatsApp rate card (INR) — initial reference', 'meta-2026-01-IN', 'Validate against Meta official rate card before relying on it.'),
        ('IN', 'India', 'utility',        0.115::numeric,  'INR', NULL::int, '2026-01-01T00:00:00Z'::timestamptz, NULL::timestamptz, true,
          'Meta WhatsApp rate card (INR) — initial reference', 'meta-2026-01-IN', 'Volume tiers apply at business-portfolio level; configure tiers if eligible.'),
        ('IN', 'India', 'authentication', 0.115::numeric,  'INR', NULL::int, '2026-01-01T00:00:00Z'::timestamptz, NULL::timestamptz, true,
          'Meta WhatsApp rate card (INR) — initial reference', 'meta-2026-01-IN', 'Volume tiers apply at business-portfolio level; configure tiers if eligible.'),
        ('IN', 'India', 'service',        0::numeric,      'INR', NULL::int, '2025-07-01T00:00:00Z'::timestamptz, '2026-10-01T00:00:00Z'::timestamptz, true,
          'Meta per-message pricing — service replies free in CSW', 'meta-2025-07-IN', 'Free inside the customer service window.'),
        ('IN', 'India', 'service',        0.115::numeric,  'INR', 1000,      '2026-10-01T00:00:00Z'::timestamptz, NULL::timestamptz, true,
          'Reported Oct-2026 India change — VERIFY on Meta rate card', 'meta-2026-10-IN', 'Applied only when Meta marks a service message billable. Free allowance is per phone number per month.')
      ) AS seed
      WHERE NOT EXISTS (SELECT 1 FROM meta_rate_cards);
    `,
    logRowCount: true,
  },
  {
    description: "Create table whatsapp_message_usage (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_message_usage (
        id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id         VARCHAR NOT NULL,
        channel_id          VARCHAR,
        waba_id             VARCHAR(64),
        phone_number_id     VARCHAR(64),
        message_id          VARCHAR(191) NOT NULL,
        recipient_country   VARCHAR(8),
        recipient_dial_code VARCHAR(8),
        category            VARCHAR(40) NOT NULL DEFAULT 'service',
        pricing_type        VARCHAR(40),
        pricing_model       VARCHAR(16),
        billable            BOOLEAN NOT NULL DEFAULT false,
        status              VARCHAR(16) NOT NULL,
        sent_at             TIMESTAMPTZ,
        delivered_at        TIMESTAMPTZ,
        read_at             TIMESTAMPTZ,
        failed_at           TIMESTAMPTZ,
        error_code          VARCHAR(32),
        campaign_id         VARCHAR,
        template_id         VARCHAR,
        template_name       TEXT,
        rate_card_id        VARCHAR,
        applied_rate        NUMERIC(12,6),
        estimated_cost      NUMERIC(14,6) NOT NULL DEFAULT 0,
        currency            VARCHAR(8),
        pricing_version     VARCHAR(64),
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wa_usage_message_id_uq ON whatsapp_message_usage (message_id);
      CREATE INDEX IF NOT EXISTS wa_usage_customer_created_idx ON whatsapp_message_usage (customer_id, created_at);
      CREATE INDEX IF NOT EXISTS wa_usage_customer_delivered_idx ON whatsapp_message_usage (customer_id, delivered_at);
      CREATE INDEX IF NOT EXISTS wa_usage_waba_idx ON whatsapp_message_usage (waba_id);
      CREATE INDEX IF NOT EXISTS wa_usage_phone_idx ON whatsapp_message_usage (phone_number_id);
      CREATE INDEX IF NOT EXISTS wa_usage_delivered_idx ON whatsapp_message_usage (delivered_at);
      CREATE INDEX IF NOT EXISTS wa_usage_category_idx ON whatsapp_message_usage (category);
      CREATE INDEX IF NOT EXISTS wa_usage_campaign_idx ON whatsapp_message_usage (campaign_id);
      CREATE INDEX IF NOT EXISTS wa_usage_created_idx ON whatsapp_message_usage (created_at);
    `,
  },
  {
    description: "Create table whatsapp_account_health (if not exists)",
    sql: `
      CREATE TABLE IF NOT EXISTS whatsapp_account_health (
        id                           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id                   VARCHAR NOT NULL,
        customer_id                  VARCHAR,
        waba_id                      VARCHAR(64),
        phone_number_id              VARCHAR(64),
        business_id                  VARCHAR(64),
        business_name                TEXT,
        business_verification_status VARCHAR(40),
        waba_name                    TEXT,
        waba_review_status           VARCHAR(40),
        waba_can_send                VARCHAR(16),
        account_mode                 VARCHAR(20),
        phone_number                 TEXT,
        verified_name                TEXT,
        name_status                  VARCHAR(40),
        quality_rating               VARCHAR(16),
        messaging_limit              VARCHAR(40),
        phone_status                 VARCHAR(40),
        code_verification_status     VARCHAR(40),
        phone_can_send               VARCHAR(16),
        messaging_availability       VARCHAR(16),
        billing_status               VARCHAR(20),
        template_counts              JSONB DEFAULT '{}'::jsonb,
        issues                       JSONB DEFAULT '[]'::jsonb,
        calling_issues               JSONB DEFAULT '[]'::jsonb,
        overall_status               VARCHAR(20) NOT NULL DEFAULT 'unknown',
        raw                          JSONB,
        last_error                   TEXT,
        checked_at                   TIMESTAMPTZ,
        created_at                   TIMESTAMPTZ DEFAULT NOW(),
        updated_at                   TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS wa_health_channel_uq ON whatsapp_account_health (channel_id);
      CREATE INDEX IF NOT EXISTS wa_health_customer_idx ON whatsapp_account_health (customer_id);
      CREATE INDEX IF NOT EXISTS wa_health_overall_idx ON whatsapp_account_health (overall_status);
    `,
  },

  // ────────────────────────────────────────────────────
  // v3.10 — Reseller distribution (profiles, pricing, customers,
  // sales, immutable ledger, audit, one-time account tokens).
  // ────────────────────────────────────────────────────
  {
    description: "Create reseller tables (if not exist)",
    sql: `
      CREATE TABLE IF NOT EXISTS reseller_profiles (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id               VARCHAR NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        reseller_code         VARCHAR(16) NOT NULL,
        business_name         TEXT NOT NULL,
        contact_person        TEXT NOT NULL,
        email                 TEXT NOT NULL,
        mobile                VARCHAR(20) NOT NULL,
        company_name          TEXT,
        address               TEXT,
        status                VARCHAR(24) NOT NULL DEFAULT 'pending_activation',
        max_customers         INTEGER NOT NULL DEFAULT 0,
        default_pricing_model VARCHAR(24) NOT NULL DEFAULT 'wholesale',
        activation_policy     VARCHAR(16) NOT NULL DEFAULT 'on_payment',
        refund_policy         VARCHAR(16) NOT NULL DEFAULT 'proportional',
        payout_hold_days      INTEGER NOT NULL DEFAULT 7,
        permissions           JSONB NOT NULL DEFAULT '{}'::jsonb,
        valid_until           TIMESTAMPTZ,
        notes                 TEXT,
        suspended_reason      TEXT,
        created_by            VARCHAR,
        archived_at           TIMESTAMPTZ,
        created_at            TIMESTAMPTZ DEFAULT NOW(),
        updated_at            TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_profiles_user_uq ON reseller_profiles (user_id);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_profiles_code_uq ON reseller_profiles (reseller_code);
      CREATE INDEX IF NOT EXISTS reseller_profiles_status_idx ON reseller_profiles (status);

      CREATE TABLE IF NOT EXISTS reseller_plan_pricing (
        id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reseller_id            VARCHAR NOT NULL REFERENCES reseller_profiles(id) ON DELETE CASCADE,
        plan_id                VARCHAR NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
        billing_cycle          VARCHAR(10) NOT NULL,
        customer_user_id       VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        pricing_model          VARCHAR(24) NOT NULL,
        wholesale_price        NUMERIC(12,2),
        commission_percent     NUMERIC(6,3),
        fixed_commission       NUMERIC(12,2),
        suggested_retail_price NUMERIC(12,2) NOT NULL,
        min_selling_price      NUMERIC(12,2) NOT NULL,
        max_selling_price      NUMERIC(12,2),
        currency               VARCHAR(8) NOT NULL DEFAULT 'INR',
        is_active              BOOLEAN NOT NULL DEFAULT true,
        version                INTEGER NOT NULL DEFAULT 1,
        updated_by             VARCHAR,
        created_at             TIMESTAMPTZ DEFAULT NOW(),
        updated_at             TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reseller_pricing_reseller_idx ON reseller_plan_pricing (reseller_id);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_pricing_active_uq
        ON reseller_plan_pricing (reseller_id, plan_id, billing_cycle, COALESCE(customer_user_id, ''))
        WHERE is_active;

      CREATE TABLE IF NOT EXISTS reseller_customers (
        id                   VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reseller_id          VARCHAR NOT NULL REFERENCES reseller_profiles(id) ON DELETE RESTRICT,
        customer_user_id     VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_name        TEXT,
        mobile               VARCHAR(20),
        source               VARCHAR(24) NOT NULL DEFAULT 'reseller_created',
        previous_reseller_id VARCHAR,
        attributed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_customers_customer_uq ON reseller_customers (customer_user_id);
      CREATE INDEX IF NOT EXISTS reseller_customers_reseller_idx ON reseller_customers (reseller_id);

      CREATE TABLE IF NOT EXISTS reseller_sales (
        id                       VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reseller_id              VARCHAR NOT NULL REFERENCES reseller_profiles(id) ON DELETE RESTRICT,
        customer_user_id         VARCHAR NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        sale_type                VARCHAR(10) NOT NULL,
        plan_id                  VARCHAR NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
        plan_name                TEXT NOT NULL,
        billing_cycle            VARCHAR(10) NOT NULL,
        cycles                   INTEGER NOT NULL DEFAULT 1,
        period_start             TIMESTAMPTZ NOT NULL,
        period_end               TIMESTAMPTZ NOT NULL,
        unit_selling_price       NUMERIC(12,2) NOT NULL,
        selling_price            NUMERIC(12,2) NOT NULL,
        wholesale_cost           NUMERIC(12,2),
        commission_amount        NUMERIC(12,2),
        reseller_earning         NUMERIC(12,2) NOT NULL,
        platform_revenue         NUMERIC(12,2) NOT NULL,
        currency                 VARCHAR(8) NOT NULL DEFAULT 'INR',
        pricing_model            VARCHAR(24) NOT NULL,
        pricing_row_id           VARCHAR,
        pricing_version          INTEGER,
        pricing_snapshot         JSONB NOT NULL,
        payment_status           VARCHAR(24) NOT NULL DEFAULT 'pending',
        activation_policy        VARCHAR(16) NOT NULL,
        transaction_id           VARCHAR REFERENCES transactions(id) ON DELETE RESTRICT,
        subscription_id          VARCHAR REFERENCES subscriptions(id) ON DELETE SET NULL,
        pay_token_hash           VARCHAR(64),
        razorpay_order_id        VARCHAR(64),
        payment_reference        TEXT,
        payment_method           VARCHAR(24),
        paid_at                  TIMESTAMPTZ,
        refunded_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
        cancelled_at             TIMESTAMPTZ,
        renewal_reminder_sent_at TIMESTAMPTZ,
        expiry_notice_sent_at    TIMESTAMPTZ,
        idempotency_key          VARCHAR(80),
        notes                    TEXT,
        created_by               VARCHAR,
        created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reseller_sales_reseller_created_idx ON reseller_sales (reseller_id, created_at);
      CREATE INDEX IF NOT EXISTS reseller_sales_customer_idx ON reseller_sales (customer_user_id);
      CREATE INDEX IF NOT EXISTS reseller_sales_status_idx ON reseller_sales (payment_status);
      CREATE INDEX IF NOT EXISTS reseller_sales_period_end_idx ON reseller_sales (period_end);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_transaction_uq ON reseller_sales (transaction_id);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_order_uq ON reseller_sales (razorpay_order_id);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_token_uq ON reseller_sales (pay_token_hash);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_idem_uq ON reseller_sales (reseller_id, idempotency_key);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_open_uq ON reseller_sales (customer_user_id)
        WHERE payment_status IN ('pending','pending_verification');
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_sales_period_uq ON reseller_sales (customer_user_id, period_start)
        WHERE payment_status NOT IN ('failed','cancelled');

      CREATE TABLE IF NOT EXISTS reseller_ledger_entries (
        id           VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reseller_id  VARCHAR NOT NULL REFERENCES reseller_profiles(id) ON DELETE RESTRICT,
        sale_id      VARCHAR REFERENCES reseller_sales(id) ON DELETE RESTRICT,
        entry_type   VARCHAR(16) NOT NULL,
        amount       NUMERIC(12,2) NOT NULL,
        currency     VARCHAR(8) NOT NULL DEFAULT 'INR',
        reference    VARCHAR(120) NOT NULL,
        available_at TIMESTAMPTZ NOT NULL,
        description  TEXT,
        created_by   VARCHAR,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reseller_ledger_reseller_idx ON reseller_ledger_entries (reseller_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS reseller_ledger_dedupe_uq ON reseller_ledger_entries (entry_type, reference);

      CREATE TABLE IF NOT EXISTS reseller_audit_logs (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        reseller_id   VARCHAR,
        actor_user_id VARCHAR,
        actor_role    VARCHAR(20),
        action        VARCHAR(64) NOT NULL,
        entity_type   VARCHAR(32) NOT NULL,
        entity_id     VARCHAR,
        before        JSONB,
        after         JSONB,
        ip_address    VARCHAR(64),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS reseller_audit_reseller_idx ON reseller_audit_logs (reseller_id, created_at);

      CREATE TABLE IF NOT EXISTS account_invitations (
        id         VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash VARCHAR(64) NOT NULL,
        purpose    VARCHAR(24) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at    TIMESTAMPTZ,
        created_by VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS account_invitations_token_uq ON account_invitations (token_hash);
      CREATE INDEX IF NOT EXISTS account_invitations_user_idx ON account_invitations (user_id);
    `,
  },
  {
    // Ledger rows are financial records: block UPDATE/DELETE at DB level.
    description: "Make reseller_ledger_entries append-only",
    sql: `
      CREATE OR REPLACE FUNCTION reseller_ledger_immutable() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'reseller_ledger_entries is append-only';
      END;
      $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS reseller_ledger_no_update ON reseller_ledger_entries;
      CREATE TRIGGER reseller_ledger_no_update BEFORE UPDATE OR DELETE ON reseller_ledger_entries
        FOR EACH ROW EXECUTE FUNCTION reseller_ledger_immutable();
    `,
  },

  {
    description: "Create demo_requests table",
    sql: `
      CREATE TABLE IF NOT EXISTS demo_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(120) NOT NULL,
        email VARCHAR(200) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        company VARCHAR(160),
        business_type VARCHAR(60),
        team_size VARCHAR(30),
        preferred_time VARCHAR(80),
        message TEXT,
        status VARCHAR(16) NOT NULL DEFAULT 'new',
        notes TEXT,
        source VARCHAR(200),
        ip VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS demo_requests_created_idx ON demo_requests (created_at);
    `,
  },
  {
    description: "Create appointment booking tables",
    sql: `
      CREATE TABLE IF NOT EXISTS appointment_settings (
        channel_id VARCHAR PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
        owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        business_name VARCHAR(80) NOT NULL DEFAULT 'Our clinic',
        provider_label VARCHAR(24) NOT NULL DEFAULT 'Doctor',
        keywords JSONB NOT NULL DEFAULT '["book","appointment","doctor","slot"]'::jsonb,
        welcome_text TEXT NOT NULL DEFAULT 'Book an appointment in a few taps 🩺',
        timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
        booking_window_days INTEGER NOT NULL DEFAULT 7,
        min_notice_minutes INTEGER NOT NULL DEFAULT 60,
        ask_reason BOOLEAN NOT NULL DEFAULT TRUE,
        reminder_minutes INTEGER NOT NULL DEFAULT 120,
        reminder_template VARCHAR(512),
        reminder_template_lang VARCHAR(16) DEFAULT 'en_US',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS appointment_providers (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        name VARCHAR(80) NOT NULL,
        specialty VARCHAR(80),
        fee NUMERIC(12,2),
        slot_minutes INTEGER NOT NULL DEFAULT 15,
        weekly_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
        days_off JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS appointment_providers_channel_idx ON appointment_providers (channel_id);
      CREATE TABLE IF NOT EXISTS appointments (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        ref VARCHAR(24) NOT NULL,
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        owner_id VARCHAR NOT NULL,
        provider_id VARCHAR NOT NULL REFERENCES appointment_providers(id) ON DELETE CASCADE,
        conversation_id VARCHAR,
        phone VARCHAR(24) NOT NULL,
        patient_name VARCHAR(120),
        reason TEXT,
        start_at TIMESTAMPTZ NOT NULL,
        end_at TIMESTAMPTZ NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'booked',
        source VARCHAR(16) NOT NULL DEFAULT 'whatsapp',
        reminder_sent_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS appointments_channel_start_idx ON appointments (channel_id, start_at);
      CREATE INDEX IF NOT EXISTS appointments_phone_idx ON appointments (channel_id, phone);
      CREATE UNIQUE INDEX IF NOT EXISTS appointments_ref_uq ON appointments (ref);
      -- one active booking per doctor per slot (prevents double booking)
      CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_uq ON appointments (provider_id, start_at) WHERE status <> 'cancelled';
      CREATE TABLE IF NOT EXISTS appointment_sessions (
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        phone VARCHAR(24) NOT NULL,
        state VARCHAR(24) NOT NULL DEFAULT 'idle',
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS appointment_sessions_uq ON appointment_sessions (channel_id, phone);
    `,
  },
  {
    description: "Create WhatsApp Mini Store tables",
    sql: `
      CREATE TABLE IF NOT EXISTS store_settings (
        channel_id VARCHAR PRIMARY KEY REFERENCES channels(id) ON DELETE CASCADE,
        owner_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        store_name VARCHAR(80) NOT NULL DEFAULT 'Our store',
        keywords JSONB NOT NULL DEFAULT '["shop","store","menu","order","catalog"]'::jsonb,
        welcome_text TEXT NOT NULL DEFAULT 'Welcome! 👋 Browse our products below and order right here on WhatsApp.',
        currency VARCHAR(3) NOT NULL DEFAULT 'INR',
        ask_address BOOLEAN NOT NULL DEFAULT TRUE,
        cod_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        upi_id VARCHAR(100),
        razorpay_key_id VARCHAR(100),
        razorpay_key_secret TEXT,
        razorpay_webhook_secret TEXT,
        delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_order NUMERIC(12,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS store_type VARCHAR(12) NOT NULL DEFAULT 'products';
      ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS checkout_prompt TEXT;
      CREATE TABLE IF NOT EXISTS store_products (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        name VARCHAR(120) NOT NULL,
        description TEXT,
        category VARCHAR(60) NOT NULL DEFAULT 'All',
        price NUMERIC(12,2) NOT NULL,
        image_url TEXT,
        stock INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS store_products_channel_idx ON store_products (channel_id);
      CREATE TABLE IF NOT EXISTS store_carts (
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        phone VARCHAR(24) NOT NULL,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        state VARCHAR(32) NOT NULL DEFAULT 'browsing',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS store_carts_channel_phone_uq ON store_carts (channel_id, phone);
      CREATE TABLE IF NOT EXISTS store_orders (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number VARCHAR(32) NOT NULL,
        channel_id VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        owner_id VARCHAR NOT NULL,
        conversation_id VARCHAR,
        phone VARCHAR(24) NOT NULL,
        customer_name VARCHAR(120),
        items JSONB NOT NULL,
        subtotal NUMERIC(12,2) NOT NULL,
        delivery_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
        total NUMERIC(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'INR',
        address TEXT,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        payment_method VARCHAR(16),
        payment_status VARCHAR(16) NOT NULL DEFAULT 'unpaid',
        payment_link_id VARCHAR(64),
        payment_link_url TEXT,
        tracking_url TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS store_orders_channel_idx ON store_orders (channel_id, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS store_orders_number_uq ON store_orders (order_number);
      CREATE INDEX IF NOT EXISTS store_orders_phone_idx ON store_orders (channel_id, phone);
    `,
  },
  {
    description: "Create integrations tables (Shopify, WooCommerce, Google Sheets, CRM)",
    sql: `
      CREATE TABLE IF NOT EXISTS integrations (
        id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id      VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id    VARCHAR NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
        type          VARCHAR(32) NOT NULL,
        name          VARCHAR(120) NOT NULL,
        status        VARCHAR(16) NOT NULL DEFAULT 'active',
        token         VARCHAR(64) NOT NULL,
        config        JSONB NOT NULL DEFAULT '{}'::jsonb,
        last_event_at TIMESTAMPTZ,
        event_count   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS integrations_owner_idx ON integrations (owner_id);
      CREATE UNIQUE INDEX IF NOT EXISTS integrations_token_uq ON integrations (token);

      CREATE TABLE IF NOT EXISTS integration_rules (
        id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id  VARCHAR NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
        event           VARCHAR(80) NOT NULL,
        template_name   VARCHAR(512) NOT NULL,
        language        VARCHAR(16) NOT NULL DEFAULT 'en_US',
        phone_path      VARCHAR(200),
        variables       JSONB NOT NULL DEFAULT '[]'::jsonb,
        header_variable VARCHAR(200),
        button_variable VARCHAR(200),
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS integration_rules_int_idx ON integration_rules (integration_id);

      CREATE TABLE IF NOT EXISTS integration_logs (
        id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        integration_id VARCHAR NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
        direction      VARCHAR(8) NOT NULL DEFAULT 'in',
        event          VARCHAR(80) NOT NULL,
        status         VARCHAR(16) NOT NULL,
        phone          VARCHAR(24),
        detail         TEXT,
        payload        JSONB,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS integration_logs_int_idx ON integration_logs (integration_id, created_at);
    `,
  },

  // ────────────────────────────────────────────────────
  // Convert every legacy `TIMESTAMP WITHOUT TIME ZONE` column in the
  // public schema to `TIMESTAMPTZ`, interpreting the existing wall-clock
  // value as UTC (the server has always run in UTC).
  //
  // This fixes the dashboard-time-drift bug where rows stored as naive
  // timestamps were sent to the browser without an offset, causing
  // `new Date(...)` to interpret them in the browser's local timezone.
  //
  // Idempotent: once a column is already `timestamp with time zone` it
  // is excluded from the loop. The session.expire column is excluded
  // because it is owned by `connect-pg-simple`, which expects
  // `TIMESTAMP(6) WITHOUT TIME ZONE`.
  // ────────────────────────────────────────────────────
  {
    description:
      "Convert all naive timestamp columns to timestamptz (interpret existing values as UTC)",
    sql: `
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND data_type = 'timestamp without time zone'
            AND NOT (table_name = 'session' AND column_name = 'expire')
        LOOP
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
            r.table_name, r.column_name, r.column_name
          );
        END LOOP;
      END$$;
    `,
  },
];

/**
 * Query existing columns across all tables we intend to alter so we can
 * report what was actually added vs already present.
 */
async function getExistingColumns(
  client: Awaited<ReturnType<Pool["connect"]>>
): Promise<Set<string>> {
  const { rows } = await client.query<{ key: string }>(`
    SELECT table_name || '.' || column_name AS key
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  return new Set(rows.map((r) => r.key));
}

async function getExistingTables(
  client: Awaited<ReturnType<Pool["connect"]>>
): Promise<Set<string>> {
  const { rows } = await client.query<{ table_name: string }>(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  return new Set(rows.map((r) => r.table_name));
}

export async function runStartupMigration(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    const beforeColumns = await getExistingColumns(client);
    const beforeTables = await getExistingTables(client);

    const errors: string[] = [];

    for (const step of steps) {
      try {
        const result = await client.query(step.sql);
        if (step.logRowCount && result.rowCount && result.rowCount > 0) {
          console.log(
            `[startup-migration] ${step.description} — patched ${result.rowCount} row(s).`
          );
        }
      } catch (err: any) {
        errors.push(
          `[startup-migration] FAILED — ${step.description}: ${err.message}`
        );
      }
    }

    if (errors.length > 0) {
      for (const e of errors) {
        console.error(e);
      }
      throw new Error(
        `Startup migration encountered ${errors.length} error(s). See logs above.`
      );
    }

    const afterColumns = await getExistingColumns(client);
    const afterTables = await getExistingTables(client);

    const addedColumns = [...afterColumns].filter(
      (c) => !beforeColumns.has(c)
    );
    const addedTables = [...afterTables].filter(
      (t) => !beforeTables.has(t)
    );

    if (addedColumns.length === 0 && addedTables.length === 0) {
      console.log("[startup-migration] All schema checks passed — database is up to date.");
    } else {
      if (addedTables.length > 0) {
        console.log(
          `[startup-migration] Created ${addedTables.length} new table(s): ${addedTables.join(", ")}`
        );
      }
      if (addedColumns.length > 0) {
        console.log(
          `[startup-migration] Added ${addedColumns.length} missing column(s): ${addedColumns.join(", ")}`
        );
      }
    }
  } finally {
    client.release();
  }
}
