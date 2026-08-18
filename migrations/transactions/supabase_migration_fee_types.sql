-- Patch T1.5: processing_fee_types cleanup (CORRECTED)
-- Verified 2026-04-22 against transactions + transaction_internal_agents CSVs:
--   • Zero transactions reference old (non-_v2) codes
--   • transaction_internal_agents.processing_fee_type_id is empty on all 1,135 rows
--   • 20 transactions reference 'tenant_other_v2' → same concept as 'tenant_non_apt_v2'
--     ("other" = not apartment); we migrate those, not create a duplicate.
-- Safe to run in Supabase SQL editor.

BEGIN;

-- ─── Step 1: Migrate tenant_other_v2 → tenant_non_apt_v2 ────────────────────
-- "other" is the same concept as "non_apt" (not apartment). Consolidate
-- the 20 orphan transactions to the canonical code.
UPDATE transactions
SET transaction_type = 'tenant_non_apt_v2',
    updated_at = now()
WHERE transaction_type = 'tenant_other_v2';

-- Verify the migration moved exactly the expected rows
DO $$
DECLARE
  remaining integer;
BEGIN
  SELECT count(*) INTO remaining
  FROM transactions
  WHERE transaction_type = 'tenant_other_v2';

  IF remaining > 0 THEN
    RAISE EXCEPTION 'ABORT: % transaction(s) still have tenant_other_v2 after migration', remaining;
  END IF;
END $$;

-- ─── Step 2: Add v2 equivalents for every remaining old code ────────────────
-- Following the existing naming convention:
--   tenant side → tenant_<subtype>_v2
--   non-tenant  → <modifier>_<role>_v2  (matches commercial_buyer_v2, etc.)

INSERT INTO processing_fee_types (
  name, code, processing_fee, is_active, display_order,
  counts_toward_cap, counts_toward_upgrade, is_lease, fee_type
)
SELECT * FROM (VALUES
  ('Landlord (apartment) Transaction', 'landlord_apt_v2',         0::numeric, true, 13, false, true, true,  'flat'),
  ('Commercial Seller Transaction',    'commercial_seller_v2',  500::numeric, true, 14, false, true, false, 'flat'),
  ('Commercial Landlord Transaction',  'commercial_landlord_v2', 350::numeric, true, 15, false, true, true,  'flat'),
  ('Business Buyer Transaction',       'business_buyer_v2',     200::numeric, true, 16, false, true, false, 'flat'),
  ('Business Seller Transaction',      'business_seller_v2',    200::numeric, true, 17, false, true, false, 'flat')
) AS new_rows(name, code, processing_fee, is_active, display_order,
              counts_toward_cap, counts_toward_upgrade, is_lease, fee_type)
WHERE NOT EXISTS (
  SELECT 1 FROM processing_fee_types pf WHERE pf.code = new_rows.code
);

-- ─── Step 3: Safety check before deleting old inactive rows ────────────────
-- If any transaction still references an old non-v2 code, ABORT.
DO $$
DECLARE
  bad_count integer;
  bad_codes text;
BEGIN
  SELECT count(*), string_agg(DISTINCT transaction_type, ', ')
    INTO bad_count, bad_codes
  FROM transactions
  WHERE transaction_type IN (
    'lease_listing', 'commercial_lease_listing', 'business_listing',
    'seller', 'buyer', 'commercial_listing', 'commercial_lease',
    'referral_out', 'apartment_lease', 'business_buyer', 'commercial_buyer'
  );

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'ABORT: % transaction(s) still reference old codes: %.',
      bad_count, bad_codes;
  END IF;
END $$;

-- ─── Step 4: Delete the 11 old inactive rows ────────────────────────────────
DELETE FROM processing_fee_types
WHERE code IN (
  'lease_listing',
  'commercial_lease_listing',
  'business_listing',
  'seller',
  'buyer',
  'commercial_listing',
  'commercial_lease',
  'referral_out',
  'apartment_lease',
  'business_buyer',
  'commercial_buyer'
)
  AND is_active = false;

COMMIT;

-- ─── Verification queries (run after commit) ───────────────────────────────
-- Expected: 17 rows, all active, all _v2 codes.
-- SELECT code, name, processing_fee, is_active, is_lease, display_order
-- FROM processing_fee_types
-- ORDER BY display_order;
--
-- Expected: zero rows (no orphan transaction_type values).
-- SELECT t.transaction_type, count(*)
-- FROM transactions t
-- LEFT JOIN processing_fee_types p ON p.code = t.transaction_type
-- WHERE p.code IS NULL AND t.transaction_type IS NOT NULL
-- GROUP BY t.transaction_type;
