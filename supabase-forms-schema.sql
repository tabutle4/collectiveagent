-- =====================================================
-- Forms Table - Store form definitions
-- =====================================================
-- This table stores all form definitions that can be
-- created by admins and displayed on agent dashboard
-- =====================================================

CREATE TABLE IF NOT EXISTS forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Form Metadata
  name TEXT NOT NULL,
  description TEXT,
  form_type TEXT NOT NULL, -- 'pre-listing', 'just-listed', 'compliance-request', 'under-contract', etc.
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  -- Shareable Link
  shareable_token TEXT UNIQUE,
  shareable_link_url TEXT,
  
  -- Form Configuration (JSONB for flexibility)
  form_config JSONB DEFAULT '{}'::JSONB, -- Store form fields, validation rules, etc.
  
  -- Created by
  created_by UUID REFERENCES users(id),
  
  -- Notes
  notes TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_forms_form_type ON forms(form_type);
CREATE INDEX IF NOT EXISTS idx_forms_is_active ON forms(is_active);
CREATE INDEX IF NOT EXISTS idx_forms_shareable_token ON forms(shareable_token);
CREATE INDEX IF NOT EXISTS idx_forms_display_order ON forms(display_order);

-- Update trigger for updated_at
CREATE TRIGGER update_forms_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

