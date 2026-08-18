-- =====================================================================
-- AGENT EMAIL DASHBOARD , PHASE 1 MIGRATION
-- =====================================================================
-- This migration adds the schema, permissions, and Graph subscription
-- tracking tables for the agent email dashboard.
--
-- ORDER: this migration is fully additive. No DROPs. No destructive
-- operations. Safe to re-run (every DDL is guarded with IF NOT EXISTS
-- and every seed uses NOT EXISTS / ON CONFLICT DO NOTHING).
--
-- SECTIONS:
--   1. email_threads               (one row per conversation)
--   2. email_thread_messages       (one row per message, in or out)
--   3. email_thread_assignments    (audit trail of ownership changes)
--   4. email_thread_notes          (internal notes, invisible to agent)
--   5. email_thread_tags           (small controlled vocabulary)
--   6. email_thread_viewers        (ephemeral collision detection)
--   7. graph_mail_subscriptions    (per-mailbox Graph subscription tracking)
--   8. graph_mail_rules            (per-mailbox Work-in-Dashboard folder + rule)
--   9. agent_email_user_prefs      (per-user default view + notification prefs)
--  10. permissions seed            (can_view_agent_email, can_manage_agent_email)
--  11. role_permissions seed       (grant to broker/operations/tc/support)
-- =====================================================================


-- =====================================================================
-- SECTION 1: email_threads
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  agent_user_id UUID NOT NULL REFERENCES users(id),
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','in_progress','waiting_on_agent','waiting_on_admin','closed')),
  assigned_to_user_id UUID REFERENCES users(id),
  waiting_on_user_id UUID REFERENCES users(id),
  last_message_at TIMESTAMPTZ,
  last_message_direction TEXT
    CHECK (last_message_direction IN ('inbound','outbound')),
  closed_at TIMESTAMPTZ,
  closed_by_user_id UUID REFERENCES users(id),
  graph_conversation_id TEXT,
  first_internet_message_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_threads_status_activity
  ON email_threads(status, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_email_threads_assigned
  ON email_threads(assigned_to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_threads_waiting_on
  ON email_threads(waiting_on_user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_threads_conv_id
  ON email_threads(graph_conversation_id);
CREATE INDEX IF NOT EXISTS idx_email_threads_agent
  ON email_threads(agent_user_id);


-- =====================================================================
-- SECTION 2: email_thread_messages
--   internet_message_id is the RFC 5322 Message-ID header and is our
--   dedupe key across mailboxes (an email CC'd to Tara and Courtney
--   lands in both inboxes with the same internet_message_id).
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  internet_message_id TEXT NOT NULL UNIQUE,
  graph_message_id TEXT,
  received_from_mailbox_upn TEXT,
  from_address TEXT NOT NULL,
  from_name TEXT,
  to_addresses TEXT[],
  cc_addresses TEXT[],
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_via_dashboard BOOLEAN DEFAULT false NOT NULL,
  sent_by_user_id UUID REFERENCES users(id),
  has_attachments BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_time
  ON email_thread_messages(thread_id, received_at DESC NULLS LAST, sent_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_thread_messages_direction
  ON email_thread_messages(direction);


-- =====================================================================
-- SECTION 3: email_thread_assignments
--   Audit trail of every ownership change. is_escalation flag lets us
--   surface a different UI + email tone for escalations vs plain assigns.
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_thread_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  assigned_from_user_id UUID REFERENCES users(id),
  assigned_to_user_id UUID NOT NULL REFERENCES users(id),
  reason_note TEXT NOT NULL,
  is_escalation BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_thread_assignments_thread
  ON email_thread_assignments(thread_id, created_at DESC);


-- =====================================================================
-- SECTION 4: email_thread_notes
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_thread_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  mentioned_user_ids UUID[],
  is_system BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_thread_notes_thread
  ON email_thread_notes(thread_id, created_at DESC);


-- =====================================================================
-- SECTION 5: email_thread_tags
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_thread_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  created_by_user_id UUID REFERENCES users(id),
  UNIQUE(thread_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_thread_tags_thread
  ON email_thread_tags(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_tags_tag
  ON email_thread_tags(tag);


-- =====================================================================
-- SECTION 6: email_thread_viewers
--   Ephemeral. Rows are heartbeated every 10s while a user is viewing
--   or composing. The API treats rows older than 30s as stale.
-- =====================================================================
CREATE TABLE IF NOT EXISTS email_thread_viewers (
  thread_id UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  activity TEXT NOT NULL CHECK (activity IN ('viewing','composing')),
  heartbeat_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_viewers_heartbeat
  ON email_thread_viewers(heartbeat_at);


-- =====================================================================
-- SECTION 7: graph_mail_subscriptions
--   Tracks one Graph mail subscription per (admin user, folder kind).
--   folder_kind is 'inbox' (new mail) or 'sentitems' (out-of-band replies).
--   subscription_id is Graph's ID. client_state is validated on webhook
--   receipt. expiration_at is used by the reconciliation cron to renew.
-- =====================================================================
CREATE TABLE IF NOT EXISTS graph_mail_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  mailbox_upn TEXT NOT NULL,
  folder_kind TEXT NOT NULL CHECK (folder_kind IN ('inbox','sentitems')),
  subscription_id TEXT NOT NULL,
  client_state TEXT NOT NULL,
  expiration_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  renewed_at TIMESTAMPTZ,
  UNIQUE(user_id, folder_kind)
);

CREATE INDEX IF NOT EXISTS idx_graph_subs_expiration
  ON graph_mail_subscriptions(expiration_at);
CREATE INDEX IF NOT EXISTS idx_graph_subs_sub_id
  ON graph_mail_subscriptions(subscription_id);


-- =====================================================================
-- SECTION 8: graph_mail_rules
--   Tracks the "Work in Dashboard" folder + inbox rule per admin
--   mailbox. agent_addresses_hash is a hash of the active-agent email
--   list so the reconciliation job knows when to update the rule
--   because the roster changed.
-- =====================================================================
CREATE TABLE IF NOT EXISTS graph_mail_rules (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  mailbox_upn TEXT NOT NULL,
  folder_id TEXT,
  rule_id TEXT,
  agent_addresses_hash TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- =====================================================================
-- SECTION 9: agent_email_user_prefs
--   Per-user default view + Teams notification opt-in.
-- =====================================================================
CREATE TABLE IF NOT EXISTS agent_email_user_prefs (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  default_view TEXT NOT NULL DEFAULT 'my'
    CHECK (default_view IN ('my','all')),
  teams_notifications_enabled BOOLEAN DEFAULT false NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);


-- =====================================================================
-- SECTION 10: permissions seed
--   Add the two permission codes. INSERT ... WHERE NOT EXISTS is used
--   instead of ON CONFLICT because the permissions table's unique
--   constraint on `code` may or may not exist historically; this form
--   is safe regardless.
-- =====================================================================
INSERT INTO permissions (id, code, display_name, category, description)
SELECT gen_random_uuid(), 'can_view_agent_email',
       'View Agent Email Dashboard',
       'Email',
       'View the agent email management dashboard.'
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE code = 'can_view_agent_email'
);

INSERT INTO permissions (id, code, display_name, category, description)
SELECT gen_random_uuid(), 'can_manage_agent_email',
       'Manage Agent Email Dashboard',
       'Email',
       'Reply, assign, escalate, tag, take notes on, and close threads in the agent email dashboard.'
WHERE NOT EXISTS (
  SELECT 1 FROM permissions WHERE code = 'can_manage_agent_email'
);


-- =====================================================================
-- SECTION 11: role_permissions seed
--   Grant both new permissions to every admin role that should have
--   access to the dashboard: broker, operations, tc, support.
--   These four match ADMIN_ROLES in lib/constants.ts.
-- =====================================================================
INSERT INTO role_permissions (id, role_id, permission_id)
SELECT gen_random_uuid(), r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('broker','operations','tc','support')
  AND p.code IN ('can_view_agent_email','can_manage_agent_email')
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id
      AND rp.permission_id = p.id
  );


-- =====================================================================
-- END OF MIGRATION
-- =====================================================================
