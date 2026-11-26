import { and, count, desc, eq, inArray, isNull } from "drizzle-orm"
import { database } from "@/database"
import { billingFeaturesTable, billingProductsTable, planFeaturesTable, plansTable, pricesTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type CreateProductInput, type ListCatalogInput } from "@/schemas/billing"

export async function rawListCatalog(input: ListCatalogInput) {
  const productFilters = [eq(billingProductsTable.isActive, true), isNull(billingProductsTable.deletedAt)]
  if (input.application) productFilters.push(eq(billingProductsTable.application, input.application))
  const where = and(...productFilters)
  const [products, totals] = await Promise.all([
    database.select().from(billingProductsTable).where(where).orderBy(desc(billingProductsTable.createdAt)).limit(input.limit).offset(input.offset),
    database.select({ total: count() }).from(billingProductsTable).where(where),
  ])
  const productIds = products.map((product) => product.id)
  const plans = productIds.length
    ? await database.select().from(plansTable).where(and(inArray(plansTable.productId, productIds), eq(plansTable.isActive, true), isNull(plansTable.deletedAt)))
    : []
  const planIds = plans.map((plan) => plan.id)
  const [prices, featureValues] = planIds.length
    ? await Promise.all([
        database.select().from(pricesTable).where(and(inArray(pricesTable.planId, planIds), eq(pricesTable.isActive, true), isNull(pricesTable.deletedAt))),
        database
          .select({ planFeature: planFeaturesTable, feature: billingFeaturesTable })
          .from(planFeaturesTable)
          .innerJoin(billingFeaturesTable, eq(planFeaturesTable.featureId, billingFeaturesTable.id))
          .where(inArray(planFeaturesTable.planId, planIds)),
      ])
    : [[], []]
  const data = products.map((product) => ({
    ...product,
    plans: plans.filter((plan) => plan.productId === product.id).map((plan) => ({
      ...plan,
      prices: prices.filter((price) => price.planId === plan.id),
      features: featureValues.filter(({ planFeature }) => planFeature.planId === plan.id),
    })),
  }))
  const total = Number(totals[0]?.total ?? 0)
  return { data, pagination: { limit: input.limit, offset: input.offset, total, hasMore: input.offset + data.length < total } }
}

export async function rawCreateProductManagement(input: CreateProductInput) {
  const [product] = await database.insert(billingProductsTable).values({ ...input, metadata: input.metadata ?? {} }).returning()
  if (!product) throw new ServiceError("product_create_failed", 409)
  return product
}
