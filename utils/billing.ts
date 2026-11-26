/** Calendar billing keeps Jan 31 -> Feb 28 rather than overflowing into March. */
export function addBillingInterval(
  start: Date,
  interval: "day" | "week" | "month" | "year",
  count: number,
  anchorDay = start.getUTCDate()
) {
  if (!Number.isSafeInteger(count) || count < 1)
    throw new Error("invalid_interval_count")
  const end = new Date(start)
  if (interval === "day" || interval === "week") {
    end.setUTCDate(end.getUTCDate() + count * (interval === "week" ? 7 : 1))
  } else {
    const day =
      Number.isInteger(anchorDay) && anchorDay >= 1 && anchorDay <= 31
        ? anchorDay
        : end.getUTCDate()
    end.setUTCDate(1)
    end.setUTCMonth(end.getUTCMonth() + count * (interval === "year" ? 12 : 1))
    const last = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)
    ).getUTCDate()
    end.setUTCDate(Math.min(day, last))
  }
  return end
}

export function billingAmount(unitAmount: number, quantity: number) {
  const amount = unitAmount * quantity
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("invalid_invoice_amount")
  return amount
}

export function initialBillingState(
  amount: number,
  trialEnd: Date | null,
  now: Date
) {
  const complimentary = amount === 0 || trialEnd !== null
  return {
    subscriptionStatus: trialEnd
      ? ("trialing" as const)
      : complimentary
        ? ("active" as const)
        : ("past_due" as const),
    invoiceStatus: complimentary ? ("paid" as const) : ("open" as const),
    entitlementStatus: complimentary
      ? ("active" as const)
      : ("inactive" as const),
    amount: trialEnd ? 0 : amount,
    paidAt: complimentary ? now : null,
  }
}
