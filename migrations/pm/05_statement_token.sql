ALTER TABLE pm_statements
  ADD COLUMN IF NOT EXISTS access_token text;

-- Verify
SELECT column_name FROM information_schema.columns
WHERE table_name = 'pm_statements' AND column_name = 'access_token';
