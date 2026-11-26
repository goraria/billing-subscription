import { eq } from "drizzle-orm"
import { database } from "@/database"
import { billingProductsTable, planFeaturesTable, plansTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type CreatePlanInput } from "@/schemas/billing"

export async function rawCreatePlanManagement(input: CreatePlanInput) {
  const { features, ...values } = input
  return database.transaction(async (transaction) => {
    const [product] = await transaction.select({ id: billingProductsTable.id }).from(billingProductsTable).where(eq(billingProductsTable.id, input.productId)).limit(1)
    if (!product) throw new ServiceError("product_not_found", 404)
    const [plan] = await transaction.insert(plansTable).values({ ...values, metadata: values.metadata ?? {} }).returning()
    if (!plan) throw new ServiceError("plan_create_failed", 409)
    if (features.length) {
      await transaction.insert(planFeaturesTable).values(features.map((feature) => ({
        planId: plan.id,
        featureId: feature.featureId,
        value: feature.value,
        softLimit: feature.softLimit === undefined ? null : String(feature.softLimit),
        hardLimit: feature.hardLimit === undefined ? null : String(feature.hardLimit),
      })))
    }
    return plan
  })
}
