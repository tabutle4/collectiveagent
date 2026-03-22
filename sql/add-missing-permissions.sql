-- ADD MISSING PERMISSIONS ONLY
-- This script ONLY adds permissions that don't exist yet
-- It does NOT modify existing permissions or role_permissions
-- Run this in Supabase SQL Editor

-- Add permissions that are missing from the database
INSERT INTO permissions (code, display_name, category, description) VALUES
  ('can_manage_coordination', 'Manage Coordination', 'coordination', 'Manage listing coordination workflows'),
  ('can_manage_onboarding', 'Manage Onboarding', 'onboarding', 'Manage agent onboarding process'),
  ('can_manage_service_config', 'Manage Service Config', 'settings', 'Manage service configurations'),
  ('can_manage_team_agreements', 'Manage Team Agreements', 'teams', 'Create and edit team agreements'),
  ('can_regenerate_roster', 'Regenerate Roster', 'agents', 'Regenerate public agent roster'),
  ('can_send_campaign_emails', 'Send Campaign Emails', 'campaigns', 'Send emails for campaigns'),
  ('can_view_training_center', 'View Training Center', 'training', 'Access training center content')
ON CONFLICT (code) DO NOTHING;

-- Add unique constraint on role_permissions if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'role_permissions_role_id_permission_id_key'
  ) THEN
    ALTER TABLE role_permissions 
    ADD CONSTRAINT role_permissions_role_id_permission_id_key 
    UNIQUE (role_id, permission_id);
  END IF;
END $$;

-- Assign new permissions to appropriate roles
-- Using ON CONFLICT DO NOTHING in case they're already assigned

-- Operations gets all new permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'operations' 
AND p.code IN (
  'can_manage_coordination',
  'can_manage_onboarding',
  'can_manage_service_config',
  'can_manage_team_agreements',
  'can_regenerate_roster',
  'can_send_campaign_emails',
  'can_view_training_center'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Broker gets all new permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'broker' 
AND p.code IN (
  'can_manage_coordination',
  'can_manage_onboarding',
  'can_manage_service_config',
  'can_manage_team_agreements',
  'can_regenerate_roster',
  'can_send_campaign_emails',
  'can_view_training_center'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- TC gets coordination and training center
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'tc' 
AND p.code IN (
  'can_manage_coordination',
  'can_view_training_center'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Support gets training center view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'support' 
AND p.code IN (
  'can_view_training_center'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Agent gets training center view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'agent' 
AND p.code IN (
  'can_view_training_center'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verify the new permissions were added
SELECT code, display_name, category 
FROM permissions 
WHERE code IN (
  'can_manage_coordination',
  'can_manage_onboarding',
  'can_manage_service_config',
  'can_manage_team_agreements',
  'can_regenerate_roster',
  'can_send_campaign_emails',
  'can_view_training_center'
)
ORDER BY code;

-- Show updated role permission counts
SELECT r.name as role, COUNT(rp.id) as permission_count
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id = r.id
GROUP BY r.name
ORDER BY r.name;
