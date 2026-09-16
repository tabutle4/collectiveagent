-- migrations/checks/12_payment_method_casing.sql
--
-- Normalise stored payment_method AND funding_source casing to the lowercase
-- vocabulary the app has always written but not always stored.
--
-- RUNS AFTER 11_payouts_ledger.sql IS VERIFIED, and after the code deploy.
-- It rewrites existing values, so it is deliberately kept out of the additive
-- migration. It is not the only destructive step in this work: 13 drops a
-- column and runs after this one.
--
-- payment_method is safe in either order relative to the deploy, because every
-- read path already lowercases before comparing (paymentMethodLabel and
-- normalizePaymentMethod in lib/transactions/constants.ts). Mixed casing
-- renders correctly today and after. This exists so that grouping, filtering
-- and any future exact-match comparison stop producing two buckets for one
-- method.
--
-- funding_source is different and is an actual live defect:
-- app/admin/transactions/[id]/page.tsx compares it case-sensitively against
-- 'crc', so rows stored as 'CRC' render a stray "Funding: CRC" line on the
-- transaction page. Lowercasing fixes it.
--
-- NO EXPECTED ROW COUNTS ARE RECORDED HERE, on purpose. An earlier version of
-- this file carried them and they were wrong within a day: the figure moved
-- three times in one afternoon as agents were marked paid, and a stale number
-- in a migration is worse than no number, because it invites someone to "fix"
-- live data to match a comment. Run the SELECT below, and check what it
-- returns against the handoff, which is written at deploy time.

-- SELECT FIRST. Every column this file rewrites is queried here, so nothing
-- gets updated that was not first counted.
--
--   select 'tia payment_method' as what, payment_method as value, count(*)
--   from public.transaction_internal_agents
--   where payment_method is not null
--     and payment_method <> lower(payment_method)
--   group by 1, 2
--   union all
--   select 'teb payment_method', payment_method, count(*)
--   from public.transaction_external_brokerages
--   where payment_method is not null
--     and payment_method <> lower(payment_method)
--   group by 1, 2
--   union all
--   select 'tia funding_source', funding_source, count(*)
--   from public.transaction_internal_agents
--   where funding_source is not null
--     and funding_source <> lower(funding_source)
--   group by 1, 2
--   order by 1, 3 desc;

begin;

update public.transaction_internal_agents
set payment_method = lower(payment_method)
where payment_method is not null
  and payment_method <> lower(payment_method);

update public.transaction_external_brokerages
set payment_method = lower(payment_method)
where payment_method is not null
  and payment_method <> lower(payment_method);

-- checks_received, pm_fee_payouts and landlord_disbursements are already
-- entirely lowercase. The same statement is included so re-running this file
-- after future drift catches them too; today it affects 0 rows.
update public.checks_received
set payment_method = lower(payment_method)
where payment_method is not null
  and payment_method <> lower(payment_method);

update public.pm_fee_payouts
set payment_method = lower(payment_method)
where payment_method is not null
  and payment_method <> lower(payment_method);

update public.landlord_disbursements
set payment_method = lower(payment_method)
where payment_method is not null
  and payment_method <> lower(payment_method);

-- funding_source has the same casing drift from the same cause. It is the
-- column that says whether Collective Realty Co. or title paid an agent, and
-- the rows reading 'title_direct' are untouched by this: lower() leaves them
-- as they are.
update public.transaction_internal_agents
set funding_source = lower(funding_source)
where funding_source is not null
  and funding_source <> lower(funding_source);

commit;

-- Verify: every one of these should return 0.
--
--   select count(*) from public.transaction_internal_agents
--     where payment_method is not null and payment_method <> lower(payment_method);
--   select count(*) from public.transaction_external_brokerages
--     where payment_method is not null and payment_method <> lower(payment_method);
--   select count(*) from public.transaction_internal_agents
--     where funding_source is not null and funding_source <> lower(funding_source);
--
-- Not addressed here, and not a casing problem: a large number of
-- transaction_internal_agents rows carry no payment_method at all. That is
-- gap 06 in the payouts data gap audit and needs a person, not a migration.
