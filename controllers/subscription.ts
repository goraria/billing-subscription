import type { Event } from "@/utils/interface"
import { getQueryValues, readRequestBody } from "@/utils/request"
import { uuidSchema } from "@/schemas/common"
import {
  cancelSubscriptionSchema,
  createSubscriptionSchema,
  listSubscriptionSchema,
} from "@/schemas/billing"
import {
  rawCancelSubscription as cancelSubscriptionServices,
  rawCreateSubscription as createSubscriptionServices,
  rawGetSubscription as getSubscriptionServices,
  rawListSubscriptions as listSubscriptionsServices,
  rawResumeSubscription as resumeSubscriptionServices,
} from "@/models/subscriptions"

export async function actListSubscriptions(context: Event) {
  return context.json(
    await listSubscriptionsServices(
      listSubscriptionSchema.parse(getQueryValues(context.req.raw)),
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actGetSubscription(context: Event) {
  return context.json(
    await getSubscriptionServices(
      uuidSchema.parse(context.req.param("id")!),
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actCreateSubscription(context: Event) {
  return context.json(
    await createSubscriptionServices(
      createSubscriptionSchema.parse(await readRequestBody(context.req)),
      context.get("auth")!
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actCancelSubscription(context: Event) {
  const input = cancelSubscriptionSchema.parse(await readRequestBody(context.req))
  return context.json(
    await cancelSubscriptionServices(
      uuidSchema.parse(context.req.param("id")!),
      input.atPeriodEnd,
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actResumeSubscription(context: Event) {
  return context.json(
    await resumeSubscriptionServices(
      uuidSchema.parse(context.req.param("id")!),
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
