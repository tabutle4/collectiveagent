-- ============================================================
-- Zip 2.1 Migration: source_repair_id on landlord_disbursement_deductions
-- ============================================================
--
-- Adds a nullable foreign key from landlord_disbursement_deductions back
-- to repair_requests so the repair PATCH can auto-create a pending
-- deduction the first time a repair is marked deducted_from_rent
-- without ever creating duplicates on subsequent edits.
--
-- Idempotent: re-running is safe.
-- Additive only: no destructive operations.
-- ============================================================

BEGIN;

ALTER TABLE landlord_disbursement_deductions
  ADD COLUMN IF NOT EXISTS source_repair_id uuid REFERENCES repair_requests(id) ON DELETE SET NULL;

-- Partial index for fast lookup by source repair (only meaningful when set)
CREATE INDEX IF NOT EXISTS idx_ldd_source_repair
  ON landlord_disbursement_deductions (source_repair_id)
  WHERE source_repair_id IS NOT NULL;

-- UNIQUE constraint prevents two simultaneous repair PATCHes from creating
-- duplicate deductions for the same repair. NULL values stay allowed
-- multiple times (Postgres treats each NULL as distinct in UNIQUE), so
-- manually-created deductions (no source repair) are unaffected.
--
-- Wrapped in a DO block so re-running the migration is safe; standard
-- ALTER TABLE ADD CONSTRAINT errors if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'landlord_disbursement_deductions_source_repair_id_key'
  ) THEN
    ALTER TABLE landlord_disbursement_deductions
      ADD CONSTRAINT landlord_disbursement_deductions_source_repair_id_key
      UNIQUE (source_repair_id);
  END IF;
END $$;

COMMIT;

-- Verification - should show 2 rows with ok = true (column + constraint)
SELECT 'source_repair_id column' AS check_name,
       (column_name = 'source_repair_id') AS ok
FROM information_schema.columns
WHERE table_name = 'landlord_disbursement_deductions'
  AND column_name = 'source_repair_id'
UNION ALL
SELECT 'source_repair_id UNIQUE constraint',
       (conname = 'landlord_disbursement_deductions_source_repair_id_key')
FROM pg_constraint
WHERE conname = 'landlord_disbursement_deductions_source_repair_id_key';
