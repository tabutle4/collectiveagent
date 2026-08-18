-- =====================================================================
-- AGENT EMAIL DASHBOARD, PHASE 3 MIGRATION
-- =====================================================================
-- Three additions:
--   1. agent_email_ai_suggestions: per-thread AI triage cache
--   2. default_screen preference column
--   3. reminder tracking columns on email_thread_assignments
-- Additive only. No DROPs. Safe to re-run.
-- =====================================================================

-- 1. AI suggestions cache. One row per thread, upserted. Invalidated
--    (invalidated_at set) when a new inbound arrives so suggestions
--    regenerate against fresh context.
CREATE TABLE IF NOT EXISTS agent_email_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL UNIQUE REFERENCES email_threads(id) ON DELETE CASCADE,
  summary TEXT,
  suggested_tag TEXT,
  tag_confidence TEXT CHECK (tag_confidence IN ('high','medium','low')),
  suggested_assignee_user_id UUID REFERENCES users(id),
  assignee_confidence TEXT CHECK (assignee_confidence IN ('high','medium','low')),
  assignee_reason TEXT,
  reply_draft TEXT,
  reply_draft_for_user_id UUID REFERENCES users(id),
  reply_draft_generated_at TIMESTAMPTZ,
  generated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  invalidated_at TIMESTAMPTZ,
  model TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_email_ai_sugg_thread
  ON agent_email_ai_suggestions(thread_id);

-- 2. Default screen preference (triage | my_work | oversight)
ALTER TABLE agent_email_user_prefs
  ADD COLUMN IF NOT EXISTS default_screen TEXT DEFAULT 'triage' NOT NULL;

-- 3. Reminder tracking on assignments. Escalations use all three stages
--    (4h in-app, 12h email, 24h fire alarm to broker). Plain assignments
--    use only the first stage (24h nudge; the 48h revert lives in the
--    stale-assignments cron).
ALTER TABLE email_thread_assignments
  ADD COLUMN IF NOT EXISTS reminder_first_sent_at TIMESTAMPTZ;
ALTER TABLE email_thread_assignments
  ADD COLUMN IF NOT EXISTS reminder_second_sent_at TIMESTAMPTZ;
ALTER TABLE email_thread_assignments
  ADD COLUMN IF NOT EXISTS reminder_alarm_sent_at TIMESTAMPTZ;

-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
