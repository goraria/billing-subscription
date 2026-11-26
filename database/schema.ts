export { httpRateLimitTable } from "@/database/http-rate-limit-schema";
import { sql } from "drizzle-orm"
import { relations } from "drizzle-orm/_relations"
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core"

export const billingInterval = pgEnum("billing_interval", [
  "day",
  "week",
  "month",
  "year",
])

export const priceType = pgEnum("price_type", ["fixed", "metered"])

export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "paused",
  "cancelled",
  "expired",
])

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
])

export const entitlementStatus = pgEnum("entitlement_status", [
  "active",
  "inactive",
  "expired",
])

export const usageAggregation = pgEnum("usage_aggregation", [
  "sum",
  "count",
  "max",
  "last",
])

export const billingFeatureValueType = pgEnum("billing_feature_value_type", [
  "boolean",
  "number",
  "string",
  "json",
])

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    externalUserId: text("external_user_id").notNull().unique(),
    name: text("name").notNull().default(""),
    username: varchar("username", { length: 32 }).unique(),
    role: varchar("role", { length: 32 }).notNull().default("user"),
    email: varchar("email", { length: 255 }).notNull().unique(),
    image: text("image"),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    lastSeenAt: timestamp("last_seen_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("users_last_seen_at_idx").on(table.lastSeenAt)]
)

export const billingProductsTable = pgTable(
  "billing_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    application: varchar("application", { length: 64 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("billing_products_application_code_key").on(
      table.application,
      table.code
    ),
    index("billing_products_application_active_idx").on(
      table.application,
      table.isActive
    ),
  ]
)

export const billingFeaturesTable = pgTable(
  "billing_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    application: varchar("application", { length: 64 }).notNull(),
    key: varchar("key", { length: 128 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    valueType: billingFeatureValueType("value_type")
      .notNull()
      .default("boolean"),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_features_application_key_key").on(
      table.application,
      table.key
    ),
  ]
)

export const billingProductAvailabilityTable = pgTable(
  "billing_product_availability",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => billingProductsTable.id, { onDelete: "cascade" }),
    countryCode: varchar("country_code", { length: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    isAvailable: boolean("is_available").notNull().default(true),
    startsAt: timestamp("starts_at", { mode: "date" }),
    endsAt: timestamp("ends_at", { mode: "date" }),
  },
  (table) => [
    primaryKey({
      columns: [table.productId, table.countryCode, table.currency],
    }),
  ]
)

export const plansTable = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => billingProductsTable.id, {
      onDelete: "cascade",
    }),
    code: varchar("code", { length: 64 }).notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    index("plans_product_active_idx").on(table.productId, table.isActive),
    index("plans_active_created_at_idx").on(table.isActive, table.createdAt),
  ]
)

export const planFeaturesTable = pgTable(
  "plan_features",
  {
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    featureId: uuid("feature_id")
      .notNull()
      .references(() => billingFeaturesTable.id, { onDelete: "cascade" }),
    value: jsonb("value").notNull().default(sql.raw("'true'::jsonb")),
    softLimit: numeric("soft_limit", { precision: 20, scale: 6 }),
    hardLimit: numeric("hard_limit", { precision: 20, scale: 6 }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.featureId] }),
    check(
      "plan_features_limits_check",
      sql`${table.softLimit} is null or ${table.hardLimit} is null or ${table.softLimit} <= ${table.hardLimit}`
    ),
  ]
)

export const pricesTable = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plansTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }),
    providerPriceId: text("provider_price_id"),
    type: priceType("type").notNull().default("fixed"),
    currency: varchar("currency", { length: 3 }).notNull(),
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull(),
    interval: billingInterval("interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    trialPeriodDays: integer("trial_period_days"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { mode: "date" }),
  },
  (table) => [
    uniqueIndex("prices_provider_reference_key").on(
      table.provider,
      table.providerPriceId
    ),
    index("prices_plan_active_idx").on(table.planId, table.isActive),
    check("prices_unit_amount_check", sql`${table.unitAmount} >= 0`),
    check("prices_interval_count_check", sql`${table.intervalCount} > 0`),
  ]
)

export const billingCustomersTable = pgTable(
  "billing_customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerCustomerId: text("provider_customer_id").notNull(),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_customers_user_provider_key").on(
      table.userId,
      table.provider
    ),
    uniqueIndex("billing_customers_provider_reference_key").on(
      table.provider,
      table.providerCustomerId
    ),
  ]
)

export const subscriptionsTable = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => billingCustomersTable.id, {
      onDelete: "set null",
    }),
    provider: varchar("provider", { length: 64 }),
    providerSubscriptionId: text("provider_subscription_id"),
    application: varchar("application", { length: 64 }).notNull(),
    status: subscriptionStatus("status").notNull().default("active"),
    currentPeriodStart: timestamp("current_period_start", { mode: "date" }),
    currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
    trialStart: timestamp("trial_start", { mode: "date" }),
    trialEnd: timestamp("trial_end", { mode: "date" }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelAt: timestamp("cancel_at", { mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { mode: "date" }),
    endedAt: timestamp("ended_at", { mode: "date" }),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscriptions_provider_reference_key").on(
      table.provider,
      table.providerSubscriptionId
    ),
    index("subscriptions_user_status_idx").on(table.userId, table.status),
    index("subscriptions_application_status_idx").on(
      table.application,
      table.status
    ),
    index("subscriptions_period_end_idx").on(table.currentPeriodEnd),
  ]
)

export const subscriptionItemsTable = pgTable(
  "subscription_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptionsTable.id, { onDelete: "cascade" }),
    priceId: uuid("price_id")
      .notNull()
      .references(() => pricesTable.id, { onDelete: "restrict" }),
    providerItemId: text("provider_item_id"),
    quantity: integer("quantity").notNull().default(1),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_items_subscription_price_key").on(
      table.subscriptionId,
      table.priceId
    ),
    uniqueIndex("subscription_items_provider_reference_key").on(
      table.providerItemId
    ),
    check("subscription_items_quantity_check", sql`${table.quantity} > 0`),
  ]
)

export const invoicesTable = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptionsTable.id,
      { onDelete: "set null" }
    ),
    provider: varchar("provider", { length: 64 }),
    providerInvoiceId: text("provider_invoice_id"),
    number: varchar("number", { length: 64 }),
    status: invoiceStatus("status").notNull().default("draft"),
    currency: varchar("currency", { length: 3 }).notNull(),
    subtotal: bigint("subtotal", { mode: "number" }).notNull().default(0),
    tax: bigint("tax", { mode: "number" }).notNull().default(0),
    discount: bigint("discount", { mode: "number" }).notNull().default(0),
    total: bigint("total", { mode: "number" }).notNull().default(0),
    amountDue: bigint("amount_due", { mode: "number" }).notNull().default(0),
    amountPaid: bigint("amount_paid", { mode: "number" }).notNull().default(0),
    amountRefunded: bigint("amount_refunded", { mode: "number" })
      .notNull()
      .default(0),
    periodStart: timestamp("period_start", { mode: "date" }),
    periodEnd: timestamp("period_end", { mode: "date" }),
    dueAt: timestamp("due_at", { mode: "date" }),
    paidAt: timestamp("paid_at", { mode: "date" }),
    voidedAt: timestamp("voided_at", { mode: "date" }),
    hostedInvoiceUrl: text("hosted_invoice_url"),
    invoicePdfUrl: text("invoice_pdf_url"),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("invoices_provider_reference_key").on(
      table.provider,
      table.providerInvoiceId
    ),
    uniqueIndex("invoices_number_key").on(table.number),
    uniqueIndex("invoices_subscription_period_key").on(table.subscriptionId, table.periodStart, table.periodEnd),
    index("invoices_user_created_at_idx").on(table.userId, table.createdAt),
    index("invoices_subscription_id_idx").on(table.subscriptionId),
    index("invoices_status_due_at_idx").on(table.status, table.dueAt),
    check("invoices_total_check", sql`${table.total} >= 0`),
    check("invoices_amount_due_check", sql`${table.amountDue} >= 0`),
    check("invoices_amount_paid_check", sql`${table.amountPaid} >= 0`),
  ]
)

export const invoiceItemsTable = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoicesTable.id, { onDelete: "cascade" }),
    subscriptionItemId: uuid("subscription_item_id").references(
      () => subscriptionItemsTable.id,
      { onDelete: "set null" }
    ),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitAmount: bigint("unit_amount", { mode: "number" }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    periodStart: timestamp("period_start", { mode: "date" }),
    periodEnd: timestamp("period_end", { mode: "date" }),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("invoice_items_invoice_id_idx").on(table.invoiceId),
    check("invoice_items_quantity_check", sql`${table.quantity} > 0`),
    check("invoice_items_unit_amount_check", sql`${table.unitAmount} >= 0`),
    check("invoice_items_amount_check", sql`${table.amount} >= 0`),
  ]
)

export const entitlementsTable = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptionsTable.id,
      { onDelete: "cascade" }
    ),
    application: varchar("application", { length: 64 }).notNull(),
    feature: varchar("feature", { length: 128 }).notNull(),
    value: jsonb("value").notNull().default(sql.raw("'true'::jsonb")),
    status: entitlementStatus("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("entitlements_user_application_feature_subscription_key").on(
      table.userId,
      table.application,
      table.feature,
      table.subscriptionId
    ),
    index("entitlements_user_application_status_idx").on(
      table.userId,
      table.application,
      table.status
    ),
    index("entitlements_expires_at_idx").on(table.expiresAt),
  ]
)

export const usageMetersTable = pgTable(
  "usage_meters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: varchar("key", { length: 128 }).notNull().unique(),
    eventName: varchar("event_name", { length: 128 }).notNull(),
    aggregation: usageAggregation("aggregation").notNull().default("sum"),
    unit: varchar("unit", { length: 64 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").notNull().default(sql.raw("'{}'::jsonb")),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [index("usage_meters_event_name_idx").on(table.eventName)]
)

export const usageRecordsTable = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptionsTable.id,
      { onDelete: "set null" }
    ),
    subscriptionItemId: uuid("subscription_item_id").references(
      () => subscriptionItemsTable.id,
      { onDelete: "set null" }
    ),
    meterId: uuid("meter_id")
      .notNull()
      .references(() => usageMetersTable.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    dimensions: jsonb("dimensions").notNull().default(sql.raw("'{}'::jsonb")),
    recordedAt: timestamp("recorded_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_records_meter_recorded_at_idx").on(
      table.meterId,
      table.recordedAt
    ),
    index("usage_records_user_recorded_at_idx").on(
      table.userId,
      table.recordedAt
    ),
    index("usage_records_subscription_id_idx").on(table.subscriptionId),
    check("usage_records_quantity_check", sql`${table.quantity} >= 0`),
  ]
)

export const usageAggregatesTable = pgTable(
  "usage_aggregates",
  {
    meterId: uuid("meter_id")
      .notNull()
      .references(() => usageMetersTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(
      () => subscriptionsTable.id,
      { onDelete: "cascade" }
    ),
    periodStart: timestamp("period_start", { mode: "date" }).notNull(),
    periodEnd: timestamp("period_end", { mode: "date" }).notNull(),
    quantity: numeric("quantity", { precision: 20, scale: 6 }).notNull(),
    calculatedAt: timestamp("calculated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.meterId,
        table.userId,
        table.periodStart,
        table.periodEnd,
      ],
    }),
    index("usage_aggregates_subscription_period_idx").on(
      table.subscriptionId,
      table.periodStart,
      table.periodEnd
    ),
    check("usage_aggregates_quantity_check", sql`${table.quantity} >= 0`),
  ]
)

export const usersRelations = relations(usersTable, ({ many }) => ({
  customers: many(billingCustomersTable),
  subscriptions: many(subscriptionsTable),
  invoices: many(invoicesTable),
  entitlements: many(entitlementsTable),
  usageRecords: many(usageRecordsTable),
}))

export const plansRelations = relations(plansTable, ({ many }) => ({
  prices: many(pricesTable),
  features: many(planFeaturesTable),
}))

export const subscriptionsRelations = relations(
  subscriptionsTable,
  ({ many, one }) => ({
    user: one(usersTable, {
      fields: [subscriptionsTable.userId],
      references: [usersTable.id],
    }),
    items: many(subscriptionItemsTable),
    invoices: many(invoicesTable),
    entitlements: many(entitlementsTable),
    usageRecords: many(usageRecordsTable),
  })
)

export const invoicesRelations = relations(invoicesTable, ({ many, one }) => ({
  subscription: one(subscriptionsTable, {
    fields: [invoicesTable.subscriptionId],
    references: [subscriptionsTable.id],
  }),
  items: many(invoiceItemsTable),
}))

export type User = typeof usersTable.$inferSelect
export type Plan = typeof plansTable.$inferSelect
export type Price = typeof pricesTable.$inferSelect
export type BillingCustomer = typeof billingCustomersTable.$inferSelect
export type Subscription = typeof subscriptionsTable.$inferSelect
export type SubscriptionItem = typeof subscriptionItemsTable.$inferSelect
export type Invoice = typeof invoicesTable.$inferSelect
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect
export type Entitlement = typeof entitlementsTable.$inferSelect
export type UsageMeter = typeof usageMetersTable.$inferSelect
export type UsageRecord = typeof usageRecordsTable.$inferSelect
export type BillingProduct = typeof billingProductsTable.$inferSelect
export type BillingFeature = typeof billingFeaturesTable.$inferSelect
export type BillingProductAvailability =
  typeof billingProductAvailabilityTable.$inferSelect
export type PlanFeature = typeof planFeaturesTable.$inferSelect
export type UsageAggregate = typeof usageAggregatesTable.$inferSelect
