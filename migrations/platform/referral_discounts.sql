-- Referral Collective membership discounts.
--
-- Replaces the single promo that lived in two company_settings columns
-- (referral_conversion_discount + referral_conversion_free_until) with a list
-- of named discounts that can each be switched on and off, aimed at a chosen
-- audience, and scheduled to repeat every month or every year.
--
-- audience:
--   all             every agent going through Referral Collective onboarding
--   crc_conversion  only Collective Realty Co. agents converting to Referral
--                   Collective (what the old two columns did)
--   outside_only    only agents joining from another brokerage
--
-- schedule_type:
--   once     runs from starts_on through ends_on, then never again
--   monthly  runs from start_day through end_day of every month
--   yearly   runs from start_month/start_day through end_month/end_day
--            of every year
--
-- For monthly and yearly, starts_on gates when the repeat begins and
-- repeat_until gates when it stops; both are optional. A window whose start is
-- after its end wraps around the end of the month or year (Dec 15 - Jan 10).
--
-- Written and read by:
--   GET/POST/PUT/DELETE /api/admin/settings/discounts   (management UI)
--   GET  /api/settings/referral                          (public pricing)
--   POST /api/agent/convert-to-referral                  (snapshots the amount)
--   GET  /api/onboarding/verify                          (onboarding display)
--   POST /api/onboarding/create-payment                  (the actual charge)
--
-- Resolution lives in one place, lib/referralDiscounts.ts, so the figure shown
-- on the pricing page is the figure billed by Payload.
--
-- Six statements: one CREATE TABLE, one CREATE INDEX, one ALTER TABLE ...
-- ENABLE ROW LEVEL SECURITY, one widening ALTER COLUMN, one ADD COLUMN, and
-- one seeding INSERT. Nothing is dropped and nothing is updated in place, so
-- there are no UPDATE/DELETE row counts to check first. The old company_settings columns
-- are deliberately left alone so a rollback to the previous build keeps
-- working; a follow-up migration can drop them once this has been running.
--
-- Safe to re-run: the create is IF NOT EXISTS, re-enabling RLS is a no-op, the
-- column widening is guarded by an information_schema check (and no-ops on the
-- live database, where the column is already numeric), and the seeding INSERT
-- is guarded by NOT EXISTS so it can never insert the promo twice.
--
-- Run this BEFORE deploying the code. The new code selects from
-- referral_discounts on the public pricing route and would 500 without it; the
-- old code never touches this table, so running the SQL early is harmless.

CREATE TABLE IF NOT EXISTS public.referral_discounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  description text,
  audience text NOT NULL DEFAULT 'all',
  discount_type text NOT NULL DEFAULT 'amount',
  amount numeric NOT NULL DEFAULT 0,
  schedule_type text NOT NULL DEFAULT 'once',
  starts_on date,
  ends_on date,
  start_month integer,
  start_day integer,
  end_month integer,
  end_day integer,
  repeat_until date,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT referral_discounts_pkey PRIMARY KEY (id),
  CONSTRAINT referral_discounts_audience_check
    CHECK (audience IN ('all', 'crc_conversion', 'outside_only')),
  CONSTRAINT referral_discounts_type_check
    CHECK (discount_type IN ('amount', 'percent')),
  CONSTRAINT referral_discounts_schedule_check
    CHECK (schedule_type IN ('once', 'monthly', 'yearly')),
  CONSTRAINT referral_discounts_amount_check
    CHECK (amount >= 0),
  CONSTRAINT referral_discounts_percent_range_check
    CHECK (discount_type <> 'percent' OR amount <= 100),
  CONSTRAINT referral_discounts_start_month_check
    CHECK (start_month IS NULL OR start_month BETWEEN 1 AND 12),
  CONSTRAINT referral_discounts_end_month_check
    CHECK (end_month IS NULL OR end_month BETWEEN 1 AND 12),
  CONSTRAINT referral_discounts_start_day_check
    CHECK (start_day IS NULL OR start_day BETWEEN 1 AND 31),
  CONSTRAINT referral_discounts_end_day_check
    CHECK (end_day IS NULL OR end_day BETWEEN 1 AND 31)
);

CREATE INDEX IF NOT EXISTS referral_discounts_active_idx
  ON public.referral_discounts (is_active);

-- RLS on with no policies, like every other table here. Every read and write
-- goes through supabaseAdmin (service role), which bypasses RLS; the anon key
-- is public, so RLS is what keeps pricing rules out of reach of the browser.
ALTER TABLE public.referral_discounts ENABLE ROW LEVEL SECURITY;

-- onboarding_sessions.discount_amount snapshots the dollars taken off.
-- The live column is ALREADY numeric, so this block is a no-op there and the
-- guard below simply skips it; docs/schema-reference.sql said integer, which
-- was stale, and this patch corrects the dump. The block stays because a
-- percent discount produces cents (50% of $299 is $149.50) and any environment
-- still on integer would silently truncate them. Widening integer to numeric
-- preserves every existing value exactly and loses nothing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'onboarding_sessions'
      AND column_name = 'discount_amount'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE public.onboarding_sessions
      ALTER COLUMN discount_amount TYPE numeric;
  END IF;
END $$;

-- The onboarding page used to hardcode the words "CRC Agent Promo" next to
-- whatever discount had been applied. Now that a discount has a name, the name
-- is snapshotted alongside the amount so the page can say which promo it was,
-- even after that promo has ended.
ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS discount_name text;

-- Carry the promo that is live today into the new table so no agent partway
-- through a conversion sees their price change. Guarded so it cannot run twice
-- and cannot run at all if any discount has already been created by hand.
INSERT INTO public.referral_discounts (
  name, description, audience, discount_type, amount,
  schedule_type, starts_on, ends_on, is_active
)
SELECT
  'CRC Agent Conversion Promo',
  'Carried over from the previous single-promo settings.',
  'crc_conversion',
  'amount',
  cs.referral_conversion_discount,
  'once',
  NULL,
  cs.referral_conversion_free_until::date,
  true
FROM public.company_settings cs
WHERE cs.referral_conversion_discount > 0
  AND cs.referral_conversion_free_until IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.referral_discounts);
