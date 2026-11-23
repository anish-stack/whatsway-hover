CREATE TABLE "account_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"purpose" varchar(24) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_rate_cards" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" varchar(8) NOT NULL,
	"country_name" text,
	"category" varchar(40) NOT NULL,
	"rate" numeric(12, 6) NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"free_monthly_allowance" integer,
	"volume_tiers" jsonb,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"pricing_source" text,
	"pricing_version" varchar(64),
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reseller_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" varchar,
	"actor_user_id" varchar,
	"actor_role" varchar(20),
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" varchar,
	"before" jsonb,
	"after" jsonb,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" varchar NOT NULL,
	"customer_user_id" varchar NOT NULL,
	"business_name" text,
	"mobile" varchar(20),
	"source" varchar(24) DEFAULT 'reseller_created' NOT NULL,
	"previous_reseller_id" varchar,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reseller_ledger_entries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" varchar NOT NULL,
	"sale_id" varchar,
	"entry_type" varchar(16) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"reference" varchar(120) NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"description" text,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reseller_plan_pricing" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"billing_cycle" varchar(10) NOT NULL,
	"customer_user_id" varchar,
	"pricing_model" varchar(24) NOT NULL,
	"wholesale_price" numeric(12, 2),
	"commission_percent" numeric(6, 3),
	"fixed_commission" numeric(12, 2),
	"suggested_retail_price" numeric(12, 2) NOT NULL,
	"min_selling_price" numeric(12, 2) NOT NULL,
	"max_selling_price" numeric(12, 2),
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" varchar,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reseller_profiles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"reseller_code" varchar(16) NOT NULL,
	"business_name" text NOT NULL,
	"contact_person" text NOT NULL,
	"email" text NOT NULL,
	"mobile" varchar(20) NOT NULL,
	"company_name" text,
	"address" text,
	"status" varchar(24) DEFAULT 'pending_activation' NOT NULL,
	"max_customers" integer DEFAULT 0 NOT NULL,
	"default_pricing_model" varchar(24) DEFAULT 'wholesale' NOT NULL,
	"activation_policy" varchar(16) DEFAULT 'on_payment' NOT NULL,
	"refund_policy" varchar(16) DEFAULT 'proportional' NOT NULL,
	"payout_hold_days" integer DEFAULT 7 NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_until" timestamp with time zone,
	"notes" text,
	"suspended_reason" text,
	"created_by" varchar,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reseller_sales" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reseller_id" varchar NOT NULL,
	"customer_user_id" varchar NOT NULL,
	"sale_type" varchar(10) NOT NULL,
	"plan_id" varchar NOT NULL,
	"plan_name" text NOT NULL,
	"billing_cycle" varchar(10) NOT NULL,
	"cycles" integer DEFAULT 1 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"unit_selling_price" numeric(12, 2) NOT NULL,
	"selling_price" numeric(12, 2) NOT NULL,
	"wholesale_cost" numeric(12, 2),
	"commission_amount" numeric(12, 2),
	"reseller_earning" numeric(12, 2) NOT NULL,
	"platform_revenue" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"pricing_model" varchar(24) NOT NULL,
	"pricing_row_id" varchar,
	"pricing_version" integer,
	"pricing_snapshot" jsonb NOT NULL,
	"payment_status" varchar(24) DEFAULT 'pending' NOT NULL,
	"activation_policy" varchar(16) NOT NULL,
	"transaction_id" varchar,
	"subscription_id" varchar,
	"pay_token_hash" varchar(64),
	"razorpay_order_id" varchar(64),
	"payment_reference" text,
	"payment_method" varchar(24),
	"paid_at" timestamp with time zone,
	"refunded_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"renewal_reminder_sent_at" timestamp with time zone,
	"expiry_notice_sent_at" timestamp with time zone,
	"idempotency_key" varchar(80),
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_account_health" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" varchar NOT NULL,
	"customer_id" varchar,
	"waba_id" varchar(64),
	"phone_number_id" varchar(64),
	"business_id" varchar(64),
	"business_name" text,
	"business_verification_status" varchar(40),
	"waba_name" text,
	"waba_review_status" varchar(40),
	"waba_can_send" varchar(16),
	"account_mode" varchar(20),
	"phone_number" text,
	"verified_name" text,
	"name_status" varchar(40),
	"quality_rating" varchar(16),
	"messaging_limit" varchar(40),
	"phone_status" varchar(40),
	"code_verification_status" varchar(40),
	"phone_can_send" varchar(16),
	"messaging_availability" varchar(16),
	"billing_status" varchar(20),
	"template_counts" jsonb DEFAULT '{}'::jsonb,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"calling_issues" jsonb DEFAULT '[]'::jsonb,
	"overall_status" varchar(20) DEFAULT 'unknown' NOT NULL,
	"raw" jsonb,
	"last_error" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_message_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"channel_id" varchar,
	"waba_id" varchar(64),
	"phone_number_id" varchar(64),
	"message_id" varchar(191) NOT NULL,
	"recipient_country" varchar(8),
	"recipient_dial_code" varchar(8),
	"category" varchar(40) DEFAULT 'service' NOT NULL,
	"pricing_type" varchar(40),
	"pricing_model" varchar(16),
	"billable" boolean DEFAULT false NOT NULL,
	"status" varchar(16) NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_code" varchar(32),
	"campaign_id" varchar,
	"template_id" varchar,
	"template_name" text,
	"rate_card_id" varchar,
	"applied_rate" numeric(12, 6),
	"estimated_cost" numeric(14, 6) DEFAULT '0' NOT NULL,
	"currency" varchar(8),
	"pricing_version" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "account_invitations" ADD CONSTRAINT "account_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_customers" ADD CONSTRAINT "reseller_customers_reseller_id_reseller_profiles_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."reseller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_customers" ADD CONSTRAINT "reseller_customers_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_ledger_entries" ADD CONSTRAINT "reseller_ledger_entries_reseller_id_reseller_profiles_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."reseller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_ledger_entries" ADD CONSTRAINT "reseller_ledger_entries_sale_id_reseller_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."reseller_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_plan_pricing" ADD CONSTRAINT "reseller_plan_pricing_reseller_id_reseller_profiles_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."reseller_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_plan_pricing" ADD CONSTRAINT "reseller_plan_pricing_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_plan_pricing" ADD CONSTRAINT "reseller_plan_pricing_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_profiles" ADD CONSTRAINT "reseller_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_sales" ADD CONSTRAINT "reseller_sales_reseller_id_reseller_profiles_id_fk" FOREIGN KEY ("reseller_id") REFERENCES "public"."reseller_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_sales" ADD CONSTRAINT "reseller_sales_customer_user_id_users_id_fk" FOREIGN KEY ("customer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_sales" ADD CONSTRAINT "reseller_sales_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_sales" ADD CONSTRAINT "reseller_sales_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reseller_sales" ADD CONSTRAINT "reseller_sales_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_invitations_token_uq" ON "account_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_invitations_user_idx" ON "account_invitations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "meta_rate_cards_lookup_idx" ON "meta_rate_cards" USING btree ("country_code","category","effective_from");--> statement-breakpoint
CREATE INDEX "reseller_audit_reseller_idx" ON "reseller_audit_logs" USING btree ("reseller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_customers_customer_uq" ON "reseller_customers" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "reseller_customers_reseller_idx" ON "reseller_customers" USING btree ("reseller_id");--> statement-breakpoint
CREATE INDEX "reseller_ledger_reseller_idx" ON "reseller_ledger_entries" USING btree ("reseller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_ledger_dedupe_uq" ON "reseller_ledger_entries" USING btree ("entry_type","reference");--> statement-breakpoint
CREATE INDEX "reseller_pricing_reseller_idx" ON "reseller_plan_pricing" USING btree ("reseller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_pricing_active_uq" ON "reseller_plan_pricing" USING btree ("reseller_id","plan_id","billing_cycle",COALESCE("customer_user_id", '')) WHERE "reseller_plan_pricing"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_profiles_user_uq" ON "reseller_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_profiles_code_uq" ON "reseller_profiles" USING btree ("reseller_code");--> statement-breakpoint
CREATE INDEX "reseller_profiles_status_idx" ON "reseller_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reseller_sales_reseller_created_idx" ON "reseller_sales" USING btree ("reseller_id","created_at");--> statement-breakpoint
CREATE INDEX "reseller_sales_customer_idx" ON "reseller_sales" USING btree ("customer_user_id");--> statement-breakpoint
CREATE INDEX "reseller_sales_status_idx" ON "reseller_sales" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "reseller_sales_period_end_idx" ON "reseller_sales" USING btree ("period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_transaction_uq" ON "reseller_sales" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_order_uq" ON "reseller_sales" USING btree ("razorpay_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_token_uq" ON "reseller_sales" USING btree ("pay_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_idem_uq" ON "reseller_sales" USING btree ("reseller_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_open_uq" ON "reseller_sales" USING btree ("customer_user_id") WHERE "reseller_sales"."payment_status" IN ('pending','pending_verification');--> statement-breakpoint
CREATE UNIQUE INDEX "reseller_sales_period_uq" ON "reseller_sales" USING btree ("customer_user_id","period_start") WHERE "reseller_sales"."payment_status" NOT IN ('failed','cancelled');--> statement-breakpoint
CREATE UNIQUE INDEX "wa_health_channel_uq" ON "whatsapp_account_health" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "wa_health_customer_idx" ON "whatsapp_account_health" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wa_health_overall_idx" ON "whatsapp_account_health" USING btree ("overall_status");--> statement-breakpoint
CREATE UNIQUE INDEX "wa_usage_message_id_uq" ON "whatsapp_message_usage" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "wa_usage_customer_created_idx" ON "whatsapp_message_usage" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "wa_usage_customer_delivered_idx" ON "whatsapp_message_usage" USING btree ("customer_id","delivered_at");--> statement-breakpoint
CREATE INDEX "wa_usage_waba_idx" ON "whatsapp_message_usage" USING btree ("waba_id");--> statement-breakpoint
CREATE INDEX "wa_usage_phone_idx" ON "whatsapp_message_usage" USING btree ("phone_number_id");--> statement-breakpoint
CREATE INDEX "wa_usage_delivered_idx" ON "whatsapp_message_usage" USING btree ("delivered_at");--> statement-breakpoint
CREATE INDEX "wa_usage_category_idx" ON "whatsapp_message_usage" USING btree ("category");--> statement-breakpoint
CREATE INDEX "wa_usage_campaign_idx" ON "whatsapp_message_usage" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "wa_usage_created_idx" ON "whatsapp_message_usage" USING btree ("created_at");