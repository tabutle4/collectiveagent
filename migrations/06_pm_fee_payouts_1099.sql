ALTER TABLE pm_fee_payouts
  ADD COLUMN IF NOT EXISTS amount_1099_reportable numeric;

-- Backfill existing agent payout rows: 1099 amount = amount paid
UPDATE pm_fee_payouts
SET amount_1099_reportable = amount
WHERE payee_type = 'agent'
  AND amount_1099_reportable IS NULL;

-- Verify
SELECT
  COUNT(*) FILTER (WHERE payee_type = 'agent' AND amount_1099_reportable IS NULL) AS agent_missing_1099,
  COUNT(*) FILTER (WHERE payee_type = 'agent' AND amount_1099_reportable IS NOT NULL) AS agent_with_1099
FROM pm_fee_payouts;
