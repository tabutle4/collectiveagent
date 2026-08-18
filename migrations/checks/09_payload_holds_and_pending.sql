-- Migration 09: per-check bank holds + Payload pending-payload sources
-- Additive only. Idempotent (IF NOT EXISTS / COALESCE). Run in Supabase SQL
-- Editor BEFORE deploying the code. No DROP, no DELETE, nothing destructive.

-- ---------------------------------------------------------------------------
-- 1. Per-check bank hold amount.
--    Set when adding a check (checks page modal or transaction checks tab).
--    Counts toward Bank Holds while the check has not cleared (cleared_date
--    empty or in the future) and drops off once cleared_date is today or past.
--    Payload-method checks are excluded from holds (they live in Pending
--    Payload instead) so nothing double counts.
-- ---------------------------------------------------------------------------
ALTER TABLE checks_received
  ADD COLUMN IF NOT EXISTS hold_amount numeric DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Provenance + idempotency for pay-link checks (commission / retainer).
--    payload_transaction_id makes webhook retries safe (no duplicate checks).
--    payload_payment_link_id lets the report split Pending Payload by source.
-- ---------------------------------------------------------------------------
ALTER TABLE checks_received
  ADD COLUMN IF NOT EXISTS payload_transaction_id text;
ALTER TABLE checks_received
  ADD COLUMN IF NOT EXISTS payload_payment_link_id text;

CREATE UNIQUE INDEX IF NOT EXISTS checks_received_payload_txn_uniq
  ON checks_received (payload_transaction_id)
  WHERE payload_transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. PM rent in-flight tracking.
--    A tenant invoice paid via Payload is in flight until the ACH settles.
--    payment_method='payload' + status='paid' + funds_cleared_at NULL means
--    the rent is still Pending Payload. The daily funding-sync cron stamps
--    funds_cleared_at once Payload shows a deposit ledger entry.
-- ---------------------------------------------------------------------------
ALTER TABLE tenant_invoices
  ADD COLUMN IF NOT EXISTS funds_cleared_at date;

-- Backfill: rent paid via Payload more than 14 days ago has long since
-- settled (ACH settles in 1-3 business days). Without this, every historical
-- paid invoice would show as Pending Payload on day one. The daily cron
-- confirms anything newer against Payload's actual deposit ledger.
-- SELECT-before preview. Review the count, then run the UPDATE.
SELECT count(*) AS will_backfill
  FROM tenant_invoices
 WHERE payment_method = 'payload'
   AND status = 'paid'
   AND funds_cleared_at IS NULL
   AND paid_at IS NOT NULL
   AND paid_at < now() - interval '14 days';

UPDATE tenant_invoices
   SET funds_cleared_at = paid_at::date
 WHERE payment_method = 'payload'
   AND status = 'paid'
   AND funds_cleared_at IS NULL
   AND paid_at IS NOT NULL
   AND paid_at < now() - interval '14 days';

-- ---------------------------------------------------------------------------
-- 4. Pay-link IDs live in settings, never hardcoded in logic.
--    COALESCE fills only when currently null, so re-running never clobbers
--    a manual edit.
-- ---------------------------------------------------------------------------
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS payload_commission_link_id text;
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS payload_retainer_link_id text;

-- SELECT-before preview for the seeding UPDATE. Run this first, review, then
-- run the UPDATE below. Expect 1 row (single company_settings row).
SELECT id, payload_commission_link_id, payload_retainer_link_id
  FROM company_settings;

UPDATE company_settings
   SET payload_commission_link_id =
         COALESCE(payload_commission_link_id, 'pay_3fBkgqMNVQix6qZNNSzU1'),
       payload_retainer_link_id   =
         COALESCE(payload_retainer_link_id,   'pay_3fBkdmOt4gV2D3sWz3i4Z');

-- ---------------------------------------------------------------------------
-- VERIFY (run all four; each should return the rows described)
-- ---------------------------------------------------------------------------
-- Expect 3 rows: hold_amount (numeric, default 0), payload_payment_link_id,
-- payload_transaction_id
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'checks_received'
   AND column_name IN ('hold_amount', 'payload_transaction_id', 'payload_payment_link_id')
 ORDER BY column_name;

-- Expect 1 row: funds_cleared_at
SELECT column_name
  FROM information_schema.columns
 WHERE table_name = 'tenant_invoices'
   AND column_name = 'funds_cleared_at';

-- Expect 1 row with both link IDs populated
SELECT payload_commission_link_id, payload_retainer_link_id
  FROM company_settings;

-- Expect 1 row: the partial unique index
SELECT indexname FROM pg_indexes
 WHERE tablename = 'checks_received'
   AND indexname = 'checks_received_payload_txn_uniq';
