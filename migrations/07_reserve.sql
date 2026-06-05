-- Add disbursement_type and reserve_amount to landlord_disbursements
ALTER TABLE landlord_disbursements
  ADD COLUMN IF NOT EXISTS disbursement_type text NOT NULL DEFAULT 'rent',
  ADD COLUMN IF NOT EXISTS reserve_amount numeric NOT NULL DEFAULT 0;

-- Backfill disbursement_type for existing rows:
-- Rows with deposit_amount > 0 and gross_rent = 0 are deposit disbursements
UPDATE landlord_disbursements
SET disbursement_type = 'deposit'
WHERE deposit_amount > 0 AND gross_rent = 0 AND disbursement_type = 'rent';

-- Verify
SELECT disbursement_type, COUNT(*) as count, SUM(reserve_amount) as total_reserve
FROM landlord_disbursements
GROUP BY disbursement_type;
