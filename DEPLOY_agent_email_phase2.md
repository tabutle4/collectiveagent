# Agent Email Dashboard, Phase 2 Deployment

Interaction layer. After Phase 2: Dale can reply, assign, escalate, add tags, add notes, mention teammates, and change status from the dashboard. Notifications go out as email (from the acting user's mailbox) plus in-app badges. Collision detection warns when two admins are on the same thread. Every action has helper text explaining what it does.

## What's in this zip

**New files** (19)

Backend:
- `migrations/agent_email_dashboard_phase2.sql`, adds `agent_email_notifications` table
- `lib/agent-email-send.ts`, Graph send helper with threading headers, signature fetch, quoted-history builder
- `lib/agent-email-notifications.ts`, in-app writes, escalation/assignment/mention email builders, @mention parser
- `lib/agent-email-context.ts`, full agent context fetch for the sidebar
- `app/api/admin/agent-email/threads/[id]/reply/route.ts`, POST reply with previewOnly mode
- `app/api/admin/agent-email/threads/[id]/assign/route.ts`, POST assign
- `app/api/admin/agent-email/threads/[id]/escalate/route.ts`, POST escalate
- `app/api/admin/agent-email/threads/[id]/status/route.ts`, POST manual status change
- `app/api/admin/agent-email/threads/[id]/close/route.ts`, POST close
- `app/api/admin/agent-email/threads/[id]/reopen/route.ts`, POST reopen
- `app/api/admin/agent-email/threads/[id]/notes/route.ts`, GET list, POST add note (with @mention parsing)
- `app/api/admin/agent-email/threads/[id]/tags/route.ts`, POST add tag, DELETE remove tag
- `app/api/admin/agent-email/threads/[id]/viewers/route.ts`, POST heartbeat, DELETE clear
- `app/api/admin/agent-email/threads/[id]/agent-context/route.ts`, GET sidebar context
- `app/api/admin/agent-email/admins/route.ts`, GET admin list for pickers
- `app/api/admin/agent-email/tags/route.ts`, GET all tags in use + defaults
- `app/api/admin/agent-email/prefs/route.ts`, GET/PUT user prefs (default view)
- `app/api/admin/agent-email/templates/route.ts`, GET/POST agent_email category templates

Frontend:
- `app/admin/agent-email/page.tsx`, REWRITE. Full three-pane interactive UI with modals.

**Modified files:** none. Phase 2 is purely additive (Phase 1's page.tsx is REPLACED by the new one; treat as a modification to `app/admin/agent-email/page.tsx`).

## Deploy sequence

**Step 1. Run the SQL migration.**

Supabase SQL Editor, paste `migrations/agent_email_dashboard_phase2.sql`, Run. Adds one table (`agent_email_notifications`) with two indexes. Additive, idempotent.

**Step 2. Deploy the code.**

```bash
cd /workspaces/collectiveagent
unzip -o agent_email_dashboard_phase2.zip
npx tsc --noEmit
git add -A
git commit -m "Add agent email dashboard phase 2: reply, assign, escalate, notes, tags, collision, full UI"
git push origin main
rm agent_email_dashboard_phase2.zip
```

Vercel auto-deploys. Wait ~2 minutes.

**Step 3. Verify.**

Open `/admin/agent-email` on any thread and try:

- **Reply.** Click Reply, type a message, click Preview and send, verify what the agent will see, click Send. Thread status flips to "Waiting on agent." Your message appears in the thread.
- **Assign.** Click Assign, pick a teammate, write a reason, click Assign. They get an email FROM your mailbox with agent context and a deep link. Thread ownership moves to them but status stays the same.
- **Escalate.** Click Escalate, pick a teammate, write what you need from them, click Escalate. They get an email with gold-accented styling. Thread status becomes "Waiting on [them]." Their name shows as "waiting on" in the header.
- **Change status.** Click the status pill in the header. Pick any status. If you pick "Waiting on admin," a picker appears for who you're waiting on. Helper text explains each option.
- **Close and reopen.** Change status to Closed. Header shows Reopen button. Click it to bring the thread back to In progress. Or wait for the agent to reply, which auto-reopens.
- **Notes and @mentions.** Type at the bottom of the thread. Type `@Courtney` to notify her. Enter to send. She gets an email from your mailbox + an in-app notification row.
- **Tags.** Click Add tag. Pick a default or type a new one. Tag counts appear in the left rail once at least one thread has them.
- **Collision.** Have another admin open the same thread while you have it open. Both browsers show an amber bar naming the other person and their activity. Updates every 10 seconds.
- **Default view.** Click Default view in the left rail. Pick My queue or All queue. Refresh the page to confirm it opens on your saved default.

## Environment variables

Phase 2 uses one optional env var:

- `NEXT_PUBLIC_APP_URL` or `APP_URL`, base URL for deep links in escalation/assignment/mention emails. Falls back to `https://agent.collectiverealtyco.com` if unset. If your production URL differs, set this so deep links go to the right host.

No new secrets to generate. Phase 1's env vars (`AGENT_EMAIL_WEBHOOK_URL`, `AGENT_EMAIL_WEBHOOK_CLIENT_STATE_SECRET`, `CRON_SECRET`) are still required.

## Azure permissions

Phase 2 uses `Mail.Send` (application) to send reply and notification emails on behalf of each admin's mailbox. This is likely already granted (Phase 1's audit noted "Send mail as any user" was green). Confirm at Azure Portal, App Registrations, your CRC app, API permissions. If `Mail.Send` isn't there, Courtney grants it same way as Phase 1.

## What's NOT in Phase 2 (deferred)

- **Mobile responsive.** Layout works on desktop. Mobile viewport needs a single-pane cascade. Deferred because Dale primarily uses desktop.
- **Server-side tag filtering in list route.** Tag counts show in the rail, clicking a tag highlights it, but the actual list filter runs client-side against loaded threads. If we need cross-page tag filtering, the list route needs a `?tag=X` param.
- **Reply body rich formatting.** Phase 2 sends plain text wrapped in `<p>` tags. Bold/italic/lists deferred.
- **Attachment support.** Neither incoming (webhook stores `has_attachments` but not the files) nor outgoing (composer has no upload UI). Both deferred.
- **DOMPurify sanitization of inbound HTML.** Same Phase 1 note; low risk since dashboard is admin-only, but worth doing.
- **Notification bell in the app header.** `agent_email_notifications` table gets written, but there's no header component reading it yet. Notifications reach admins via email; in-app badges arrive in Phase 3.

## Rollback

**Code rollback:**
```bash
git revert HEAD
git push origin main
```
Phase 2's page.tsx is a rewrite of Phase 1's. Reverting restores the read-only shell. All ingest continues to work.

**DB rollback:**
Additive migration, no rollback needed. If you want the table gone:
```sql
DROP TABLE IF EXISTS agent_email_notifications;
```

**In-flight interactions:** if someone escalates or assigns during a bad deploy, the audit row and system note are written even if the email send fails. So you never lose the intent; worst case the recipient doesn't get the email and you have to tell them in Slack.

## Smoke tests (must pass before declaring green)

1. **Reply flow end-to-end.** From dashboard, reply to a thread, verify agent receives the email (check with them or check the sent folder in your Outlook). Thread status flips to "Waiting on agent."
2. **Escalation email delivery.** Escalate to yourself as a test. Check that the email lands with the gold styling and full context.
3. **Cross-mailbox out-of-band sync.** Reply from Outlook to a thread the dashboard already has. Within 30 seconds, thread status flips to "Waiting on agent" and a system note appears saying "Reply sent from Outlook by X."
4. **@mention notification.** Add a note with `@Tara` (or any admin's first name). Confirm the mention email is sent and the note appears with author.
5. **Collision.** Open the same thread in two browser tabs signed in as different admins. Both see the amber "X is viewing" bar within 20 seconds.
6. **Default view preference.** Change default view in settings. Refresh page. Confirm it opens on the saved default.
7. **Close and auto-reopen.** Close a thread. Have an active agent reply to it. Confirm within 30 seconds it reappears as "New" and shows the "Thread reopened" system note.
