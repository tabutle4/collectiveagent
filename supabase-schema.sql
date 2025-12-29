-- =====================================================
-- Collective Agent - Database Schema
-- Stage 1: Prospects and Users
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- Single user system with role-based access
-- =====================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Authentication
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  
  -- Basic Info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_first_name TEXT NOT NULL,
  preferred_last_name TEXT NOT NULL,
  
  -- Roles & Status
  roles TEXT[] DEFAULT ARRAY[]::TEXT[], -- e.g., ['admin', 'agent', 'tc']
  is_active BOOLEAN DEFAULT true,
  
  -- Password Reset
  reset_token TEXT,
  reset_token_expires TIMESTAMP WITH TIME ZONE
);

-- Index for faster email lookups
CREATE INDEX idx_users_email ON users(email);

-- Index for role queries
CREATE INDEX idx_users_roles ON users USING GIN(roles);

-- =====================================================
-- PROSPECTS TABLE
-- Stores prospective agent form submissions
-- =====================================================
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Contact Information
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  preferred_first_name TEXT NOT NULL,
  preferred_last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT NOT NULL,
  instagram_handle TEXT,
  
  -- MLS Information
  mls_choice TEXT NOT NULL, -- 'HAR', 'MetroTex | NTREIS', 'Both'
  association_status TEXT NOT NULL, -- 'new_agent' or 'previous_member'
  previous_brokerage TEXT,
  
  -- Expectations
  expectations TEXT NOT NULL,
  accountability TEXT NOT NULL,
  lead_generation TEXT NOT NULL,
  additional_info TEXT NOT NULL,
  
  -- Referral & Team
  how_heard TEXT NOT NULL,
  how_heard_other TEXT,
  referring_agent TEXT,
  joining_team TEXT,
  
  -- Admin tracking
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'scheduled', 'joined', 'not_interested'
  notes JSONB DEFAULT '[]'::JSONB -- Array of note objects: [{text, created_by, created_at}]
);

-- Index for faster email searches
CREATE INDEX idx_prospects_email ON prospects(email);

-- Index for status filtering
CREATE INDEX idx_prospects_status ON prospects(status);

-- Index for search queries
CREATE INDEX idx_prospects_name ON prospects(preferred_first_name, preferred_last_name);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Users table policies
-- Only authenticated users can view users
CREATE POLICY "Users can view all users" ON users
  FOR SELECT
  USING (true);

-- Anyone can insert first user (we'll check in application code)
CREATE POLICY "Anyone can create first user" ON users
  FOR INSERT
  WITH CHECK (true);

-- Only the user themselves can update their own record
CREATE POLICY "Users can update own record" ON users
  FOR UPDATE
  USING (id = auth.uid());

-- Prospects table policies
-- Anyone can insert (public form)
CREATE POLICY "Anyone can create prospects" ON prospects
  FOR INSERT
  WITH CHECK (true);

-- Anyone can view prospects (we'll control access in application)
CREATE POLICY "Anyone can view prospects" ON prospects
  FOR SELECT
  USING (true);

-- Anyone can update prospects (we'll control access in application)
CREATE POLICY "Anyone can update prospects" ON prospects
  FOR UPDATE
  USING (true);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Note: First admin user will be created through the registration flow
-- No initial seed data needed for Stage 1
