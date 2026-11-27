import { and, eq } from "drizzle-orm"
import { database } from "@/database"
import { subscriptionsTable, usageMetersTable, usageRecordsTable } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { type RecordUsageInput } from "@/schemas/billing"
import { type AuthContext } from "@/utils/interface"

export async function rawRecordUsage(input: RecordUsageInput, idempotencyKey: string, auth: AuthContext) {
  if (!idempotencyKey) throw new ServiceError("invalid_idempotency_key", 400)
  const [meter] = await database.select().from(usageMetersTable).where(and(eq(usageMetersTable.key, input.meterKey), eq(usageMetersTable.isActive, true))).limit(1)
  if (!meter) throw new ServiceError("meter_not_found", 404)
  if (input.subscriptionId) {
    const [subscription] = await database.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, input.subscriptionId)).limit(1)
    if (!subscription) throw new ServiceError("subscription_not_found", 404)
    if (subscription.userId !== auth.user.id && !["admin", "master"].includes(auth.user.role)) {
      throw new ServiceError("subscription_forbidden", 403)
    }
  }
  const [record] = await database
    .insert(usageRecordsTable)
    .values({
      userId: auth.user.id,
      subscriptionId: input.subscriptionId,
      meterId: meter.id,
      idempotencyKey,
      quantity: String(input.quantity),
      dimensions: input.dimensions ?? {},
      recordedAt: input.recordedAt,
    })
    .onConflictDoNothing({ target: usageRecordsTable.idempotencyKey })
    .returning()
  if (record) return { record, reused: false }
  const [existing] = await database.select().from(usageRecordsTable).where(eq(usageRecordsTable.idempotencyKey, idempotencyKey)).limit(1)
  if (!existing || existing.userId !== auth.user.id) throw new ServiceError("usage_record_conflict", 409)
  return { record: existing, reused: true }
}
