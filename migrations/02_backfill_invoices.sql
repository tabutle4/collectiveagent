-- ============================================================
-- Migration 02: Backfill pm_landlord_invoices for active leases
-- Run AFTER Migration 01 and AFTER deploying code
-- Run verification SELECT first, then the INSERT
-- ============================================================

-- STEP A: Preview what will be created (run this first, review counts)
SELECT
  l.id AS lease_id,
  l.landlord_id,
  l.property_id,
  l.monthly_rent,
  l.lease_start,
  l.lease_end,
  COALESCE(a.management_fee_flat, ROUND(l.monthly_rent * a.management_fee_pct / 100, 2)) AS mgmt_fee_amount,
  a.management_fee_pct,
  a.management_fee_flat
FROM pm_leases l
JOIN managed_properties mp ON mp.id = l.property_id
JOIN pm_agreements a ON a.id = mp.pm_agreement_id
WHERE l.status = 'active'
  AND mp.pm_agreement_id IS NOT NULL
ORDER BY l.created_at;

-- STEP B: Once you've reviewed the preview, run the INSERT
-- This generates one pm_landlord_invoice per month per active lease
-- Months that already have a landlord_disbursement will be marked paid in Migration 03
INSERT INTO pm_landlord_invoices (
  landlord_id,
  property_id,
  period_month,
  period_year,
  amount,
  description,
  due_date,
  status
)
SELECT
  l.landlord_id,
  l.property_id,
  month_series.period_month,
  month_series.period_year,
  COALESCE(a.management_fee_flat, ROUND(l.monthly_rent * a.management_fee_pct / 100, 2)) AS amount,
  'Management Fee' AS description,
  -- Due date: rent_due_day of that month (cap at 28 to be safe)
  make_date(
    month_series.period_year,
    month_series.period_month,
    LEAST(l.rent_due_day, 28)
  ) AS due_date,
  'pending' AS status
FROM pm_leases l
JOIN managed_properties mp ON mp.id = l.property_id
JOIN pm_agreements a ON a.id = mp.pm_agreement_id
-- Generate one row per month in the lease term
CROSS JOIN LATERAL (
  SELECT
    EXTRACT(MONTH FROM gs)::integer AS period_month,
    EXTRACT(YEAR  FROM gs)::integer AS period_year
  FROM generate_series(
    date_trunc('month', l.lease_start::date),
    date_trunc('month', l.lease_end::date),
    '1 month'::interval
  ) gs
) month_series
WHERE l.status = 'active'
  AND mp.pm_agreement_id IS NOT NULL
  -- Skip if invoice already exists for this landlord/property/period (idempotent)
  AND NOT EXISTS (
    SELECT 1 FROM pm_landlord_invoices pli
    WHERE pli.landlord_id = l.landlord_id
      AND pli.property_id = l.property_id
      AND pli.period_month = month_series.period_month
      AND pli.period_year  = month_series.period_year
  );

-- Verify count
SELECT COUNT(*) AS invoices_created FROM pm_landlord_invoices;
