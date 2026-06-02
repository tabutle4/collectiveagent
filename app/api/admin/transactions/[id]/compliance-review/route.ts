import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { buildComplianceReviewEmail } from '@/lib/email/buildComplianceEmail'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

// The reviewer name always shows as Leah Parpan regardless of who clicks send,
// matching Brokermint behavior where the role sends, not the individual.
const TC_DISPLAY_NAME = 'Leah Parpan'
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'
const CC_EMAIL = 'compliance@collectiverealtyco.com'
const RECHECK_URL = 'https://visit.collectiverealtyco.com/recheck'
// TODO: Replace RECHECK_URL with a dynamic URL pointing to the in-app compliance recheck form
// once that form is built. The form should accept a transaction_id param so agents can
// submit directly from the app (e.g. /recheck?txn={id}) and Leah sees the recheck in the
// Documents tab. Pull this URL from company_settings once a recheck_url column is added.

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  const { id } = await params

  try {
    // Load transaction + primary agent email
    const { data: txn } = await supabase
      .from('transactions')
      .select('id, property_address, transaction_type, compliance_status')
      .eq('id', id)
      .single()

    if (!txn) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    // Get all agents on this transaction to find the to: address
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

    // Primary agent email - prefer primary_agent, fall back to first agent
    const primaryAgent = agents?.find(a => a.agent_role === 'primary_agent') || agents?.[0]
    const agentUser = primaryAgent?.user as any
    const toEmail = agentUser?.office_email || agentUser?.email

    if (!toEmail) {
      return NextResponse.json({ error: 'No agent email found for this transaction' }, { status: 400 })
    }

    // Load all documents and their current review status
    const { data: docs } = await supabase
      .from('transaction_documents')
      .select('id, file_name, compliance_status, compliance_notes, required_document_id')
      .eq('transaction_id', id)
      .in('compliance_status', ['approved', 'rejected'])

    if (!docs || docs.length === 0) {
      return NextResponse.json(
        { error: 'No reviewed documents found. Approve or reject at least one document first.' },
        { status: 400 }
      )
    }

    // Load required_document names for display
    const rdIds = [...new Set(docs.filter(d => d.required_document_id).map(d => d.required_document_id))]
    const rdMap: Record<string, string> = {}
    if (rdIds.length > 0) {
      const { data: rds } = await supabase
        .from('required_documents')
        .select('id, name')
        .in('id', rdIds)
      for (const rd of rds || []) rdMap[rd.id] = rd.name
    }

    const approved = docs
      .filter(d => d.compliance_status === 'approved')
      .map(d => ({
        name: d.required_document_id && rdMap[d.required_document_id]
          ? rdMap[d.required_document_id]
          : d.file_name,
        notes: null,
      }))

    const rejected = docs
      .filter(d => d.compliance_status === 'rejected')
      .map(d => ({
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

    const sendResult = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      cc: [CC_EMAIL],
      replyTo: CC_EMAIL,
      subject,
      html,
    })

    if (sendResult.error) {
      throw new Error(sendResult.error.message)
    }

    // Update transaction compliance_status based on whether all is approved
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

    // Log the review in compliance_reviews
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
