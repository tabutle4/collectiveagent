/**
 * Agent Email Dashboard,  Graph send helpers.
 *
 * The dashboard's reply flow needs to send email that:
 *   1) FROM the acting user's mailbox (Dale, Tara, Courtney, etc.)
 *   2) TO the agent, with the original thread's To/CC preserved
 *   3) Threaded correctly in Outlook (In-Reply-To + References)
 *   4) With the user's saved signature appended
 *   5) With quoted history for context
 *
 * We use Graph's plain /sendMail (not /messages/{id}/reply) because the
 * acting user may not have a copy of the original message in their own
 * mailbox (e.g., an agent emailed Courtney directly and Dale is replying
 * from operations@). Instead we build a fresh message with proper
 * threading headers.
 */

import { getGraphToken } from './microsoft-graph'
import { supabaseAdmin } from './supabase'

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'

export interface ThreadReplySendInput {
  fromUpn: string
  to: string[]
  cc?: string[]
  subject: string
  bodyHtml: string
  inReplyToMessageId: string | null
  referencesMessageIds?: string[]
}

export interface ThreadReplySendResult {
  ok: boolean
  error?: string
}

/**
 * Send a threaded reply from the acting admin's mailbox.
 *
 * internetMessageHeaders on the outgoing message tie it to the original
 * conversation so Outlook groups it correctly on the recipient side.
 */
export async function sendThreadReply(input: ThreadReplySendInput): Promise<ThreadReplySendResult> {
  const { fromUpn, to, cc, subject, bodyHtml, inReplyToMessageId, referencesMessageIds } = input

  if (!fromUpn) return { ok: false, error: 'Missing sender mailbox' }
  if (!to || to.length === 0) return { ok: false, error: 'No recipients' }

  // Graph's sendMail rejects an empty or whitespace-only subject
  // (ErrorMissingSubject). Coerce blank subjects to a safe default rather
  // than let the send fail.
  const safeSubject = subject && subject.trim() ? subject : 'Re: (no subject)'

  const token = await getGraphToken()

  const message: Record<string, unknown> = {
    subject: safeSubject,
    body: { contentType: 'HTML', content: bodyHtml },
    toRecipients: to.map(a => ({ emailAddress: { address: a } })),
  }
  if (cc && cc.length > 0) {
    message.ccRecipients = cc.map(a => ({ emailAddress: { address: a } }))
  }

  // Note on threading: Graph's /sendMail only accepts internetMessageHeaders
  // whose names begin with "x-" (or "X-"). Standard headers like In-Reply-To
  // and References are rejected with ErrorInvalidInternetMessageHeader, which
  // fails the whole send. We therefore do not set them here; the reply still
  // threads for the recipient via the "Re: <subject>" subject line and the
  // quoted history in the body. inReplyToMessageId / referencesMessageIds are
  // accepted by this function for future use (for example a draft-then-send
  // path) but are intentionally not attached to a direct sendMail.
  void inReplyToMessageId
  void referencesMessageIds

  const res = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(fromUpn)}/sendMail`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, saveToSentItems: true }),
    }
  )

  if (res.status === 202) return { ok: true }

  const text = await res.text().catch(() => '')
  return {
    ok: false,
    error: `Graph sendMail failed: ${res.status} ${text.slice(0, 400)}`,
  }
}

/**
 * Fetch the acting user's saved email signature HTML. Returns null if
 * they haven't saved one yet, in which case the composer falls back to
 * a plain-text sign-off (name + role) rather than blocking send.
 */
export async function getUserSignatureHtml(userId: string): Promise<string | null> {
  // Signatures are per (user, layout). Prefer 'classic', fall back to
  // any other layout the user has saved.
  const { data: preferred } = await supabaseAdmin
    .from('email_signatures')
    .select('html_content')
    .eq('user_id', userId)
    .eq('layout', 'classic')
    .maybeSingle()
  if (preferred?.html_content) return preferred.html_content as string

  const { data: any } = await supabaseAdmin
    .from('email_signatures')
    .select('html_content')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  return (any?.html_content as string) || null
}

/**
 * Build the quoted history block that goes below the reply body.
 * Mimics standard "On [date], [name] wrote:" convention.
 */
export function buildQuotedHistory(originalMessage: {
  from_address: string
  from_name: string | null
  received_at: string | null
  sent_at: string | null
  body_html: string | null
  body_text: string | null
}): string {
  const when = originalMessage.received_at || originalMessage.sent_at || null
  const whenStr = when
    ? new Date(when).toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        dateStyle: 'full',
        timeStyle: 'short',
      })
    : ''
  const who = originalMessage.from_name || originalMessage.from_address || ''
  const inner =
    originalMessage.body_html ||
    escapeHtml(originalMessage.body_text || '').replace(/\n/g, '<br>')
  return `
<div style="margin-top:24px;padding-top:12px;border-top:1px solid #ccc;">
  <div style="font-size:12px;color:#666;margin-bottom:8px;">
    On ${escapeHtml(whenStr)}, ${escapeHtml(who)} wrote:
  </div>
  <blockquote style="margin:0 0 0 8px;padding-left:12px;border-left:2px solid #ccc;color:#333;">
    ${inner}
  </blockquote>
</div>`
}

/**
 * Build the full outbound HTML body: reply body + signature + quoted history.
 */
export function buildReplyBody(input: {
  bodyHtml: string
  signatureHtml: string | null
  quotedHistoryHtml: string | null
}): string {
  const parts: string[] = []
  parts.push(`<div>${input.bodyHtml}</div>`)
  if (input.signatureHtml) {
    parts.push(`<div style="margin-top:16px;">${input.signatureHtml}</div>`)
  }
  if (input.quotedHistoryHtml) {
    parts.push(input.quotedHistoryHtml)
  }
  return parts.join('\n')
}

// Convert plain text with newlines to HTML paragraphs.
export function plainTextToHtml(text: string): string {
  if (!text) return ''
  return text
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function escapeHtml(s: string): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
