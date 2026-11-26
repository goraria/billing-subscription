import { and, count, desc, eq, inArray, sql } from "drizzle-orm"

import { database } from "@/database"
import {
  billingFeaturesTable,
  billingProductsTable,
  entitlementsTable,
  invoiceItemsTable,
  invoicesTable,
  planFeaturesTable,
  plansTable,
  pricesTable,
  subscriptionItemsTable,
  subscriptionsTable,
  type Subscription,
} from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import type { CreateSubscriptionInput, ListSubscriptionInput } from "@/schemas/billing"
import type { AuthContext } from "@/types/auth"
import { addBillingInterval as addInterval, billingAmount, initialBillingState } from "@/utils/billing"

function canManageAll(auth: AuthContext) {
  return auth.user.role === "admin" || auth.user.role === "master"
}

function assertOwner(subscription: Subscription, auth: AuthContext) {
  if (subscription.userId !== auth.user.id && !canManageAll(auth)) {
    throw new ServiceError("subscription_forbidden", 403)
  }
}

function invoiceNumber() {
  const date = new Date()
  return `INV-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
}

export async function rawCreateSubscription(input: CreateSubscriptionInput, auth: AuthContext) {
  const [offer] = await database
    .select({ price: pricesTable, plan: plansTable, product: billingProductsTable })
    .from(pricesTable)
    .innerJoin(plansTable, eq(pricesTable.planId, plansTable.id))
    .innerJoin(billingProductsTable, eq(plansTable.productId, billingProductsTable.id))
    .where(and(eq(pricesTable.id, input.priceId), eq(pricesTable.isActive, true), eq(plansTable.isActive, true), eq(billingProductsTable.isActive, true)))
    .limit(1)
  if (!offer) throw new ServiceError("price_not_found", 404)
  if (offer.price.type !== "fixed") throw new ServiceError("metered_subscription_requires_usage_settlement", 422)
  if (offer.product.application !== auth.application && !canManageAll(auth)) {
    throw new ServiceError("application_client_mismatch", 403)
  }

  const periodStart = new Date()
  let trialEnd = offer.price.trialPeriodDays
    ? addInterval(periodStart, "day", offer.price.trialPeriodDays)
    : null
  const currentPeriodStart = periodStart
  let currentPeriodEnd = trialEnd ?? addInterval(currentPeriodStart, offer.price.interval, offer.price.intervalCount)
  const amount = billingAmount(offer.price.unitAmount, input.quantity)
  let state = initialBillingState(amount, trialEnd, periodStart)
  const features = await database
    .select({ planFeature: planFeaturesTable, feature: billingFeaturesTable })
    .from(planFeaturesTable)
    .innerJoin(billingFeaturesTable, eq(planFeaturesTable.featureId, billingFeaturesTable.id))
    .where(eq(planFeaturesTable.planId, offer.plan.id))

  return database.transaction(async (transaction) => {
    // Serialize purchases for this user/product; trial eligibility cannot be
    // bypassed by concurrent requests, another price or another plan version.
    await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([auth.user.id, offer.product.id])},0))`)
    const [history] = await transaction.select({
      hasActive: sql<boolean>`coalesce(bool_or(${subscriptionsTable.status} IN ('active','trialing','past_due') AND (${subscriptionsTable.currentPeriodEnd}>now() OR ${subscriptionsTable.currentPeriodEnd} IS NULL)),false)`,
      usedTrial: sql<boolean>`coalesce(bool_or(${subscriptionsTable.trialStart} IS NOT NULL),false)`,
    }).from(subscriptionsTable)
      .innerJoin(subscriptionItemsTable, eq(subscriptionItemsTable.subscriptionId, subscriptionsTable.id))
      .innerJoin(pricesTable, eq(pricesTable.id, subscriptionItemsTable.priceId))
      .innerJoin(plansTable, eq(plansTable.id, pricesTable.planId))
      .where(and(eq(subscriptionsTable.userId, auth.user.id), eq(plansTable.productId, offer.product.id)))
    if (history?.hasActive) throw new ServiceError("subscription_already_exists", 409)
    if (history?.usedTrial && trialEnd) {
      trialEnd = null
      currentPeriodEnd = addInterval(currentPeriodStart, offer.price.interval, offer.price.intervalCount)
      state = initialBillingState(amount, null, periodStart)
    }
    const [subscription] = await transaction.insert(subscriptionsTable).values({
      userId: auth.user.id,
      application: offer.product.application,
      status: state.subscriptionStatus,
      currentPeriodStart,
      currentPeriodEnd,
      trialStart: trialEnd ? periodStart : null,
      trialEnd,
      metadata: { ...(input.metadata ?? {}), billingAnchorDay: (trialEnd ?? periodStart).getUTCDate() },
    }).returning()
    if (!subscription) throw new ServiceError("subscription_create_failed", 409)

    const [item] = await transaction.insert(subscriptionItemsTable).values({
      subscriptionId: subscription.id,
      priceId: offer.price.id,
      quantity: input.quantity,
    }).returning()
    if (!item) throw new ServiceError("subscription_item_create_failed", 409)

    const [invoice] = await transaction.insert(invoicesTable).values({
      userId: auth.user.id,
      subscriptionId: subscription.id,
      number: invoiceNumber(),
      status: state.invoiceStatus,
      currency: offer.price.currency,
      subtotal: state.amount,
      total: state.amount,
      amountDue: state.amount,
      amountPaid: 0,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
      dueAt: trialEnd ? trialEnd : periodStart,
      paidAt: state.paidAt,
    }).returning()
    if (!invoice) throw new ServiceError("invoice_create_failed", 409)
    await transaction.insert(invoiceItemsTable).values({
      invoiceId: invoice.id,
      subscriptionItemId: item.id,
      description: `${offer.product.name} - ${offer.plan.name}`,
      quantity: input.quantity,
      unitAmount: trialEnd ? 0 : offer.price.unitAmount,
      amount: state.amount,
      currency: offer.price.currency,
      periodStart: currentPeriodStart,
      periodEnd: currentPeriodEnd,
    })
    if (features.length) {
      await transaction.insert(entitlementsTable).values(features.map(({ planFeature, feature }) => ({
        userId: auth.user.id,
        subscriptionId: subscription.id,
        application: offer.product.application,
        feature: feature.key,
        value: planFeature.value,
        status: state.entitlementStatus,
        startsAt: periodStart,
        expiresAt: currentPeriodEnd,
      })))
    }
    return { subscription, item, invoice }
  })
}

export async function rawListSubscriptions(input: ListSubscriptionInput, auth: AuthContext) {
  const filters = canManageAll(auth) ? [] : [eq(subscriptionsTable.userId, auth.user.id)]
  if (input.status) filters.push(eq(subscriptionsTable.status, input.status))
  const where = filters.length ? and(...filters) : undefined
  const [data, totals] = await Promise.all([
    database.select().from(subscriptionsTable).where(where).orderBy(desc(subscriptionsTable.createdAt)).limit(input.limit).offset(input.offset),
    database.select({ total: count() }).from(subscriptionsTable).where(where),
  ])
  const total = Number(totals[0]?.total ?? 0)
  return { data, pagination: { limit: input.limit, offset: input.offset, total, hasMore: input.offset + data.length < total } }
}

export async function rawGetSubscription(id: string, auth: AuthContext) {
  const [subscription] = await database.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id)).limit(1)
  if (!subscription) throw new ServiceError("subscription_not_found", 404)
  assertOwner(subscription, auth)
  const [items, invoices, entitlements] = await Promise.all([
    database.select().from(subscriptionItemsTable).where(eq(subscriptionItemsTable.subscriptionId, id)),
    database.select().from(invoicesTable).where(eq(invoicesTable.subscriptionId, id)).orderBy(desc(invoicesTable.createdAt)),
    database.select().from(entitlementsTable).where(eq(entitlementsTable.subscriptionId, id)),
  ])
  return { ...subscription, items, invoices, entitlements }
}

export async function rawCancelSubscription(id: string, atPeriodEnd: boolean, auth: AuthContext) {
  return database.transaction(async (transaction) => {
  const [subscription] = await transaction.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id)).for("update")
  if (!subscription) throw new ServiceError("subscription_not_found", 404)
  assertOwner(subscription, auth)
  if (["cancelled", "expired"].includes(subscription.status)) return subscription
  const now = new Date()
  const [updated] = await transaction.update(subscriptionsTable).set(
    atPeriodEnd
      ? { cancelAtPeriodEnd: true, cancelAt: subscription.currentPeriodEnd, updatedAt: now }
      : { status: "cancelled", cancelAtPeriodEnd: false, cancelledAt: now, endedAt: now, updatedAt: now },
  ).where(eq(subscriptionsTable.id, id)).returning()
  if (!updated) throw new ServiceError("subscription_update_failed", 409)
  if (!atPeriodEnd) {
    await transaction.update(entitlementsTable).set({ status: "inactive", expiresAt: now, updatedAt: now }).where(eq(entitlementsTable.subscriptionId, id))
  }
  return updated
  })
}

export async function rawResumeSubscription(id: string, auth: AuthContext) {
  const [subscription] = await database.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, id)).limit(1)
  if (!subscription) throw new ServiceError("subscription_not_found", 404)
  assertOwner(subscription, auth)
  if (subscription.status === "cancelled" || subscription.status === "expired") {
    throw new ServiceError("subscription_cannot_resume", 409)
  }
  const [updated] = await database.update(subscriptionsTable).set({ cancelAtPeriodEnd: false, cancelAt: null, updatedAt: new Date() }).where(eq(subscriptionsTable.id, id)).returning()
  if (!updated) throw new ServiceError("subscription_update_failed", 409)
  return updated
}
