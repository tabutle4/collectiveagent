-- T2 migration: add lead_source + referred_agent_id to transaction_internal_agents
--                add executive_email to company_settings
--
-- Context:
--   1. Prior to T2, lead_source on a transaction was tracked only on the
--      listings table (set via pre-listing form) or inferred from
--      team_agreement_splits (different semantics: 3 buckets own/team_lead/firm).
--
--      T2 introduces per-TIA lead source tracking on transaction_internal_agents.
--      Each agent on a transaction can have their own lead source from the
--      15-option list (LEAD_SOURCES in lib/transactions/constants.ts). Drives:
--
--        * Team split lookup: getLeadSourceBucket() translates the user-facing
--          value to one of {own, team_lead, firm} before querying
--          team_agreement_splits.
--        * Internal referral tracking: when lead_source = internal_agent_referral,
--          referred_agent_id records which CRC agent referred the lead. If that
--          referrer is the team lead, the bucket resolves to team_lead
--          (not own).
--        * Reporting: lead source analytics by agent, team, and brokerage.
--
--   2. Statement and CDA emails CC an internal records inbox that should be
--      visible only to brokerage executives. Adding company_settings.executive_email
--      gives ops a single field to manage that, separate from the general
--      agent-facing brokerage_main_email.
--
--      Historical note: brokerage_main_email previously defaulted to info@.
--      Going forward the main brokerage inbox is office@, and info@ is the
--      executive-only inbox. We do NOT retroactively change existing DB rows
--      (that's intentional; existing installs may have custom overrides).
--      Only new rows or freshly-seeded installs pick up the new defaults.
--
-- All changes are nullable / additive — safe to run multiple times.

ALTER TABLE transaction_internal_agents
  ADD COLUMN IF NOT EXISTS lead_source TEXT;

ALTER TABLE transaction_internal_agents
  ADD COLUMN IF NOT EXISTS referred_agent_id UUID
  REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS executive_email TEXT;

-- Seed the executive email on the singleton row if it's not already set.
-- Uses info@collectiverealtyco.com which historically has been the owner +
-- ops-only inbox. If the column already has a value, we leave it.
UPDATE company_settings
  SET executive_email = 'info@collectiverealtyco.com'
  WHERE executive_email IS NULL;

-- Optional indexes for reporting. Commented until needed.
--
-- CREATE INDEX IF NOT EXISTS idx_tia_lead_source
--   ON transaction_internal_agents(lead_source)
--   WHERE lead_source IS NOT NULL;
--
-- CREATE INDEX IF NOT EXISTS idx_tia_referred_agent_id
--   ON transaction_internal_agents(referred_agent_id)
--   WHERE referred_agent_id IS NOT NULL;

COMMENT ON COLUMN transaction_internal_agents.lead_source IS
  'User-facing lead source from LEAD_SOURCES const (15 options). Translated to the 3 team-split buckets via getLeadSourceBucket() at query time.';

COMMENT ON COLUMN transaction_internal_agents.referred_agent_id IS
  'When lead_source = internal_agent_referral, the CRC agent who referred this lead. NULL for all other lead sources. If the referrer equals the agent''s team lead, the bucket resolves to team_lead; otherwise own.';

COMMENT ON COLUMN company_settings.executive_email IS
  'Executive-only inbox visible to brokerage owner + ops. Used as CC on commission statements and CDA emails. Distinct from brokerage_main_email (agent-facing) and agency_email (general contact).';


