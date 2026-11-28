import type { Event } from "@/utils/interface"
import { getQueryValues, readRequestBody } from "@/modules/principle/request"
import {
  createPaymentForInvoiceSchema,
  reconcileInvoiceSchema,
} from "@/schemas/billing"
import { paginationSchema, uuidSchema } from "@/schemas/common"
import {
  rawCreateInvoicePayment as createInvoicePaymentServices,
  rawGetInvoice as getInvoiceServices,
  rawListInvoices as listInvoicesServices,
  rawReconcileInvoicePayment as reconcileInvoicePaymentServices,
} from "@/models/invoices"

export async function actListInvoices(context: Event) {
  const query = paginationSchema.parse(getQueryValues(context.req.raw))
  return context.json(
    await listInvoicesServices(
      query.limit,
      query.offset,
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actGetInvoice(context: Event) {
  return context.json(
    await getInvoiceServices(
      uuidSchema.parse(context.req.param("id")!),
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actCreateInvoicePayment(context: Event) {
  return context.json(
    await createInvoicePaymentServices(
      uuidSchema.parse(context.req.param("id")!),
      createPaymentForInvoiceSchema.parse(await readRequestBody(context.req)),
      context.req.header("authorization") ?? "",
      context.req.header("idempotency-key")?.trim() ?? "",
      context.get("auth")!
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actReconcileInvoicePayment(context: Event) {
  const input = reconcileInvoiceSchema.parse(await readRequestBody(context.req))
  return context.json(
    await reconcileInvoicePaymentServices(
      uuidSchema.parse(context.req.param("id")!),
      input.paymentId,
      context.req.header("authorization") ?? "",
      context.get("auth")!
    ),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
