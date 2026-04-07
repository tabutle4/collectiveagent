-- Add lease_commission_plan column to users table
-- Default to 'lease' (the standard 85/15 lease plan)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS lease_commission_plan TEXT DEFAULT 'lease';

-- Update commission_plans table: rename "Apartment and Lease" to "Lease Plan"
UPDATE commission_plans 
SET name = 'Lease Plan', code = 'lease'
WHERE code = '85_15_lease';

-- Comment for clarity
COMMENT ON COLUMN users.lease_commission_plan IS 'Agent lease commission plan - lease (85/15) or Custom - XX/XX format';
