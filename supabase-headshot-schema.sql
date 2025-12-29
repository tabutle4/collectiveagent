-- Add headshot_url column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS headshot_url TEXT;

-- Optional: store crop settings for headshots (offset/zoom) without altering original image
ALTER TABLE users
ADD COLUMN IF NOT EXISTS headshot_crop JSONB;

-- Index for headshot queries (optional, but can help with filtering)
CREATE INDEX IF NOT EXISTS idx_users_headshot_url ON users(headshot_url) WHERE headshot_url IS NOT NULL;

