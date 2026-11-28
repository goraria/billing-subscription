import { createBackgroundQueue } from "@/modules/principle/queue";

export const {
  enqueueBackgroundJob,
  processBackgroundJob,
  plugin: backgroundQueuePlugin,
} = createBackgroundQueue("billing-jobs", {
  drain: drainBackgroundJobs,
  maintenance: drainBackgroundJobs,
});

async function drainBackgroundJobs() {
    const { rawRenewSubscriptions: renewSubscriptions } = await import("@/services/renewal")
    await renewSubscriptions()
}
