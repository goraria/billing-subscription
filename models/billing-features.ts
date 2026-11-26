import { database } from "@/database"
import { billingFeaturesTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type CreateFeatureInput } from "@/schemas/billing"

export async function rawCreateFeatureManagement(input: CreateFeatureInput) {
  const [feature] = await database.insert(billingFeaturesTable).values({ ...input, metadata: input.metadata ?? {} }).returning()
  if (!feature) throw new ServiceError("feature_create_failed", 409)
  return feature
}
