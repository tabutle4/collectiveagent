import { NextRequest, NextResponse } from 'next/server'
import { getGraphToken } from '@/lib/microsoft-graph'
import { supabaseAdmin } from '@/lib/supabase'
import {
  isValidClientState,
  findSubscriptionByClientState,
} from '@/lib/graph-mail-subscriptions'
import {
  resolveAgentFromEmail,
  getActiveAdminEmailSet,
  messagePassesReadingAFilter,
  findOrCreateInboundThread,
  locateThreadByConversationId,
  insertThreadMessage,
  insertSystemNote,
  preferredDisplayName,
} from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// Public route (no session). Two behaviors:
//
// 1) Graph subscription validation handshake:
//    Graph POSTs with ?validationToken=<token>. We must return the token
//    as plain text within 10 seconds. This happens once at subscription
//    creation time.
//
// 2) Change notifications:
//    Graph POSTs a JSON body { value: [notifications] }. For each
//    notification we validate clientState, fetch the message from Graph,
//    apply the Reading A filter (if inbox subscription), or the
//    out-of-band-reply logic (if sentitems subscription), and persist.
//
// This route is in middleware.ts PUBLIC_PATHS. Auth here is a shared
// secret in clientState, verified in isValidClientState.
export async function POST(request: NextRequest) {
  // 1) Validation handshake
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken')
  if (validationToken) {
    // Graph requires a plain-text 200 response with just the token.
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // 2) Change notification payload
  let payload: any
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const notifications: any[] = Array.isArray(payload?.value) ? payload.value : []

  // Graph expects a 202 within 30 seconds. If we take too long the
  // subscription can be dropped. We process what we can synchronously
  // but any per-notification failure is caught and logged so we still
  // return 202 promptly.
  const results: Array<{ subscriptionId: string; ok: boolean; reason?: string }> = []

  for (const n of notifications) {
    const subscriptionId = String(n?.subscriptionId || '')
    const clientState = String(n?.clientState || '')
    const resource = String(n?.resource || '')
    if (!isValidClientState(clientState)) {
      results.push({ subscriptionId, ok: false, reason: 'invalid clientState' })
      continue
    }
    try {
      await processNotification({ subscriptionId, clientState, resource })
      results.push({ subscriptionId, ok: true })
    } catch (err: any) {
      console.error('agent-email webhook notification error:', err?.message || err)
      results.push({
        subscriptionId,
        ok: false,
        reason: err?.message || 'unknown error',
      })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results }, { status: 202 })
}

// ─── Per-notification processing ───────────────────────────────────────────

async function processNotification(input: {
  subscriptionId: string
  clientState: string
  resource: string
}): Promise<void> {
  const { clientState, resource } = input

  // Look up which subscription this is. The clientState is unique per
  // subscription (secret + nonce), so it's the safest key.
  const sub = await findSubscriptionByClientState(clientState)
  if (!sub) {
    // Unknown subscription , probably a stale one we already deleted.
    return
  }

  // Fetch the message from Graph. resource looks like:
  //   Users/{id}/Messages/{messageId}
  //   users/{upn}/mailFolders/inbox/messages/{messageId}
  // We normalize by pulling the message ID from the end and use the
  // stored mailbox UPN as the address.
  const messageId = extractMessageIdFromResource(resource)
  if (!messageId) return

  const token = await getGraphToken()
  const msgUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sub.mailboxUpn)}/messages/${messageId}?$select=id,internetMessageId,conversationId,from,toRecipients,ccRecipients,subject,body,bodyPreview,receivedDateTime,sentDateTime,hasAttachments,sender`
  const res = await fetch(msgUrl, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Graph get message failed: ${res.status} ${t.slice(0, 300)}`)
  }
  const msg = await res.json()

  const internetMessageId = String(msg.internetMessageId || '')
  const conversationId = msg.conversationId ? String(msg.conversationId) : null
  const fromAddress = String(msg.from?.emailAddress?.address || msg.sender?.emailAddress?.address || '').toLowerCase()
  const fromName = String(msg.from?.emailAddress?.name || msg.sender?.emailAddress?.name || '') || null
  const toAddresses = ((msg.toRecipients || []) as any[])
    .map(r => String(r?.emailAddress?.address || ''))
    .filter(Boolean)
  const ccAddresses = ((msg.ccRecipients || []) as any[])
    .map(r => String(r?.emailAddress?.address || ''))
    .filter(Boolean)
  const subject = msg.subject ? String(msg.subject) : null
  const bodyHtml = msg.body?.contentType === 'html' ? String(msg.body?.content || '') : null
  const bodyText = msg.body?.contentType === 'text' ? String(msg.body?.content || '') : (msg.bodyPreview ? String(msg.bodyPreview) : null)
  const receivedAt = msg.receivedDateTime ? String(msg.receivedDateTime) : null
  const sentAt = msg.sentDateTime ? String(msg.sentDateTime) : null
  const hasAttachments = Boolean(msg.hasAttachments)

  if (!internetMessageId) {
    // Nothing we can dedupe on , refuse to ingest to avoid duplicates.
    return
  }

  if (sub.folderKind === 'inbox') {
    await processInbound({
      fromAddress,
      fromName,
      toAddresses,
      ccAddresses,
      subject,
      bodyHtml,
      bodyText,
      receivedAt: receivedAt || new Date().toISOString(),
      sentAt,
      hasAttachments,
      internetMessageId,
      graphMessageId: String(msg.id || ''),
      conversationId,
      mailboxUpn: sub.mailboxUpn,
    })
  } else {
    await processOutbound({
      fromAddress,
      fromName,
      toAddresses,
      ccAddresses,
      subject,
      bodyHtml,
      bodyText,
      sentAt: sentAt || new Date().toISOString(),
      hasAttachments,
      internetMessageId,
      graphMessageId: String(msg.id || ''),
      conversationId,
      mailboxUpn: sub.mailboxUpn,
    })
  }
}

// Best-effort parse of the message id out of the resource string.
function extractMessageIdFromResource(resource: string): string | null {
  if (!resource) return null
  // Try to match /messages/{id} case-insensitively.
  const match = resource.match(/messages\/([^/?#]+)/i)
  return match ? match[1] : null
}

// ─── Inbound (Reading A filter, thread find-or-create) ────────────────────

async function processInbound(m: {
  fromAddress: string
  fromName: string | null
  toAddresses: string[]
  ccAddresses: string[]
  subject: string | null
  bodyHtml: string | null
  bodyText: string | null
  receivedAt: string
  sentAt: string | null
  hasAttachments: boolean
  internetMessageId: string
  graphMessageId: string
  conversationId: string | null
  mailboxUpn: string
}): Promise<void> {
  // Resolve agent
  const agent = await resolveAgentFromEmail(m.fromAddress)
  if (!agent) {
    // Not an active agent sender , silently ignore.
    return
  }

  // Reading A: at least one admin on To/CC
  const adminEmailSet = await getActiveAdminEmailSet()
  const agentEmailSet = new Set<string>([m.fromAddress])
  const passes = messagePassesReadingAFilter({
    fromAddress: m.fromAddress,
    toAddresses: m.toAddresses,
    ccAddresses: m.ccAddresses,
    agentEmailSetLower: agentEmailSet,
    adminEmailSetLower: adminEmailSet,
  })
  if (!passes) return

  // Find or create thread
  const thread = await findOrCreateInboundThread({
    agentUserId: agent.id,
    graphConversationId: m.conversationId,
    firstInternetMessageId: m.internetMessageId,
    subject: m.subject,
    receivedAt: m.receivedAt,
  })

  // Insert message (dedupe by internet_message_id)
  const insertResult = await insertThreadMessage({
    threadId: thread.threadId,
    direction: 'inbound',
    internetMessageId: m.internetMessageId,
    graphMessageId: m.graphMessageId,
    receivedFromMailboxUpn: m.mailboxUpn,
    fromAddress: m.fromAddress,
    fromName: m.fromName,
    toAddresses: m.toAddresses,
    ccAddresses: m.ccAddresses,
    subject: m.subject,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    receivedAt: m.receivedAt,
    sentAt: m.sentAt,
    sentViaDashboard: false,
    sentByUserId: null,
    hasAttachments: m.hasAttachments,
  })

  if (thread.wasReopened && insertResult.inserted) {
    await insertSystemNote(
      thread.threadId,
      'Thread reopened. This thread was closed but the agent replied, so it is back in the queue.'
    )
  }
}

// ─── Outbound (out-of-band reply detection) ───────────────────────────────

async function processOutbound(m: {
  fromAddress: string
  fromName: string | null
  toAddresses: string[]
  ccAddresses: string[]
  subject: string | null
  bodyHtml: string | null
  bodyText: string | null
  sentAt: string
  hasAttachments: boolean
  internetMessageId: string
  graphMessageId: string
  conversationId: string | null
  mailboxUpn: string
}): Promise<void> {
  if (!m.conversationId) return
  const found = await locateThreadByConversationId(m.conversationId)
  if (!found) return

  // Look up the admin who sent it, by email.
  const { data: adminUser } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name')
    .ilike('email', m.fromAddress.toLowerCase())
    .maybeSingle()

  const sentByUserId = adminUser?.id || null
  const senderDisplay = adminUser
    ? preferredDisplayName({
        first_name: adminUser.first_name,
        last_name: adminUser.last_name,
        preferred_first_name: adminUser.preferred_first_name,
        preferred_last_name: adminUser.preferred_last_name,
        email: adminUser.email,
      })
    : m.fromName || m.fromAddress

  const insertResult = await insertThreadMessage({
    threadId: found.threadId,
    direction: 'outbound',
    internetMessageId: m.internetMessageId,
    graphMessageId: m.graphMessageId,
    receivedFromMailboxUpn: m.mailboxUpn,
    fromAddress: m.fromAddress,
    fromName: m.fromName,
    toAddresses: m.toAddresses,
    ccAddresses: m.ccAddresses,
    subject: m.subject,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    receivedAt: null,
    sentAt: m.sentAt,
    // If Phase 2's dashboard-send path already recorded this
    // internet_message_id with sent_via_dashboard=true, insertThreadMessage
    // will return {inserted:false, reason:'duplicate'} and we skip the
    // rest , no double-count, no bogus "sent from Outlook" note.
    sentViaDashboard: false,
    sentByUserId,
    hasAttachments: m.hasAttachments,
  })
  if (!insertResult.inserted) return

  // Update thread: status → waiting_on_agent, clear waiting_on_user_id.
  await supabaseAdmin
    .from('email_threads')
    .update({
      status: 'waiting_on_agent',
      waiting_on_user_id: null,
      last_message_at: m.sentAt,
      last_message_direction: 'outbound',
      updated_at: new Date().toISOString(),
    })
    .eq('id', found.threadId)

  // System note.
  const when = new Date(m.sentAt).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  await insertSystemNote(
    found.threadId,
    `Reply sent from Outlook by ${senderDisplay} at ${when}. Status updated automatically. Nothing else needed from you.`
  )
}
