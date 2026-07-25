/**
 * Agent Email Dashboard,  notifications (in-app + email).
 *
 * When Dale assigns, escalates, or @mentions someone, we:
 *   1) Write a row in agent_email_notifications for the recipient's badge
 *   2) Send an email FROM the acting user's mailbox to the recipient's
 *      email address, with full context and a deep link to the thread
 *
 * The email is sent via Graph as the acting user (per Tara's confirmed
 * design decision that notifications feel personal, not system-y).
 */

import { supabaseAdmin } from './supabase'
import { sendMailAs } from './microsoft-graph-mail'
import { preferredDisplayName } from './agent-email'
import { escapeHtml } from './agent-email-send'

export type NotificationKind = 'assigned' | 'escalated' | 'mentioned' | 'reopened'

export interface WriteInAppNotificationInput {
  userId: string
  threadId: string
  kind: NotificationKind
  actorUserId: string | null
  body: string
}

/**
 * Write an in-app notification row. Non-blocking; logs and swallows errors.
 */
export async function writeInAppNotification(input: WriteInAppNotificationInput): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('agent_email_notifications').insert({
      user_id: input.userId,
      thread_id: input.threadId,
      kind: input.kind,
      actor_user_id: input.actorUserId,
      body: input.body,
    })
    if (error) console.error('writeInAppNotification error:', error)
  } catch (e) {
    console.error('writeInAppNotification exception:', e)
  }
}

// ─── Email builders ────────────────────────────────────────────────────────

/**
 * Get the app's public base URL for deep links. Falls back to the known
 * production host if env is missing (so links still resolve in prod).
 */
function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://agent.collectiverealtyco.com'
  )
}

export interface EscalationEmailInput {
  actorName: string
  actorEmail: string
  recipientEmail: string
  agentName: string
  agentContextLines: string[] // pre-formatted context strings
  reasonNote: string
  latestMessagePreview: string
  threadId: string
  threadSubject: string | null
}

export function buildEscalationEmail(input: EscalationEmailInput): {
  subject: string
  html: string
} {
  const url = `${appBaseUrl()}/admin/agent-email?thread=${input.threadId}`
  const subject = `${input.actorName} escalated an agent email to you: ${input.agentName}${
    input.threadSubject ? ` - ${input.threadSubject}` : ''
  }`
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:640px;">
  <p>Hi,</p>
  <p>${escapeHtml(input.actorName)} escalated an agent email that needs your decision.</p>
  <div style="background:#F0E7D6;padding:12px 14px;border-radius:8px;margin:16px 0;">
    <div style="font-size:11px;color:#5f4324;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:500;">
      ${escapeHtml(input.actorName)}'s note
    </div>
    <div style="font-size:13px;color:#1a1a1a;">${escapeHtml(input.reasonNote)}</div>
  </div>
  <p style="font-weight:500;margin:0 0 6px;">Agent context</p>
  <div style="font-size:12.5px;color:#5f5e5a;line-height:1.7;margin-bottom:16px;">
    ${input.agentContextLines.map(escapeHtml).join('<br>')}
  </div>
  <p style="font-weight:500;margin:0 0 6px;">Latest message from ${escapeHtml(input.agentName)}</p>
  <div style="font-size:12.5px;color:#1a1a1a;font-style:italic;padding-left:12px;border-left:3px solid #C5A278;margin-bottom:20px;">
    ${escapeHtml(input.latestMessagePreview)}
  </div>
  <div style="text-align:center;margin:24px 0 12px;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open thread in dashboard</a>
  </div>
  <div style="text-align:center;font-size:11px;color:#888780;font-style:italic;">
    Or just reply to this email, the dashboard will pick it up and update the thread.
  </div>
</div>`
  return { subject, html }
}

export interface AssignmentEmailInput {
  actorName: string
  actorEmail: string
  recipientEmail: string
  agentName: string
  agentContextLines: string[]
  reasonNote: string
  latestMessagePreview: string
  threadId: string
  threadSubject: string | null
}

export function buildAssignmentEmail(input: AssignmentEmailInput): {
  subject: string
  html: string
} {
  const url = `${appBaseUrl()}/admin/agent-email?thread=${input.threadId}`
  const subject = `${input.actorName} assigned an agent email to you: ${input.agentName}${
    input.threadSubject ? ` - ${input.threadSubject}` : ''
  }`
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:640px;">
  <p>Hi,</p>
  <p>${escapeHtml(input.actorName)} handed off an agent email to you. Not urgent, they thought it was a better fit for your desk.</p>
  <div style="background:#f1efe8;padding:12px 14px;border-radius:8px;margin:16px 0;">
    <div style="font-size:11px;color:#5f5e5a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:500;">
      ${escapeHtml(input.actorName)}'s note
    </div>
    <div style="font-size:13px;color:#1a1a1a;">${escapeHtml(input.reasonNote)}</div>
  </div>
  <p style="font-weight:500;margin:0 0 6px;">Agent context</p>
  <div style="font-size:12.5px;color:#5f5e5a;line-height:1.7;margin-bottom:16px;">
    ${input.agentContextLines.map(escapeHtml).join('<br>')}
  </div>
  <p style="font-weight:500;margin:0 0 6px;">Latest message from ${escapeHtml(input.agentName)}</p>
  <div style="font-size:12.5px;color:#1a1a1a;font-style:italic;padding-left:12px;border-left:3px solid #ccc;margin-bottom:20px;">
    ${escapeHtml(input.latestMessagePreview)}
  </div>
  <div style="text-align:center;margin:24px 0 12px;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open thread in dashboard</a>
  </div>
  <div style="text-align:center;font-size:11px;color:#888780;font-style:italic;">
    Or just reply to this email, the dashboard will pick it up and update the thread.
  </div>
</div>`
  return { subject, html }
}

export interface MentionEmailInput {
  actorName: string
  actorEmail: string
  recipientEmail: string
  agentName: string
  threadId: string
  threadSubject: string | null
  noteBody: string
}

export function buildMentionEmail(input: MentionEmailInput): {
  subject: string
  html: string
} {
  const url = `${appBaseUrl()}/admin/agent-email?thread=${input.threadId}`
  const subject = `${input.actorName} mentioned you in an agent email note: ${input.agentName}${
    input.threadSubject ? ` - ${input.threadSubject}` : ''
  }`
  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:640px;">
  <p>Hi,</p>
  <p>${escapeHtml(input.actorName)} mentioned you in a note on ${escapeHtml(input.agentName)}'s email thread.</p>
  <div style="background:#f1efe8;padding:12px 14px;border-radius:8px;margin:16px 0;">
    <div style="font-size:11px;color:#5f5e5a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:500;">
      Note
    </div>
    <div style="font-size:13px;color:#1a1a1a;">${escapeHtml(input.noteBody)}</div>
  </div>
  <div style="text-align:center;margin:24px 0 12px;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open thread in dashboard</a>
  </div>
</div>`
  return { subject, html }
}

// ─── Send helper (single wrapper for all three) ────────────────────────────

export async function sendNotificationEmail(input: {
  fromUpn: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await sendMailAs({
      fromUpn: input.fromUpn,
      to: input.to,
      subject: input.subject,
      html: input.html,
    })
    return { ok: true }
  } catch (err: any) {
    console.error('sendNotificationEmail error:', err?.userMessage || err?.message || err)
    return { ok: false, error: err?.userMessage || err?.message || 'Send failed' }
  }
}

// ─── @mention parsing ─────────────────────────────────────────────────────

/**
 * Extract @mentioned admin user IDs from a note body. Matches @firstname
 * or @firstname.lastname (case-insensitive) against the admin user list.
 * Returns the set of user IDs that match.
 */
export async function parseMentions(
  noteBody: string,
  candidateAdmins: Array<{
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    preferred_first_name: string | null
    preferred_last_name: string | null
  }>
): Promise<string[]> {
  if (!noteBody || !candidateAdmins.length) return []
  const matches = new Set<string>()
  const mentionRegex = /@([a-zA-Z][a-zA-Z0-9._-]*)/g
  const found: string[] = []
  let m: RegExpExecArray | null
  while ((m = mentionRegex.exec(noteBody)) !== null) {
    found.push(m[1].toLowerCase())
  }
  if (found.length === 0) return []

  for (const admin of candidateAdmins) {
    const first = (admin.preferred_first_name || admin.first_name || '').toLowerCase()
    const last = (admin.preferred_last_name || admin.last_name || '').toLowerCase()
    const displayName = preferredDisplayName(admin).toLowerCase().replace(/\s+/g, '.')
    for (const token of found) {
      if (token === first || token === last || token === `${first}.${last}` || token === displayName) {
        matches.add(admin.id)
        break
      }
    }
  }
  return Array.from(matches)
}
