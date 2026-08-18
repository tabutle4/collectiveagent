-- =====================================================================
-- AGENT EMAIL DASHBOARD, PHASE 2 MIGRATION
-- =====================================================================
-- Adds a single new table for in-app notifications. Everything else
-- Phase 2 needs (assign audit, notes, tags, viewers, prefs) already
-- exists from Phase 1.
--
-- Additive only. No DROPs. Safe to re-run.
-- =====================================================================


-- =====================================================================
-- SECTION 1: agent_email_notifications
--   In-app notifications for assign, escalate, mention. Sent to the
--   dashboard user's badge/bell when they open the app. NOT the audit
--   trail (that's email_thread_assignments) and NOT the sent emails
--   (those go through Graph).
--
--   Lifecycle: created when an assign/escalate/mention happens, marked
--   read when the user clicks it in the UI. Old read notifications can
--   be cleaned up in a future cron.
-- =====================================================================
CREATE TABLE IF NOT EXISTS agent_email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('assigned','escalated','mentioned','reopened')),
  actor_user_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_email_notif_user_unread
  ON agent_email_notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_email_notif_thread
  ON agent_email_notifications(thread_id);


-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
