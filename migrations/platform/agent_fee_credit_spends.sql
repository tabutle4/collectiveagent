-- Where each fee credit actually went.
--
-- The first version of this feature decremented agent_fee_credits.remaining at
-- the moment an invoice was created and recorded nothing else. Two problems
-- came out of review, both of which cost a real person real money:
--
--   1. The onboarding route closes the previous unpaid invoice every time an
--      agent reopens the payment step. A credit spent on the closed invoice was
--      gone, and the replacement invoice came out higher than the first one.
--   2. The monthly cron has no invoice to find for an agent whose credit
--      covered the whole month, so its duplicate check could not see them. A
--      re-run spent the credit a second time, or billed an agent the app had
--      already marked paid.
--
-- A spend row per (credit, charge) fixes both. The unique constraint makes a
-- repeat spend a no-op, and released_at lets a cancelled charge hand the money
-- back. Rows are kept after release as the audit trail of what happened.

create table if not exists agent_fee_credit_spends (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  credit_id uuid not null references agent_fee_credits(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- The charge this paid for: 'invoice:<payload id>' or 'monthly:<Month Year>'.
  reference text not null,
  amount numeric not null check (amount > 0),
  released_at timestamptz,
  unique (credit_id, reference)
);

create index if not exists agent_fee_credit_spends_open_idx
  on agent_fee_credit_spends (reference)
  where released_at is null;

alter table agent_fee_credit_spends enable row level security;
