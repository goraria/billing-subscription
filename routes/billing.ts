import { Hono } from "hono"
import {
  actCreateFeature,
  actCreatePlan,
  actCreatePrice,
  actCreateProduct,
  actListCatalog,
} from "@/controllers/catalog"
import {
  actCreateInvoicePayment,
  actGetInvoice,
  actListInvoices,
  actReconcileInvoicePayment,
} from "@/controllers/invoice"
import {
  actCancelSubscription,
  actCreateSubscription,
  actGetSubscription,
  actListSubscriptions,
  actResumeSubscription,
} from "@/controllers/subscription"
import {
  actCreateMeter,
  actListEntitlements,
  actRecordUsage,
} from "@/controllers/usage"
import { requireAdmin, requireAuth } from "@/middlewares/auth"

export const billingRoutes = new Hono()

billingRoutes.post("/invoice/:id/payment", requireAuth("write"), actCreateInvoicePayment)
billingRoutes.post(
  "/invoice/:id/reconcile",
  requireAuth("write"),
  actReconcileInvoicePayment,
)
billingRoutes.post("/subscription/:id/cancel", requireAuth("write"), actCancelSubscription)
billingRoutes.post("/subscription/:id/resume", requireAuth("write"), actResumeSubscription)
billingRoutes.get("/invoice/:id", requireAuth("read"), actGetInvoice)
billingRoutes.get("/subscription/:id", requireAuth("read"), actGetSubscription)
billingRoutes.get("/catalog", actListCatalog)
billingRoutes.get("/entitlement", requireAuth("read"), actListEntitlements)
billingRoutes.post("/feature", requireAuth("write"), requireAdmin(), actCreateFeature)
billingRoutes.get("/invoice", requireAuth("read"), actListInvoices)
billingRoutes.post("/meter", requireAuth("write"), requireAdmin(), actCreateMeter)
billingRoutes.post("/plan", requireAuth("write"), requireAdmin(), actCreatePlan)
billingRoutes.post("/price", requireAuth("write"), requireAdmin(), actCreatePrice)
billingRoutes.post("/product", requireAuth("write"), requireAdmin(), actCreateProduct)
billingRoutes.get("/subscription", requireAuth("read"), actListSubscriptions)
billingRoutes.post("/subscription", requireAuth("write"), actCreateSubscription)
billingRoutes.post("/usage", requireAuth("write"), actRecordUsage)
