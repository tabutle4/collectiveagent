-- Migration: transaction detail page unification (2026-04-24)
--
-- Three safe changes (column drops moved to follow-up migration):
--   1. Add transactions.released_to_agent_at — timestamp set when admin
--      clicks Release to Agents at the bottom of the Commissions section.
--      Until set, agents see "pending broker review" instead of commission
--      details, statement, or CDA.
--
--   2. Add transaction_internal_agents.uses_canonical_math — boolean flag,
--      default false. New rows created by the updated transaction page set
--      this to true and display/calculate with the canonical formula:
--          amount_1099 = agent_gross + btsa − processing − coaching
--                        − other_fees − rebate
--          agent_net   = amount_1099 − debts
--      Existing rows (flag=false) display stored values as-is, no preview,
--      no mini-tree, no recalc. To migrate a row, admin deletes and re-adds
--      the agent, OR flips the flag manually in the Supabase SQL Editor.
--
--   3. Update checklist_templates.applies_to — Commission Check Processing
--      currently applies_to='both' but per Tara (2026-04-24) should only
--      surface on leases since the CDA Checklist covers sales.
--
-- NOTE: The following drops were planned but deferred to a follow-up
-- migration that runs AFTER the code updates remove all references:
--   - DROP transactions.rebate_amount (read by legacy agent page;
--     referenced as safe fallback `t.rebate_amount || ''`)
--   - DROP checks.agents_paid (read by payouts report, admin transaction
--     page, and payouts-report API — 9 active references)
-- These columns stay in place during Phase 1. A Phase 2 migration will
-- drop them after consumer code is removed.
--
-- Safety:
--   - No existing data modified
--   - New columns are nullable or defaulted
--   - The checklist_templates UPDATE is safe to re-run

BEGIN;

-- 1. Released-to-agent gate
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS released_to_agent_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.transactions.released_to_agent_at IS
  'Set when admin clicks Release to Agents at the bottom of the Commissions '
  'section. Until set, agents see "pending broker review" instead of '
  'commission details, statement, or CDA.';

-- 2. Row-level canonical math opt-in
ALTER TABLE public.transaction_internal_agents
  ADD COLUMN IF NOT EXISTS uses_canonical_math boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.transaction_internal_agents.uses_canonical_math IS
  'true = row uses the canonical commission formula for display and '
  'recomputation (agent_gross + btsa − processing − coaching − other_fees '
  '− rebate for 1099; minus debts for net). false = row displays stored '
  'values as-is with no recalc (legacy rows from pre-2026-04-24). Set by '
  'the new agent creation path; admins can flip manually via SQL Editor.';

-- 3. Commission Check Processing checklist: leases only
UPDATE public.checklist_templates
   SET applies_to = 'lease',
       updated_at = now()
 WHERE slug = 'payouts';

COMMIT;

