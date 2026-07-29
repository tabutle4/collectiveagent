import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import {
  sendThreadReply,
  getUserSignatureHtml,
  buildReplyBody,
  buildQuotedHistory,
  plainTextToHtml,
} from '@/lib/agent-email-send'
import { insertThreadMessage, preferredDisplayName } from '@/lib/agent-email'

export const dynamic = 'force-dynamic'

// POST - Reply to an agent email thread from the acting user's mailbox.
// Body: { bodyText: string, previewOnly?: boolean }
//
// previewOnly=true returns the rendered HTML without sending, for the
// mandatory Preview step in the composer.
//
// Gated by can_manage_agent_email.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_agent_email')
  if (auth.error) return auth.error
  const { id: threadId } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const bodyText = String(body?.bodyText || '').trim()
    const previewOnly = Boolean(body?.previewOnly)
    if (!bodyText) {
      return NextResponse.json({ error: 'Reply body is required' }, { status: 400 })
    }

    // Load thread + agent
    const { data: thread, error: tErr } = await supabaseAdmin
      .from('email_threads')
      .select('id, subject, agent_user_id, graph_conversation_id')
      .eq('id', threadId)
      .maybeSingle()
    if (tErr) throw tErr
    if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name')
      .eq('id', thread.agent_user_id)
      .maybeSingle()
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    // Load the latest inbound message for threading + quoted history
    const { data: latestInbound } = await supabaseAdmin
      .from('email_thread_messages')
      .select(
        'internet_message_id, from_address, from_name, to_addresses, cc_addresses, subject, body_html, body_text, received_at, sent_at'
      )
      .eq('thread_id', threadId)
      .eq('direction', 'inbound')
      .order('received_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    // Build recipients: reply TO agent, CC anyone from the latest inbound
    // CC list who is not the sender or the acting user.
    const actingEmail = auth.user.email.toLowerCase()
    const toAddresses = [agent.email]
    let ccAddresses: string[] = []
    if (latestInbound?.cc_addresses) {
      ccAddresses = (latestInbound.cc_addresses as string[])
        .filter(
          a =>
            a &&
            a.toLowerCase() !== agent.email.toLowerCase() &&
            a.toLowerCase() !== actingEmail
        )
    }

    const rawSubject = latestInbound?.subject && !/^re:/i.test(latestInbound.subject)
      ? `Re: ${latestInbound.subject}`
      : latestInbound?.subject || (thread.subject || 'Re: (no subject)')
    // Final guard: Graph's sendMail rejects a message with an empty or
    // whitespace-only subject (ErrorMissingSubject). The fallback chain above
    // normally prevents that, but a stored subject that is whitespace-only
    // (for example a single space) would slip through, so we coerce anything
    // blank to a safe default here.
    const subject = rawSubject && rawSubject.trim() ? rawSubject : 'Re: (no subject)'

    // Build body
    const bodyHtml = plainTextToHtml(bodyText)
    const signatureHtml = await getUserSignatureHtml(auth.user.id)
    const quotedHistoryHtml = latestInbound
      ? buildQuotedHistory({
          from_address: latestInbound.from_address as string,
          from_name: (latestInbound.from_name as string) || null,
          received_at: (latestInbound.received_at as string) || null,
          sent_at: (latestInbound.sent_at as string) || null,
          body_html: (latestInbound.body_html as string) || null,
          body_text: (latestInbound.body_text as string) || null,
        })
      : null
    const fullHtml = buildReplyBody({ bodyHtml, signatureHtml, quotedHistoryHtml })

    if (previewOnly) {
      return NextResponse.json({
        success: true,
        preview: {
          fromUpn: auth.user.email,
          toAddresses,
          ccAddresses,
          subject,
          html: fullHtml,
          hasSignature: Boolean(signatureHtml),
        },
      })
    }

    // Send via Graph
    const result = await sendThreadReply({
      fromUpn: auth.user.email,
      to: toAddresses,
      cc: ccAddresses,
      subject,
      bodyHtml: fullHtml,
      inReplyToMessageId: (latestInbound?.internet_message_id as string) || null,
      referencesMessageIds: latestInbound?.internet_message_id
        ? [latestInbound.internet_message_id as string]
        : undefined,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Send failed' }, { status: 502 })
    }

    // Synthesize an internetMessageId for our record. Graph's sendMail
    // doesn't return the sent message's Message-ID, so we generate one
    // locally with a distinctive prefix. Later, when the sent-items
    // subscription fires for this send, the webhook's dedupe by
    // internetMessageId will see our generated id is different from
    // Graph's real one and would insert a second row. To prevent that,
    // we also match against graph_message_id in a soft-dedupe path,
    // OR (simpler and what we do here) we mark this row as
    // sent_via_dashboard=true and rely on the webhook to skip inserting
    // a duplicate. Since Graph assigns its own Message-ID we cannot
    // pre-emptively record it, so the webhook may write a second row
    // for the same outbound send. Mitigated by webhook checking
    // sent_via_dashboard on the last outbound with matching to_addresses
    // within a short window.
    const now = new Date().toISOString()
    const localMessageId = `dashboard-${threadId}-${Date.now()}@collectiverealtyco.com`

    await insertThreadMessage({
      threadId,
      direction: 'outbound',
      internetMessageId: localMessageId,
      graphMessageId: null,
      receivedFromMailboxUpn: auth.user.email,
      fromAddress: auth.user.email,
      fromName: preferredDisplayName(auth.user as any),
      toAddresses,
      ccAddresses,
      subject,
      bodyHtml: fullHtml,
      bodyText: bodyText,
      receivedAt: null,
      sentAt: now,
      sentViaDashboard: true,
      sentByUserId: auth.user.id,
      hasAttachments: false,
    })

    // Update thread status
    await supabaseAdmin
      .from('email_threads')
      .update({
        status: 'waiting_on_agent',
        waiting_on_user_id: null,
        last_message_at: now,
        last_message_direction: 'outbound',
        updated_at: now,
      })
      .eq('id', threadId)

    return NextResponse.json({ success: true, sentAt: now })
  } catch (err: any) {
    console.error('reply route error:', err)
    return NextResponse.json({ error: err?.message || 'Reply failed' }, { status: 500 })
  }
}
