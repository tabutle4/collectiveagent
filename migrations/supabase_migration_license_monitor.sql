-- License Monitor
--
-- Additive only. No DROP, no DELETE. Safe to run more than once.
--
-- Adds:
--   1. two config columns on company_settings
--   2. license_check_runs, so the weekly email can tell new findings from
--      ones it already reported
--
-- No new columns on users. The only thing written back to a person is
-- license_expiration, which already exists. Everything else TREC returns
-- lives in the email and in the run log.
--
-- RUN THIS FIRST, before deploying any of the code. The settings page save
-- spreads the whole settings object into the PATCH with no allowlist, so if
-- someone types in the new box before this column exists, PostgREST returns
-- PGRST204 and the entire settings save fails, not just that field.

-- 1. Config -------------------------------------------------------------

alter table company_settings
  add column if not exists trec_broker_license_number text;

alter table company_settings
  add column if not exists license_report_email text;

comment on column company_settings.trec_broker_license_number is
  'Our broker company licences as TREC records them. Comma separate when there is more than one entity; the first is the primary. Collective Realty Co. is 9011695-BB and Referral Collective is 9016570-BB. The license monitor treats an agent sponsored by any of these as still ours.';

comment on column company_settings.license_report_email is
  'Where the weekly license report is sent. Comma separate for more than one recipient. Falls back to office@collectiverealtyco.com when null.';

-- 2. Run history ---------------------------------------------------------

create table if not exists license_check_runs (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  agents_checked integer not null default 0,
  records_returned integer not null default 0,
  findings jsonb not null default '[]'::jsonb,
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists license_check_runs_ran_at_idx
  on license_check_runs (ran_at desc);

comment on table license_check_runs is
  'One row per license monitor run. findings holds the finding keys so the next run can report what is new rather than repeating everything.';

-- 3. Seed ----------------------------------------------------------------
--
-- company_settings holds a single row (every read in the app uses .single()),
-- so each of these updates exactly 1 row. Confirm first:
--
--   select count(*) from company_settings;
--
-- Both licence numbers were verified against TREC on 2026-08-13:
--   9011695-BB  COLLECTIVE REALTY CO, LLC   Active
--   9016570-BB  REFERRAL COLLECTIVE LLC     confirmed as a sponsoring broker

update company_settings
set trec_broker_license_number = '9011695-BB, 9016570-BB'
where trec_broker_license_number is null;
