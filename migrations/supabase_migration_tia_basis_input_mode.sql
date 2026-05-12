-- Phase 2.8 migration: percentage-based referral basis on transaction_internal_agents
--
-- Context:
--   Prior to this migration, a referral_agent's carve-out on a transaction
--   was tracked only as a dollar amount (agent_basis). When the side
--   commission on a deal later changed, the referral basis stayed pinned
--   at the original dollars, drifting out of sync with the new commission
--   pool. Real referral agreements are typically expressed as a percentage
--   of the side commission ("20% referral fee on the buyer side"), and
--   ops wanted to enter referrals that way and have them auto-recompute
--   whenever the side commission changes.
--
--   Two columns are added to transaction_internal_agents to support this:
--
--     basis_input_mode   text   NULL   default 'amount' for new rows
--       Whether the referral row's agent_basis is entered as a fixed
--       dollar amount or as a percentage of the side commission. Values:
--         'amount'      — agent_basis is the source of truth (legacy
--                         behavior; default for ALL existing rows).
--         'percentage'  — basis_percentage × side commission is the
--                         source of truth; agent_basis is derived
--                         server-side and recomputed on every side
--                         commission change.
--       Only meaningful on referral_agent rows. Other roles ignore it.
--
--     basis_percentage   numeric(5,2)   NULL
--       The percentage value when basis_input_mode = 'percentage'.
--       Null when mode = 'amount'. Range 0-100 in practice (constrained
--       by the FE input max=100), DB precision (5,2) allows up to 999.99
--       to leave headroom.
--
-- Side effects elsewhere:
--   • app/api/admin/transactions/[id]/route.ts
--     - resolveAgentPlanSplit and rebalanceReferralCarveouts unchanged.
--     - New helper recomputePercentageBasedReferrals(transactionId, side,
--       newSideCommission) iterates referral_agent rows on the side with
--       basis_input_mode='percentage' and rewrites their agent_basis,
--       agent_gross, brokerage_split, agent_net, amount_1099_reportable.
--     - update_transaction action calls the helper after saving any change
--       to listing_side_commission or buying_side_commission (including
--       changes driven by gross_commission / office_gross / sales_price
--       auto-broadcasts).
--     - update_internal_agent action: when the FE sends
--       basis_input_mode='percentage' + basis_percentage, the BE re-derives
--       agent_basis server-side from the current side commission (FE's
--       cached side commission may be stale).
--   • components/transactions/AgentCardFinancials.tsx
--     - New BasisModeToggle component renders a $/% switch on
--       referral_agent rows. Initial mode reads from a.basis_input_mode.
--   • app/admin/transactions/[id]/page.tsx
--     - Mode toggle posts via updateInternalAgent with both
--       basis_input_mode and basis_percentage fields.
--
-- All existing rows default to basis_input_mode='amount' /
-- basis_percentage=null; behavior is identical to pre-migration. No
-- backfill needed.
--
-- Safe to run in the Supabase SQL editor. Idempotent (IF NOT EXISTS).

BEGIN;

-- ─── Step 1: Add basis_input_mode ──────────────────────────────────────────
ALTER TABLE transaction_internal_agents
  ADD COLUMN IF NOT EXISTS basis_input_mode text NOT NULL DEFAULT 'amount';

COMMENT ON COLUMN transaction_internal_agents.basis_input_mode IS
  'For referral_agent rows: whether agent_basis is a fixed dollar amount '
  '(''amount'', default) or derived from basis_percentage × side commission '
  '(''percentage''). Other roles ignore this. Phase 2.8.';

-- Optional safety: constrain to known values so app bugs can''t write
-- nonsense. CHECK constraints are easy to extend later if a third mode is
-- ever needed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transaction_internal_agents_basis_input_mode_check'
  ) THEN
    ALTER TABLE transaction_internal_agents
      ADD CONSTRAINT transaction_internal_agents_basis_input_mode_check
      CHECK (basis_input_mode IN ('amount', 'percentage'));
  END IF;
END$$;

-- ─── Step 2: Add basis_percentage ──────────────────────────────────────────
ALTER TABLE transaction_internal_agents
  ADD COLUMN IF NOT EXISTS basis_percentage numeric(5, 2) NULL;

COMMENT ON COLUMN transaction_internal_agents.basis_percentage IS
  'Percentage of side commission used to derive agent_basis when '
  'basis_input_mode = ''percentage''. Null when mode = ''amount''. Range '
  '0-100 in practice. Phase 2.8.';

COMMIT;

-- ─── Post-migration verification ───────────────────────────────────────────
-- Run these queries after the migration to confirm the schema is correct.
-- Expected results are in comments next to each query.
--
-- 1. Confirm both columns exist:
--    SELECT column_name, data_type, is_nullable, column_default
--    FROM information_schema.columns
--    WHERE table_name = 'transaction_internal_agents'
--      AND column_name IN ('basis_input_mode', 'basis_percentage')
--    ORDER BY column_name;
--    Expected:
--      basis_input_mode  | text          | NO  | 'amount'::text
--      basis_percentage  | numeric(5,2)  | YES | NULL
--
-- 2. Confirm every existing row defaulted to 'amount':
--    SELECT basis_input_mode, count(*)
--    FROM transaction_internal_agents
--    GROUP BY basis_input_mode;
--    Expected: a single row 'amount' | <total row count>
--
-- 3. Confirm check constraint:
--    SELECT conname FROM pg_constraint
--    WHERE conname = 'transaction_internal_agents_basis_input_mode_check';
--    Expected: 1 row.

-- ─── Rollback (if needed) ──────────────────────────────────────────────────
-- The migration is purely additive. To roll back:
--
--   BEGIN;
--   ALTER TABLE transaction_internal_agents
--     DROP CONSTRAINT IF EXISTS transaction_internal_agents_basis_input_mode_check;
--   ALTER TABLE transaction_internal_agents
--     DROP COLUMN IF EXISTS basis_percentage;
--   ALTER TABLE transaction_internal_agents
--     DROP COLUMN IF EXISTS basis_input_mode;
--   COMMIT;
--
-- The code uses these columns defensively — references gracefully skip rows
-- where they don't exist or are null — but the matching code revert should
-- be deployed BEFORE rolling back the schema so SELECT('*') queries don't
-- break for users on stale frontends.
