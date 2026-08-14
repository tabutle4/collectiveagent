import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailSection, emailButton } from '@/lib/email/layout'
import { deriveComplianceForTransactions, complianceEmailLine, complianceSidesHtml, complianceActionHtml } from '@/lib/compliance/derive'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { check_id } = await request.json()

    if (!check_id) {
      return NextResponse.json({ error: 'check_id required' }, { status: 400 })
    }

    // Fetch the check with its linked transaction and agent
    const { data: check, error: checkError } = await supabase
      .from('checks_received')
      .select(
        `
        id, property_address, check_amount, received_date, cleared_date,
        compliance_complete_date, notes, transaction_id,
        transactions (
          id, property_address, submitted_by,
          users!transactions_submitted_by_fkey (
            id, first_name, last_name, preferred_first_name, preferred_last_name,
            email, office_email
          )
        )
      `
      )
      .eq('id', check_id)
      .single()

    if (checkError || !check) {
      return NextResponse.json({ error: 'Check not found' }, { status: 404 })
    }

    // Get the agent from the linked transaction
    const transaction = (check as any).transactions
    const agent = transaction?.users

    if (!agent) {
      return NextResponse.json(
        { error: 'No agent linked to this check. Link a transaction first.' },
        { status: 400 }
      )
    }

    const agentEmail = agent.office_email || agent.email
    const agentName = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
    const address = check.property_address || transaction?.property_address || 'Unknown Property'

    // Determine the expected clear date to show in email
    // Use cleared_date if set, otherwise compliance_complete_date, otherwise received_date
    const dateToShow = check.cleared_date || check.compliance_complete_date || check.received_date
    const formattedDate = dateToShow
      ? new Date(dateToShow).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null

    // Deal-level compliance, from the same helper the payouts report uses, so
    // the email cannot tell an agent the file is clear while the report says
    // otherwise.
    const derived = check.transaction_id
      ? await deriveComplianceForTransactions([check.transaction_id])
      : {}
    const derivedForTxn = check.transaction_id ? derived[check.transaction_id] : undefined
    // A standalone check has no transaction, so there is no file whose
    // compliance could be outstanding. Saying nothing is the only honest
    // option: the default sentence would send the agent chasing paperwork
    // that does not exist, which is the same error in the other direction as
    // telling them a file is clear when it is not.
    const complianceLine = check.transaction_id ? complianceEmailLine(derivedForTxn) : ''
    const actionHtml = check.transaction_id ? complianceActionHtml(derivedForTxn) : ''
    const sidesHtml = complianceSidesHtml(derivedForTxn)

    const subject = `Check Received - ${address}`

    const htmlBody = getEmailLayout(
      `<p class="email-greeting">Hi ${agentName},</p>
      <p>Your check for <strong>${address}</strong> is being processed.${formattedDate ? ` The date on the check is <strong>${formattedDate}</strong>, which is the date it is expected to clear.` : ''}</p>
      ${emailSection(
        'What Happens Next',
        `${sidesHtml}${complianceLine ? `<p>${complianceLine}</p>` : ''}
        <p>Commission payments are processed within 10-14 business days from receiving completed compliance and check. This often happens faster, but the guarantee per your agent agreement is 30 days.</p>
        ${actionHtml}`
      )}
      ${emailButton('View My Checks', 'https://agent.collectiverealtyco.com/admin/checks')}
      ${emailButton('View Compliance Process', 'https://visit.collectiverealtyco.com/compliance')}
      <p style="font-size:13px;color:#888;">Questions? Reply to this email or contact transactions@collectiverealtyco.com</p>`,
      { title: 'Check Received', subtitle: address, preheader: `Your check for ${address} is being processed` }
    )

    const { error: emailError } = await resend.emails.send({
      from: 'Collective Realty Co. <tc@coachingbrokeragetools.com>',
      to: [agentEmail],
      replyTo: 'transactions@collectiverealtyco.com',
      subject,
      html: htmlBody,
    })

    if (emailError) throw new Error(emailError.message)

    return NextResponse.json({ success: true, sent_to: agentEmail })
  } catch (err: any) {
    console.error('Notify agent error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}