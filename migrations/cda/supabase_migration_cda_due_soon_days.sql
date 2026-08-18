-- Needs CDA "send now" threshold.
--
-- How many days before closing a deal should be flagged on the Needs CDA tab.
-- Lives in company_settings so it is editable in Settings -> Terms rather than
-- hardcoded. 7 matches the rule that was requested.
--
-- Additive only. Safe to re-run. No destructive operation in this file.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS cda_due_soon_days integer NOT NULL DEFAULT 7;

-- Verification: expect one row, cda_due_soon_days = 7 (or whatever it is set to).
-- SELECT id, cda_due_soon_days FROM company_settings;
