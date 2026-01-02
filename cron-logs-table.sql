-- =====================================================
-- CRON EXECUTION LOGS TABLE
-- Tracks execution history of cron jobs
-- =====================================================

CREATE TABLE IF NOT EXISTS cron_execution_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Cron job identification
  cron_name TEXT NOT NULL, -- e.g., 'send-weekly-reports'
  
  -- Execution timing
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Execution status
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  
  -- Execution results
  total_items INTEGER, -- Total items to process
  success_count INTEGER, -- Number of successful operations
  failure_count INTEGER, -- Number of failed operations
  error_details TEXT, -- JSON string or error message
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_cron_logs_name ON cron_execution_logs(cron_name);
CREATE INDEX IF NOT EXISTS idx_cron_logs_started ON cron_execution_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_logs_status ON cron_execution_logs(status);

-- Enable RLS (optional, but recommended)
ALTER TABLE cron_execution_logs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to view cron logs (adjust as needed)
CREATE POLICY "Admins can view cron logs" ON cron_execution_logs
  FOR SELECT
  USING (true); -- Adjust this based on your auth requirements

-- Allow system to insert/update cron logs (no auth check needed for cron jobs)
CREATE POLICY "System can manage cron logs" ON cron_execution_logs
  FOR ALL
  USING (true); -- Adjust this based on your auth requirements

