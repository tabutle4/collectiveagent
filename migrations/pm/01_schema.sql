-- ============================================================
-- Migration 01: Self-Collect Landlord Support - Schema
-- Run in Supabase SQL Editor FIRST before deploying code
-- ============================================================

-- 1. Three toggles on pm_agreements (all default true = existing behavior unchanged)
ALTER TABLE pm_agreements
  ADD COLUMN IF NOT EXISTS crc_collects_rent boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS crc_holds_deposit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS crc_invoices_mgmt_fee boolean NOT NULL DEFAULT true;

-- 2. Payment instructions on pm_leases (shown on tenant portal for self-collect)
ALTER TABLE pm_leases
  ADD COLUMN IF NOT EXISTS landlord_payment_instructions text;

-- 3. New pm_landlord_invoices table (mgmt fee billing for ALL landlords)
CREATE TABLE IF NOT EXISTS pm_landlord_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  landlord_id uuid NOT NULL REFERENCES landlords(id),
  property_id uuid NOT NULL REFERENCES managed_properties(id),
  period_month integer NOT NULL CHECK (period_month >= 1 AND period_month <= 12),
  period_year integer NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  amount numeric NOT NULL,
  description text,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','paid','cancelled')),
  paid_at timestamptz,
  paid_amount numeric,
  payment_method text,
  payment_notes text,
  payload_invoice_id text,
  payload_payment_link_id text,
  payload_payment_link_url text,
  notes text
);

-- 4. Connect pm_fee_payouts to landlord invoices
ALTER TABLE pm_fee_payouts
  ADD COLUMN IF NOT EXISTS landlord_invoice_id uuid REFERENCES pm_landlord_invoices(id);

-- Verification
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pm_agreements'
  AND column_name IN ('crc_collects_rent','crc_holds_deposit','crc_invoices_mgmt_fee');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'pm_leases' AND column_name = 'landlord_payment_instructions';

SELECT table_name FROM information_schema.tables
WHERE table_name = 'pm_landlord_invoices';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'pm_fee_payouts' AND column_name = 'landlord_invoice_id';
