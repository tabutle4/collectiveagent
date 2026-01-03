-- =====================================================
-- Team Agreements Splits Restructure
-- Migrates from old split_from_* columns to new nested JSONB structure
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
--     "cap": { ... },
--     "custom": { ... }
--   },
--   "lease": {
--     "standard": {
--       "team_lead": {"agent": 60, "team_lead": 25, "firm": 15},
--       "own": {"agent": 80, "team_lead": 5, "firm": 15},
--       "firm": {"agent": 70, "team_lead": 5, "firm": 25}
--     },
--     "custom": { ... }
--   }
-- }

-- Helper function to normalize split format (handles both old and new formats)
-- Old format: {"agent_percent": 50, "team_lead_percent": 30, "firm_percent": 20}
-- New format: {"agent": 50, "team_lead": 30, "firm": 20}
CREATE OR REPLACE FUNCTION normalize_split(split_json JSONB)
RETURNS JSONB AS $$
BEGIN
  IF split_json IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- If already in new format, return as-is
  IF split_json ? 'agent' THEN
    RETURN split_json;
  END IF;
  
  -- Convert from old format to new format
  IF split_json ? 'agent_percent' THEN
    RETURN jsonb_build_object(
      'agent', COALESCE((split_json->>'agent_percent')::numeric, 0),
      'team_lead', COALESCE((split_json->>'team_lead_percent')::numeric, 0),
      'firm', COALESCE((split_json->>'firm_percent')::numeric, 0)
    );
  END IF;
  
  RETURN split_json;
END;
$$ LANGUAGE plpgsql;

-- Default splits for new_agent plan
CREATE OR REPLACE FUNCTION get_default_new_agent_split(source_type TEXT)
RETURNS JSONB AS $$
BEGIN
  CASE source_type
    WHEN 'team_lead' THEN
      RETURN '{"agent": 50, "team_lead": 30, "firm": 20}'::jsonb;
    WHEN 'own' THEN
      RETURN '{"agent": 70, "team_lead": 10, "firm": 20}'::jsonb;
    WHEN 'firm' THEN
      RETURN '{"agent": 50, "team_lead": 5, "firm": 45}'::jsonb;
    ELSE
      RETURN '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Default splits for no_cap plan
CREATE OR REPLACE FUNCTION get_default_no_cap_split(source_type TEXT)
RETURNS JSONB AS $$
BEGIN
  CASE source_type
    WHEN 'team_lead' THEN
      RETURN '{"agent": 50, "team_lead": 35, "firm": 15}'::jsonb;
    WHEN 'own' THEN
      RETURN '{"agent": 80, "team_lead": 5, "firm": 15}'::jsonb;
    WHEN 'firm' THEN
      RETURN '{"agent": 50, "team_lead": 5, "firm": 45}'::jsonb;
    ELSE
      RETURN '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Default splits for cap plan (same as new_agent)
CREATE OR REPLACE FUNCTION get_default_cap_split(source_type TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN get_default_new_agent_split(source_type);
END;
$$ LANGUAGE plpgsql;

-- Default splits for lease standard
CREATE OR REPLACE FUNCTION get_default_lease_standard_split(source_type TEXT)
RETURNS JSONB AS $$
BEGIN
  CASE source_type
    WHEN 'team_lead' THEN
      RETURN '{"agent": 60, "team_lead": 25, "firm": 15}'::jsonb;
    WHEN 'own' THEN
      RETURN '{"agent": 80, "team_lead": 5, "firm": 15}'::jsonb;
    WHEN 'firm' THEN
      RETURN '{"agent": 70, "team_lead": 5, "firm": 25}'::jsonb;
    ELSE
      RETURN '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Migrate existing data from old structure to new structure
-- Uses existing split_from_* columns to populate all sales plans
UPDATE team_members
SET splits = jsonb_build_object(
  'sales', jsonb_build_object(
    'new_agent', jsonb_build_object(
      'team_lead', COALESCE(normalize_split(split_from_team_lead), get_default_new_agent_split('team_lead')),
      'own', COALESCE(normalize_split(split_from_own_lead), get_default_new_agent_split('own')),
      'firm', COALESCE(normalize_split(split_from_firm_lead), get_default_new_agent_split('firm'))
    ),
    'no_cap', jsonb_build_object(
      'team_lead', COALESCE(normalize_split(split_from_team_lead), get_default_no_cap_split('team_lead')),
      'own', COALESCE(normalize_split(split_from_own_lead), get_default_no_cap_split('own')),
      'firm', COALESCE(normalize_split(split_from_firm_lead), get_default_no_cap_split('firm'))
    ),
    'cap', jsonb_build_object(
      'team_lead', COALESCE(normalize_split(split_from_team_lead), get_default_cap_split('team_lead')),
      'own', COALESCE(normalize_split(split_from_own_lead), get_default_cap_split('own')),
      'firm', COALESCE(normalize_split(split_from_firm_lead), get_default_cap_split('firm'))
    ),
    'custom', jsonb_build_object(
      'team_lead', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb,
      'own', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb,
      'firm', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb
    )
  ),
  'lease', jsonb_build_object(
    'standard', jsonb_build_object(
      'team_lead', get_default_lease_standard_split('team_lead'),
      'own', get_default_lease_standard_split('own'),
      'firm', get_default_lease_standard_split('firm')
    ),
    'custom', jsonb_build_object(
      'team_lead', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb,
      'own', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb,
      'firm', '{"agent": 0, "team_lead": 0, "firm": 0}'::jsonb
    )
  )
)
WHERE splits IS NULL;

-- Add index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_team_members_splits ON team_members USING GIN (splits);

-- Clean up helper functions (optional - can keep them for future use)
-- DROP FUNCTION IF EXISTS normalize_split(JSONB);
-- DROP FUNCTION IF EXISTS get_default_new_agent_split(TEXT);
-- DROP FUNCTION IF EXISTS get_default_no_cap_split(TEXT);
-- DROP FUNCTION IF EXISTS get_default_cap_split(TEXT);
-- DROP FUNCTION IF EXISTS get_default_lease_standard_split(TEXT);

-- Note: Old columns (split_from_team_lead, split_from_own_lead, split_from_firm_lead) 
-- are kept for backward compatibility but should not be used going forward.
-- They can be removed in a future migration if desired.
