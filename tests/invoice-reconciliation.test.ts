import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  updates: [] as Record<string, unknown>[],
}))
vi.mock("@/utils/sso-directory", () => ({
  getServiceOrigin: async (key: string) => {
    const origins: Record<string, string> = {"payment":"https://payment.example"};
    if (!origins[key]) throw new Error("Unregistered fixture service");
    return origins[key];
  },
  getApplicationOrigin: async (key: string) => {
    const origins: Record<string, string> = {"payment":"https://payment.example"};
    if (!origins[key]) throw new Error("Unregistered fixture application");
    return origins[key];
  },
}));
vi.mock("@/utils/environment", () => ({
  oauthClientBindings: undefined,
  paymentServerUrl: "https://payment.example",
  isProduction: true,
}))
vi.mock("@/database", () => {
  const db = {
    select() {
      const query = {
        from: () => query,
        where: () => query,
        limit: () => query,
        for: () => query,
        then(resolve: (rows: unknown[]) => unknown) {
          return Promise.resolve(state.rows.shift() ?? []).then(resolve)
        },
      }
      return query
    },
    update: () => ({
      set(values: Record<string, unknown>) {
        state.updates.push(values)
        const query = {
          where: () => query,
          returning: async () => state.rows.shift() ?? [],
          then(resolve: (rows: unknown[]) => unknown) {
            return Promise.resolve([]).then(resolve)
          },
        }
        return query
      },
    }),
    transaction: async (fn: (transaction: unknown) => unknown) => fn(db),
  }
  return { database: db }
})
import { rawReconcileInvoicePayment } from "@/models/invoices"
const end = new Date(Date.now() + 86_400_000)
const invoice = () => ({
  id: "invoice",
  userId: "user",
  subscriptionId: "subscription",
  total: 100,
  amountDue: 100,
  status: "open",
  currency: "USD",
  periodStart: new Date(),
  periodEnd: end,
})
const payment = () => ({
  referenceType: "invoice",
  referenceId: "invoice",
  amount: 100,
  currency: "USD",
  status: "succeeded",
})
const auth = { user: { id: "user", role: "user" } } as never
beforeEach(() => {
  state.rows = []
  state.updates = []
  vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(payment()))
})
it("activates only the matching paid current subscription cycle", async () => {
  state.rows = [
    [invoice()],
    [{ id: "subscription", status: "past_due", currentPeriodEnd: end }],
    [invoice()],
    [{ ...invoice(), status: "paid", amountDue: 0 }],
  ]
  expect(
    await rawReconcileInvoicePayment("invoice", "payment", "Bearer valid", auth)
  ).toMatchObject({ invoice: { status: "paid" } })
  expect(state.updates.filter((row) => row.status === "active")).toHaveLength(2)
  expect(vi.mocked(fetch).mock.calls[0]![1]!.redirect).toBe("error")
})
it("reconciliation is idempotent when amountDue is already zero", async () => {
  const paid = { ...invoice(), status: "paid", amountDue: 0 }
  state.rows = [[paid], [{ status: "active" }], [paid]]
  expect(
    await rawReconcileInvoicePayment("invoice", "payment", "Bearer valid", auth)
  ).toMatchObject({ invoice: { status: "paid" } })
  expect(state.updates).toEqual([])
})
it.each(["cancelled", "expired"])(
  "does not revive a %s subscription",
  async (status) => {
    state.rows = [
      [invoice()],
      [{ status, currentPeriodEnd: end }],
      [invoice()],
      [{ ...invoice(), status: "paid" }],
    ]
    await rawReconcileInvoicePayment("invoice", "payment", "Bearer valid", auth)
    expect(state.updates.filter((row) => row.status === "active")).toHaveLength(
      0
    )
  }
)
it("rejects mismatched payment amount, currency and reference", async () => {
  for (const change of [
    { amount: 99 },
    { currency: "VND" },
    { referenceId: "foreign" },
  ]) {
    state.rows = [[invoice()]]
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ ...payment(), ...change })
    )
    await expect(
      rawReconcileInvoicePayment("invoice", "payment", "Bearer valid", auth)
    ).rejects.toThrow("payment_invoice_mismatch")
  }
  expect(state.updates).toEqual([])
})
