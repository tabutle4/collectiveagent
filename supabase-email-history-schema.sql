-- Email History Table for Listing Coordination
-- Tracks all emails sent for coordinations with Resend email IDs

CREATE TABLE IF NOT EXISTS coordination_email_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  coordination_id UUID NOT NULL REFERENCES listing_coordination(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL, -- 'welcome' or 'weekly_report'
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  resend_email_id TEXT, -- Resend API email ID for verification
  status TEXT DEFAULT 'sent', -- 'sent', 'failed', 'pending'
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- For weekly reports, link to the report
  weekly_report_id UUID REFERENCES coordination_weekly_reports(id) ON DELETE SET NULL
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_history_coordination ON coordination_email_history(coordination_id);
CREATE INDEX IF NOT EXISTS idx_email_history_sent_at ON coordination_email_history(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_history_type ON coordination_email_history(email_type);

-- Add comment
COMMENT ON TABLE coordination_email_history IS 'Tracks all emails sent for listing coordinations, including Resend email IDs for verification';

