-- =====================================================
-- Update listing_coordination table to support broker_listing payment method
-- =====================================================

-- Check if payment_method column has a CHECK constraint and update it
-- If the constraint exists, drop it and recreate with broker_listing option

-- First, check if constraint exists and drop it
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE listing_coordination 
    DROP CONSTRAINT IF EXISTS listing_coordination_payment_method_check;
    
    -- Add new constraint allowing broker_listing
    ALTER TABLE listing_coordination 
    ADD CONSTRAINT listing_coordination_payment_method_check 
    CHECK (payment_method IS NULL OR payment_method IN ('client_direct', 'agent_pays', 'broker_listing'));
    
EXCEPTION
    WHEN OTHERS THEN
        -- If constraint doesn't exist or other error, just add the new constraint
        BEGIN
            ALTER TABLE listing_coordination 
            ADD CONSTRAINT listing_coordination_payment_method_check 
            CHECK (payment_method IS NULL OR payment_method IN ('client_direct', 'agent_pays', 'broker_listing'));
        EXCEPTION
            WHEN duplicate_object THEN
                -- Constraint already exists, do nothing
                NULL;
        END;
END $$;

-- Note: If you get an error that the constraint doesn't exist, that's fine.
-- It means the column doesn't have a constraint, which is also acceptable.
-- The application code will handle validation.

