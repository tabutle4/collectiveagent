import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout } from '@/lib/email/layout'
import { Resend } from 'resend'
import { normalizeAddressForStorage, toTitleCase } from '@/lib/transactions/utils'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

async function findTransactionByAddress(agentId: string, propertyAddress: string) {
  const { data: tiaRows } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('transaction_id')
    .eq('agent_id', agentId)
  if (!tiaRows?.length) return null
  const ids = tiaRows.map((r: any) => r.transaction_id)
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status')
    .ilike('property_address', `%${propertyAddress.trim()}%`)
    .in('id', ids)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data || null
}

async function sendNotifications(emails: string[], subject: string, html: string, identifier: string) {
  for (const email of emails) {
    if (!email?.trim()) continue
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: [email.trim()], subject: `${subject} - ${identifier}`, html })
    } catch (err) { console.error(`Failed to notify ${email}:`, err) }
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const transactionId = searchParams.get('transaction_id')
  const mode = searchParams.get('mode')
  const onBehalfOfAgentId = searchParams.get('on_behalf_of_agent_id')
  // Office staff may look up an agent's transactions when filing on their behalf.
  // Verify staff server-side; otherwise fall back to the caller's own id.
  const STAFF_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
  const lookupAgentId =
    onBehalfOfAgentId && STAFF_ROLES.includes(String(auth.user.role || '').toLowerCase())
      ? onBehalfOfAgentId
      : auth.user.id
  try {
    let txn: any = null
    if (transactionId) {
      const { data } = await supabaseAdmin.from('transactions')
        .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division')
        .eq('id', transactionId).single()
      txn = data
    } else if (address?.trim()) {
      const { data: tiaRows } = await supabaseAdmin.from('transaction_internal_agents').select('transaction_id').eq('agent_id', lookupAgentId)
      if (tiaRows?.length) {
        const ids = tiaRows.map((r: any) => r.transaction_id)
        const { data } = await supabaseAdmin.from('transactions')
          .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division')
          .ilike('property_address', `%${address.trim()}%`).in('id', ids).order('created_at', { ascending: false }).limit(5)
        txn = data?.[0] || null
      }
    }
    if (!txn) return NextResponse.json({ transaction: null, last_submission: null })
    let lastSubmission: any = null
    if (mode === 'subsequent') {
      const { data: lastSub } = await supabaseAdmin.from('agent_form_submissions')
        .select('id, data, submitted_at').eq('transaction_id', txn.id).eq('agent_id', lookupAgentId)
        .order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      lastSubmission = lastSub || null
    }
    return NextResponse.json({ transaction: txn, last_submission: lastSubmission })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { submission_mode, on_behalf_of_agent_id } = body
    if (!submission_mode) return NextResponse.json({ error: 'submission_mode is required' }, { status: 400 })

    // Office staff may submit on behalf of an agent. Verify the submitter is
    // staff server-side before honoring the selected agent (never trust the client).
    const STAFF_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
    let agentId = auth.user.id
    let agentEmail = auth.user.email
    let agentName = `${auth.user.first_name} ${auth.user.last_name}`
    if (on_behalf_of_agent_id) {
      const submitterRole = String(auth.user.role || '').toLowerCase()
      if (!STAFF_ROLES.includes(submitterRole)) {
        return NextResponse.json({ error: 'Not permitted to submit on behalf of another agent' }, { status: 403 })
      }
      // Confirm the target is a real licensed agent
      const { data: targetAgent } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name')
        .eq('id', on_behalf_of_agent_id)
        .eq('is_licensed_agent', true)
        .maybeSingle()
      if (!targetAgent) {
        return NextResponse.json({ error: 'Selected agent not found' }, { status: 400 })
      }
      agentId = on_behalf_of_agent_id
      agentEmail = targetAgent.email || auth.user.email
      agentName = `${targetAgent.preferred_first_name || targetAgent.first_name || ''} ${targetAgent.preferred_last_name || targetAgent.last_name || ''}`.trim() || agentName
    }
    const now = new Date().toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const { data: formRecord } = await supabaseAdmin.from('forms').select('id, name, notification_emails')
      .eq('linked_form_type', 'compliance_cda').eq('is_active', true).maybeSingle()
    const notificationEmails: string[] = formRecord?.notification_emails || []

    // ── RETAINER ─────────────────────────────────────────────────────────────
    if (submission_mode === 'retainer') {
      const { client_name, retainer_transaction_type, retainer_amount, docs_confirmed } = body
      if (!client_name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
      if (!retainer_transaction_type) return NextResponse.json({ error: 'Transaction type is required' }, { status: 400 })
      if (!retainer_amount || parseFloat(retainer_amount) <= 0) return NextResponse.json({ error: 'Retainer amount is required' }, { status: 400 })
      if (!docs_confirmed) return NextResponse.json({ error: 'You must confirm all required documents are signed and uploaded' }, { status: 400 })
      const amount = parseFloat(retainer_amount)
      const limits: Record<string, [number, number]> = {
        residential_rental: [250, 500], residential_buyer: [750, 1000], commercial_rental: [750, 1000],
      }
      const [min, max] = limits[retainer_transaction_type] || [0, 0]
      if (amount < min || amount > max) return NextResponse.json({ error: `Retainer amount must be between $${min} and $${max} for this transaction type` }, { status: 400 })
      const isLease = retainer_transaction_type !== 'residential_buyer'

      // Check for existing retainer transactions for this agent with a similar client name.
      // confirm_new_deal=true means agent already reviewed the matches and confirmed this is a new deal.
      const { confirm_new_deal } = body
      if (!confirm_new_deal) {
        const { data: existingTiaRows } = await supabaseAdmin
          .from('transaction_internal_agents')
          .select('transaction_id')
          .eq('agent_id', agentId)
          .eq('installment_kind', 'retainer')

        if (existingTiaRows?.length) {
          const existingIds = existingTiaRows.map((r: any) => r.transaction_id)
          const { data: matchingTxns } = await supabaseAdmin
            .from('transactions')
            .select('id, client_name, property_address, created_at, status')
            .in('id', existingIds)
            .ilike('client_name', `%${client_name.trim().split(' ')[0]}%`)
            .eq('status', 'prospect')
          if (matchingTxns?.length) {
            return NextResponse.json({
              success: false,
              duplicate_check: true,
              matches: matchingTxns.map((t: any) => ({
                id: t.id,
                client_name: t.client_name || t.property_address,
                created_at: t.created_at,
              })),
            })
          }
        }
      }

      const { data: newTxn, error: createErr } = await supabaseAdmin.from('transactions')
        .insert({ property_address: formatNameToTitleCase(client_name.trim()), client_name: formatNameToTitleCase(client_name.trim()), status: 'prospect', transaction_type: isLease ? 'lease' : 'sale', submitted_by: agentId, updated_at: now })
        .select('id').single()
      if (createErr || !newTxn) { console.error('Failed to create retainer transaction:', createErr); return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 }) }
      const transactionId = newTxn.id
      await supabaseAdmin.from('transaction_internal_agents').insert({
        transaction_id: transactionId, agent_id: agentId, agent_role: 'primary_agent',
        installment_kind: 'retainer', agent_basis: amount, processing_fee: 45,
        amount_1099_reportable: Math.round((amount - 45) * 100) / 100,
        agent_net: Math.round((amount - 45) * 100) / 100,
        payment_status: 'pending', split_percentage: 0, agent_gross: 0, brokerage_split: 0,
        coaching_fee: 0, team_lead_commission: 0, btsa_amount: 0, rebate_amount: 0,
        other_fees: 0, sales_volume: 0, units: 0, debts_deducted: 0, counts_toward_progress: false, updated_at: now,
      })
      const submissionData = { submission_mode: 'retainer', client_name, retainer_transaction_type, retainer_amount: amount, docs_confirmed }
      const { data: submission } = await supabaseAdmin.from('agent_form_submissions')
        .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: submissionData, updated_at: now })
        .select('id').single()
      const typeLabel: Record<string, string> = { residential_rental: 'Residential Rental', residential_buyer: 'Residential Buyer', commercial_rental: 'Commercial Rental' }
      const notifyHtml = getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:#555555;">A retainer submission has been received.</p>
         <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${agentName}</p>
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Client:</strong> ${client_name}</p>
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Type:</strong> ${typeLabel[retainer_transaction_type] || retainer_transaction_type}</p>
           <p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Amount:</strong> $${amount.toFixed(2)} (agent net $${(amount - 45).toFixed(2)} after $45 processing fee)</p>
         </div>
         <p style="font-size:13px;color:#555555;margin:0 0 16px;">Agent confirmed all required documents are signed and uploaded to BoldTrail. Please confirm payment received and process payout.</p>
         <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/transactions/${transactionId}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View Transaction</a></p>`,
        { title: 'New Retainer Submission', preheader: `Retainer for ${client_name}` }
      )
      await sendNotifications(notificationEmails, 'Retainer Submission', notifyHtml, client_name)
      return NextResponse.json({ success: true, transaction_id: transactionId, submission_id: submission?.id || null, message: 'Retainer submission received. The office will confirm payment and process your payout within 48-72 hours of funds clearing and documents being approved.' })
    }

    // ── FIND TRANSACTION (compliance + subsequent) ────────────────────────────
    const { property_address, transaction_id: clientTransactionId } = body
    if (!property_address?.trim() && !clientTransactionId) return NextResponse.json({ error: 'Property address is required' }, { status: 400 })
    let txn: any = null
    if (clientTransactionId) {
      const { data } = await supabaseAdmin.from('transactions').select('id, property_address, is_locked, compliance_status, transaction_type, representing, status').eq('id', clientTransactionId).single()
      txn = data
    } else {
      txn = await findTransactionByAddress(agentId, property_address)
    }

    // ── SUBSEQUENT ───────────────────────────────────────────────────────────
    if (submission_mode === 'subsequent') {
      if (!txn) return NextResponse.json({ error: 'No transaction found for that address. Please check and try again.' }, { status: 404 })
      const { last_submission_id, notes, ...formFields } = body
      let previousData: Record<string, any> = {}
      if (last_submission_id) {
        const { data: prevSub } = await supabaseAdmin.from('agent_form_submissions').select('data').eq('id', last_submission_id).single()
        previousData = prevSub?.data || {}
      }
      const skipKeys = new Set(['submission_mode', 'property_address', 'transaction_id', 'last_submission_id', 'notes'])
      const changedFields: string[] = []
      for (const [key, value] of Object.entries(formFields)) {
        if (skipKeys.has(key)) continue
        if (JSON.stringify(previousData[key]) !== JSON.stringify(value)) changedFields.push(key)
      }
      const submissionData = { ...formFields, notes: notes || null, changed_fields: changedFields, submission_mode: 'subsequent' }
      const { data: submission } = await supabaseAdmin.from('agent_form_submissions')
        .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: txn.id, data: submissionData, updated_at: now })
        .select('id').single()
      if (!txn.is_locked && changedFields.length > 0) {
        // Only write the fields that actually changed plus the compliance status fields
        const isLease = (formFields.representing || txn.representing) === 'tenant' ||
                        (formFields.representing || txn.representing) === 'landlord'
        const fieldMap: Record<string, any> = {
          representing:          formFields.representing || null,
          tenant_transaction_type: formFields.tenant_transaction_type || null,
          lease_term:            formFields.lease_term_months ? parseInt(formFields.lease_term_months) : null,
          closing_date:          isLease ? null : formFields.closing_or_movein_date || null,
          move_in_date:          isLease ? formFields.closing_or_movein_date || null : null,
          acceptance_date:       formFields.acceptance_date || null,
          loan_type:             formFields.loan_type || null,
          sales_price:           formFields.total_sales_rent_price ? parseFloat(formFields.total_sales_rent_price) : null,
          monthly_rent:          isLease && formFields.total_sales_rent_price ? parseFloat(formFields.total_sales_rent_price) : null,
          gross_commission:      formFields.commission_basis_price ? parseFloat(formFields.commission_basis_price) : null,
          bonus_amount:          formFields.bonus_btsa_amount ? parseFloat(formFields.bonus_btsa_amount) : 0,
          has_btsa:              !!(formFields.bonus_btsa_amount && parseFloat(formFields.bonus_btsa_amount) > 0),
          btsa_amount:           formFields.bonus_btsa_amount ? parseFloat(formFields.bonus_btsa_amount) : 0,
          rebate_amount:         formFields.rebate_amount ? parseFloat(formFields.rebate_amount) : 0,
          internal_referral:     formFields.internal_referral || false,
          internal_referral_fee: formFields.internal_referral_fee ? parseFloat(formFields.internal_referral_fee) : 0,
          external_referral:     formFields.external_referral || false,
          external_referral_fee: formFields.external_referral_fee ? parseFloat(formFields.external_referral_fee) : 0,
          brokerage_referral:    formFields.brokerage_referral || false,
          brokerage_referral_fee: formFields.brokerage_referral_fee ? parseFloat(formFields.brokerage_referral_fee) : 0,
        }
        // Keys that map from form field name to transaction column name
        const formToColumn: Record<string, string> = {
          lease_term_months:        'lease_term',
          closing_or_movein_date:   isLease ? 'move_in_date' : 'closing_date',
          total_sales_rent_price:   isLease ? 'monthly_rent' : 'sales_price',
          commission_basis_price:   'gross_commission',
          bonus_btsa_amount:        'bonus_amount',
        }
        // Build partial update: only include columns whose form field changed
        const partialUpdate: Record<string, any> = {
          compliance_status:        'submitted',
          compliance_submitted_at:  now,
          compliance_submitted_by:  agentId,
          updated_at:               now,
        }
        for (const changedKey of changedFields) {
          const col = formToColumn[changedKey] || changedKey
          if (col in fieldMap) partialUpdate[col] = fieldMap[col]
          // has_btsa and btsa_amount follow bonus_btsa_amount
          if (changedKey === 'bonus_btsa_amount') {
            partialUpdate.has_btsa = fieldMap.has_btsa
            partialUpdate.btsa_amount = fieldMap.btsa_amount
          }
          // closing_date and move_in_date are paired
          if (changedKey === 'closing_or_movein_date') {
            partialUpdate.closing_date = fieldMap.closing_date
            partialUpdate.move_in_date = fieldMap.move_in_date
          }
          // monthly_rent and sales_price are paired
          if (changedKey === 'total_sales_rent_price') {
            partialUpdate.sales_price = fieldMap.sales_price
            partialUpdate.monthly_rent = fieldMap.monthly_rent
          }
        }
        await supabaseAdmin.from('transactions').update(partialUpdate).eq('id', txn.id)
      }
      const formatLabel = (k: string) => k.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      const changedHtml = changedFields.length
        ? `<div style="background:#fff8e6;padding:14px 18px;margin:0 0 20px;border-left:3px solid #C5A278;"><p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a1a;">Changed fields:</p><ul style="margin:0;padding-left:18px;">${changedFields.map(f => `<li style="font-size:13px;color:#555;">${formatLabel(f)}</li>`).join('')}</ul></div>`
        : '<p style="font-size:13px;color:#555;margin:0 0 16px;">No field changes detected.</p>'
      const lockedNote = txn.is_locked ? '<p style="font-size:13px;color:#C5A278;margin:0 0 16px;"><strong>Note:</strong> Transaction is locked. Manual update required.</p>' : ''
      const notifyHtml = getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Resubmission received for <strong style="color:#1a1a1a;">${txn.property_address}</strong>.</p>
         ${lockedNote}${changedHtml}
         ${notes ? `<p style="font-size:13px;color:#555;margin:0 0 16px;"><strong>Agent notes:</strong> ${notes}</p>` : ''}
         <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View in Compliance Dashboard</a></p>`,
        { title: 'Subsequent Compliance Resubmission', preheader: `Resubmission for ${txn.property_address}` }
      )
      await sendNotifications(notificationEmails, 'Compliance Resubmission', notifyHtml, txn.property_address)
      return NextResponse.json({
        success: true, locked: txn.is_locked, submission_id: submission?.id || null, changed_fields: changedFields,
        message: txn.is_locked ? 'Your resubmission has been received. Because this transaction has been reviewed by the office, any updates will be applied manually. No action is needed from you.' : 'Resubmission received. The office has been notified.',
      })
    }

    // ── COMPLIANCE ───────────────────────────────────────────────────────────
    const { team_or_office, unit, in_matrix, mls_link, client_name, client_email, client_phone, lead_source,
      closing_or_movein_date, acceptance_date, representing, tenant_transaction_type, lease_term_months,
      referred_client_type, commission_basis_price, commission_rate, commission_rate_type,
      total_sales_rent_price, bonus_btsa_amount, additional_compensation, rebate_amount,
      internal_referral, internal_referral_fee, external_referral, external_referral_fee,
      brokerage_referral, brokerage_referral_fee, title_officer_name, title_company,
      title_company_email, title_phone, loan_type, expedite_acknowledged, bedrooms, bathrooms, garage, sqft,
      flyer_display_type, flyer_division, flyer_team_name, additional_notes } = body

    if (!expedite_acknowledged) return NextResponse.json({ error: 'You must acknowledge the expedite policy' }, { status: 400 })
    if (!acceptance_date) return NextResponse.json({ error: 'Acceptance date is required' }, { status: 400 })
    if (!closing_or_movein_date) return NextResponse.json({ error: 'Closing or move-in date is required' }, { status: 400 })

    const { data: agentProfile } = await supabaseAdmin.from('users').select('office').eq('id', agentId).single()
    const isLease = representing === 'tenant' || representing === 'landlord'
    // Flyer type: for referred-out, base it on the type of client referred; otherwise on representation.
    const flyerIsLease = representing === 'referred_out'
      ? (referred_client_type === 'tenant' || referred_client_type === 'landlord')
      : isLease
    const flyerType = flyerIsLease ? 'just_leased' : 'just_sold'
    let flyerDisplayLine: string | null = null
    if (flyer_display_type === 'office') flyerDisplayLine = agentProfile?.office || null
    else if (flyer_display_type === 'team') flyerDisplayLine = flyer_team_name || null
    else if (flyer_display_type === 'division') flyerDisplayLine = flyer_division || null

    const submissionData = {
      submission_mode: 'compliance', property_address: property_address || txn?.property_address,
      team_or_office, unit: unit || null, in_matrix, mls_link, client_name, client_email, client_phone: client_phone || null,
      lead_source, closing_or_movein_date, acceptance_date: acceptance_date || null, representing,
      tenant_transaction_type: tenant_transaction_type || null, lease_term_months: lease_term_months || null,
      referred_client_type: referred_client_type || null, commission_basis_price, commission_rate,
      commission_rate_type, total_sales_rent_price, bonus_btsa_amount: bonus_btsa_amount || 0,
      additional_compensation: additional_compensation || [], rebate_amount: rebate_amount || 0,
      internal_referral: internal_referral || false, internal_referral_fee: internal_referral_fee || null,
      external_referral: external_referral || false, external_referral_fee: external_referral_fee || null,
      brokerage_referral: brokerage_referral || false, brokerage_referral_fee: brokerage_referral_fee || null,
      title_officer_name, title_company, title_company_email, loan_type,
      bedrooms: bedrooms || null, bathrooms: bathrooms || null, garage: garage || null, sqft: sqft || null,
      flyer_display_type, flyer_display_line: flyerDisplayLine, additional_notes: additional_notes || null,
    }

    let transactionId: string
    const txnFields = {
      representing, tenant_transaction_type: tenant_transaction_type || null,
      lease_term: lease_term_months ? parseInt(lease_term_months) : null,
      closing_date: isLease ? null : closing_or_movein_date || null,
      move_in_date: isLease ? closing_or_movein_date || null : null,
      acceptance_date: acceptance_date || null,
      mls_link: mls_link || null, client_name: client_name ? formatNameToTitleCase(String(client_name).trim()) : null, client_email: client_email || null,
      lead_source: lead_source || null, loan_type: loan_type || null,
      sales_price: total_sales_rent_price ? parseFloat(total_sales_rent_price) : null,
      monthly_rent: isLease && total_sales_rent_price ? parseFloat(total_sales_rent_price) : null,
      gross_commission: commission_basis_price ? parseFloat(commission_basis_price) : null,
      bonus_amount: bonus_btsa_amount ? parseFloat(bonus_btsa_amount) : 0,
      has_btsa: !!(bonus_btsa_amount && parseFloat(bonus_btsa_amount) > 0),
      btsa_amount: bonus_btsa_amount ? parseFloat(bonus_btsa_amount) : 0,
      rebate_amount: rebate_amount ? parseFloat(rebate_amount) : 0,
      internal_referral: internal_referral || false, internal_referral_fee: internal_referral_fee ? parseFloat(internal_referral_fee) : 0,
      external_referral: external_referral || false, external_referral_fee: external_referral_fee ? parseFloat(external_referral_fee) : 0,
      brokerage_referral: brokerage_referral || false, brokerage_referral_fee: brokerage_referral_fee ? parseFloat(brokerage_referral_fee) : 0,
      title_officer_name: title_officer_name ? formatNameToTitleCase(String(title_officer_name).trim()) : null,
      title_company: title_company ? toTitleCase(String(title_company).trim()) : null,
      title_company_email: title_company_email || null, flyer_division: flyerDisplayLine,
      compliance_status: 'submitted', compliance_submitted_at: now, compliance_submitted_by: agentId, updated_at: now,
    }

    if (!txn) {
      const { data: newTxn, error: createErr } = await supabaseAdmin.from('transactions')
        .insert({ property_address: normalizeAddressForStorage(property_address), status: 'pending', submitted_by: agentId, transaction_type: isLease ? 'lease' : 'sale', ...txnFields })
        .select('id').single()
      if (createErr || !newTxn) { console.error('Failed to create transaction:', createErr); return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 }) }
      transactionId = newTxn.id
      await supabaseAdmin.from('transaction_internal_agents').insert({ transaction_id: transactionId, agent_id: agentId, agent_role: 'primary_agent', updated_at: now })
    } else {
      transactionId = txn.id
      if (txn.is_locked) {
        await supabaseAdmin.from('agent_form_submissions').insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: { ...submissionData, locked_transaction: true }, updated_at: now })
        const notifyHtml = getEmailLayout(`<p style="font-size:14px;color:#555;">Compliance submission for <strong>${txn.property_address}</strong> - transaction is locked. Manual review required.</p>`, { title: 'Locked Transaction - Compliance Submission', preheader: `Locked: ${txn.property_address}` })
        await sendNotifications(notificationEmails, 'Compliance Submission (Locked)', notifyHtml, txn.property_address)
        return NextResponse.json({ success: true, transaction_id: transactionId, locked: true, message: 'Your compliance request has been received. Because this transaction has been reviewed by the office, any updates will be applied manually. No action is needed from you.' })
      }
      await supabaseAdmin.from('transactions').update(txnFields).eq('id', transactionId)
    }

    // ── Contacts: upsert client + title for both new and existing transactions ─
    // Client type derives from representation; title from the title fields.
    const clientContactType =
      representing === 'seller' ? 'seller'
      : representing === 'landlord' ? 'landlord'
      : representing === 'tenant' ? 'tenant'
      : representing === 'referred_out' ? null
      : 'buyer'
    async function upsertContact(contactType: string, fields: { name: string | null; company: string | null; email: string | null; phone: string | null }) {
      if (!fields.name && !fields.company && !fields.email && !fields.phone) return
      const { data: existing } = await supabaseAdmin
        .from('transaction_contacts')
        .select('id')
        .eq('transaction_id', transactionId)
        .eq('contact_type', contactType)
        .maybeSingle()
      if (existing) {
        await supabaseAdmin.from('transaction_contacts')
          .update({ name: fields.name, company: fields.company, email: fields.email, phone: fields.phone, updated_at: now })
          .eq('id', existing.id)
      } else {
        await supabaseAdmin.from('transaction_contacts')
          .insert({ transaction_id: transactionId, contact_type: contactType, name: fields.name, company: fields.company, email: fields.email, phone: fields.phone })
      }
    }
    if (clientContactType) {
      await upsertContact(clientContactType, { name: client_name || null, company: null, email: client_email || null, phone: client_phone || null })
    }
    await upsertContact('title_company', { name: title_officer_name || null, company: title_company || null, email: title_company_email || null, phone: title_phone || null })

    const { data: submission } = await supabaseAdmin.from('agent_form_submissions')
      .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: submissionData, updated_at: now })
      .select('id').single()
    await supabaseAdmin.from('transaction_flyers').insert({ transaction_id: transactionId, flyer_type: flyerType, status: 'requested', requested_by: agentId, flyer_division: flyerDisplayLine, bedrooms: bedrooms || null, bathrooms: bathrooms || null, garage: garage || null, sqft: sqft || null, updated_at: now })

    const notifyHtml = getEmailLayout(
      `<p style="margin:0 0 16px;font-size:14px;color:#555555;">New compliance request for <strong style="color:#1a1a1a;">${submissionData.property_address}</strong>.</p>
       <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${agentName}</p>
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Closing/Move-in:</strong> ${closing_or_movein_date || 'N/A'}</p>
         <p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Representing:</strong> ${representing || 'N/A'}</p>
       </div>
       <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View in Compliance Dashboard</a></p>`,
      { title: 'New Compliance Request', preheader: `Compliance for ${submissionData.property_address}` }
    )
    await sendNotifications(notificationEmails, 'Compliance & CDA Request', notifyHtml, submissionData.property_address || '')
    const flyerUrl = `${appUrl}/agent/flyer/${transactionId}`
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: [agentEmail], subject: `Compliance Request Received - ${submissionData.property_address}`,
        html: getEmailLayout(
          `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Your compliance review and CDA request for <strong style="color:#1a1a1a;">${submissionData.property_address}</strong> has been received. Our team will review your documents and follow up shortly.</p>
           <p style="margin:0 0 16px;font-size:14px;color:#555555;">To receive your Just ${flyerIsLease ? 'Leased' : 'Sold'} flyer, please upload a property photo.</p>
           <p style="text-align:center;margin:24px 0 0;"><a href="${flyerUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Upload Photo &amp; Get Your Flyer</a></p>`,
          { title: 'Compliance Request Received', preheader: `Request received for ${submissionData.property_address}` }
        ),
      })
    } catch (err) { console.error('Failed to send agent confirmation:', err) }

    return NextResponse.json({ success: true, transaction_id: transactionId, submission_id: submission?.id || null, flyer_url: flyerUrl, message: 'Compliance request submitted successfully.' })
  } catch (err: any) {
    console.error('compliance-cda POST error:', err)
    return NextResponse.json({ error: err.message || 'Failed to submit' }, { status: 500 })
  }
}
