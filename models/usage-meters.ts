import { database } from "@/database"
import { usageMetersTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type CreateMeterInput } from "@/schemas/billing"

export async function rawCreateMeterManagement(input: CreateMeterInput) {
  const [meter] = await database.insert(usageMetersTable).values({ ...input, metadata: input.metadata ?? {} }).returning()
  if (!meter) throw new ServiceError("meter_create_failed", 409)
  return meter
}
