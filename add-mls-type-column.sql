-- =====================================================
-- Add missing columns to listings table
-- =====================================================

-- Add mls_type column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'listings' 
        AND column_name = 'mls_type'
    ) THEN
        ALTER TABLE listings 
        ADD COLUMN mls_type TEXT CHECK (mls_type IS NULL OR mls_type IN ('HAR', 'NTREIS'));
        
        -- Set default value for existing rows
        UPDATE listings 
        SET mls_type = 'HAR' 
        WHERE mls_type IS NULL;
        
        RAISE NOTICE 'Column mls_type added successfully';
    ELSE
        RAISE NOTICE 'Column mls_type already exists';
    END IF;
END $$;

-- Add co_listing_agent column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'listings' 
        AND column_name = 'co_listing_agent'
    ) THEN
        ALTER TABLE listings 
        ADD COLUMN co_listing_agent TEXT;
        
        RAISE NOTICE 'Column co_listing_agent added successfully';
    ELSE
        RAISE NOTICE 'Column co_listing_agent already exists';
    END IF;
END $$;

-- Add mls_login_info column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'listings' 
        AND column_name = 'mls_login_info'
    ) THEN
        ALTER TABLE listings 
        ADD COLUMN mls_login_info TEXT;
        
        RAISE NOTICE 'Column mls_login_info added successfully';
    ELSE
        RAISE NOTICE 'Column mls_login_info already exists';
    END IF;
END $$;

-- Add is_broker_listing column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'listings' 
        AND column_name = 'is_broker_listing'
    ) THEN
        ALTER TABLE listings 
        ADD COLUMN is_broker_listing BOOLEAN DEFAULT false;
        
        -- Set default value for existing rows
        UPDATE listings 
        SET is_broker_listing = false 
        WHERE is_broker_listing IS NULL;
        
        RAISE NOTICE 'Column is_broker_listing added successfully';
    ELSE
        RAISE NOTICE 'Column is_broker_listing already exists';
    END IF;
END $$;

