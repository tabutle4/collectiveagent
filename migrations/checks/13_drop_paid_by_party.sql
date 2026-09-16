-- migrations/checks/13_drop_paid_by_party.sql
--
-- Drops transaction_internal_agents.paid_by_party.
--
-- DESTRUCTIVE. Runs LAST, after 11 and 12 are verified and the code is
-- deployed. Kept out of the additive migration on purpose.
--
-- Why it exists: migration 11 originally added this column to record whether
-- Collective Realty Co. or title paid a given agent. That was a duplicate.
-- transaction_internal_agents.funding_source already does exactly that job,
-- already carries 'title_direct', and already has 52 rows saying so. Because
-- paid_by_party defaulted to 'brokerage' it did not merely duplicate
-- funding_source, it contradicted it on every one of those 52 rows.
--
-- Nothing reads or writes paid_by_party. Migration 11 no longer adds it, so on
-- a fresh database this is a no-op.
--
-- SELECT FIRST. The test is a condition, not a number: the query must return
-- exactly ONE row, and that row must be 'brokerage'. The row count itself is
-- deliberately not recorded here, because it grows with every deal and a stale
-- figure in a migration invites someone to reconcile live data to a comment.
--
--   select coalesce(paid_by_party, '(null)') as paid_by_party, count(*)
--   from public.transaction_internal_agents
--   group by 1;
--
-- If a second row appears, or the single row is anything other than
-- 'brokerage', STOP. Someone has started using the column and dropping it
-- would lose what they recorded.

begin;

alter table public.transaction_internal_agents
  drop column if exists paid_by_party;

commit;

-- Verify: should return 0.
--
--   select count(*) from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'transaction_internal_agents'
--     and column_name = 'paid_by_party';
