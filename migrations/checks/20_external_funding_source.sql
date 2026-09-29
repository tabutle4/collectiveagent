-- Who funded an outside brokerage's commission.
--
-- transaction_internal_agents has carried funding_source since the payouts
-- ledger was built: 'crc' when we paid the agent, 'title_direct' when title
-- paid them at the closing table. transaction_external_brokerages never got
-- the same column, so the app has no way to say that title paid the other
-- brokerage direct.
--
-- That matters now. The ledger only records money that moved through the
-- payouts bank account, and it decides that from funding_source. Without this
-- column an outside brokerage paid at the table posts an external_payout line
-- for money that never left the account, and its deal's check still posts a
-- deposit for money that never arrived. Exactly the pair of errors that put
-- 5714 Sandhill Oak Trail 1,580.67 out on the internal-agent side.
--
-- Mirrors transaction_internal_agents.funding_source exactly: text, nullable,
-- default 'crc', no check constraint. Postgres backfills the default into the
-- 38 existing rows, which is the right answer for every one of them (none has
-- a payment date on or after the ledger start date, so none has ever posted).
--
-- Additive and idempotent. Runs BEFORE the code deploy: the new posting code
-- selects funding_source from this table, and selecting a column that does not
-- exist makes PostgREST answer 42703, which would take the ledger sync down.
-- The reverse order is safe, because the old code never asks for it.

alter table public.transaction_external_brokerages
  add column if not exists funding_source text default 'crc';

comment on column public.transaction_external_brokerages.funding_source is
  'Who paid this brokerage: crc when we did, title_direct when title paid them at closing, rc for Referral Collective. Mirrors transaction_internal_agents.funding_source. title_direct keeps the payment out of the payouts ledger, because no CRC account moved.';
