import { QueueClient } from "@vercel/queue"
const queue = new QueueClient({ telemetry: { isEnabled: false } })
export async function enqueueBackgroundJob(kind: "drain" | "maintenance" = "drain") {
  await queue.send("billing-jobs", { kind })
}
async function drainBackgroundJobs() {
    const { rawRenewSubscriptions: renewSubscriptions } = await import("@/services/renewal")
    await renewSubscriptions()
}
export async function processBackgroundJob(message: unknown) {
  const kind = message && typeof message === "object" ? (message as { kind?: unknown }).kind : undefined
  if (kind === "maintenance") {
    const { rawRenewSubscriptions: renewSubscriptions } = await import("@/services/renewal")
    await renewSubscriptions()
    return
  }
  if (kind !== "drain") throw new Error("Invalid background job")
  await drainBackgroundJobs()
}
