-- =====================================================
-- Team Agreements Splits Restructure
-- Changes from separate columns to nested JSONB structure
-- =====================================================

-- Add new splits column (nested JSONB structure)
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS splits JSONB;

-- Structure:
-- {
--   "sales": {
--     "new_agent": {
--       "team_lead": {"agent": 50, "team_lead": 30, "firm": 20},
--       "own": {"agent": 70, "team_lead": 10, "firm": 20},
--       "firm": {"agent": 50, "team_lead": 5, "firm": 45}
--     },
--     "no_cap": { ... },
--     "cap": { ... }
--   },
--   "lease": {
--     "team_lead": {"agent": 60, "team_lead": 25, "firm": 15},
--     "own": {"agent": 80, "team_lead": 5, "firm": 15},
--     "firm": {"agent": 70, "team_lead": 5, "firm": 25}
--   }
-- }

-- Migrate existing data from old structure to new structure
-- This migrates sales_split_* and lease_split_* to the new nested format
UPDATE team_members
SET splits = jsonb_build_object(
  'sales', jsonb_build_object(
    'new_agent', jsonb_build_object(
      'team_lead', COALESCE(sales_split_from_team_lead, '{"agent": 50, "team_lead": 30, "firm": 20}'::jsonb),
      'own', COALESCE(sales_split_from_own_lead, '{"agent": 70, "team_lead": 10, "firm": 20}'::jsonb),
      'firm', COALESCE(sales_split_from_firm_lead, '{"agent": 50, "team_lead": 5, "firm": 45}'::jsonb)
    ),
    'no_cap', jsonb_build_object(
      'team_lead', COALESCE(sales_split_from_team_lead, '{"agent": 50, "team_lead": 35, "firm": 15}'::jsonb),
      'own', COALESCE(sales_split_from_own_lead, '{"agent": 80, "team_lead": 5, "firm": 15}'::jsonb),
      'firm', COALESCE(sales_split_from_firm_lead, '{"agent": 50, "team_lead": 5, "firm": 45}'::jsonb)
    ),
    'cap', jsonb_build_object(
      'team_lead', COALESCE(sales_split_from_team_lead, '{"agent": 50, "team_lead": 30, "firm": 20}'::jsonb),
      'own', COALESCE(sales_split_from_own_lead, '{"agent": 70, "team_lead": 10, "firm": 20}'::jsonb),
      'firm', COALESCE(sales_split_from_firm_lead, '{"agent": 50, "team_lead": 5, "firm": 45}'::jsonb)
    )
  ),
  'lease', jsonb_build_object(
    'team_lead', COALESCE(lease_split_from_team_lead, '{"agent": 60, "team_lead": 25, "firm": 15}'::jsonb),
    'own', COALESCE(lease_split_from_own_lead, '{"agent": 80, "team_lead": 5, "firm": 15}'::jsonb),
    'firm', COALESCE(lease_split_from_firm_lead, '{"agent": 70, "team_lead": 5, "firm": 25}'::jsonb)
  )
)
WHERE splits IS NULL;

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_team_members_splits ON team_members USING GIN (splits);

-- Note: Old columns (sales_split_*, lease_split_*) can be kept for backward compatibility
-- or removed in a future migration after confirming the new structure works.

