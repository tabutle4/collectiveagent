-- T3 migration: per-agent custom commission terms
--
-- Context:
--   The standard New Agent Plan applies to 5 sales transactions and charges a
--   $500 coaching/training fee per transaction. Most agents follow this
--   template, but occasionally ops negotiates custom terms (shorter threshold,
--   waived coaching fee, different cap, etc).
--
--   Prior to this migration, those custom terms required hand-editing the
--   signed PDF and manually zeroing fees on each TIA row. This migration
--   moves those knobs into the users table so they can be set once on a
--   prospect and the app automatically renders the right language in every
--   document, email, and UI surface.
--
--   Four nullable/defaulted columns are added:
--
--     qualifying_transaction_target  int   NOT NULL DEFAULT 5
--       How many New Agent Plan deals before the agent graduates to No Cap
--       or Cap. Used by: statement email, dashboard widget, admin tx detail,
--       commission plan document, ICA document, auto-promotion logic.
--
--     waive_coaching_fee             bool  NOT NULL DEFAULT false
--       If true, the coaching/training fee is zeroed out on all this agent's
--       TIA rows regardless of the plan default. Used by: commission plan
--       document, ICA document, smart-calc.
--
--     cap_amount_override            numeric  NULL
--       Per-agent override for the Cap Plan dollar cap. NULL = use plan
--       default. Used by: commission plan document.
--
--     post_cap_split_override        text  NULL
--       Per-agent override for the Cap Plan post-cap split string, e.g.
--       '95/5'. NULL = use plan default. Used by: commission plan document.
--
-- Plan default values (coaching fee, cap amount, post-cap split) move from
-- hardcoded strings in the document templates to rows in company_settings,
-- with sensible seeded defaults matching the firm's current standard.
--
-- All changes are additive, safe to run multiple times, and existing agents
-- are unaffected (defaults match current behavior).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS qualifying_transaction_target INTEGER NOT NULL DEFAULT 5;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS waive_coaching_fee BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cap_amount_override NUMERIC;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS post_cap_split_override TEXT;

COMMENT ON COLUMN users.qualifying_transaction_target IS
  'How many New Agent Plan sales transactions before graduation. Default 5.';

COMMENT ON COLUMN users.waive_coaching_fee IS
  'If true, coaching/training fee is zeroed on all this agents TIA rows regardless of the commission plan default.';

COMMENT ON COLUMN users.cap_amount_override IS
  'Per-agent Cap Plan dollar cap override. NULL = use company default.';

COMMENT ON COLUMN users.post_cap_split_override IS
  'Per-agent Cap Plan post-cap split override, e.g. "95/5". NULL = use company default.';

-- Firm-wide standard plan defaults (previously hardcoded in document templates)
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS standard_new_agent_coaching_fee NUMERIC NOT NULL DEFAULT 500;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS standard_cap_amount NUMERIC NOT NULL DEFAULT 18000;

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS standard_post_cap_split TEXT NOT NULL DEFAULT '97/3';

COMMENT ON COLUMN company_settings.standard_new_agent_coaching_fee IS
  'Standard New Agent Plan coaching/training fee charged per transaction. Agents can have this waived individually via users.waive_coaching_fee.';

COMMENT ON COLUMN company_settings.standard_cap_amount IS
  'Standard Cap Plan dollar cap amount. Agents can override individually via users.cap_amount_override.';

COMMENT ON COLUMN company_settings.standard_post_cap_split IS
  'Standard Cap Plan post-cap split (agent/agency), e.g. "97/3". Agents can override individually via users.post_cap_split_override.';
