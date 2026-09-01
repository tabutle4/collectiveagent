-- A note that prints on the CDA.
--
-- ADDITIVE ONLY. One nullable column, nothing dropped, nothing deleted, safe to
-- re-run.
--
-- ORDER RELATIVE TO THE CODE DEPLOY: run this FIRST.
--   lib/documents/cdaData.ts selects cda_notes. PostgREST fails a select naming
--   a column that does not exist, so deploying the code first breaks CDA
--   generation entirely - both the web CDA and the emailed PDF - until this
--   runs. Running this first is harmless: an unread column changes nothing.
--
-- One note per DEAL, on transactions, not per agent row. A deal has one CDA.
-- cda_status, cda_url and cda_sent_manual_at already live here in the singular;
-- the [tia_id] in the CDA route says whose figures the document is built from,
-- not which of several CDAs it is.

-- Look first. Expect the column not to exist yet.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'transactions'
  AND column_name IN ('cda_notes', 'cda_status', 'cda_url');

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS cda_notes text;

-- Confirm. Expect cda_notes present, text, and null on every row: this is a new
-- field, so nothing is backfilled and every existing CDA renders exactly as it
-- does today until someone types a note.
SELECT
  count(*)                                        AS transactions,
  count(cda_notes)                                AS with_a_note
FROM public.transactions;
-- Expect with_a_note = 0.
