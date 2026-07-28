-- Manual "CDA sent" override.
--
-- Some CDAs go to title outside the app -- emailed from a mailbox, handed over
-- at closing. The Needs CDA tab has no way to know about those, so a deal sits
-- on the list forever looking like it still needs one.
--
-- These columns record a manual mark. They are SEPARATE from cda_status so the
-- in-app detection keeps working on its own: the tab treats a deal as sent when
-- cda_status = 'sent' OR cda_sent_manual_at is set. Marking by hand can only
-- add the flag, never erase a real in-app send.
--
-- Additive only. Safe to re-run. No destructive operation in this file.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS cda_sent_manual_at timestamptz;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS cda_sent_manual_by uuid REFERENCES users(id);

-- Verification: both columns present, all existing rows null (nothing is
-- retroactively marked as sent).
--   SELECT COUNT(*) AS total,
--          COUNT(cda_sent_manual_at) AS manually_marked
--   FROM transactions;
