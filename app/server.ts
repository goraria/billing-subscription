import { Hono } from "hono"
import { defineHandler } from "nitro"
import { routeNotFound } from "@/app/error"
import { billingRoutes } from "@/routes/billing"
import { sharedRoutes } from "@/routes/shared"

export const router = new Hono()
router.onError((error) => { throw error })
router.notFound((context) => routeNotFound(context.req.raw))
router.route("/billing", billingRoutes)
router.route("/", sharedRoutes)

export default defineHandler((event) => router.fetch(event.req))
