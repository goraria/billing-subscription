import { z } from "zod"

import { jsonObjectSchema, paginationSchema } from "@/schemas/common"

export const listCatalogSchema = paginationSchema.extend({
  application: z.string().trim().min(1).max(64).optional(),
})

export const createProductSchema = z.object({
  application: z.string().trim().min(1).max(64),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  metadata: jsonObjectSchema.optional(),
})

export const createFeatureSchema = z.object({
  application: z.string().trim().min(1).max(64),
  key: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  valueType: z.enum(["boolean", "number", "string", "json"]).default("boolean"),
  metadata: jsonObjectSchema.optional(),
})

export const createPlanSchema = z.object({
  productId: z.uuid(),
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2000).optional(),
  features: z.array(z.object({
    featureId: z.uuid(),
    value: z.unknown().default(true),
    softLimit: z.number().nonnegative().optional(),
    hardLimit: z.number().nonnegative().optional(),
  })).default([]),
  metadata: jsonObjectSchema.optional(),
})

export const createPriceSchema = z.object({
  planId: z.uuid(),
  type: z.enum(["fixed", "metered"]).default("fixed"),
  currency: z.string().length(3).transform((value) => value.toUpperCase()),
  unitAmount: z.number().int().nonnegative().safe(),
  interval: z.enum(["day", "week", "month", "year"]),
  intervalCount: z.number().int().positive().max(365).default(1),
  trialPeriodDays: z.number().int().min(0).max(365).optional(),
  metadata: jsonObjectSchema.optional(),
})

export const createSubscriptionSchema = z.object({
  priceId: z.uuid(),
  quantity: z.number().int().positive().max(100_000).default(1),
  metadata: jsonObjectSchema.optional(),
})

export const listSubscriptionSchema = paginationSchema.extend({
  status: z.enum(["trialing", "active", "past_due", "paused", "cancelled", "expired"]).optional(),
})

export const cancelSubscriptionSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
})

export const createPaymentForInvoiceSchema = z.object({
  provider: z.enum(["stripe", "zalopay", "momo", "vnpay"]),
  returnUrl: z.url().optional(),
})

export const reconcileInvoiceSchema = z.object({ paymentId: z.uuid() })

export const createMeterSchema = z.object({
  key: z.string().trim().min(1).max(128),
  eventName: z.string().trim().min(1).max(128),
  aggregation: z.enum(["sum", "count", "max", "last"]).default("sum"),
  unit: z.string().trim().min(1).max(64),
  metadata: jsonObjectSchema.optional(),
})

export const recordUsageSchema = z.object({
  meterKey: z.string().trim().min(1).max(128),
  subscriptionId: z.uuid().optional(),
  quantity: z.number().nonnegative(),
  recordedAt: z.coerce.date().default(() => new Date()),
  dimensions: jsonObjectSchema.optional(),
})

export type ListCatalogInput = z.infer<typeof listCatalogSchema>
export type CreateProductInput = z.infer<typeof createProductSchema>
export type CreateFeatureInput = z.infer<typeof createFeatureSchema>
export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type CreatePriceInput = z.infer<typeof createPriceSchema>
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>
export type ListSubscriptionInput = z.infer<typeof listSubscriptionSchema>
export type CreatePaymentForInvoiceInput = z.infer<typeof createPaymentForInvoiceSchema>
export type CreateMeterInput = z.infer<typeof createMeterSchema>
export type RecordUsageInput = z.infer<typeof recordUsageSchema>
