-- =====================================================
-- REQUIRED: Form Token Fields for Shareable Links
-- =====================================================
-- This SQL is REQUIRED for shareable form links to work.
-- Without these fields, forms will work but shareable links
-- will not be generated or stored.
-- =====================================================

-- Add form token fields to listings table
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS pre_listing_token TEXT,
ADD COLUMN IF NOT EXISTS just_listed_token TEXT;

-- Create indexes for faster token lookups
CREATE INDEX IF NOT EXISTS idx_listings_pre_listing_token ON listings(pre_listing_token);
CREATE INDEX IF NOT EXISTS idx_listings_just_listed_token ON listings(just_listed_token);

