-- Add missing columns to email_templates table if they don't exist
DO $$ 
BEGIN
  -- Add category column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'category'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN category TEXT DEFAULT 'campaign' NOT NULL;
    
    -- Update existing templates to have category = 'campaign'
    UPDATE email_templates SET category = 'campaign' WHERE category IS NULL;
    
    -- Create index for category lookups
    CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
    
    -- Create composite index for category and default status
    CREATE INDEX IF NOT EXISTS idx_email_templates_category_default ON email_templates(category, is_default);
  END IF;
  
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
  
  -- Add subject_line column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'subject_line'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN subject_line TEXT DEFAULT 'Campaign Email' NOT NULL;
    
    -- Update existing templates to have default subject line
    UPDATE email_templates SET subject_line = 'Campaign Email' WHERE subject_line IS NULL;
  END IF;
  
  -- Add html_content column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'html_content'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN html_content TEXT DEFAULT '' NOT NULL;
    
    -- Update existing templates to have empty HTML content
    UPDATE email_templates SET html_content = '' WHERE html_content IS NULL;
  END IF;
  
  -- Add variables column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'variables'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN variables TEXT[] DEFAULT ARRAY[]::TEXT[];
  END IF;
  
  -- Add is_default column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'is_default'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN is_default BOOLEAN DEFAULT false;
    
    -- Update existing templates to be non-default
    UPDATE email_templates SET is_default = false WHERE is_default IS NULL;
    
    -- Create index for default status lookups
    CREATE INDEX IF NOT EXISTS idx_email_templates_default ON email_templates(is_default) WHERE is_default = true;
  END IF;
END $$;

-- Enable RLS on email_templates table
DO $$ 
BEGIN
  -- Check if RLS is already enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'email_templates' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create RLS policies if they don't exist
DO $$ 
BEGIN
  -- Policy: Anyone can view email templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_templates' 
    AND policyname = 'Anyone can view email templates'
  ) THEN
    CREATE POLICY "Anyone can view email templates" ON email_templates
      FOR SELECT
      USING (true);
  END IF;

  -- Policy: Anyone can create email templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_templates' 
    AND policyname = 'Anyone can create email templates'
  ) THEN
    CREATE POLICY "Anyone can create email templates" ON email_templates
      FOR INSERT
      WITH CHECK (true);
  END IF;

  -- Policy: Anyone can update email templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_templates' 
    AND policyname = 'Anyone can update email templates'
  ) THEN
    CREATE POLICY "Anyone can update email templates" ON email_templates
      FOR UPDATE
      USING (true);
  END IF;

  -- Policy: Anyone can delete email templates
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'email_templates' 
    AND policyname = 'Anyone can delete email templates'
  ) THEN
    CREATE POLICY "Anyone can delete email templates" ON email_templates
      FOR DELETE
      USING (true);
  END IF;
END $$;

