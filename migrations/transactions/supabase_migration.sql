-- Patch T1: Transaction module rebuild
-- Adds source_tia_id to transaction_internal_agents for linking auto-created
-- team_lead and momentum_partner rows back to the primary/listing/co_agent
-- that spawned them via apply_primary_split.
--
-- ON DELETE CASCADE means: delete the primary row → its linked TL and MP rows
-- are automatically deleted by the database. No app-level cascade logic needed.
--
-- Existing TIA rows (migrated from Brokermint) have source_tia_id = NULL.
-- Only rows created by the new apply_primary_split action get source_tia_id set.
-- This means re-applying split on a migrated transaction will create NEW TL/MP
-- rows alongside the old ones (by design — old rows are preserved untouched).

ALTER TABLE transaction_internal_agents
ADD COLUMN IF NOT EXISTS source_tia_id UUID
  REFERENCES transaction_internal_agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tia_source_tia_id
  ON transaction_internal_agents(source_tia_id)
  WHERE source_tia_id IS NOT NULL;

-- Safety check: source_tia_id should only ever be set on team_lead or
-- momentum_partner rows. Enforce via CHECK constraint.
ALTER TABLE transaction_internal_agents
DROP CONSTRAINT IF EXISTS tia_source_tia_id_role_check;

ALTER TABLE transaction_internal_agents
ADD CONSTRAINT tia_source_tia_id_role_check CHECK (
  source_tia_id IS NULL
  OR agent_role IN ('team_lead', 'momentum_partner')
);

COMMENT ON COLUMN transaction_internal_agents.source_tia_id IS
  'When agent_role is team_lead or momentum_partner, links to the primary/listing/co_agent TIA row that spawned this row via apply_primary_split. ON DELETE CASCADE ensures linked rows are removed when the source is deleted.';
