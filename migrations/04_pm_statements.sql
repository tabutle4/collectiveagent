-- ============================================================
-- Migration 04: pm_statements table + landlord_disbursement_deductions index
-- Run all at once. Verify SELECT at bottom returns 2 rows.
-- ============================================================

ALTER TABLE landlord_disbursement_deductions
  ADD COLUMN IF NOT EXISTS source_invoice_id uuid REFERENCES tenant_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ldd_source_invoice
  ON landlord_disbursement_deductions (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS pm_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL REFERENCES landlords(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES managed_properties(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('monthly', 'annual')),
  period_month integer CHECK (period_month BETWEEN 1 AND 12),
  period_year integer NOT NULL,
  statement_date date NOT NULL DEFAULT CURRENT_DATE,
  total_rent_collected numeric(12,2) NOT NULL DEFAULT 0,
  total_management_fees numeric(12,2) NOT NULL DEFAULT 0,
  total_deductions numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_in numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_returned_to_landlord numeric(12,2) NOT NULL DEFAULT 0,
  total_deposits_refunded_to_tenant numeric(12,2) NOT NULL DEFAULT 0,
  total_net_disbursed numeric(12,2) NOT NULL DEFAULT 0,
  total_net_pending numeric(12,2) NOT NULL DEFAULT 0,
  held_in_trust_at_statement_date numeric(12,2) NOT NULL DEFAULT 0,
  sent_at timestamptz,
  sent_to_email text,
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pm_statements_unique_period
  ON pm_statements (landlord_id, property_id, period_type, period_year, COALESCE(period_month, 0));

CREATE INDEX IF NOT EXISTS idx_pm_statements_landlord
  ON pm_statements (landlord_id, period_year DESC, period_month DESC);

CREATE INDEX IF NOT EXISTS idx_pm_statements_property
  ON pm_statements (property_id, period_year DESC, period_month DESC);

-- Verify (expect 2 rows)
SELECT table_name, 'exists' AS status
FROM information_schema.tables
WHERE table_name = 'pm_statements'
UNION ALL
SELECT column_name, 'exists'
FROM information_schema.columns
WHERE table_name = 'landlord_disbursement_deductions'
  AND column_name = 'source_invoice_id';
