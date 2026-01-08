-- Add notification_email column to forms table
-- This column stores the email address to receive form submission notifications

ALTER TABLE forms
ADD COLUMN IF NOT EXISTS notification_email TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_forms_notification_email ON forms(notification_email) WHERE notification_email IS NOT NULL;

