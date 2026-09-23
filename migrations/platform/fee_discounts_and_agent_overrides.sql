-- Fee discounts for every fee, plus per-agent standing rates and credits.
--
-- Before this, referral_discounts only ever came off the Referral Collective
-- annual membership, and the only per-agent lever was monthly_fee_waived: all
-- or nothing. There was no way to say "this one pays $25 a month" or "take $100
-- off her onboarding", which is what the office actually needed, and no way to
-- carry a credit for money already collected on the wrong entity.
--
-- The table keeps its old name. Renaming it to fee_discounts would have meant a
-- window during deploy where the running code reads a table that no longer
-- exists, and the name is not worth an outage.

-- 1. Which fee a discount comes off. Existing rows are all RC membership.
alter table referral_discounts
  add column if not exists fee_type text not null default 'rc_annual';

alter table referral_discounts
  drop constraint if exists referral_discounts_fee_type_check;
alter table referral_discounts
  add constraint referral_discounts_fee_type_check
  check (fee_type in ('rc_annual', 'crc_onboarding', 'crc_monthly'));

-- Monthly promos only: false discounts every invoice while the promo runs,
-- true gives each agent one discounted invoice and full price after that.
alter table referral_discounts
  add column if not exists first_invoice_only boolean not null default false;

-- 2. Standing rates. Null means the agent pays the standard fee. Zero is a
-- real value and means free, which is why these are nullable numerics rather
-- than a flag plus an amount.
alter table users
  add column if not exists onboarding_fee_override numeric,
  add column if not exists monthly_fee_override numeric,
  add column if not exists rc_annual_fee_override numeric;

comment on column users.onboarding_fee_override is
  'Standing onboarding fee for this agent. Null = standard fee. Suppresses promos.';
comment on column users.monthly_fee_override is
  'Standing monthly fee for this agent. Null = standard fee. Suppresses promos.';
comment on column users.rc_annual_fee_override is
  'Standing RC annual membership for this agent. Null = standard fee. Suppresses promos.';

-- 3. One-time credits. `remaining` is what is left to spend, so a $200 credit
-- against a $50 monthly fee survives four months instead of being lost on the
-- first one.
create table if not exists agent_fee_credits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references users(id) on delete cascade,
  fee_type text not null check (fee_type in ('rc_annual', 'crc_onboarding', 'crc_monthly')),
  amount numeric not null check (amount > 0),
  remaining numeric not null check (remaining >= 0),
  note text,
  created_by uuid references users(id),
  consumed_at timestamptz,
  consumed_reference text,
  is_void boolean not null default false
);

create index if not exists agent_fee_credits_open_idx
  on agent_fee_credits (user_id, fee_type)
  where is_void = false and remaining > 0;

alter table agent_fee_credits enable row level security;

-- 4. Which agents have already spent a first-invoice-only promo. The unique
-- constraint is what makes the rule hold when two invoice runs overlap.
create table if not exists agent_discount_uses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discount_id uuid not null references referral_discounts(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  reference text,
  unique (discount_id, user_id)
);

alter table agent_discount_uses enable row level security;
