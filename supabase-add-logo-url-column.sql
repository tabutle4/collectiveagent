-- Add logo_url column to email_templates table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN logo_url TEXT DEFAULT '/logo.png';
    
    -- Update existing templates to have default logo URL
    UPDATE email_templates SET logo_url = '/logo.png' WHERE logo_url IS NULL;
  END IF;
END $$;

