-- ============================================================
-- Migration 03: Mark historical invoices paid + connect pm_fee_payouts
-- Run AFTER Migration 02
-- ============================================================

-- STEP A: Preview which invoices will be marked paid (review before running UPDATE)
SELECT
  pli.id AS invoice_id,
  pli.landlord_id,
  pli.property_id,
  pli.period_month,
  pli.period_year,
  pli.amount,
  ld.id AS disbursement_id,
  ld.management_fee,
  COALESCE(ld.payment_date, ld.created_at::date) AS paid_date
FROM pm_landlord_invoices pli
JOIN landlord_disbursements ld
  ON ld.landlord_id = pli.landlord_id
  AND ld.property_id = pli.property_id
  AND ld.period_month = pli.period_month
  AND ld.period_year  = pli.period_year
WHERE pli.status = 'pending'
ORDER BY pli.period_year, pli.period_month;

-- STEP B: Mark invoices paid where a disbursement exists
UPDATE pm_landlord_invoices pli
SET
  status       = 'paid',
  paid_at      = (
    SELECT COALESCE(ld.payment_date::timestamptz, ld.created_at)
    FROM landlord_disbursements ld
    WHERE ld.landlord_id = pli.landlord_id
      AND ld.property_id = pli.property_id
      AND ld.period_month = pli.period_month
      AND ld.period_year  = pli.period_year
    LIMIT 1
  ),
  paid_amount  = (
    SELECT ld.management_fee
    FROM landlord_disbursements ld
    WHERE ld.landlord_id = pli.landlord_id
      AND ld.property_id = pli.property_id
      AND ld.period_month = pli.period_month
      AND ld.period_year  = pli.period_year
    LIMIT 1
  ),
  payment_method = 'disbursement',
  updated_at   = now()
WHERE pli.status = 'pending'
  AND EXISTS (
    SELECT 1 FROM landlord_disbursements ld
    WHERE ld.landlord_id = pli.landlord_id
      AND ld.property_id = pli.property_id
      AND ld.period_month = pli.period_month
      AND ld.period_year  = pli.period_year
  );

-- STEP C: Preview pm_fee_payouts that need landlord_invoice_id set
SELECT
  fp.id AS fee_payout_id,
  fp.disbursement_id,
  fp.payee_type,
  fp.amount,
  pli.id AS invoice_id
FROM pm_fee_payouts fp
JOIN landlord_disbursements ld ON ld.id = fp.disbursement_id
JOIN pm_landlord_invoices pli
  ON pli.landlord_id = ld.landlord_id
  AND pli.property_id = ld.property_id
  AND pli.period_month = ld.period_month
  AND pli.period_year  = ld.period_year
WHERE fp.landlord_invoice_id IS NULL
ORDER BY fp.created_at;

-- STEP D: Connect existing pm_fee_payouts to their landlord invoices
UPDATE pm_fee_payouts fp
SET landlord_invoice_id = pli.id
FROM landlord_disbursements ld
JOIN pm_landlord_invoices pli
  ON pli.landlord_id = ld.landlord_id
  AND pli.property_id = ld.property_id
  AND pli.period_month = ld.period_month
  AND pli.period_year  = ld.period_year
WHERE fp.disbursement_id = ld.id
  AND fp.landlord_invoice_id IS NULL;

-- Final verification
SELECT
  COUNT(*) FILTER (WHERE status = 'paid')    AS invoices_paid,
  COUNT(*) FILTER (WHERE status = 'pending') AS invoices_pending,
  COUNT(*) FILTER (WHERE status = 'sent')    AS invoices_sent
FROM pm_landlord_invoices;

SELECT
  COUNT(*) FILTER (WHERE landlord_invoice_id IS NOT NULL) AS fee_payouts_connected,
  COUNT(*) FILTER (WHERE landlord_invoice_id IS NULL)     AS fee_payouts_unconnected
FROM pm_fee_payouts;
