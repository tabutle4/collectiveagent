# Agent Email Dashboard — Phase 1 Deployment

Foundation + ingest. After Phase 1: subscriptions run, folders and rules exist in each admin mailbox, emails from active agents land as threads in the DB, and you can view them read-only in `/admin/agent-email`. Reply, assign, escalate, notes, tags, and the full three-pane UI arrive in Phase 2.

## What's in this zip

**New files**

- `migrations/agent_email_dashboard_phase1.sql` — schema for 9 tables + permission seeds
- `lib/agent-email.ts` — types, admin/agent discovery, Reading A filter, thread find-or-create, message dedupe helpers
- `lib/graph-mail-subscriptions.ts` — Graph subscription create/renew/delete, "Work in Dashboard" folder creation, mail rule create/update, reconciliation orchestrator
- `app/api/admin/agent-email/subscriptions/reconcile/route.ts` — POST endpoint (admin-triggered reconcile)
- `app/api/cron/agent-email-reconcile/route.ts` — hourly cron entry point
- `app/api/agent-email/webhook/route.ts` — Graph webhook receiver (validation handshake + notifications)
- `app/api/admin/agent-email/threads/route.ts` — GET thread list (view + status filters)
- `app/api/admin/agent-email/threads/[id]/route.ts` — GET thread detail (messages, notes, assignments, tags, agent)
- `app/admin/agent-email/page.tsx` — read-only dashboard shell

**Modified files** (drop-in replacements)

- `lib/permissions.ts` — adds `can_view_agent_email` and `can_manage_agent_email` to the type union and the `allPermissions` array
- `middleware.ts` — adds `/api/agent-email/webhook` to `PUBLIC_PATHS`
- `vercel.json` — adds `/api/cron/agent-email-reconcile` cron entry (hourly)
- `components/shared/AppSidebar.tsx` — adds `Agent Email` nav item to `adminNavEntries`, `tcNavEntries`, `supportNavEntries`

## Deploy sequence

**Step 1. Run the SQL migration.**
```
Supabase SQL editor → open migrations/agent_email_dashboard_phase1.sql → run.
```
Idempotent, safe to re-run. Adds tables and permissions data.

**Step 2. Set the two new env vars in Vercel Production.**

- `AGENT_EMAIL_WEBHOOK_URL` — public HTTPS URL of the webhook receiver. In production:
  ```
  https://agent.collectiverealtyco.com/api/agent-email/webhook
  ```
- `AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET` — random 32+ character string. Generate:
  ```
  openssl rand -hex 32
  ```
  Copy the output. Not shared with anyone, not committed. Only used server-side.

**Step 3. Confirm Azure app permissions.**

The existing Azure app registration used for Microsoft Graph needs these Application-scoped permissions with admin consent (Courtney does the consent as tenant admin):

- `Mail.ReadWrite` — required for creating the "Work in Dashboard" mail folder
- `MailboxSettings.ReadWrite` — required for creating the inbox move rule
- `Mail.Read` — required for reading messages when webhook fires (usually already granted)

Also verify `User.Read.All` (or `Directory.Read.All`) is already granted if not — required to look up mailbox users. If any of the above is missing, the reconciliation job will log an error but not crash.

To check: Azure Portal → App Registrations → the CRC app → API permissions. Grant admin consent for the tenant on any that show "Not granted".

**Step 4. Deploy the code.**

```
git add -A
git commit -m "Add agent email dashboard phase 1: ingest + read-only shell"
git push origin main
```

Vercel auto-deploys.

**Step 5. Trigger the first reconciliation.**

Either:
- Wait up to an hour for the cron to fire, or
- POST to `/api/admin/agent-email/subscriptions/reconcile` while signed in as broker or operations. curl example:
  ```
  curl -X POST https://agent.collectiverealtyco.com/api/admin/agent-email/subscriptions/reconcile \
    -b "ca_session=$YOUR_SESSION_COOKIE"
  ```

The response `report` shows what happened. On the first run you should see:
- `adminsScanned` = the count of active broker/operations/tc/support users
- `foldersCreated` = same number (one Work in Dashboard folder per admin)
- `subscriptionsCreated` = 2× admin count (inbox + sentitems per admin)
- `rulesCreated` = admin count

Errors (per-admin) are collected in `report.errors` and don't halt the run.

**Step 6. Verify.**

Open `/admin/agent-email`. You'll see the shell. Have an active agent send an email to any admin (Tara, Courtney, Dale, or the like). Within seconds it should land in the dashboard as a thread with status "New."

## Rollback

**Code:**
```
git revert HEAD
git push origin main
```

**Env vars:** Remove `AGENT_EMAIL_WEBHOOK_URL` from Vercel to prevent new subscriptions being created.

**Subscriptions in Graph:** if you want to fully tear down, delete each row in `graph_mail_subscriptions`. On next cron/reconcile run, the code will delete the corresponding Graph subscriptions server-side (since the admin will still be present, but the row is gone). Cleaner: temporarily set every affected admin's status to inactive in Supabase, run reconcile once (which will delete their subscriptions as orphans), then restore.

**DB:** Migration is additive, no rollback SQL needed unless you want the tables gone entirely. If so, drop in reverse dependency order:
```
DROP TABLE IF EXISTS agent_email_user_prefs;
DROP TABLE IF EXISTS graph_mail_rules;
DROP TABLE IF EXISTS graph_mail_subscriptions;
DROP TABLE IF EXISTS email_thread_viewers;
DROP TABLE IF EXISTS email_thread_tags;
DROP TABLE IF EXISTS email_thread_notes;
DROP TABLE IF EXISTS email_thread_assignments;
DROP TABLE IF EXISTS email_thread_messages;
DROP TABLE IF EXISTS email_threads;
```
Permissions rows will remain in `permissions` and `role_permissions`; harmless.

## Smoke tests

1. **Cron endpoint auth.**
   ```
   curl -i https://agent.collectiverealtyco.com/api/cron/agent-email-reconcile
   → 401 Unauthorized
   curl -i -H "Authorization: Bearer $CRON_SECRET" https://agent.collectiverealtyco.com/api/cron/agent-email-reconcile
   → 200 { success: true, report: {...} }
   ```

2. **Webhook validation handshake.**
   ```
   curl -i -X POST "https://agent.collectiverealtyco.com/api/agent-email/webhook?validationToken=hello"
   → 200, body "hello", content-type text/plain
   ```

3. **List endpoint auth.**
   ```
   curl -i https://agent.collectiverealtyco.com/api/admin/agent-email/threads
   → 401 Unauthorized
   ```
   Then sign in as an admin (broker/operations/tc/support) and open `/admin/agent-email` — you should see the shell load, threads list empty until real mail flows.

4. **Real ingest.** Have an active agent send an email from their `@collectiverealtyco.com` mailbox to yours. Within ~30 seconds the thread should appear in `/admin/agent-email` with status "New". Clicking it opens the message body.

5. **Cross-mailbox dedupe.** Ask an agent to CC both `tarab@` and `courtneyo@` on a single email. You should see one thread, not two. `email_thread_messages` should have exactly one row for that internet_message_id.

## What's NOT in Phase 1 (arrives in Phase 2)

- Reply composer with signature + preview
- Assign / Escalate modals with note requirement
- Internal notes (write side)
- Tags (write side)
- Templates chip integration + save-on-the-fly
- Collision detection heartbeat + display
- View toggle default preference save
- Escalation email builder (assigned admin gets full-context email)
- Teams notification integration
- Full agent context sidebar (commission plan, license, team, unpaid invoices, deals)
- Auto-reopen system note surfacing on the closed-then-reopened flow (backend fires it; UI polish arrives in Phase 2)
