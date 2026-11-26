import { eq } from "drizzle-orm"
import { database } from "@/database"
import { plansTable, pricesTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type CreatePriceInput } from "@/schemas/billing"

export async function rawCreatePriceManagement(input: CreatePriceInput) {
  const [plan] = await database.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.id, input.planId)).limit(1)
  if (!plan) throw new ServiceError("plan_not_found", 404)
  const [price] = await database.insert(pricesTable).values({ ...input, metadata: input.metadata ?? {} }).returning()
  if (!price) throw new ServiceError("price_create_failed", 409)
  return price
}
