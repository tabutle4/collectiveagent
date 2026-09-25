-- migrations/checks/16_transaction_activity.sql
--
-- What happened on a deal, and why CRC's cut moved.
--
-- ADDITIVE ONLY. One new table, one function, four triggers. Nothing existing
-- is altered or dropped. Safe to run before the code deploy: nothing reads the
-- table until the new code does, and the triggers only write to it.
--
-- Re-running is safe. Every statement is guarded.
--
-- ---------------------------------------------------------------------------
-- Why a database trigger rather than logging in the app
-- ---------------------------------------------------------------------------
-- `office_net` is written from exactly one place in the app today
-- (lib/transactions/cascade.ts, recomputeOfficeNet), so a hook there would
-- catch every change made through the app RIGHT NOW. That is not the same as
-- catching every change.
--
-- The payouts ledger learned this the expensive way: `checks_received` is
-- written from six places, a hook in one of them silently missed the other
-- five, and a seventh writer added later would have missed it again. A row
-- corrected by hand in SQL is invisible to any amount of application code.
--
-- A trigger cannot be bypassed. It fires for the app, for a hand-written
-- UPDATE, for a future route nobody has written yet, and for a bulk fix run at
-- 11pm. For a question like "why is this number different from yesterday",
-- a log with a hole in it is worse than no log, because it answers
-- confidently and wrongly.
--
-- This is the same control the September account review recommended after the
-- $1,976 earmark could not be explained.
--
-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
-- Deliberately general. Today it records field changes that move CRC's cut.
-- It is shaped to hold everything else that happens on a deal later - a
-- document uploaded, a status moved, a payout sent - without a second table
-- and without a migration. `event_type` says what kind of thing happened and
-- `details` carries anything a future event needs that these columns do not.
--
-- No `summary` column on purpose. The sentence a person reads is built at read
-- time, so the wording can be improved without rewriting history.

create table if not exists public.transaction_activity (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  -- Which table the change happened in, and which row of it.
  source_table text not null,
  record_id uuid,
  -- 'field_changed' today. Room for 'document_uploaded', 'status_changed' and
  -- the rest later.
  event_type text not null,
  field text,
  old_value text,
  new_value text,
  -- Null for anything a trigger wrote. Every write in this app goes through
  -- one service credential, so the database cannot see the person; the app
  -- will fill this in on the events it logs itself.
  actor_id uuid references public.users(id),
  details jsonb
);

-- ROW LEVEL SECURITY. Not optional, and not a formality.
--
-- Supabase grants `anon` and `authenticated` full SELECT/INSERT/UPDATE/DELETE
-- /TRUNCATE on every table in the public schema, and the publishable key that
-- carries the `anon` role ships inside the browser bundle. RLS is the only
-- thing standing between that key and the data. Without it this table - which
-- holds the before and after of every commission, split and fee on every deal
-- - would be readable, alterable and truncatable by anyone who opened the
-- page source.
--
-- Enabled with NO policies, which is what the other 118 tables in this
-- database do: `anon` and `authenticated` are denied everything, and
-- `service_role` bypasses RLS entirely, which is the credential the app's
-- `supabaseAdmin` client uses. So the app reads it and nobody else can.
alter table public.transaction_activity enable row level security;

-- The tab reads one deal newest first; the daily popup reads one day across
-- every deal.
create index if not exists transaction_activity_txn_idx
  on public.transaction_activity (transaction_id, occurred_at desc);
create index if not exists transaction_activity_occurred_idx
  on public.transaction_activity (occurred_at desc);
create index if not exists transaction_activity_field_idx
  on public.transaction_activity (field, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 2. One function, attached four times
-- ---------------------------------------------------------------------------
-- Written once and reused rather than four near-identical functions that drift
-- apart. Arguments: the first names the column holding the deal id on this
-- table, the rest are the columns worth recording.
--
-- Numbers are compared AS NUMBERS. 2100.0 and 2100.00 are the same amount and
-- must not produce a "CRC cut changed" line saying it went from 2100.0 to
-- 2100.00, which is the kind of noise that trains people to ignore a log.

create or replace function public.log_transaction_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  txn_col  text := TG_ARGV[0];
  new_j    jsonb := to_jsonb(NEW);
  old_j    jsonb := to_jsonb(OLD);
  txn_id   uuid;
  col      text;
  ov       text;
  nv       text;
  changed  boolean;
  i        int;
begin
  -- A row that is not attached to a deal has nothing to say about one. This
  -- is the normal case for an agent_debts row that is not offsetting a
  -- transaction.
  begin
    txn_id := nullif(new_j ->> txn_col, '')::uuid;
  exception when others then
    return NEW;
  end;
  if txn_id is null then
    return NEW;
  end if;

  for i in 1 .. (TG_NARGS - 1) loop
    col := TG_ARGV[i];
    ov  := old_j ->> col;
    nv  := new_j ->> col;

    if ov is null and nv is null then
      changed := false;
    elsif ov is null or nv is null then
      changed := true;
    elsif ov ~ '^-?[0-9]+(\.[0-9]+)?$' and nv ~ '^-?[0-9]+(\.[0-9]+)?$' then
      changed := (ov::numeric is distinct from nv::numeric);
    else
      changed := (ov is distinct from nv);
    end if;

    if changed then
      -- Logging must never block the edit it is recording.
      --
      -- This trigger sits on `transactions`, so anything that makes the insert
      -- fail - a foreign key, a permission, a full disk - would abort the
      -- UPDATE that fired it. That would mean nobody could edit a deal because
      -- the history table was unhappy, which is a far worse outcome than a
      -- missing history row. The failure is raised as a warning in the
      -- Postgres log instead.
      begin
        insert into public.transaction_activity
          (transaction_id, source_table, record_id, event_type, field, old_value, new_value)
        values
          (txn_id, TG_TABLE_NAME, nullif(new_j ->> 'id', '')::uuid,
           'field_changed', col, ov, nv);
      exception when others then
        raise warning 'log_transaction_activity could not record %.% : %', TG_TABLE_NAME, col, sqlerrm;
      end;
    end if;
  end loop;

  return NEW;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The four attachments
-- ---------------------------------------------------------------------------
-- CRC's cut is derived, so recording only the cut answers "it moved" and never
-- "why". The three tables underneath it are what actually changed:
-- the agent rows (splits and fees), the outside brokerage amounts, and staged
-- debts or credits. Recording all four means the Activity tab can show the
-- cause beside the effect.

drop trigger if exists trg_activity_transactions on public.transactions;
create trigger trg_activity_transactions
  after update on public.transactions
  for each row
  execute function public.log_transaction_activity(
    'id', 'office_net', 'office_gross', 'gross_commission',
    'listing_side_commission', 'buying_side_commission'
  );

drop trigger if exists trg_activity_internal_agents on public.transaction_internal_agents;
create trigger trg_activity_internal_agents
  after update on public.transaction_internal_agents
  for each row
  execute function public.log_transaction_activity(
    'transaction_id', 'brokerage_split', 'processing_fee', 'coaching_fee',
    'other_fees', 'agent_gross', 'agent_basis', 'btsa_amount', 'rebate_amount'
  );

drop trigger if exists trg_activity_external_brokerages on public.transaction_external_brokerages;
create trigger trg_activity_external_brokerages
  after update on public.transaction_external_brokerages
  for each row
  execute function public.log_transaction_activity(
    'transaction_id', 'commission_amount', 'amount_1099_reportable'
  );

-- agent_debts rows only bear on a deal when they are offsetting one, which is
-- why the deal id column here is offset_transaction_id. Rows that are not
-- offsetting anything return early above.
drop trigger if exists trg_activity_agent_debts on public.agent_debts;
create trigger trg_activity_agent_debts
  after update on public.agent_debts
  for each row
  execute function public.log_transaction_activity(
    'offset_transaction_id', 'amount_owed', 'amount_remaining', 'status'
  );

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
-- Expect the table present and empty, the function present, and four triggers.
-- The table fills the next time anybody edits a deal.

-- select count(*) as rows_so_far from public.transaction_activity;

-- RLS must read true, with zero policies, exactly like brokerage_ledger:
-- select relname, relrowsecurity
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public'
--    and relname in ('transaction_activity', 'brokerage_ledger');

-- select tgname, tgrelid::regclass as on_table
--   from pg_trigger
--  where tgname like 'trg_activity_%'
--  order by tgname;

-- After an edit, the cut and its cause sit side by side:
-- select occurred_at, source_table, field, old_value, new_value
--   from public.transaction_activity
--  where transaction_id = '<deal id>'
--  order by occurred_at desc
--  limit 20;
