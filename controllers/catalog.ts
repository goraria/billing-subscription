import type { Event } from "@/utils/interface"
import { getQueryValues, readRequestBody } from "@/modules/principle/request"
import {
  createFeatureSchema,
  createPlanSchema,
  createPriceSchema,
  createProductSchema,
  listCatalogSchema,
} from "@/schemas/billing"
import { rawCreateFeatureManagement as createFeatureServices } from "@/models/billing-features"
import { rawCreatePlanManagement as createPlanServices } from "@/models/plans"
import { rawCreatePriceManagement as createPriceServices } from "@/models/prices"
import { rawCreateProductManagement as createProductServices, rawListCatalog as listCatalogServices } from "@/models/billing-products"
export async function actListCatalog(context: Event) {
  return context.json(
    await listCatalogServices(listCatalogSchema.parse(getQueryValues(context.req.raw))),
    { headers: { "content-type": "application/json; charset=UTF-8" } }
  )
}
export async function actCreateProduct(context: Event) {
  return context.json(
    await createProductServices(
      createProductSchema.parse(await readRequestBody(context.req))
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actCreateFeature(context: Event) {
  return context.json(
    await createFeatureServices(
      createFeatureSchema.parse(await readRequestBody(context.req))
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actCreatePlan(context: Event) {
  return context.json(
    await createPlanServices(createPlanSchema.parse(await readRequestBody(context.req))),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
export async function actCreatePrice(context: Event) {
  return context.json(
    await createPriceServices(
      createPriceSchema.parse(await readRequestBody(context.req))
    ),
    {
      status: 201,
      headers: { "content-type": "application/json; charset=UTF-8" },
    }
  )
}
