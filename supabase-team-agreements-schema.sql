-- =====================================================
-- Team Agreements Schema
-- =====================================================

-- Team Agreements Table
CREATE TABLE IF NOT EXISTS team_agreements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Basic Information
  team_name TEXT NOT NULL,
  team_lead_id UUID REFERENCES users(id) ON DELETE SET NULL,
  effective_date DATE NOT NULL,
  expiration_date DATE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired', 'terminated'
  agreement_document_url TEXT,
  notes TEXT,
  
  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Relationships
  team_agreement_id UUID NOT NULL REFERENCES team_agreements(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Member Details
  is_team_lead BOOLEAN DEFAULT false,
  joined_date DATE NOT NULL,
  left_date DATE,
  
  -- Commission Splits by Lead Source
  -- Each is a JSONB object: { agent_percent: number, team_lead_percent: number, firm_percent: number }
  split_from_team_lead JSONB, -- Lead from Team Lead
  split_from_own_lead JSONB,  -- Agent's Own Lead
  split_from_firm_lead JSONB, -- Lead from Firm
  
  -- Ensure unique agent per team agreement (unless they left and rejoined)
  UNIQUE(team_agreement_id, agent_id, joined_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_agreements_status ON team_agreements(status);
CREATE INDEX IF NOT EXISTS idx_team_agreements_team_lead ON team_agreements(team_lead_id);
CREATE INDEX IF NOT EXISTS idx_team_agreements_effective_date ON team_agreements(effective_date);
CREATE INDEX IF NOT EXISTS idx_team_members_agreement ON team_members(team_agreement_id);
CREATE INDEX IF NOT EXISTS idx_team_members_agent ON team_members(agent_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_team_agreements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_team_members_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_team_agreements_updated_at
  BEFORE UPDATE ON team_agreements
  FOR EACH ROW
  EXECUTE FUNCTION update_team_agreements_updated_at();

CREATE TRIGGER update_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION update_team_members_updated_at();

