-- Migration: management_fee_flat column on pm_agreements
--
-- Context:
--   Prior to this migration, pm_agreements modeled management fees only as
--   a percentage of monthly rent (management_fee_pct). A column called
--   management_fee_minimum exists but is dead in the codebase: the only
--   place that computes a management fee is the tenant-payment-webhook at
--   app/api/pm/payload/tenant-payment-webhook/route.ts, and it reads
--   management_fee_pct only. The minimum field is never consulted.
--
--   At least one landlord (Pidatala, 503 Tidal Dr, McKinney) has a signed
--   TXR-2201 PM Agreement with a $200 flat monthly management fee, not a
--   percentage. The leasing_fee side already supports both pct and flat
--   (leasing_fee_pct + leasing_fee_flat); management fee needs the same
--   treatment.
--
--   This migration adds:
--
--     management_fee_flat   numeric   NULL
--       When set (not NULL), the disbursement webhook uses this value
--       directly as the management fee instead of computing pct of rent.
--       When NULL, behavior is unchanged: management_fee_pct is applied
--       to gross rent as before. Default NULL preserves legacy behavior
--       for every existing agreement.
--
-- Companion code change:
--   app/api/pm/payload/tenant-payment-webhook/route.ts is patched in the
--   same deploy to read management_fee_flat and prefer it when set.
--
-- Reversibility:
--   Fully reversible. To roll back, drop the column. No data is destroyed
--   by adding a nullable column.
--
-- Safe to run in Supabase SQL editor.

BEGIN;

-- Pre-check: confirm the column does not already exist
DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pm_agreements'
      AND column_name = 'management_fee_flat'
  ) INTO col_exists;

  IF col_exists THEN
    RAISE NOTICE 'Column pm_agreements.management_fee_flat already exists, skipping add';
  END IF;
END $$;

-- Add the column (idempotent via IF NOT EXISTS)
ALTER TABLE public.pm_agreements
  ADD COLUMN IF NOT EXISTS management_fee_flat numeric NULL;

COMMENT ON COLUMN public.pm_agreements.management_fee_flat IS
  'Flat monthly management fee in dollars. When set (not NULL), the disbursement webhook uses this value instead of computing management_fee_pct of gross rent. When NULL, management_fee_pct is used as before.';

-- Post-check: confirm column was added
DO $$
DECLARE
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pm_agreements'
      AND column_name = 'management_fee_flat'
  ) INTO col_exists;

  IF NOT col_exists THEN
    RAISE EXCEPTION 'ABORT: management_fee_flat column was not added';
  END IF;
END $$;

COMMIT;

-- Verification queries (run after commit, outside the transaction):
--
-- 1. Confirm column exists with the expected type:
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'pm_agreements'
--      AND column_name = 'management_fee_flat';
--
--    Expected:
--      column_name           | data_type | is_nullable | column_default
--      management_fee_flat   | numeric   | YES         | NULL
--
-- 2. Confirm existing rows are unaffected (all should be NULL):
--    SELECT count(*) AS total_agreements,
--           count(management_fee_flat) AS rows_with_flat_set
--    FROM public.pm_agreements;
--
--    Expected: rows_with_flat_set = 0 immediately after migration.
