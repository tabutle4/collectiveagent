# Agent Email Dashboard, Phase 2.1

Small behavior patch. Three changes plus one bug fix.

## Changes

**1. Auto-assign on first inbound message when directed at exactly one admin.**

When an agent sends an email and Graph delivers it to the webhook, the webhook now checks the To field. If exactly one active admin appears there, the thread is automatically assigned to that admin. The audit trail records this as a system assignment (no `created_by_user_id`), a system note explains what happened, and the target admin gets an in-app notification. Runs only on the very first inbound of a thread; subsequent messages inherit the current assignment.

**2. Manual assign no longer sends an email.**

The assignment target has always been on the To or CC of the original email (Reading A guarantees that), so a "you were assigned" email was noise. In-app notification and system note still fire. The escalate flow is unchanged, escalations still send an immediate email because they carry a decision request, not just a hand-off.

**3. Stale assignments revert to the New bucket after 48 hours.**

A new hourly cron scans threads that are assigned, not closed, and have had no activity in 48 hours. Any it finds are reverted: `assigned_to_user_id` cleared, `status` set to `new`. A system note records why. Anyone can pick them up from the New bucket.

Activity = reply, note, tag change, status change, reassign, escalate, close, reopen, or an inbound agent reply. Any of those bumps `updated_at` on the thread and restarts the 48-hour clock. Notes needed a small fix so adding a note counts as activity.

**4. Bug fix: empty replies in the dashboard.**

When Dale replied from the dashboard, two rows sometimes appeared: the real one from her Send, and a phantom one when Graph delivered the sent-message notification to the sent-items subscription. The phantom row also triggered a false "Reply sent from Outlook by Dale" system note. The webhook now checks for a recent dashboard-sent row within 60 seconds with matching recipients. If found, it backfills the real Graph message id onto that row and skips the duplicate insert. No more phantom rows, no more false Outlook notes.

## Files

**Modified (4):**
- `app/api/agent-email/webhook/route.ts`, adds auto-assign in processInbound + dedupe race fix in processOutbound
- `app/api/admin/agent-email/threads/[id]/assign/route.ts`, removes email send, keeps in-app + system note
- `app/api/admin/agent-email/threads/[id]/notes/route.ts`, bumps thread updated_at when a note is added
- `vercel.json`, adds hourly cron for stale-assignments sweep

**New (1):**
- `app/api/cron/agent-email-stale-assignments/route.ts`, the sweep endpoint

**No SQL migration.** All schema needed exists from Phase 1/2.

## Deploy

```bash
cd /workspaces/collectiveagent
unzip -o agent_email_dashboard_phase2_1.zip
npx tsc --noEmit
git add -A
git commit -m "Phase 2.1: auto-assign, remove assign email, 48h stale revert, dedupe race fix"
git push origin main
rm agent_email_dashboard_phase2_1.zip
```

Vercel redeploys, ~2 minutes. New cron picks up on Vercel's next hourly tick.

## Smoke tests

1. **Auto-assign.** Have an active agent send an email with exactly one admin's address on the To line (say tarab@). Within 30 seconds, the thread should appear in the dashboard already assigned to Tara, with a system note "Auto-assigned to Tara Butler because they were the only admin on the To line."

2. **Auto-assign skipped when To has multiple admins or none.** Have the same agent send with both tarab@ and courtneyo@ on To. Thread should appear unassigned in the New bucket. Same for zero admins on To (all admins on CC only).

3. **Manual assign no email.** Assign a thread from the dashboard. Confirm the target does not get an email. Confirm the target sees an in-app notification (once Phase 3 adds the bell) and the system note appears in the thread.

4. **Escalate still sends email.** Escalate a thread from the dashboard. Confirm the target gets the gold-accented escalation email.

5. **Reply dedupe race fixed.** From the dashboard, reply to a thread. Wait 60 seconds. Refresh the thread. There should be exactly one outbound message row, not two, and no "Reply sent from Outlook by [you]" system note.

6. **48h revert.** Hard to test in real time, but you can force it via SQL: pick a test thread, run
   ```sql
   UPDATE email_threads
   SET assigned_to_user_id = '<some admin id>',
       status = 'in_progress',
       updated_at = now() - interval '49 hours'
   WHERE id = '<test thread id>';
   ```
   Then trigger the cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
     https://agent.collectiverealtyco.com/api/cron/agent-email-stale-assignments
   ```
   Confirm the thread now has `assigned_to_user_id=null`, `status='new'`, and a system note explaining the revert.

## Rollback

```bash
git revert HEAD
git push origin main
```

Restores Phase 2 behavior. No DB rollback needed (schema unchanged).
