import { describe, expect, it, vi } from "vitest"
import {
  addBillingInterval,
  billingAmount,
  initialBillingState,
} from "@/utils/billing"

const fixture = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }))
vi.mock("@/database", () => ({ pool: { connect: async () => fixture } }))
import { rawRenewSubscriptions } from "@/services/renewal"

describe("billing invariants", () => {
  it("does not grant access for an unpaid paid plan", () => {
    expect(initialBillingState(100, null, new Date())).toMatchObject({
      subscriptionStatus: "past_due",
      invoiceStatus: "open",
      entitlementStatus: "inactive",
      paidAt: null,
    })
  })
  it("gives a trial a zero invoice and access only through the trial end", () => {
    const now = new Date("2026-01-01Z")
    expect(
      initialBillingState(100, new Date("2026-01-08Z"), now)
    ).toMatchObject({
      subscriptionStatus: "trialing",
      invoiceStatus: "paid",
      entitlementStatus: "active",
      amount: 0,
      paidAt: now,
    })
  })
  it("clamps calendar month and leap year; rejects unsafe money", () => {
    expect(
      addBillingInterval(
        new Date("2026-01-31T12:00:00Z"),
        "month",
        1
      ).toISOString()
    ).toBe("2026-02-28T12:00:00.000Z")
    expect(
      addBillingInterval(new Date("2024-02-29Z"), "year", 1).toISOString()
    ).toBe("2025-02-28T00:00:00.000Z")
    expect(() => billingAmount(Number.MAX_SAFE_INTEGER, 2)).toThrow(
      "invalid_invoice_amount"
    )
    expect(
      addBillingInterval(new Date("2026-02-28Z"), "month", 1, 31).toISOString()
    ).toBe("2026-03-31T00:00:00.000Z")
  })
  it("commits bounded idle batches and always releases", async () => {
    fixture.query.mockReset().mockResolvedValue({ rows: [] })
    expect(await rawRenewSubscriptions()).toEqual({
      renewed: 0,
      expired: 0,
      cancelled: 0,
    })
    expect(fixture.query.mock.calls[1]![0]).toContain("FOR UPDATE SKIP LOCKED")
    expect(fixture.query).toHaveBeenLastCalledWith("COMMIT")
    expect(fixture.release).toHaveBeenCalled()
  })
  it("rolls back a failed batch", async () => {
    fixture.query
      .mockReset()
      .mockResolvedValue({ rows: [] })
      .mockRejectedValueOnce(new Error("offline"))
    await expect(rawRenewSubscriptions()).rejects.toThrow("offline")
    expect(fixture.query).toHaveBeenLastCalledWith("ROLLBACK")
  })
  it("creates an open next-cycle invoice and disables access pending payment", async () => {
    fixture.query.mockReset().mockImplementation(async (query: string) => {
      if (query.startsWith("SELECT * FROM subscriptions"))
        return {
          rows: [
            {
              id: "subscription",
              user_id: "user",
              status: "active",
              current_period_end: new Date("2026-01-31Z"),
              metadata: { billingAnchorDay: 31 },
            },
          ],
        }
      if (query.includes("SELECT si.id AS"))
        return {
          rows: [
            {
              id: "price",
              subscription_item_id: "item",
              quantity: 2,
              unit_amount: "100",
              type: "fixed",
              currency: "USD",
              interval: "month",
              interval_count: 1,
              plan_name: "Plan",
            },
          ],
        }
      if (query.includes("INSERT INTO invoices"))
        return { rows: [{ id: "invoice" }] }
      return { rows: [] }
    })
    expect(await rawRenewSubscriptions(50, new Date("2026-02-01Z"))).toEqual({
      renewed: 1,
      expired: 0,
      cancelled: 0,
    })
    const invoice = fixture.query.mock.calls.find(([query]) =>
      query.includes("INSERT INTO invoices")
    )!
    expect(invoice[1]).toEqual(expect.arrayContaining(["open", "USD", 200]))
    const item = fixture.query.mock.calls.find(([query]) =>
      query.includes("INSERT INTO invoice_items")
    )!
    expect(item[1][1]).toBe("item")
    const subscription = fixture.query.mock.calls.find(([query]) =>
      query.startsWith(
        "UPDATE subscriptions SET status=$2,current_period_start"
      )
    )!
    expect(subscription[1][1]).toBe("past_due")
  })
  it.each([
    ["past_due", false, "expired"],
    ["active", true, "cancelled"],
  ])(
    "expires or cancels due subscription %s",
    async (status, cancel, expected) => {
      fixture.query
        .mockReset()
        .mockImplementation(async (query: string) => ({
          rows: query.startsWith("SELECT * FROM subscriptions")
            ? [{ id: "subscription", status, cancel_at_period_end: cancel }]
            : [],
        }))
      const result = await rawRenewSubscriptions()
      expect(result[expected as "expired" | "cancelled"]).toBe(1)
      expect(
        fixture.query.mock.calls.some(([query]) =>
          query.includes("status='uncollectible'")
        )
      ).toBe(true)
    }
  )
})
