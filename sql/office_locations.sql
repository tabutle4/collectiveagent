-- ============================================================
-- Add per-office (Houston, DFW, Referral Collective) fields to company_settings
-- These power the email signature builder office selector.
-- ============================================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS houston_address_line1 text DEFAULT '13201 Northwest Fwy',
  ADD COLUMN IF NOT EXISTS houston_address_line2 text DEFAULT 'Ste 450',
  ADD COLUMN IF NOT EXISTS houston_city text DEFAULT 'Houston',
  ADD COLUMN IF NOT EXISTS houston_state text DEFAULT 'TX',
  ADD COLUMN IF NOT EXISTS houston_zip text DEFAULT '77040',
  ADD COLUMN IF NOT EXISTS houston_phone text DEFAULT '(281) 638-9407',
  ADD COLUMN IF NOT EXISTS houston_fax text DEFAULT '(281) 516-5806',
  ADD COLUMN IF NOT EXISTS dfw_address_line1 text DEFAULT '2300 Valley View Ln',
  ADD COLUMN IF NOT EXISTS dfw_address_line2 text DEFAULT 'Ste 518',
  ADD COLUMN IF NOT EXISTS dfw_city text DEFAULT 'Irving',
  ADD COLUMN IF NOT EXISTS dfw_state text DEFAULT 'TX',
  ADD COLUMN IF NOT EXISTS dfw_zip text DEFAULT '75062',
  ADD COLUMN IF NOT EXISTS dfw_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS dfw_fax text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rc_brand_name text DEFAULT 'Referral Collective',
  ADD COLUMN IF NOT EXISTS rc_address_line1 text DEFAULT '13201 Northwest Fwy',
  ADD COLUMN IF NOT EXISTS rc_address_line2 text DEFAULT 'Ste 450',
  ADD COLUMN IF NOT EXISTS rc_city text DEFAULT 'Houston',
  ADD COLUMN IF NOT EXISTS rc_state text DEFAULT 'TX',
  ADD COLUMN IF NOT EXISTS rc_zip text DEFAULT '77040',
  ADD COLUMN IF NOT EXISTS rc_phone text DEFAULT '(281) 638-9407',
  ADD COLUMN IF NOT EXISTS rc_fax text DEFAULT '',
  ADD COLUMN IF NOT EXISTS rc_logo_url text DEFAULT 'https://zuhqqtfnyjlvbpcprdhf.supabase.co/storage/v1/object/public/public-assets/The%20Coaching%20Brokerage%20Final-01%20(1).png',
  ADD COLUMN IF NOT EXISTS rc_website text DEFAULT 'https://coachingbrokerage.com';

-- Set the main website default for CRC if it's null
UPDATE public.company_settings
SET website = 'https://coachingbrokerage.com'
WHERE website IS NULL OR website = '';
