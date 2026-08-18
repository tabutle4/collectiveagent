-- Add recurring deduction support to landlord_disbursement_deductions.
-- is_recurring = true marks a template row that auto-applies each month.
-- recurring_start_date / recurring_end_date control the active window.
-- Applied rows (attached to a disbursement) always have is_recurring = false.

ALTER TABLE landlord_disbursement_deductions
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_start_date date,
  ADD COLUMN IF NOT EXISTS recurring_end_date date;
