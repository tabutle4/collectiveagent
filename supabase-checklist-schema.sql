-- =====================================================
-- ONBOARDING CHECKLIST SYSTEM SCHEMA
-- Recreates Base44 checklist functionality
-- =====================================================

-- Add onboarding fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_unlocked BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paid_onboarding_fee BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS accepted_trec BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS independent_contractor_agreement_signed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS w9_completed BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_checklist JSONB DEFAULT '{}'::JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_fee_amount DECIMAL(10, 2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_fee_paid_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS join_date DATE;

-- Index for onboarding queries
CREATE INDEX IF NOT EXISTS idx_users_onboarding_unlocked ON users(onboarding_unlocked);

-- =====================================================
-- CHECKLIST ITEMS TABLE
-- Stores all checklist items organized by sections
-- =====================================================
CREATE TABLE IF NOT EXISTS checklist_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Section organization
  section TEXT NOT NULL, -- e.g., 'systemsSetup', 'communication', 'training'
  section_title TEXT NOT NULL, -- e.g., 'Systems Setup', 'Communication & Setup'
  
  -- Item details
  item_key TEXT, -- Unique key within section (e.g., 'outlookWeb')
  label TEXT NOT NULL,
  description TEXT,
  
  -- Priority and display
  priority TEXT DEFAULT 'normal', -- 'normal' or 'high'
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  -- Links (can have up to 2 links per item)
  link_text TEXT,
  link_url TEXT,
  second_link_text TEXT,
  second_link_url TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_checklist_items_section ON checklist_items(section);
CREATE INDEX IF NOT EXISTS idx_checklist_items_active ON checklist_items(is_active);
CREATE INDEX IF NOT EXISTS idx_checklist_items_display_order ON checklist_items(display_order);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

-- Checklist Items policies
CREATE POLICY "Anyone can view active checklist items" ON checklist_items
  FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage checklist items" ON checklist_items
  FOR ALL
  USING (true); -- Will be filtered in application code

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for checklist_items
CREATE TRIGGER update_checklist_items_updated_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

