-- Add support for dual report files in weekly reports
-- Run this SQL in Supabase SQL Editor

ALTER TABLE coordination_weekly_reports 
ADD COLUMN IF NOT EXISTS report_file_url_2 TEXT;

ALTER TABLE coordination_weekly_reports 
ADD COLUMN IF NOT EXISTS report_file_name_2 TEXT;

