import { NextRequest, NextResponse } from 'next/server'
import { COMPLIANCE_RECHECK_URL } from '@/lib/compliance/derive'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { buildComplianceReviewEmail } from '@/lib/email/buildComplianceEmail'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

const TC_DISPLAY_NAME = 'Leah Parpan'
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'
const CC_EMAIL = 'compliance@collectiverealtyco.com'
// Single source in lib/compliance/derive.ts, shared with the check emails.
const RECHECK_URL = COMPLIANCE_RECHECK_URL

// Shared helper: load transaction, the side under review, its docs, and build
// the email payload. Compliance is per side: each compliance submission (one per
// agent per side) is reviewed on its own. When submissionId is given, docs and
// the recipient are scoped to that side; otherwise the single compliance
// submission on the deal is used (legacy single-side behavior).
async function buildEmailPayload(id: string, submissionId?: string | null) {
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, property_address, transaction_type, compliance_status, compliance_submitted_at')
    .eq('id', id)
    .single()

  if (!txn) throw new Error('Transaction not found')

  // Resolve the side under review.
  const { data: sideSubs } = await supabase
    .from('agent_form_submissions')
    .select('id, agent_id, status, data')
    .eq('transaction_id', id)
    .filter('data->>submission_mode', 'eq', 'compliance')
  const submissions = sideSubs || []
  const submission = submissionId
    ? submissions.find((s: any) => s.id === submissionId) || null
    : submissions.length === 1
      ? submissions[0]
      : null
  if (submissionId && !submission) throw new Error('Compliance submission not found for this deal')

  // Recipient: the reviewed side's agent when known; otherwise the primary agent.
  let toEmail: string | null = null
  if (submission?.agent_id) {
    const { data: sideAgent } = await supabase
      .from('users')
      .select('email, office_email')
      .eq('id', submission.agent_id)
      .maybeSingle()
    toEmail = sideAgent?.office_email || sideAgent?.email || null
  }
  if (!toEmail) {
    const { data: agents } = await supabase
      .from('transaction_internal_agents')
      .select(`
        agent_role,
        user:users!transaction_internal_agents_agent_id_fkey(
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          email, office_email
        )
      `)
      .eq('transaction_id', id)
      .in('agent_role', ['primary_agent', 'listing_agent', 'buyer_agent'])
      .limit(5)
    const primaryAgent = agents?.find((a: any) => a.agent_role === 'primary_agent') || agents?.[0]
    const agentUser = primaryAgent?.user as any
    toEmail = agentUser?.office_email || agentUser?.email
  }

  if (!toEmail) throw new Error('No agent email found for this transaction')

  // This side's docs: tagged to the submission, plus shared (untagged) docs.
  let docsQuery = supabase
    .from('transaction_documents')
    .select('id, file_name, compliance_status, compliance_notes, required_document_id, submission_id')
    .eq('transaction_id', id)
    .in('compliance_status', ['approved', 'rejected'])
  const { data: allDocs } = await docsQuery
  const docs = submission
    ? (allDocs || []).filter((d: any) => d.submission_id === submission.id || d.submission_id === null)
    : allDocs

  if (!docs || docs.length === 0) {
    throw new Error('No reviewed documents found. Approve or reject at least one document first.')
  }

  // Load required_document names
  const rdIds = [...new Set(docs.filter((d: any) => d.required_document_id).map((d: any) => d.required_document_id))]
  const rdMap: Record<string, string> = {}
  if (rdIds.length > 0) {
    const { data: rds } = await supabase
      .from('required_documents')
      .select('id, name')
      .in('id', rdIds)
    for (const rd of rds || []) rdMap[rd.id] = rd.name
  }

  const approved = docs
    .filter((d: any) => d.compliance_status === 'approved')
    .map((d: any) => ({
      name: d.required_document_id && rdMap[d.required_document_id]
        ? rdMap[d.required_document_id]
        : d.file_name,
      notes: null as string | null,
    }))

  const rejected = docs
    .filter((d: any) => d.compliance_status === 'rejected')
    .map((d: any) => ({
      name: d.required_document_id && rdMap[d.required_document_id]
        ? rdMap[d.required_document_id]
        : d.file_name,
      notes: d.compliance_notes || null,
    }))

  const { subject, html } = buildComplianceReviewEmail({
    propertyAddress: txn.property_address || 'Transaction',
    transactionId: id,
    reviewerName: TC_DISPLAY_NAME,
    approved,
    rejected,
    recheckUrl: RECHECK_URL,
  })

  return { txn, toEmail, approved, rejected, subject, html, submission }
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

    // ── Preview: return structured doc arrays for Leah to review and edit ──
    if (action === 'preview') {
      const { toEmail, approved, rejected, subject, submission } = await buildEmailPayload(id, body.submission_id || null)
      void submission
      return NextResponse.json({ to: toEmail, cc: CC_EMAIL, subject, approved, rejected })
    }

    // ── Send: accept edited subject + doc arrays, rebuild HTML server-side ──
    const { toEmail, txn, submission } = await buildEmailPayload(id, body.submission_id || null)
    const finalSubject = body.subject || ''
    const editedApproved: { name: string; notes: string | null }[] = body.approved || []
    const editedRejected: { name: string; notes: string | null }[] = body.rejected || []

    if (!finalSubject || (editedApproved.length === 0 && editedRejected.length === 0)) {
      return NextResponse.json({ error: 'subject and at least one reviewed document are required' }, { status: 400 })
    }

    const { html: finalHtml } = buildComplianceReviewEmail({
      propertyAddress: txn.property_address || 'Transaction',
      transactionId: id,
      reviewerName: TC_DISPLAY_NAME,
      approved: editedApproved,
      rejected: editedRejected,
      recheckUrl: RECHECK_URL,
    })

    const approved = editedApproved
    const rejected = editedRejected

    if (!finalHtml) {
      return NextResponse.json({ error: 'Failed to build email' }, { status: 500 })
    }

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      cc: [CC_EMAIL],
      replyTo: CC_EMAIL,
      subject: finalSubject,
      html: finalHtml,
    })

    if (sendResult.error) throw new Error(sendResult.error.message)

    const hasRejections = rejected.length > 0
    const newComplianceStatus = hasRejections ? 'incomplete' : 'complete'
    const nowIso = new Date().toISOString()

    // The submission (this side) is the source of truth. Missing items default
    // to the rejected docs' notes; Leah can edit them later from the tracker.
    if (submission) {
      const missingText = hasRejections
        ? rejected.map(r => `${r.name}${r.notes ? `: ${r.notes}` : ''}`).join('\n')
        : null
      await supabase
        .from('agent_form_submissions')
        .update({
          status: newComplianceStatus,
          admin_notes: missingText,
          reviewed_by: auth.user!.id,
          reviewed_at: hasRejections ? null : nowIso,
          updated_at: nowIso,
        })
        .eq('id', submission.id)
    }

    // Dual-write the transaction as the worst status across sides so legacy
    // readers keep working during rollout.
    let derivedTxnStatus = newComplianceStatus
    const { data: allSides } = await supabase
      .from('agent_form_submissions')
      .select('id, status')
      .eq('transaction_id', id)
      .filter('data->>submission_mode', 'eq', 'compliance')
    if (allSides && allSides.length > 0) {
      const statuses = allSides.map((s: any) =>
        submission && s.id === submission.id ? newComplianceStatus : s.status
      )
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
        compliance_submitted_at: txn.compliance_submitted_at || nowIso,
        updated_at: nowIso,
      })
      .eq('id', id)

    // The pay-by deadline follows the sign-off, whichever screen it came from.
    await syncCheckComplianceDate(id)

    await supabase.from('compliance_reviews').insert({
      transaction_id: id,
      reviewer_id: auth.user!.id,
      status: hasRejections ? 'in_progress' : 'complete',
      notes: `Email sent to ${toEmail}. Approved: ${approved.length}, Rejected: ${rejected.length}`,
      completed_at: hasRejections ? null : new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      sent_to: toEmail,
      approved_count: approved.length,
      rejected_count: rejected.length,
      compliance_status: newComplianceStatus,
    })
  } catch (err: any) {
    console.error('compliance-review POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
