CREATE TYPE "billing_feature_value_type" AS ENUM('boolean', 'number', 'string', 'json');--> statement-breakpoint
CREATE TYPE "billing_interval" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "entitlement_status" AS ENUM('active', 'inactive', 'expired');--> statement-breakpoint
CREATE TYPE "invoice_status" AS ENUM('draft', 'open', 'paid', 'void', 'uncollectible');--> statement-breakpoint
CREATE TYPE "price_type" AS ENUM('fixed', 'metered');--> statement-breakpoint
CREATE TYPE "subscription_status" AS ENUM('trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "usage_aggregation" AS ENUM('sum', 'count', 'max', 'last');--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_customer_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application" varchar(64) NOT NULL,
	"key" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"value_type" "billing_feature_value_type" DEFAULT 'boolean'::"billing_feature_value_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_product_availability" (
	"product_id" uuid,
	"country_code" varchar(2),
	"currency" varchar(3),
	"is_available" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	CONSTRAINT "billing_product_availability_pkey" PRIMARY KEY("product_id","country_code","currency")
);
--> statement-breakpoint
CREATE TABLE "billing_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"application" varchar(64) NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"application" varchar(64) NOT NULL,
	"feature" varchar(128) NOT NULL,
	"value" jsonb DEFAULT 'true' NOT NULL,
	"status" "entitlement_status" DEFAULT 'active'::"entitlement_status" NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"invoice_id" uuid NOT NULL,
	"subscription_item_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_amount" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_quantity_check" CHECK ("quantity" > 0),
	CONSTRAINT "invoice_items_unit_amount_check" CHECK ("unit_amount" >= 0),
	CONSTRAINT "invoice_items_amount_check" CHECK ("amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid,
	"subscription_id" uuid,
	"provider" varchar(64),
	"provider_invoice_id" text,
	"number" varchar(64),
	"status" "invoice_status" DEFAULT 'draft'::"invoice_status" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"tax" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"amount_due" bigint DEFAULT 0 NOT NULL,
	"amount_paid" bigint DEFAULT 0 NOT NULL,
	"amount_refunded" bigint DEFAULT 0 NOT NULL,
	"period_start" timestamp,
	"period_end" timestamp,
	"due_at" timestamp,
	"paid_at" timestamp,
	"voided_at" timestamp,
	"hosted_invoice_url" text,
	"invoice_pdf_url" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_total_check" CHECK ("total" >= 0),
	CONSTRAINT "invoices_amount_due_check" CHECK ("amount_due" >= 0),
	CONSTRAINT "invoices_amount_paid_check" CHECK ("amount_paid" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_features" (
	"plan_id" uuid,
	"feature_id" uuid,
	"value" jsonb DEFAULT 'true' NOT NULL,
	"soft_limit" numeric(20,6),
	"hard_limit" numeric(20,6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plan_features_pkey" PRIMARY KEY("plan_id","feature_id"),
	CONSTRAINT "plan_features_limits_check" CHECK ("soft_limit" is null or "hard_limit" is null or "soft_limit" <= "hard_limit")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"product_id" uuid,
	"code" varchar(64) NOT NULL UNIQUE,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"plan_id" uuid NOT NULL,
	"provider" varchar(64),
	"provider_price_id" text,
	"type" "price_type" DEFAULT 'fixed'::"price_type" NOT NULL,
	"currency" varchar(3) NOT NULL,
	"unit_amount" bigint NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"trial_period_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "prices_unit_amount_check" CHECK ("unit_amount" >= 0),
	CONSTRAINT "prices_interval_count_check" CHECK ("interval_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"subscription_id" uuid NOT NULL,
	"price_id" uuid NOT NULL,
	"provider_item_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_items_quantity_check" CHECK ("quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"customer_id" uuid,
	"provider" varchar(64),
	"provider_subscription_id" text,
	"application" varchar(64) NOT NULL,
	"status" "subscription_status" DEFAULT 'active'::"subscription_status" NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancel_at" timestamp,
	"cancelled_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_aggregates" (
	"meter_id" uuid,
	"user_id" uuid,
	"subscription_id" uuid,
	"period_start" timestamp,
	"period_end" timestamp,
	"quantity" numeric(20,6) NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_aggregates_pkey" PRIMARY KEY("meter_id","user_id","period_start","period_end"),
	CONSTRAINT "usage_aggregates_quantity_check" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "usage_meters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"key" varchar(128) NOT NULL UNIQUE,
	"event_name" varchar(128) NOT NULL,
	"aggregation" "usage_aggregation" DEFAULT 'sum'::"usage_aggregation" NOT NULL,
	"unit" varchar(64) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"subscription_id" uuid,
	"subscription_item_id" uuid,
	"meter_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"quantity" numeric(20,6) NOT NULL,
	"dimensions" jsonb DEFAULT '{}' NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "usage_records_quantity_check" CHECK ("quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"external_user_id" text NOT NULL UNIQUE,
	"name" text DEFAULT '' NOT NULL,
	"username" varchar(32) UNIQUE,
	"role" varchar(32) DEFAULT 'user' NOT NULL,
	"email" varchar(255) NOT NULL UNIQUE,
	"image" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_provider_key" ON "billing_customers" ("user_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_provider_reference_key" ON "billing_customers" ("provider","provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_features_application_key_key" ON "billing_features" ("application","key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_products_application_code_key" ON "billing_products" ("application","code");--> statement-breakpoint
CREATE INDEX "billing_products_application_active_idx" ON "billing_products" ("application","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_user_application_feature_subscription_key" ON "entitlements" ("user_id","application","feature","subscription_id");--> statement-breakpoint
CREATE INDEX "entitlements_user_application_status_idx" ON "entitlements" ("user_id","application","status");--> statement-breakpoint
CREATE INDEX "entitlements_expires_at_idx" ON "entitlements" ("expires_at");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_provider_reference_key" ON "invoices" ("provider","provider_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" ("number");--> statement-breakpoint
CREATE INDEX "invoices_user_created_at_idx" ON "invoices" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_subscription_id_idx" ON "invoices" ("subscription_id");--> statement-breakpoint
CREATE INDEX "invoices_status_due_at_idx" ON "invoices" ("status","due_at");--> statement-breakpoint
CREATE INDEX "plans_product_active_idx" ON "plans" ("product_id","is_active");--> statement-breakpoint
CREATE INDEX "plans_active_created_at_idx" ON "plans" ("is_active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "prices_provider_reference_key" ON "prices" ("provider","provider_price_id");--> statement-breakpoint
CREATE INDEX "prices_plan_active_idx" ON "prices" ("plan_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_items_subscription_price_key" ON "subscription_items" ("subscription_id","price_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_items_provider_reference_key" ON "subscription_items" ("provider_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_reference_key" ON "subscriptions" ("provider","provider_subscription_id");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_application_status_idx" ON "subscriptions" ("application","status");--> statement-breakpoint
CREATE INDEX "subscriptions_period_end_idx" ON "subscriptions" ("current_period_end");--> statement-breakpoint
CREATE INDEX "usage_aggregates_subscription_period_idx" ON "usage_aggregates" ("subscription_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_meters_event_name_idx" ON "usage_meters" ("event_name");--> statement-breakpoint
CREATE INDEX "usage_records_meter_recorded_at_idx" ON "usage_records" ("meter_id","recorded_at");--> statement-breakpoint
CREATE INDEX "usage_records_user_recorded_at_idx" ON "usage_records" ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "usage_records_subscription_id_idx" ON "usage_records" ("subscription_id");--> statement-breakpoint
CREATE INDEX "users_last_seen_at_idx" ON "users" ("last_seen_at");--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "billing_product_availability" ADD CONSTRAINT "billing_product_availability_5GX3T9Q2lyCY_fkey" FOREIGN KEY ("product_id") REFERENCES "billing_products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_subscription_item_id_subscription_items_id_fkey" FOREIGN KEY ("subscription_item_id") REFERENCES "subscription_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_feature_id_billing_features_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "billing_features"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_product_id_billing_products_id_fkey" FOREIGN KEY ("product_id") REFERENCES "billing_products"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_plan_id_plans_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_price_id_prices_id_fkey" FOREIGN KEY ("price_id") REFERENCES "prices"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_billing_customers_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "billing_customers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_meter_id_usage_meters_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "usage_meters"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_aggregates" ADD CONSTRAINT "usage_aggregates_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscription_id_subscriptions_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_subscription_item_id_subscription_items_id_fkey" FOREIGN KEY ("subscription_item_id") REFERENCES "subscription_items"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_meter_id_usage_meters_id_fkey" FOREIGN KEY ("meter_id") REFERENCES "usage_meters"("id") ON DELETE RESTRICT;