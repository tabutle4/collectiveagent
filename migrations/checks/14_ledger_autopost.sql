-- migrations/checks/14_ledger_autopost.sql
--
-- Automatic ledger posting: the start date, and the third ending for an
-- earmark.
--
-- ADDITIVE ONLY. One new column, one widened check constraint. Nothing is
-- dropped and nothing is deleted, so this is safe to run before the code
-- deploy. Running it early breaks nothing: the old code does not know the
-- column exists and the widened constraint only allows a value the old code
-- never writes.
--
-- Re-running is safe. Every statement is guarded.
--
-- ---------------------------------------------------------------------------
-- 1. company_settings.ledger_start_date
-- ---------------------------------------------------------------------------
-- The date the payouts ledger opens. NULL means it has not been started, and
-- while it is NULL nothing auto-posts at all.
--
-- This is the whole of the backfill story. The opening balance is one line at
-- whatever the bank actually says on the day the ledger starts, and that
-- figure already contains every deposit, payout and sweep that came before it.
-- Auto-posting therefore ignores anything dated earlier: posting that history
-- on top of the opening balance would count the same money twice.
--
-- It is a setting rather than a constant because Tara chooses the day, and it
-- is deliberately NOT the same thing as CUTOVER_DATE. The cutover is where the
-- reporting period starts; this is where the cash ledger starts. They answer
-- different questions and conflating them is how a screen ends up hiding a
-- liability on a date boundary.

alter table public.company_settings
  add column if not exists ledger_start_date date;

comment on column public.company_settings.ledger_start_date is
  'Date the payouts ledger opens. NULL means not started and nothing auto-posts. Auto-posting ignores anything dated before it, because the opening balance already contains that history.';

-- ---------------------------------------------------------------------------
-- 2. payout_expenses.status gains 'paid'
-- ---------------------------------------------------------------------------
-- An earmark had two endings and neither of them was "the money actually went
-- out": Release stops reserving and deliberately moves nothing, Delete removes
-- the record. So there was no way to say a bill was paid, which is why paying
-- one could not be told apart from cancelling one.
--
-- 'paid' is the third ending. It closes the earmark AND posts a bill line to
-- the ledger with the amount that actually left, which may differ from the
-- amount reserved.
--
-- The constraint is replaced rather than dropped, so the column stays
-- protected throughout.

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'payout_expenses_status_check'
  ) then
    alter table public.payout_expenses
      drop constraint payout_expenses_status_check;
  end if;

  alter table public.payout_expenses
    add constraint payout_expenses_status_check
    check (status = any (array['active'::text, 'released'::text, 'paid'::text]));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Verification
-- ---------------------------------------------------------------------------
-- Expect: ledger_start_date present and NULL, the status constraint listing
-- three values, and no ledger rows carrying an auto external_id yet.

-- select column_name, is_nullable
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name = 'company_settings'
--    and column_name = 'ledger_start_date';

-- select pg_get_constraintdef(oid)
--   from pg_constraint
--  where conname = 'payout_expenses_status_check';

-- select count(*) as auto_posted_lines
--   from public.brokerage_ledger
--  where external_source = 'auto';
