import { NextRequest, NextResponse } from 'next/server'
import { RETAINER_FORM_URL } from '@/lib/compliance/derive'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { buildRetainerReviewEmail } from '@/lib/email/buildComplianceEmail'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'
import { SIDE_MODES_FILTER, pickSideSubmissions } from '@/lib/compliance/derive'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

const TC_DISPLAY_NAME = 'Leah Parpan'
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'
const CC_EMAIL = 'compliance@collectiverealtyco.com'

// Where an agent goes to fix a rejected retainer. Retainer mode detects the
// existing submission and updates it in place, so this does not create a
// second retainer for the same client.
// Single source in lib/compliance/derive.ts, shared with the check emails.
// It carries the same NEXT_PUBLIC_APP_URL fallback, so a missing env var
// still yields an absolute href.
const RESUBMIT_URL = RETAINER_FORM_URL

// The retainer sibling of compliance-review. Sending the review writes the
// retainer's own submission row, then derives the deal's compliance status and
// stamps the checks the same way the compliance review does, so a retainer
// reads as a real deal on the payouts report and the transaction page.
// pickSideSubmissions keeps that safe on a converted deal: once the prospect
// carries a real compliance submission, the retainer stops contributing.
async function loadRetainer(id: string, submissionId?: string | null) {
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, property_address, client_name')
    .eq('id', id)
    .single()

  if (!txn) throw new Error('Transaction not found')

  let query = supabase
    .from('agent_form_submissions')
    .select('id, agent_id, status, admin_notes, data')
    .eq('transaction_id', id)
    .filter('data->>submission_mode', 'eq', 'retainer')
    .order('submitted_at', { ascending: true })

  if (submissionId) query = query.eq('id', submissionId)

  const { data: subs } = await query.limit(1)
  const submission = subs?.[0] || null
  if (!submission) throw new Error('No retainer submission on this transaction')

  // Same precedence as compliance-review, deliberately. The Resend sending
  // domain is allowlisted on the CRC M365 mailboxes, so office_email leads and
  // personal addresses are never used for agent mail.
  const { data: agent } = await supabase
    .from('users')
    .select('id, email, office_email, first_name, last_name')
    .eq('id', submission.agent_id)
    .maybeSingle()

  const toEmail = agent?.office_email || agent?.email || ''
  if (!toEmail) throw new Error('That agent has no email address on file')

  const clientName =
    submission.data?.client_name || txn.client_name || txn.property_address || 'Client'

  return { txn, submission, toEmail, clientName }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  const { id } = await params

  try {
    const body = await request.json().catch(() => ({}))
    const action = body.action || 'send'

    const { submission, toEmail, clientName } = await loadRetainer(id, body.submission_id || null)

    // Preview: hand back what the email will say so Leah can edit the status
    // and the notes before anything is sent, the same two-step the compliance
    // review uses.
    if (action === 'preview') {
      const status = submission.status === 'complete' ? 'complete' : 'incomplete'
      const { subject } = buildRetainerReviewEmail({
        clientName,
        reviewerName: TC_DISPLAY_NAME,
        status,
        notes: submission.admin_notes || null,
        resubmitUrl: RESUBMIT_URL,
      })
      return NextResponse.json({
        to: toEmail,
        cc: CC_EMAIL,
        subject,
        client_name: clientName,
        status,
        notes: submission.admin_notes || '',
      })
    }

    // Send: the client supplies the reviewed status and notes, the HTML is
    // rebuilt server-side so an edited body cannot be posted in.
    const status: 'complete' | 'incomplete' = body.status === 'complete' ? 'complete' : 'incomplete'
    const notes = typeof body.notes === 'string' ? body.notes.trim() : ''

    if (status === 'incomplete' && !notes) {
      return NextResponse.json(
        { error: 'Say what needs fixing before sending an Action Required email.' },
        { status: 400 }
      )
    }

    const { subject: builtSubject, html } = buildRetainerReviewEmail({
      clientName,
      reviewerName: TC_DISPLAY_NAME,
      status,
      notes: notes || null,
      resubmitUrl: RESUBMIT_URL,
    })

    const finalSubject = body.subject || builtSubject
    if (!html) return NextResponse.json({ error: 'Failed to build email' }, { status: 500 })

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      cc: [CC_EMAIL],
      replyTo: CC_EMAIL,
      subject: finalSubject,
      html,
    })

    if (sendResult.error) throw new Error(sendResult.error.message)

    const nowIso = new Date().toISOString()

    // The submission row is the only thing this sign-off writes. Notes are kept
    // on incomplete and cleared on complete, matching set-status.
    await supabase
      .from('agent_form_submissions')
      .update({
        status,
        admin_notes: status === 'incomplete' ? notes : null,
        reviewed_by: auth.user!.id,
        reviewed_at: status === 'complete' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', submission.id)

    // Derive the deal from its sides, the same as compliance-review does. On a
    // retainer-only prospect the retainer is the only side, so this carries the
    // sign-off to the transaction and the checks.
    const { data: allSideRows } = await supabase
      .from('agent_form_submissions')
      .select('id, status, data')
      .eq('transaction_id', id)
      .filter('data->>submission_mode', 'in', SIDE_MODES_FILTER)
    const allSides = pickSideSubmissions(allSideRows || [])
    let derivedTxnStatus: string = status
    if (allSides.length > 0) {
      const statuses = allSides.map((s: any) => (s.id === submission.id ? status : s.status))
      derivedTxnStatus = statuses.includes('incomplete')
        ? 'incomplete'
        : statuses.some((s: string) => s === 'in_review' || s === 'submitted')
          ? 'in_review'
          : 'complete'
    }

    await supabase
      .from('transactions')
      .update({
        compliance_status: derivedTxnStatus,
        compliance_approved_at: derivedTxnStatus === 'complete' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', id)

    // The pay-by deadline follows the sign-off, whichever screen it came from.
    await syncCheckComplianceDate(id)

    await supabase.from('compliance_reviews').insert({
      transaction_id: id,
      reviewer_id: auth.user!.id,
      status: status === 'complete' ? 'complete' : 'in_progress',
      notes: `Retainer review email sent to ${toEmail}. Status: ${status}`,
      completed_at: status === 'complete' ? nowIso : null,
    })

    return NextResponse.json({
      success: true,
      sent_to: toEmail,
      status,
    })
  } catch (err: any) {
    console.error('retainer-review POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
