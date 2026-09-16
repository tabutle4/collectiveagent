-- migrations/checks/11_payouts_ledger.sql
--
-- Payouts account ledger, office net sweep, recurring bills, reconciliation.
--
-- Additive and idempotent throughout. Safe to re-run. No column is dropped and
-- no row is deleted. Run this BEFORE deploying the code: the running app
-- ignores columns it does not know about, so nothing breaks in between.
--
-- RUNNING THIS IS NOT OPTIONAL, even if an earlier version of this file has
-- already been applied. This version adds payout_report_snapshots.source and
-- .taken_for_date plus the UNIQUE constraint across them, and the nightly
-- snapshot resolves its upsert against that constraint. Deploy the code
-- without this and the snapshot fails every night.
--
-- Why each piece exists is in the README table; the short version:
--   * checks_received.funds_destination  - a check can land in payouts, land in
--     income, or never reach a Collective Realty Co. account at all because
--     title paid the payee directly. Only 'payouts' money is sweepable, and
--     only 'payouts' money belongs in the payouts report's balance.
--   * brokerage_ledger.entry_type gains 'transfer' - a sweep moves money
--     between two of our own accounts, which is neither income nor expense.
--   * brokerage_ledger.parent_entry_id - one sweep is one bank line but covers
--     several deals. The parent carries the total and reconciles against the
--     statement; a real child row per deal carries that deal's office net.
--   * payout_report_snapshots.source + .taken_for_date - Vercel documents that
--     a cron can fire the same run twice, so the nightly snapshot has to be
--     keyed rather than blindly inserted.
--
-- Who paid an agent is recorded in transaction_internal_agents.funding_source,
-- which already exists. An earlier draft of this file added paid_by_party for
-- that and it was a duplicate; migration 13 drops it.

begin;

-- 1. Where a check's money actually landed ----------------------------------

alter table public.checks_received
  add column if not exists funds_destination text not null default 'payouts';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'checks_received_funds_destination_check'
  ) then
    alter table public.checks_received
      add constraint checks_received_funds_destination_check
      check (funds_destination = any (array['payouts'::text, 'income'::text, 'title_direct'::text]));
  end if;
end $$;

comment on column public.checks_received.funds_destination is
  'Which account this money reached. payouts = the payouts account, and the only value the payouts report and the sweep consider. income = went straight to the income account. title_direct = title disbursed to the payee and it never entered a Collective Realty Co. account.';

-- 2. Who actually paid the agent --------------------------------------------
--
-- NOTHING HERE. An earlier draft of this migration added
-- transaction_internal_agents.paid_by_party for this, which was a mistake:
-- funding_source already exists on that table and already carries
-- 'title_direct'. paid_by_party duplicated it, and because it defaulted to
-- 'brokerage' it contradicted funding_source on every row where title had in
-- fact paid.
--
-- If paid_by_party already exists in your database, migration 13 drops it.
-- Use funding_source.

-- 2b. When our share was moved, and how much ---------------------------------
-- These two exist on the live database already but were created by hand and
-- appear in no migration, so this file would not reproduce a working schema
-- from scratch. Storing the amount alongside the date is what makes later
-- drift in office_net detectable rather than silent.

alter table public.transactions
  add column if not exists office_net_swept_at timestamp with time zone,
  add column if not exists office_net_swept_amount numeric;

comment on column public.transactions.office_net_swept_at is
  'When our share of this deal was moved to the income account. Null means it is still in the payouts account, which is what the sweep screen offers.';

create index if not exists transactions_office_net_swept_at_idx
  on public.transactions (office_net_swept_at);

-- 3. Earmarks gain a category and a release record ---------------------------
-- Clearing an earmark today means deleting the row, which is why the Sept 4
-- and Sept 8 releases left no trace beyond the audit trigger.

alter table public.payout_expenses
  add column if not exists category text,
  add column if not exists status text not null default 'active',
  add column if not exists released_at timestamp with time zone,
  add column if not exists released_by uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_expenses_status_check'
  ) then
    alter table public.payout_expenses
      add constraint payout_expenses_status_check
      check (status = any (array['active'::text, 'released'::text]));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'payout_expenses_released_by_fkey'
  ) then
    alter table public.payout_expenses
      add constraint payout_expenses_released_by_fkey
      foreign key (released_by) references public.users(id);
  end if;
end $$;

-- 4. The ledger -------------------------------------------------------------
-- Widening a CHECK can never invalidate an existing row, and this table holds
-- none, so the drop-and-add is safe. The constraint name is the live one,
-- verified against pg_constraint rather than assumed.

alter table public.brokerage_ledger
  drop constraint if exists brokerage_ledger_entry_type_check;

alter table public.brokerage_ledger
  add constraint brokerage_ledger_entry_type_check
  check (entry_type = any (array['income'::text, 'expense'::text, 'transfer'::text]));

alter table public.brokerage_ledger
  add column if not exists parent_entry_id uuid;

-- Every line carries how the money moved and who recorded it.
--
-- payment_method uses the same lowercase vocabulary as every other payment
-- column in the app (check, zelle, ach, wire, payload, ecommission), now that
-- the two disagreeing lists have been merged into one.
--
-- recorded_by is the person, not the service credential. Every write in this
-- app goes through one Supabase service key, so without this column the
-- database can say a sweep happened and when, but never who ran it. That is
-- the control the design chose in place of broker pre-approval, so it is not
-- optional.
alter table public.brokerage_ledger
  add column if not exists payment_method text,
  add column if not exists recorded_by uuid,
  add column if not exists account text not null default 'payouts';

comment on column public.brokerage_ledger.account is
  'Which account this line belongs to. Only payouts exists today. It is here from the start so a second ledger, the trust account in particular, drops in as configuration rather than as a migration across every row and every query.';

create index if not exists brokerage_ledger_account_idx on public.brokerage_ledger (account);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'brokerage_ledger_recorded_by_fkey'
  ) then
    alter table public.brokerage_ledger
      add constraint brokerage_ledger_recorded_by_fkey
      foreign key (recorded_by) references public.users(id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'brokerage_ledger_parent_entry_id_fkey'
  ) then
    alter table public.brokerage_ledger
      add constraint brokerage_ledger_parent_entry_id_fkey
      foreign key (parent_entry_id) references public.brokerage_ledger(id) on delete cascade;
  end if;
end $$;

comment on column public.brokerage_ledger.parent_entry_id is
  'Set on the per-deal child rows of a sweep. The parent is the single bank transfer and reconciles against one statement line; each child names one deal and its office net.';

-- external_id is how a sweep reversal proves the sweep has not already been
-- reversed. A read-then-insert check is only advice without this: two clicks
-- at once both read "not reversed" and both insert. Postgres allows any number
-- of NULLs under a UNIQUE constraint, so rows that carry no external id are
-- unaffected. The table holds no rows, so there is nothing to conflict.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'brokerage_ledger_external_id_key'
  ) then
    alter table public.brokerage_ledger
      add constraint brokerage_ledger_external_id_key unique (external_id);
  end if;
end $$;

create index if not exists brokerage_ledger_entry_date_idx on public.brokerage_ledger (entry_date desc);
create index if not exists brokerage_ledger_parent_idx on public.brokerage_ledger (parent_entry_id);
create index if not exists brokerage_ledger_transaction_idx on public.brokerage_ledger (transaction_id);
create index if not exists brokerage_ledger_category_idx on public.brokerage_ledger (category);

-- What was on screen when the button was pressed --------------------------
--
-- The design asks for "every warning that was showing at the moment of
-- confirmation", and the reason given is that it protects the person who
-- pressed the button. A sweep is never blocked, only warned about, so the
-- record of what the warning said is the whole difference between a judgement
-- call someone made with their eyes open and an unexplained transfer.
--
-- One row per warning per deal. A deal that was fully ready writes no rows,
-- which reads correctly as "nothing was flagged". Warnings are recomputed
-- server side at the moment of confirmation and never taken from the request,
-- for the same reason the amount is not.
--
-- Cascades with the ledger entry: undoing a sweep leaves the reversal behind
-- as the record, and a sweep that failed and was rolled back should take its
-- warnings with it rather than leaving them pointing at nothing.

create table if not exists public.sweep_warnings (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  ledger_entry_id uuid not null,
  transaction_id uuid,
  property_address text,
  warning text not null,
  constraint sweep_warnings_pkey primary key (id),
  constraint sweep_warnings_ledger_entry_id_fkey
    foreign key (ledger_entry_id) references public.brokerage_ledger(id) on delete cascade,
  constraint sweep_warnings_transaction_id_fkey
    foreign key (transaction_id) references public.transactions(id)
);

comment on table public.sweep_warnings is
  'What the sweep screen was warning about, per deal, at the moment someone confirmed a transfer. A deal with no rows was fully ready. Recomputed server side at confirmation, never sent by the browser.';

create index if not exists sweep_warnings_ledger_entry_idx on public.sweep_warnings (ledger_entry_id);
create index if not exists sweep_warnings_transaction_idx on public.sweep_warnings (transaction_id);

-- The daily snapshot needs to be idempotent -------------------------------
--
-- Vercel documents that a cron can fire the same scheduled run more than once:
-- "Cron delivery can also occasionally invoke the same scheduled run more than
-- once ... Design your operations to be idempotent."
-- https://vercel.com/docs/cron-jobs/manage-cron-jobs
--
-- A plain insert therefore writes two snapshots for the same day whenever that
-- happens, and anything that later averages or diffs consecutive days reads
-- the duplicate as a real second observation.
--
-- taken_for_date is the day the snapshot describes, and source says who wrote
-- it. The daily cron is unique per day. Reconciliation saves write several a
-- day legitimately, so they carry a null taken_for_date, and Postgres allows
-- any number of NULLs under a UNIQUE constraint.

alter table public.payout_report_snapshots
  add column if not exists taken_for_date date,
  add column if not exists source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payout_report_snapshots_source_date_key'
  ) then
    alter table public.payout_report_snapshots
      add constraint payout_report_snapshots_source_date_key unique (source, taken_for_date);
  end if;
end $$;

create index if not exists payout_report_snapshots_taken_for_date_idx
  on public.payout_report_snapshots (taken_for_date desc);

-- 5. Recurring bills ---------------------------------------------------------
-- Four schedule shapes in one table: a single day (E&O on the 1st), two fixed
-- days (payroll taxes on the 1st and 16th), the last day of the month (payroll),
-- and a window (both rents, due the 1st to the 5th, reserved from the 1st so
-- the figure never understates).

create table if not exists public.recurring_bills (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  name text not null,
  amount numeric not null,
  days integer[] not null default '{}',
  last_day_of_month boolean not null default false,
  window_start_day integer,
  window_end_day integer,
  shift_earlier_for_nonbusiness boolean not null default false,
  account text not null default 'payouts',
  active boolean not null default true,
  notes text,
  constraint recurring_bills_pkey primary key (id)
);

comment on table public.recurring_bills is
  'Bills paid from the payouts account. Amounts live here and are editable in Settings, never hardcoded. A run can still be overridden with the real amount when it is ticked paid, so a varying bill like the Payload ACH fee does not corrupt the schedule.';

create index if not exists recurring_bills_active_idx on public.recurring_bills (active);

-- 6. Permissions -------------------------------------------------------------
-- Seven codes. A requirePermission call naming a code with no permissions row
-- silently blocks everyone, operations and broker included, so these rows have
-- to exist before the code that reads them.
--
-- Manage goes to operations and broker only. View also goes to support and tc
-- so they can read the account and answer their own questions without being
-- able to move money.

insert into public.permissions (code, display_name, category, description) values
  ('can_view_sweeps',            'View Office Net Sweeps',   'Payments', 'See which deals have had our share moved to the income account, and which are still waiting.'),
  ('can_manage_sweeps',          'Move Office Net',          'Payments', 'Record a transfer of our share from the payouts account to the income account, and reverse one.'),
  ('can_view_ledger',            'View Payouts Ledger',      'Payments', 'Read the payouts account ledger: every deposit, payment, bill and transfer.'),
  ('can_manage_ledger',          'Manage Payouts Ledger',    'Payments', 'Add ledger entries by hand and release earmarked money.'),
  ('can_view_reconciliation',    'View Bank Reconciliation', 'Payments', 'Read the comparison between the bank statement and the app.'),
  ('can_manage_reconciliation',  'Reconcile the Bank',       'Payments', 'Save bank figures and tick ledger lines off against the statement.'),
  ('can_manage_recurring_bills', 'Manage Recurring Bills',   'Payments', 'Add, edit and turn off the bills paid on a schedule from the payouts account.')
on conflict (code) do nothing;

-- Role assignments. A permission with no role_permissions rows blocks everyone,
-- so this half is not optional.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code in (
  'can_view_sweeps', 'can_manage_sweeps',
  'can_view_ledger', 'can_manage_ledger',
  'can_view_reconciliation', 'can_manage_reconciliation',
  'can_manage_recurring_bills'
)
  and r.name in ('operations', 'broker')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code in ('can_view_sweeps', 'can_view_ledger', 'can_view_reconciliation')
  and r.name in ('support', 'tc')
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );

-- 7. The eight bills ---------------------------------------------------------
-- Amounts as of September 2026, editable in Settings from here on. Keyed on
-- name so re-running never duplicates a bill and never overwrites an amount
-- someone has since corrected in the app.
--
-- Both rents use a window: due the 1st to the 5th, reserved from the 1st,
-- because the money has to be in the account before the payment goes.
-- Both payrolls shift earlier for a weekend, never later, matching how payroll
-- actually runs.

insert into public.recurring_bills
  (name, amount, days, last_day_of_month, window_start_day, window_end_day, shift_earlier_for_nonbusiness, account, notes)
select v.name, v.amount, v.days, v.last_day, v.win_start, v.win_end, v.shift, 'payouts', v.notes
from (values
  ('E&O insurance',     222.73,  array[1],     false, null::integer, null::integer, false, null::text),
  ('Payroll taxes',     605.64,  array[1, 16], false, null,          null,          false, null),
  ('Payroll 1',        1924.04,  array[15],    true,  null,          null,          true,  'Runs the 15th and the last day of the month.'),
  ('Payroll 2',        1731.63,  array[15],    true,  null,          null,          true,  'Runs the 15th and the last day of the month.'),
  ('Payload ACH fees',  120.00,  array[2],     false, null,          null,          false, 'Varies month to month. Type the real amount when the run is ticked paid.'),
  ('Printer lease',     189.23,  array[2],     false, null,          null,          false, null),
  ('Houston rent',     3732.33,  array[]::integer[], false, 1,       5,             false, 'Due between the 1st and the 5th. Held back from the 1st.'),
  ('Dallas rent',      3043.74,  array[]::integer[], false, 1,       5,             false, 'Due between the 1st and the 5th. Held back from the 1st.')
) as v(name, amount, days, last_day, win_start, win_end, shift, notes)
where not exists (
  select 1 from public.recurring_bills b where b.name = v.name
);

commit;
