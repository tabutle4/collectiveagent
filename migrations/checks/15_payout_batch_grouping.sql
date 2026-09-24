-- migrations/checks/15_payout_batch_grouping.sql
--
-- Void a payout from the app, and group payouts into the Payload batch that
-- actually hit the bank.
--
-- ADDITIVE ONLY. Two nullable columns, nothing dropped, nothing rewritten.
-- Safe to run before the code deploy: the old code neither reads nor writes
-- these columns.
--
-- Re-running is safe. Both statements are guarded.
--
-- ---------------------------------------------------------------------------
-- payload_funding_id
-- ---------------------------------------------------------------------------
-- Payload debits the bank ONCE for a whole run of payouts. Six payments to six
-- agents are one line on the statement. Posting six ledger lines against that
-- single debit means nothing can ever be ticked off, which is the one job the
-- payouts ledger exists to do.
--
-- Payload exposes the link, but not in its public object reference. A settled
-- credit carries a ledger entry whose `assoc_transaction_id` is the funding
-- transaction - the same id the dashboard shows under Deposits. Confirmed
-- against live data 2026-09-24: credit txn_3fSFShWfSOVQXF5wFu09t carries
-- assoc_transaction_id txn_3fSGtK3LinoPKcQ3KYn78, and that batch's six credits
-- sum to exactly its $5,714.73.
--
-- The id is CAPTURED rather than fetched on demand. The reconciliation cron
-- already calls Payload for these rows, so it stores the value while it has it.
-- Asking Payload again on every ledger sync would be a polling loop re-reading
-- something that never changes once settled.
--
-- Nullable on purpose. A payout paid by wire, Zelle or check has no Payload
-- batch and never will, and those stand as their own bank lines - which is
-- correct, because that is what the statement shows.

alter table public.transaction_internal_agents
  add column if not exists payload_funding_id text;

comment on column public.transaction_internal_agents.payload_funding_id is
  'Payload funding transaction this payout settled inside - the single bank debit that carried it. From ledger[].assoc_transaction_id. NULL for anything not paid through a Payload batch.';

-- An outside brokerage can ride in the same Payload run as the agents. Tara,
-- 2026-09-24: "they can but have not so far." The column exists so the day it
-- happens the payout lands in the right batch with no schema change.
alter table public.transaction_external_brokerages
  add column if not exists payload_funding_id text;

comment on column public.transaction_external_brokerages.payload_funding_id is
  'Payload funding transaction this payout settled inside. From ledger[].assoc_transaction_id. NULL for anything not paid through a Payload batch.';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
-- Expect both columns present and entirely NULL. They fill in from the next
-- reconciliation run (11:30 UTC), which stores the id for every payout it
-- marks paid and backfills any already-paid row that is missing one.

-- select table_name, column_name, is_nullable, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and column_name = 'payload_funding_id'
--  order by table_name;

-- select count(*) filter (where payload_funding_id is not null) as with_batch,
--        count(*) as paid_rows
--   from public.transaction_internal_agents
--  where payment_status = 'paid';

-- Batch lines in the ledger, once the ledger has synced. Each parent's amount
-- must equal the sum of its children, and only parents count toward the
-- balance.
-- select p.id, p.entry_date, p.amount as batch_total,
--        count(c.id) as payments,
--        coalesce(sum(c.amount), 0) as children_total
--   from public.brokerage_ledger p
--   left join public.brokerage_ledger c on c.parent_entry_id = p.id
--  where p.external_id like 'payout_batch:%'
--  group by p.id, p.entry_date, p.amount
--  order by p.entry_date desc;
