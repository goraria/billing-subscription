import { pool } from "@/database"
import { addBillingInterval, billingAmount } from "@/utils/billing"

/** Bounded, transactional scheduler. Run repeatedly; SKIP LOCKED permits multiple runners. */
export async function rawRenewSubscriptions(limit = 50, now = new Date()) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error("invalid_batch_size")
  const client = await pool.connect()
  let renewed = 0
  let expired = 0
  let cancelled = 0
  try {
    await client.query("BEGIN")
    const { rows } = await client.query(
      `SELECT * FROM subscriptions
      WHERE status IN ('active','trialing','past_due') AND
        (current_period_end <= $1 OR (cancel_at IS NOT NULL AND cancel_at <= $1))
      ORDER BY current_period_end, id FOR UPDATE SKIP LOCKED LIMIT $2`,
      [now, limit]
    )
    for (const subscription of rows) {
      if (
        subscription.cancel_at_period_end ||
        subscription.status === "past_due"
      ) {
        const status = subscription.cancel_at_period_end
          ? "cancelled"
          : "expired"
        await client.query(
          `UPDATE subscriptions SET status=$2, ended_at=$3,
          cancelled_at=CASE WHEN $2='cancelled' THEN $3 ELSE cancelled_at END, updated_at=$3 WHERE id=$1`,
          [subscription.id, status, now]
        )
        await client.query(
          "UPDATE entitlements SET status='inactive', expires_at=$2, updated_at=$2 WHERE subscription_id=$1",
          [subscription.id, now]
        )
        await client.query(
          "UPDATE invoices SET status='uncollectible',updated_at=$2 WHERE subscription_id=$1 AND status='open' AND period_end<=$2",
          [subscription.id, now]
        )
        status === "cancelled" ? cancelled++ : expired++
        continue
      }
      const { rows: items } = await client.query(
        `SELECT si.id AS subscription_item_id, si.quantity, p.*, pl.name AS plan_name
        FROM subscription_items si JOIN prices p ON p.id=si.price_id JOIN plans pl ON pl.id=p.plan_id
        WHERE si.subscription_id=$1 ORDER BY si.id`,
        [subscription.id]
      )
      // Mixed intervals/currencies and metered settlement need a separate invoicing policy.
      const first = items[0]
      if (
        !first ||
        items.some(
          (item) =>
            item.type !== "fixed" ||
            item.currency !== first.currency ||
            item.interval !== first.interval ||
            item.interval_count !== first.interval_count
        )
      ) {
        throw new Error("unsupported_subscription_price_configuration")
      }
      const start = new Date(subscription.current_period_end)
      const end = addBillingInterval(
        start,
        first.interval,
        first.interval_count,
        subscription.metadata?.billingAnchorDay
      )
      const amount = items.reduce(
        (sum, item) =>
          billingAmount(
            sum + billingAmount(Number(item.unit_amount), item.quantity),
            1
          ),
        0
      )
      const invoice = await client.query(
        `INSERT INTO invoices
        (user_id,subscription_id,number,status,currency,subtotal,total,amount_due,period_start,period_end,due_at,paid_at)
        VALUES ($1,$2,$3,$4,$5,$6,$6,$6,$7,$8,$7,$9)
        ON CONFLICT (subscription_id,period_start,period_end) DO NOTHING RETURNING id`,
        [
          subscription.user_id,
          subscription.id,
          `INV-${crypto.randomUUID()}`,
          amount === 0 ? "paid" : "open",
          first.currency,
          amount,
          start,
          end,
          amount === 0 ? now : null,
        ]
      )
      if (invoice.rows[0]) {
        for (const item of items)
          await client.query(
            `INSERT INTO invoice_items
          (invoice_id,subscription_item_id,description,quantity,unit_amount,amount,currency,period_start,period_end)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              invoice.rows[0].id,
              item.subscription_item_id,
              item.plan_name,
              item.quantity,
              item.unit_amount,
              billingAmount(Number(item.unit_amount), item.quantity),
              item.currency,
              start,
              end,
            ]
          )
      }
      await client.query(
        "UPDATE subscriptions SET status=$2,current_period_start=$3,current_period_end=$4,updated_at=$5 WHERE id=$1",
        [subscription.id, amount === 0 ? "active" : "past_due", start, end, now]
      )
      await client.query(
        "UPDATE entitlements SET status=$2,starts_at=$3,expires_at=$4,updated_at=$5 WHERE subscription_id=$1",
        [subscription.id, amount === 0 ? "active" : "inactive", start, end, now]
      )
      renewed++
    }
    await client.query("COMMIT")
    return { renewed, expired, cancelled }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
