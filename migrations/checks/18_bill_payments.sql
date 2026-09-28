-- Recording that a bill actually got paid.
--
-- recurring_bills holds what a bill USUALLY costs and when it is due. That was
-- half the job: the payouts report can warn what is about to leave, but there
-- has never been anywhere to record what actually left. The settings screen
-- already tells the reader "ticking a run paid records the real amount", which
-- has been a promise to a feature that did not exist.
--
-- One row per run paid. The amount is what actually left, not the stored
-- figure, because Payload's ACH fees vary every month and a rent can change
-- mid-lease. The stored amount stays the default and is never corrupted by a
-- one-off month.
--
-- bill_name is a snapshot on purpose. A bill that is renamed or deactivated
-- later must not rewrite what the history says was paid, and the foreign key
-- is ON DELETE SET NULL for the same reason: deleting a bill definition should
-- lose the link, never the payment.
--
-- Additive only, idempotent. Runs BEFORE the code deploy: the new route reads
-- and writes this table, so code deployed first gets PostgREST 42P01 on every
-- attempt. The reverse order is safe, because no existing code knows the table.

create table if not exists public.bill_payments (
  id uuid primary key default gen_random_uuid(),
  recurring_bill_id uuid references public.recurring_bills(id) on delete set null,
  -- What the bill was called when it was paid. Survives a rename.
  bill_name text not null,
  -- What actually left the account.
  amount numeric not null,
  paid_date date not null,
  payment_method text,
  reference text,
  -- The Money Movement line this produced. Set null if that line is ever
  -- removed, so the payment record outlives it.
  ledger_entry_id uuid references public.brokerage_ledger(id) on delete set null,
  account text not null default 'payouts',
  notes text,
  recorded_by uuid references public.users(id),
  recorded_at timestamptz not null default now()
);

comment on table public.bill_payments is
  'One row per recurring bill run actually paid, carrying the real amount rather than the scheduled one.';

-- The history view for a bill, newest first.
create index if not exists bill_payments_bill_date_idx
  on public.bill_payments (recurring_bill_id, paid_date desc);

-- "What did we pay in this period" across all bills.
create index if not exists bill_payments_paid_date_idx
  on public.bill_payments (paid_date desc);

-- Every other table in this database has row level security on with no
-- policies: all access goes through the service credential, which bypasses it.
-- A new table without this is readable and writable by anon.
alter table public.bill_payments enable row level security;
