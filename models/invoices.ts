import { getServiceOrigin } from "@/utils/sso-directory";
import { and, count, desc, eq } from "drizzle-orm"

import { database } from "@/database"
import { entitlementsTable, invoiceItemsTable, invoicesTable, subscriptionsTable, type Invoice } from "@/database/schema"
import { ServiceError } from "@/lib/errors"
import { isProduction } from "@/utils/environment"
import type { CreatePaymentForInvoiceInput } from "@/schemas/billing"
import type { AuthContext } from "@/utils/interface"

function canManageAll(auth: AuthContext) {
  return auth.user.role === "admin" || auth.user.role === "master"
}

function assertOwner(invoice: Invoice, auth: AuthContext) {
  if (invoice.userId !== auth.user.id && !canManageAll(auth)) throw new ServiceError("invoice_forbidden", 403)
}

async function paymentEndpoint(path: string) {
  const paymentServerUrl = await getServiceOrigin("payment")
  const url = new URL(paymentServerUrl)
  if (url.username || url.password || url.hash || url.search || (url.protocol !== "https:" && (isProduction || url.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new ServiceError("invalid_payment_server_url", 502)
  return new URL(path, url)
}

export async function rawListInvoices(limit: number, offset: number, auth: AuthContext) {
  const where = canManageAll(auth) ? undefined : eq(invoicesTable.userId, auth.user.id)
  const [data, totals] = await Promise.all([
    database.select().from(invoicesTable).where(where).orderBy(desc(invoicesTable.createdAt)).limit(limit).offset(offset),
    database.select({ total: count() }).from(invoicesTable).where(where),
  ])
  const total = Number(totals[0]?.total ?? 0)
  return { data, pagination: { limit, offset, total, hasMore: offset + data.length < total } }
}

export async function rawGetInvoice(id: string, auth: AuthContext) {
  const [invoice] = await database.select().from(invoicesTable).where(eq(invoicesTable.id, id)).limit(1)
  if (!invoice) throw new ServiceError("invoice_not_found", 404)
  assertOwner(invoice, auth)
  const items = await database.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, id))
  return { ...invoice, items }
}

export async function rawCreateInvoicePayment(
  id: string,
  input: CreatePaymentForInvoiceInput,
  authorization: string,
  idempotencyKey: string,
  auth: AuthContext,
) {
  const [record] = await database
    .select({ invoice: invoicesTable, subscription: subscriptionsTable })
    .from(invoicesTable)
    .leftJoin(subscriptionsTable, eq(invoicesTable.subscriptionId, subscriptionsTable.id))
    .where(eq(invoicesTable.id, id))
    .limit(1)
  if (!record) throw new ServiceError("invoice_not_found", 404)
  assertOwner(record.invoice, auth)
  if (record.invoice.status !== "open" || record.invoice.amountDue <= 0) {
    throw new ServiceError("invoice_not_payable", 409)
  }
  if (record.invoice.periodEnd && record.invoice.periodEnd <= new Date()) throw new ServiceError("invoice_period_expired", 409)
  if (record.subscription && ["cancelled", "expired", "paused"].includes(record.subscription.status)) throw new ServiceError("subscription_not_payable", 409)
  if (!idempotencyKey) throw new ServiceError("invalid_idempotency_key", 400)

  const response = await fetch(await paymentEndpoint("/payment/intent"), {
    method: "POST",
    redirect: "error",
    headers: {
      Authorization: authorization,
      "Idempotency-Key": idempotencyKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      application: record.subscription?.application ?? "billing",
      referenceType: "invoice",
      referenceId: record.invoice.id,
      provider: input.provider,
      amount: record.invoice.amountDue,
      currency: record.invoice.currency,
      description: `Invoice ${record.invoice.number ?? record.invoice.id}`,
      returnUrl: input.returnUrl,
      metadata: { subscriptionId: record.invoice.subscriptionId },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    throw new ServiceError(typeof payload.error === "string" ? payload.error : "payment_gateway_failed", 502)
  }
  return payload
}

export async function rawReconcileInvoicePayment(
  invoiceId: string,
  paymentId: string,
  authorization: string,
  auth: AuthContext,
) {
  const [invoice] = await database.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId)).limit(1)
  if (!invoice) throw new ServiceError("invoice_not_found", 404)
  assertOwner(invoice, auth)
  const response = await fetch(await paymentEndpoint(`/payment/${paymentId}`), {
    headers: { Authorization: authorization, Accept: "application/json" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  })
  const payment = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) throw new ServiceError("payment_gateway_failed", 502)
  if (payment.referenceType !== "invoice" || payment.referenceId !== invoice.id || payment.amount !== invoice.total || payment.currency !== invoice.currency) {
    throw new ServiceError("payment_invoice_mismatch", 409)
  }
  if (payment.status !== "succeeded") return { invoice, payment }
  return database.transaction(async (transaction) => {
    // Same lock order as renewal/cancellation: subscription before invoice.
    const subscription = invoice.subscriptionId
      ? (await transaction.select().from(subscriptionsTable).where(eq(subscriptionsTable.id, invoice.subscriptionId)).for("update"))[0]
      : undefined
    const [locked] = await transaction.select().from(invoicesTable).where(eq(invoicesTable.id, invoice.id)).for("update")
    if (!locked) throw new ServiceError("invoice_not_found", 404)
    if (locked.status === "paid") return { invoice: locked, payment }
    if (locked.status !== "open") throw new ServiceError("invoice_not_payable", 409)
    const now = new Date()
    const [updated] = await transaction.update(invoicesTable)
      .set({ status: "paid", amountPaid: locked.total, amountDue: 0, paidAt: now, updatedAt: now })
      .where(eq(invoicesTable.id, locked.id)).returning()
    if (locked.subscriptionId) {
      // Paying an old invoice must not resurrect a cancelled or newer billing period.
      if (subscription && ["past_due", "active"].includes(subscription.status) &&
          locked.periodEnd?.getTime() === subscription.currentPeriodEnd?.getTime() &&
          locked.periodEnd && locked.periodEnd > now) {
        await transaction.update(subscriptionsTable).set({ status: "active", updatedAt: now }).where(eq(subscriptionsTable.id, subscription.id))
        await transaction.update(entitlementsTable).set({ status: "active", startsAt: locked.periodStart ?? now, expiresAt: locked.periodEnd, updatedAt: now }).where(eq(entitlementsTable.subscriptionId, subscription.id))
      }
    }
    return { invoice: updated, payment }
  })
}
