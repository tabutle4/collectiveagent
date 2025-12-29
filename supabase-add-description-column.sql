-- Add description, is_active, and logo_url columns to email_templates table if they don't exist
DO $$ 
BEGIN
  -- Add description column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'description'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN description TEXT;
  END IF;
  
  -- Add is_active column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN is_active BOOLEAN DEFAULT true;
    
    -- Update existing templates to be active by default
    UPDATE email_templates SET is_active = true WHERE is_active IS NULL;
    
    -- Create index for active status lookups
    CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
  END IF;
  
  -- Add logo_url column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN logo_url TEXT DEFAULT '/logo.png';
    
    -- Update existing templates to have default logo URL
    UPDATE email_templates SET logo_url = '/logo.png' WHERE logo_url IS NULL;
  END IF;
END $$;

