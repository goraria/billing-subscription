import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  values: {} as Record<string, Record<string, unknown>>,
  lock: vi.fn(),
}))
vi.mock("@/database", async () => {
  const { getTableName } = await import("drizzle-orm")
  const db = {
    select() {
      const query = {
        from: () => query,
        innerJoin: () => query,
        where: () => query,
        limit: () => query,
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve(state.rows.shift() ?? []).then(resolve)
        },
      }
      return query
    },
    insert(table: Parameters<typeof getTableName>[0]) {
      return {
        values(value: Record<string, unknown>) {
          state.values[getTableName(table)] = value
          return {
            returning: async () => [
              { id: getTableName(table) + "-id", ...value },
            ],
            then(resolve: (rows: unknown[]) => unknown) {
              return Promise.resolve([]).then(resolve)
            },
          }
        },
      }
    },
    execute: state.lock,
    transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  }
  return { database: db }
})
import { rawCreateSubscription } from "@/models/subscriptions"
const offer = () => ({
  price: {
    id: "price",
    type: "fixed",
    currency: "USD",
    interval: "month",
    intervalCount: 1,
    trialPeriodDays: 7,
    unitAmount: 100,
  },
  plan: { id: "plan", name: "Plan" },
  product: { id: "product", application: "video", name: "Product" },
})
const auth = {
  application: "video",
  user: { id: "user", role: "user" },
} as never
beforeEach(() => {
  state.values = {}
  vi.clearAllMocks()
})
it("rejects duplicate purchases while holding a product-specific transaction lock", async () => {
  state.rows = [[offer()], [], [{ hasActive: true, usedTrial: true }]]
  await expect(
    rawCreateSubscription({ priceId: "price", quantity: 1 }, auth)
  ).rejects.toThrow("subscription_already_exists")
  expect(state.lock).toHaveBeenCalledOnce()
  expect(state.values).toEqual({})
})
it("does not give another free trial after a prior cancelled trial", async () => {
  state.rows = [[offer()], [], [{ hasActive: false, usedTrial: true }]]
  await rawCreateSubscription({ priceId: "price", quantity: 1 }, auth)
  expect(state.values.subscriptions).toMatchObject({
    status: "past_due",
    trialEnd: null,
  })
  expect(state.values.invoices).toMatchObject({
    status: "open",
    total: 100,
    amountDue: 100,
  })
})
it("creates a genuinely zero-cost invoice for a first trial", async () => {
  state.rows = [[offer()], [], [{ hasActive: false, usedTrial: false }]]
  await rawCreateSubscription({ priceId: "price", quantity: 1 }, auth)
  expect(state.values.subscriptions).toMatchObject({ status: "trialing" })
  expect(state.values.invoices).toMatchObject({
    status: "paid",
    subtotal: 0,
    total: 0,
    amountDue: 0,
  })
  expect(state.values.invoice_items).toMatchObject({ amount: 0, unitAmount: 0 })
})
