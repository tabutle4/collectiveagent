import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout } from '@/lib/email/layout'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const transactionId = searchParams.get('transaction_id')

  try {
    // ── Find transaction by ID or address ─────────────────────────────────────
    let txn: any = null

    if (transactionId) {
      const { data } = await supabaseAdmin
        .from('transactions')
        .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division')
        .eq('id', transactionId)
        .single()
      txn = data
    } else if (address?.trim()) {
      // Find agent's transactions matching address
      const { data: tiaRows } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('transaction_id')
        .eq('agent_id', auth.user.id)

      if (tiaRows?.length) {
        const ids = tiaRows.map((r: any) => r.transaction_id)
        const { data } = await supabaseAdmin
          .from('transactions')
          .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division')
          .ilike('property_address', `%${address.trim()}%`)
          .in('id', ids)
          .order('created_at', { ascending: false })
          .limit(5)
        txn = data?.[0] || null
      }
    }

    if (!txn) {
      return NextResponse.json({ transaction: null, last_submission: null })
    }

    // ── Load last compliance submission data ──────────────────────────────────
    const { data: lastSub } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, data, submitted_at')
      .eq('transaction_id', txn.id)
      .eq('agent_id', auth.user.id)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      transaction: txn,
      last_submission: lastSub || null,
    })
  } catch (err: any) {
    console.error('subsequent-compliance GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { transaction_id, last_submission_id, notes, ...formFields } = body

    if (!transaction_id) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    // ── Fetch transaction ─────────────────────────────────────────────────────
    const { data: txn } = await supabaseAdmin
      .from('transactions')
      .select('id, property_address, is_locked, compliance_status')
      .eq('id', transaction_id)
      .single()

    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // ── Fetch previous submission data for diff ───────────────────────────────
    let previousData: Record<string, any> = {}
    if (last_submission_id) {
      const { data: prevSub } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('data')
        .eq('id', last_submission_id)
        .single()
      previousData = prevSub?.data || {}
    }

    // ── Compute changed fields ────────────────────────────────────────────────
    const changedFields: string[] = []
    for (const [key, value] of Object.entries(formFields)) {
      const prev = previousData[key]
      const curr = value
      if (JSON.stringify(prev) !== JSON.stringify(curr)) {
        changedFields.push(key)
      }
    }

    const now = new Date().toISOString()
    const submissionData = { ...formFields, notes: notes || null, changed_fields: changedFields }

    const isLocked = txn.is_locked

    // ── Create submission record ──────────────────────────────────────────────
    const { data: submission } = await supabaseAdmin
      .from('agent_form_submissions')
      .insert({
        form_id: null,
        agent_id: auth.user.id,
        submitted_at: now,
        status: 'submitted',
        transaction_id,
        data: submissionData,
        updated_at: now,
      })
      .select('id')
      .single()

    if (isLocked) {
      // Notify but do not update transaction
      await sendSubsequentNotification(txn, submissionData, changedFields, true)

      return NextResponse.json({
        success: true,
        locked: true,
        changed_fields: changedFields,
        message: 'Your compliance request has been received. Because this transaction has been reviewed by the office, any updates will be applied manually. No action is needed from you.',
      })
    }

    // ── Update transaction ────────────────────────────────────────────────────
    const {
      representing,
      tenant_transaction_type,
      lease_term_months,
      closing_or_movein_date,
      commission_basis_price,
      commission_rate,
      total_sales_rent_price,
      bonus_btsa_amount,
      rebate_amount,
      internal_referral,
      internal_referral_fee,
      external_referral,
      external_referral_fee,
      brokerage_referral,
      brokerage_referral_fee,
      loan_type,
    } = formFields

    const isLease = representing === 'tenant' || representing === 'landlord'

    await supabaseAdmin
      .from('transactions')
      .update({
        representing: representing || null,
        tenant_transaction_type: tenant_transaction_type || null,
        lease_term: lease_term_months ? parseInt(lease_term_months) : null,
        closing_date: isLease ? null : closing_or_movein_date || null,
        move_in_date: isLease ? closing_or_movein_date || null : null,
        loan_type: loan_type || null,
        sales_price: total_sales_rent_price ? parseFloat(total_sales_rent_price) : null,
        monthly_rent: isLease && total_sales_rent_price ? parseFloat(total_sales_rent_price) : null,
        gross_commission: commission_basis_price ? parseFloat(commission_basis_price) : null,
        bonus_amount: bonus_btsa_amount ? parseFloat(bonus_btsa_amount) : 0,
        has_btsa: !!(bonus_btsa_amount && parseFloat(bonus_btsa_amount) > 0),
        btsa_amount: bonus_btsa_amount ? parseFloat(bonus_btsa_amount) : 0,
        rebate_amount: rebate_amount ? parseFloat(rebate_amount) : 0,
        internal_referral: internal_referral || false,
        internal_referral_fee: internal_referral_fee ? parseFloat(internal_referral_fee) : 0,
        external_referral: external_referral || false,
        external_referral_fee: external_referral_fee ? parseFloat(external_referral_fee) : 0,
        brokerage_referral: brokerage_referral || false,
        brokerage_referral_fee: brokerage_referral_fee ? parseFloat(brokerage_referral_fee) : 0,
        compliance_status: 'submitted',
        compliance_submitted_at: now,
        compliance_submitted_by: auth.user.id,
        updated_at: now,
      })
      .eq('id', transaction_id)

    await sendSubsequentNotification(txn, submissionData, changedFields, false)

    return NextResponse.json({
      success: true,
      submission_id: submission?.id || null,
      changed_fields: changedFields,
      message: 'Resubmission received. The office has been notified.',
    })
  } catch (err: any) {
    console.error('subsequent-compliance POST error:', err)
    return NextResponse.json({ error: err.message || 'Failed to submit' }, { status: 500 })
  }
}

async function sendSubsequentNotification(
  txn: any,
  submissionData: Record<string, any>,
  changedFields: string[],
  isLocked: boolean
) {
  const { data: formRecord } = await supabaseAdmin
    .from('forms')
    .select('notification_emails')
    .eq('linked_form_type', 'subsequent_compliance')
    .eq('is_active', true)
    .maybeSingle()

  const recipients: string[] = formRecord?.notification_emails || []
  if (!recipients.length) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'

  const formatLabel = (key: string) =>
    key.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  const changedHtml = changedFields.length
    ? `<div style="background-color:#fff8e6;padding:14px 18px;margin:0 0 20px;border-left:3px solid #C5A278;">
         <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a1a;">Changed fields:</p>
         <ul style="margin:0;padding-left:18px;">
           ${changedFields.map(f => `<li style="font-size:13px;color:#555555;">${formatLabel(f)}</li>`).join('')}
         </ul>
       </div>`
    : `<p style="font-size:13px;color:#555555;margin:0 0 16px;">No field changes detected. Agent may have resubmitted without changes.</p>`

  const lockedNote = isLocked
    ? `<p style="font-size:13px;color:#C5A278;margin:0 0 16px;"><strong>Note:</strong> Transaction is locked. Manual update required.</p>`
    : ''

  const html = getEmailLayout(
    `<p style="margin:0 0 16px;font-size:14px;color:#555555;">
       A resubmission has been received for <strong style="color:#1a1a1a;">${txn.property_address}</strong>.
     </p>
     ${lockedNote}
     ${changedHtml}
     ${submissionData.notes ? `<p style="font-size:13px;color:#555555;margin:0 0 16px;"><strong>Agent notes:</strong> ${submissionData.notes}</p>` : ''}
     <p style="text-align:center;margin:24px 0 0;">
       <a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">
         View in Compliance Dashboard
       </a>
     </p>`,
    { title: 'Subsequent Compliance Resubmission', preheader: `Resubmission received for ${txn.property_address}` }
  )

  for (const email of recipients) {
    if (!email?.trim()) continue
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: [email.trim()],
        subject: `Compliance Resubmission - ${txn.property_address}`,
        html,
      })
    } catch (err) {
      console.error(`Failed to send subsequent notification to ${email}:`, err)
    }
  }
}
