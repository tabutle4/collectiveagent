-- Zoom Recording Jobs
-- Stores recording webhook payloads and tracks upload status to SharePoint

CREATE TABLE IF NOT EXISTS zoom_recording_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- From Zoom webhook
  meeting_title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  mp4_download_url TEXT NOT NULL,
  mp4_file_size BIGINT,
  zoom_token TEXT NOT NULL,

  -- Suggested by Claude
  suggested_title TEXT,
  suggested_folder TEXT,

  -- Confirmed by Tara
  final_title TEXT,
  final_folder TEXT,

  -- Upload tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'uploaded', 'error')),
  sharepoint_url TEXT,
  uploaded_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS zoom_recording_jobs_status_idx ON zoom_recording_jobs (status);
CREATE INDEX IF NOT EXISTS zoom_recording_jobs_created_at_idx ON zoom_recording_jobs (created_at DESC);
