import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { buildComplianceReviewEmail } from '@/lib/email/buildComplianceEmail'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

const TC_DISPLAY_NAME = 'Leah Parpan'
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'
const CC_EMAIL = 'compliance@collectiverealtyco.com'
const RECHECK_URL = 'https://visit.collectiverealtyco.com/recheck'
// TODO: Replace RECHECK_URL with in-app recheck form URL once built.
// Pull from company_settings once a recheck_url column is added.

// Shared helper: load transaction, agents, docs, and build email payload
async function buildEmailPayload(id: string) {
  const { data: txn } = await supabase
    .from('transactions')
    .select('id, property_address, transaction_type, compliance_status, compliance_submitted_at')
    .eq('id', id)
    .single()

  if (!txn) throw new Error('Transaction not found')

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
  const toEmail = agentUser?.office_email || agentUser?.email

  if (!toEmail) throw new Error('No agent email found for this transaction')

  const { data: docs } = await supabase
    .from('transaction_documents')
    .select('id, file_name, compliance_status, compliance_notes, required_document_id')
    .eq('transaction_id', id)
    .in('compliance_status', ['approved', 'rejected'])

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

  return { txn, toEmail, approved, rejected, subject, html }
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

    // ── Preview: build the email and return subject + html for Leah to review ──
    if (action === 'preview') {
      const { toEmail, approved, rejected, subject, html } = await buildEmailPayload(id)
      return NextResponse.json({ to: toEmail, cc: CC_EMAIL, subject, html, approved_count: approved.length, rejected_count: rejected.length })
    }

    // ── Send: accept optionally-edited subject + html from the preview modal ──
    const { toEmail, approved, rejected, txn } = await buildEmailPayload(id)
    const finalSubject = body.subject || ''
    const finalHtml = body.html || ''

    if (!finalSubject || !finalHtml) {
      return NextResponse.json({ error: 'subject and html are required' }, { status: 400 })
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

    await supabase
      .from('transactions')
      .update({
        compliance_status: newComplianceStatus,
        compliance_submitted_at: txn.compliance_submitted_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

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
