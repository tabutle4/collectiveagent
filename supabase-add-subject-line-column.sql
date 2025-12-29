-- Add subject_line column to email_templates table if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'email_templates' AND column_name = 'subject_line'
  ) THEN
    ALTER TABLE email_templates ADD COLUMN subject_line TEXT DEFAULT 'Campaign Email' NOT NULL;
    
    -- Update existing templates to have default subject line
    UPDATE email_templates SET subject_line = 'Campaign Email' WHERE subject_line IS NULL;
  END IF;
END $$;

