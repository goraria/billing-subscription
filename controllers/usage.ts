import type { Event } from "@/utils/interface"
import { getQueryValues, readRequestBody } from "@/utils/request"
import { createMeterSchema, recordUsageSchema } from "@/schemas/billing"
import { rawCreateMeterManagement as createMeterServices } from "@/models/usage-meters"
import { rawListEntitlements as listEntitlementsServices } from "@/models/entitlements"
import { rawRecordUsage as recordUsageServices } from "@/models/usage-records"

export async function actCreateMeter(context: Event) {
  return context.json(
    await createMeterServices(
      createMeterSchema.parse(await readRequestBody(context.req))
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actRecordUsage(context: Event) {
  const result = await recordUsageServices(
    recordUsageSchema.parse(await readRequestBody(context.req)),
    context.req.header("idempotency-key")?.trim() ?? "",
    context.get("auth")!
  )
  return context.json(result, {
    status: result.reused ? 200 : 201,
    headers: { "content-type": "application/json; charset=UTF-8" },
  })
}
export async function actListEntitlements(context: Event) {
  return context.json(
    await listEntitlementsServices(
      getQueryValues(context.req.raw)["application"],
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
