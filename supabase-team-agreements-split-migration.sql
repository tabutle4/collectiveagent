-- =====================================================
-- Team Agreements Split Migration
-- Adds Sales and Lease split fields
-- =====================================================

-- Add new split columns for sales
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS sales_split_from_team_lead JSONB,
  ADD COLUMN IF NOT EXISTS sales_split_from_own_lead JSONB,
  ADD COLUMN IF NOT EXISTS sales_split_from_firm_lead JSONB;

-- Add new split columns for leases
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS lease_split_from_team_lead JSONB,
  ADD COLUMN IF NOT EXISTS lease_split_from_own_lead JSONB,
  ADD COLUMN IF NOT EXISTS lease_split_from_firm_lead JSONB;

-- Add commission plan template column
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS commission_plan_template TEXT; -- 'new_agent', 'no_cap', 'cap', 'custom'

-- Migrate existing data (if any) from old structure to sales structure
-- This assumes old split_from_* fields should become sales_split_from_*
UPDATE team_members
SET 
  sales_split_from_team_lead = split_from_team_lead,
  sales_split_from_own_lead = split_from_own_lead,
  sales_split_from_firm_lead = split_from_firm_lead
WHERE 
  (sales_split_from_team_lead IS NULL OR sales_split_from_own_lead IS NULL OR sales_split_from_firm_lead IS NULL)
  AND (split_from_team_lead IS NOT NULL OR split_from_own_lead IS NOT NULL OR split_from_firm_lead IS NOT NULL);

-- Note: Old columns (split_from_team_lead, split_from_own_lead, split_from_firm_lead) 
-- are kept for backward compatibility but should not be used going forward.
-- They can be removed in a future migration if desired.

