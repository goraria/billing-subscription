-- Inspect/resolve existing duplicate cycles before applying this migration.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_subscription_period_key
  ON invoices(subscription_id, period_start, period_end);
COMMIT;
