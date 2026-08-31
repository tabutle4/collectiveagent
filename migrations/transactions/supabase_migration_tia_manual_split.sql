-- Negotiated three-way splits.
--
-- A team can agree a different cut with its lead for one particular lead, and
-- the office needs to enter it on that deal. Before this column the number
-- survived only until the next recalculation, and a recalculation is not
-- something anyone triggers on purpose: autoCascadeTransaction runs on a
-- compliance resubmission, a commission edit, a side-commission change. The
-- negotiated split reverted to the standard team agreement silently, usually
-- after someone had already been told what they were getting.
--
-- When true, cascadePrimarySplit preserves the three percentages on the row
-- and only re-derives the dollars from the current basis. The per-row
-- Recalculate button clears it, which is how you go back to the agreement.
--
-- Additive only. Existing rows default to false, which is exactly today's
-- behaviour, so this is safe to run before the code deploy.

ALTER TABLE public.transaction_internal_agents
  ADD COLUMN IF NOT EXISTS manual_split boolean NOT NULL DEFAULT false;
