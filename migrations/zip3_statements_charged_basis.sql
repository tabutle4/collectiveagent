-- ============================================================
-- Zip 3 Migration: PM Statements + Charged-basis management fees
-- ============================================================
--
-- Three schema changes shipped together because they're all required by
-- the same feature set (PM Statements + monthly auto-charge for landlords
-- whose agreement charges mgmt fee on rent BILLED, not just RECEIVED).
--
-- 1. pm_agreements.mgmt_fee_basis
--    Enum-like text column: 'collected' | 'charged'.
--    - 'collected' (legacy default): mgmt fee taken only when rent is
--      received. This is what every existing agreement does today.
--    - 'charged' (new): mgmt fee is owed every period regardless of
--      whether tenant paid. When tenant skips a month, a pending
--      deduction is auto-created so the fee comes out of the next
--      successful disbursement. Matches TXR-2201 Para 6(A): "A vacancy
--      in the Property or failure by a tenant to pay rent does not
--      excuse payment of the minimum management fee."
--    The SQL default is 'collected' so existing rows are unaffected. The
--    form UI defaults new agreements to 'charged' (UI decision, not DB).
--
-- 2. landlord_disbursement_deductions.source_invoice_id
--    Nullable FK to tenant_invoices. Mirrors the source_repair_id pattern
--    added in zip2_1: gives idempotency for auto-charge so re-running the
--    monthly charged-basis job cannot create duplicate deductions for the
--    same unpaid invoice. UNIQUE constraint enforces this at the DB level.
--
-- 3. pm_statements table
--    New table for landlord monthly/annual statements. Cash basis (the
--    period_month/period_year reflect when money MOVED, not when it was
--    invoiced). One statement per landlord+property+period combination.
--    Sent via Resend with a link to the portal view; rendered as HTML
--    (browser-printable) using the same getPMEmailLayout styling as all
--    other PM emails.
--
-- Reversibility:
--   Mgmt fee basis column - drop column (no data destroyed, all rows
--     would revert to NULL/collected behavior).
--   source_invoice_id - drop column + constraint.
--   pm_statements - drop table. Statements are derivative records that
--     can be regenerated from disbursement/invoice/deduction data.
--
-- Safe to run in Supabase SQL editor. Idempotent.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. pm_agreements.mgmt_fee_basis
-- ============================================================

ALTER TABLE pm_agreements
  ADD COLUMN IF NOT EXISTS mgmt_fee_basis text NOT NULL DEFAULT 'collected';

-- CHECK constraint via DO block for idempotency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pm_agreements_mgmt_fee_basis_check'
  ) THEN
    ALTER TABLE pm_agreements
      ADD CONSTRAINT pm_agreements_mgmt_fee_basis_check
      CHECK (mgmt_fee_basis IN ('collected', 'charged'));
  END IF;
END $$;

-- ============================================================
-- 2. landlord_disbursement_deductions.source_invoice_id
-- ============================================================

ALTER TABLE landlord_disbursement_deductions
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES tenant_invoices(id) ON DELETE SET NULL;

-- Partial index for fast lookup (only meaningful when set)
CREATE INDEX IF NOT EXISTS idx_ldd_source_invoice
  ON landlord_disbursement_deductions (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

-- UNIQUE constraint prevents the monthly charged-basis job from inserting
-- a duplicate deduction for the same unpaid invoice. NULL values are
-- treated as distinct in Postgres UNIQUE constraints, so manually-created
-- deductions (no source invoice) are unaffected.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'landlord_disbursement_deductions_source_invoice_id_key'
  ) THEN
    ALTER TABLE landlord_disbursement_deductions
      ADD CONSTRAINT landlord_disbursement_deductions_source_invoice_id_key
      UNIQUE (source_invoice_id);
  END IF;
END $$;

-- ============================================================
-- 3. pm_statements table
-- ============================================================

CREATE TABLE IF NOT EXISTS pm_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scope: who and which property
  landlord_id uuid NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES managed_properties(id) ON DELETE CASCADE,

  -- Period
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'annual')),
  period_month integer CHECK (period_month BETWEEN 1 AND 12),  -- NULL when period_type='annual'
  period_year integer NOT NULL,
  statement_date date NOT NULL DEFAULT CURRENT_DATE,

  -- Computed totals at time of generation - cached for performance and
  -- so future schema changes don't retroactively modify statements that
  -- were already sent to landlords.
  total_rent_collected numeric(12,2) NOT NULL DEFAULT 0,
  total_management_fees numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_in numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_returned_to_landlord numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_refunded_to_tenant numeric(12,2) NOT NULL DEFAULT 0,
  total_net_disbursed numeric(12,2) NOT NULL DEFAULT 0,
  held_in_trust_at_statement_date numeric(12,2) NOT NULL DEFAULT 0,

  -- Email tracking
  sent_at timestamptz,
  sent_to_email text,

  -- Notes (admin-editable, surfaces on statement)
  notes text,

  -- Standard tracking
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One statement per landlord+property+period combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_statements_unique_period
  ON pm_statements (landlord_id, property_id, period_type, period_year, COALESCE(period_month, 0));

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_pm_statements_landlord ON pm_statements (landlord_id, period_year DESC, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_pm_statements_property ON pm_statements (property_id, period_year DESC, period_month DESC);

COMMIT;

-- ============================================================
-- Verification (run after migration, expect all rows ok=true)
-- ============================================================
SELECT 'pm_agreements.mgmt_fee_basis column' AS check_name,
       (column_name = 'mgmt_fee_basis') AS ok
FROM information_schema.columns
WHERE table_name = 'pm_agreements' AND column_name = 'mgmt_fee_basis'
UNION ALL
SELECT 'pm_agreements.mgmt_fee_basis CHECK constraint',
       (conname = 'pm_agreements_mgmt_fee_basis_check')
FROM pg_constraint WHERE conname = 'pm_agreements_mgmt_fee_basis_check'
UNION ALL
SELECT 'landlord_disbursement_deductions.source_invoice_id column',
       (column_name = 'source_invoice_id')
FROM information_schema.columns
WHERE table_name = 'landlord_disbursement_deductions' AND column_name = 'source_invoice_id'
UNION ALL
SELECT 'landlord_disbursement_deductions.source_invoice_id UNIQUE constraint',
       (conname = 'landlord_disbursement_deductions_source_invoice_id_key')
FROM pg_constraint WHERE conname = 'landlord_disbursement_deductions_source_invoice_id_key'
UNION ALL
SELECT 'pm_statements table',
       (table_name = 'pm_statements')
FROM information_schema.tables WHERE table_name = 'pm_statements';
