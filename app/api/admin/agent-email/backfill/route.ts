import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import {
  getActiveAdmins,
  getActiveAdminEmailSet,
  resolveAgentFromEmail,
  messagePassesReadingAFilter,
  findOrCreateInboundThread,
  insertThreadMessage,
  insertSystemNote,
} from '@/lib/agent-email'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST - One-off backfill of agent emails from admin mailboxes.
//
// Walks every active admin's Inbox and pulls messages received in the last
// N hours (default 24). Each message runs through the same filter and
// ingest logic the webhook uses:
//   - Sender must be an active agent (agent or referral role, active)
//   - At least one recipient must be an active admin (Reading A rule)
//   - Deduped by internetMessageId (so re-runs are safe, and mail CC'd
//     to multiple admins still creates one thread)
//
// This is the tool for:
//   - First run after ingest goes live, to backfill recent history
//   - A new admin joining, to pull their existing conversations
//   - After a filter bug fix, to correct historical threads
//
// Query params (all optional):
//   hours=24              (default 24, max 168 = 7 days)
//   userIds=id1,id2       (default: all active admins; scope to specific admins)
//
// Gated by can_manage_agent_email.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const hoursRaw = parseInt(searchParams.get('hours') || '24', 10)
    const hours = Math.max(1, Math.min(168, isNaN(hoursRaw) ? 24 : hoursRaw))
    const userIdsParam = searchParams.get('userIds')
    const userIdFilter = userIdsParam
      ? new Set(userIdsParam.split(',').map(s => s.trim()).filter(Boolean))
      : null

    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    // Fetch admins (role-based, from users table)
    const allAdmins = await getActiveAdmins()
    const admins = userIdFilter
      ? allAdmins.filter(a => userIdFilter.has(a.id))
      : allAdmins

    const adminEmailSet = await getActiveAdminEmailSet()

    const token = await getGraphToken()

    interface PerMailboxResult {
      mailboxUpn: string
      messagesScanned: number
      messagesIngested: number
      messagesFilteredOut: number
      messagesDuplicate: number
      errors: string[]
    }

    const results: PerMailboxResult[] = []
    let totalIngested = 0

    for (const admin of admins) {
      const res: PerMailboxResult = {
        mailboxUpn: admin.email,
        messagesScanned: 0,
        messagesIngested: 0,
        messagesFilteredOut: 0,
        messagesDuplicate: 0,
        errors: [],
      }
      try {
        await backfillMailbox({
          token,
          mailboxUpn: admin.email,
          sinceIso,
          adminEmailSet,
          result: res,
        })
      } catch (err: any) {
        res.errors.push(err?.message || String(err))
      }
      totalIngested += res.messagesIngested
      results.push(res)
    }

    return NextResponse.json({
      success: true,
      report: {
        ranAt: new Date().toISOString(),
        hoursScanned: hours,
        sinceIso,
        adminsScanned: admins.length,
        totalIngested,
        perMailbox: results,
      },
    })
  } catch (err: any) {
    console.error('backfill error:', err)
    return NextResponse.json(
      { error: err?.message || 'Backfill failed' },
      { status: 500 }
    )
  }
}

// ─── Per-mailbox backfill ─────────────────────────────────────────────────

async function backfillMailbox(input: {
  token: string
  mailboxUpn: string
  sinceIso: string
  adminEmailSet: Set<string>
  result: {
    mailboxUpn: string
    messagesScanned: number
    messagesIngested: number
    messagesFilteredOut: number
    messagesDuplicate: number
    errors: string[]
  }
}): Promise<void> {
  const { token, mailboxUpn, sinceIso, adminEmailSet, result } = input

  // Walk the Inbox with paging. Graph caps $top at 999; 100 keeps the
  // request light and page-size friendly.
  const select =
    'id,internetMessageId,conversationId,from,toRecipients,ccRecipients,subject,body,bodyPreview,receivedDateTime,sentDateTime,hasAttachments,sender'
  const filter = `receivedDateTime ge ${sinceIso}`
  let url: string | null =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailboxUpn)}` +
    `/mailFolders/inbox/messages?$select=${encodeURIComponent(select)}` +
    `&$filter=${encodeURIComponent(filter)}&$top=100&$orderby=receivedDateTime%20desc`

  let safetyLimit = 50 // hard cap: 50 pages × 100 = up to 5000 messages per mailbox

  while (url && safetyLimit > 0) {
    safetyLimit -= 1
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const text = await res.text()
      result.errors.push(
        `Graph list failed: ${res.status} ${text.slice(0, 300)}`
      )
      return
    }
    const payload = await res.json()
    const messages: any[] = payload?.value || []

    for (const msg of messages) {
      result.messagesScanned += 1
      try {
        const outcome = await ingestOne({
          msg,
          mailboxUpn,
          adminEmailSet,
        })
        if (outcome === 'ingested') result.messagesIngested += 1
        else if (outcome === 'duplicate') result.messagesDuplicate += 1
        else result.messagesFilteredOut += 1
      } catch (err: any) {
        result.errors.push(
          `message ${msg?.internetMessageId || '?'}: ${err?.message || String(err)}`
        )
      }
    }

    url = payload['@odata.nextLink'] || null
  }
}

// Process a single Graph message the same way the webhook does. Returns
// 'ingested' | 'duplicate' | 'filtered' so the caller can count outcomes.
async function ingestOne(input: {
  msg: any
  mailboxUpn: string
  adminEmailSet: Set<string>
}): Promise<'ingested' | 'duplicate' | 'filtered'> {
  const { msg, mailboxUpn, adminEmailSet } = input

  const internetMessageId = String(msg.internetMessageId || '')
  if (!internetMessageId) return 'filtered'

  const conversationId = msg.conversationId ? String(msg.conversationId) : null
  const fromAddress = String(
    msg.from?.emailAddress?.address ||
      msg.sender?.emailAddress?.address ||
      ''
  ).toLowerCase()
  const fromName =
    String(
      msg.from?.emailAddress?.name || msg.sender?.emailAddress?.name || ''
    ) || null
  const toAddresses = ((msg.toRecipients || []) as any[])
    .map(r => String(r?.emailAddress?.address || ''))
    .filter(Boolean)
  const ccAddresses = ((msg.ccRecipients || []) as any[])
    .map(r => String(r?.emailAddress?.address || ''))
    .filter(Boolean)
  const subject = msg.subject ? String(msg.subject) : null
  const bodyHtml =
    msg.body?.contentType === 'html' ? String(msg.body?.content || '') : null
  const bodyText =
    msg.body?.contentType === 'text'
      ? String(msg.body?.content || '')
      : msg.bodyPreview
        ? String(msg.bodyPreview)
        : null
  const receivedAt = msg.receivedDateTime
    ? String(msg.receivedDateTime)
    : new Date().toISOString()
  const sentAt = msg.sentDateTime ? String(msg.sentDateTime) : null
  const hasAttachments = Boolean(msg.hasAttachments)

  // Resolve sender against active agents
  const agent = await resolveAgentFromEmail(fromAddress)
  if (!agent) return 'filtered'

  // Reading A: at least one admin on To/CC
  const agentEmailSet = new Set<string>([fromAddress])
  const passes = messagePassesReadingAFilter({
    fromAddress,
    toAddresses,
    ccAddresses,
    agentEmailSetLower: agentEmailSet,
    adminEmailSetLower: adminEmailSet,
  })
  if (!passes) return 'filtered'

  // Find or create thread
  const thread = await findOrCreateInboundThread({
    agentUserId: agent.id,
    graphConversationId: conversationId,
    firstInternetMessageId: internetMessageId,
    subject,
    receivedAt,
  })

  // Insert (dedupe via unique constraint on internet_message_id)
  const insertResult = await insertThreadMessage({
    threadId: thread.threadId,
    direction: 'inbound',
    internetMessageId,
    graphMessageId: String(msg.id || ''),
    receivedFromMailboxUpn: mailboxUpn,
    fromAddress,
    fromName,
    toAddresses,
    ccAddresses,
    subject,
    bodyHtml,
    bodyText,
    receivedAt,
    sentAt,
    sentViaDashboard: false,
    sentByUserId: null,
    hasAttachments,
  })

  if (!insertResult.inserted) {
    return insertResult.reason === 'duplicate' ? 'duplicate' : 'filtered'
  }

  if (thread.wasReopened) {
    await insertSystemNote(
      thread.threadId,
      'Thread reopened. This thread was closed but the agent replied, so it is back in the queue.'
    )
  }

  return 'ingested'
}
