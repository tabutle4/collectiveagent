import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { autoCascadeTransaction } from '@/lib/transactions/cascade'
import { feeCodeFromRepresenting } from '@/lib/transactions/feeCode'
import { createFlyerFromForm } from '@/lib/flyers/createFlyerFromForm'
import { normalizeAddressComponents, buildDisplayAddress, validateAddressComponents, normalizePropertyStats } from '@/lib/transactions/utils'
import { checkRequired, requiredFieldsError, UNDER_CONTRACT_RULES } from '@/lib/forms/requiredFields'
import { getEmailLayout } from '@/lib/email/layout'
import { buildFormAnswersHtml } from '@/lib/form-fields'
import { Resend } from 'resend'
import { normalizeAddressForStorage } from '@/lib/transactions/utils'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

async function sendNotifications(emails: string[], subject: string, html: string, identifier: string) {
  for (const email of emails) {
    if (!email?.trim()) continue
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: [email.trim()], subject: `${subject} - ${identifier}`, html })
    } catch (err) { console.error(`Failed to notify ${email}:`, err) }
  }
}

// POST /api/agent/forms/under-contract
// Creates a transaction (status pending), primary agent row, title + lender +
// cooperating agent contacts, an under_contract flyer, a submission record, and
// notifies the office. Mirrors the compliance/CDA route patterns.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  let agentId = auth.user.id
  const now = new Date().toISOString()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'

  try {
    const body = await request.json()
    const {
      agent_name, agent_email, agent_phone,
      property_address, street_address, unit, city, state, zip,
      sales_price, commission_rate, closing_date, mls_link,
      flyer_choice, team_name, division_name,
      representing, client_name, client_phone, client_email, lead_source,
      other_agent_name, other_agent_phone, other_agent_email,
      title_company, title_contact_name, title_phone, title_email,
      lender_company, lender_contact_name, lender_phone, lender_email,
      add_transaction_coordination, documents_uploaded_ack,
      bedrooms, bathrooms, garage, sqft,
      on_behalf_of_agent_id,
    } = body

    // Normalize the address once so it is stored consistently (Title Case,
    // standard abbreviations, collapsed whitespace).
    // Property stats live on the transaction, not the flyer.
    const txnStats = normalizePropertyStats({ bedrooms, bathrooms, garage, sqft })

    // Server side required fields. The browser hints on the form are easily
    // bypassed; this is the gate that holds.
    const missing = checkRequired(body, UNDER_CONTRACT_RULES)
    if (missing.length > 0) {
      return NextResponse.json({ error: requiredFieldsError(missing) }, { status: 400 })
    }

    // Structured address in, generated display string out. Reject malformed.
    let normalizedAddress: string
    let addrParts = { street_address: '', unit: '', city: '', state: '', zip: '' }
    if (street_address || city || zip) {
      addrParts = normalizeAddressComponents({ street_address, unit, city, state, zip })
      const problems = validateAddressComponents(addrParts)
      if (problems.length) {
        return NextResponse.json({ error: problems.join('. ') }, { status: 400 })
      }
      normalizedAddress = buildDisplayAddress(addrParts)
    } else {
      normalizedAddress = normalizeAddressForStorage(property_address)
    }

    // Office staff may submit on behalf of an agent. Verify server-side.
    const STAFF_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
    if (on_behalf_of_agent_id) {
      const submitterRole = String(auth.user.role || '').toLowerCase()
      if (!STAFF_ROLES.includes(submitterRole)) {
        return NextResponse.json({ error: 'Not permitted to submit on behalf of another agent' }, { status: 403 })
      }
      const { data: targetAgent } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', on_behalf_of_agent_id)
        .eq('is_licensed_agent', true)
        .maybeSingle()
      if (!targetAgent) {
        return NextResponse.json({ error: 'Selected agent not found' }, { status: 400 })
      }
      agentId = on_behalf_of_agent_id
    }

    // ── Required-field validation (server side) ──────────────────────────────
    const required: Record<string, any> = {
      'Agent name': agent_name, 'Agent email': agent_email, 'Agent phone': agent_phone,
      'Property address': normalizedAddress, 'Sales price': sales_price,
      'Commission rate': commission_rate, 'Closing date': closing_date, 'MLS link': mls_link,
      'Flyer choice': flyer_choice, 'Representation': representing,
      'Client name': client_name, 'Client phone': client_phone, 'Client email': client_email,
      'Lead source': lead_source, 'Other agent name': other_agent_name,
      'Other agent phone': other_agent_phone, 'Other agent email': other_agent_email,
      'Title company': title_company, 'Title contact name': title_contact_name,
      'Title company phone': title_phone, 'Title company email': title_email,
      'Lender company': lender_company, 'Lender contact name': lender_contact_name,
      'Lender phone': lender_phone, 'Lender email': lender_email,
    }
    for (const [label, val] of Object.entries(required)) {
      if (!val || String(val).trim() === '') {
        return NextResponse.json({ error: `${label} is required` }, { status: 400 })
      }
    }
    if (flyer_choice === 'team' && !team_name?.trim()) {
      return NextResponse.json({ error: 'Team name is required' }, { status: 400 })
    }
    if (flyer_choice === 'division' && !division_name?.trim()) {
      return NextResponse.json({ error: 'Division name is required' }, { status: 400 })
    }
    if (!documents_uploaded_ack) {
      return NextResponse.json({ error: 'Please confirm you have uploaded the contract documents' }, { status: 400 })
    }

    const isLease = representing === 'tenant' || representing === 'landlord'

    // ── Flyer division line from Q9 ──────────────────────────────────────────
    let flyerDivisionLine: string | null = null
    if (flyer_choice === 'houston') flyerDivisionLine = 'Houston'
    else if (flyer_choice === 'dallas') flyerDivisionLine = 'Dallas'
    else if (flyer_choice === 'team') flyerDivisionLine = team_name?.trim() || null
    else if (flyer_choice === 'division') flyerDivisionLine = division_name?.trim() || null

    // ── Load notification recipients from the forms row (set in the UI) ──────
    const { data: formRecord } = await supabaseAdmin
      .from('forms')
      .select('id, notification_emails, triggers_flyer, flyer_type')
      .eq('linked_form_type', 'under_contract')
      .eq('is_active', true)
      .maybeSingle()
    const notificationEmails: string[] = formRecord?.notification_emails || []

    // Commission rate is free text on this form (e.g. "3%" or "3000"). If it is a
    // plain dollar amount, store it in gross_commission; a percentage stays null
    // (the office sets the dollar figure at review). The raw value is kept in the
    // submission record either way.
    const commissionText = String(commission_rate || '').trim()
    const grossCommission = commissionText && !commissionText.includes('%')
      ? (parseFloat(commissionText.replace(/[^0-9.]/g, '')) || null)
      : null

    const salesPriceNum = sales_price ? (parseFloat(String(sales_price).replace(/[^0-9.]/g, '')) || null) : null

    // ── Create the transaction (matches the CDA route field mapping) ─────────
    const { data: newTxn, error: createErr } = await supabaseAdmin
      .from('transactions')
      .insert({
        property_address: normalizedAddress,
        street_address: addrParts.street_address || null,
        unit: addrParts.unit || null,
        bedrooms: txnStats.bedrooms,
        bathrooms: txnStats.bathrooms,
        garage: txnStats.garage,
        building_sqft: txnStats.building_sqft,
        city: addrParts.city || null,
        state: addrParts.state || null,
        zip: addrParts.zip || null,
        status: 'pending',
        transaction_type: feeCodeFromRepresenting(representing) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'),
        representing: representing || null,
        sales_price: isLease ? null : salesPriceNum,
        monthly_rent: isLease ? salesPriceNum : null,
        gross_commission: grossCommission,
        closing_date: isLease ? null : closing_date || null,
        move_in_date: isLease ? closing_date || null : null,
        mls_link: mls_link || null,
        client_name: client_name ? formatNameToTitleCase(String(client_name).trim()) : null,
        client_email: client_email || null,
        lead_source: lead_source || null,
        title_officer_phone: title_phone || null,
        title_officer_name: title_contact_name || null,
        title_company: title_company || null,
        title_company_email: title_email || null,
        flyer_division: flyerDivisionLine,
        submitted_by: agentId,
        updated_at: now,
      })
      .select('id')
      .single()

    if (createErr || !newTxn) {
      console.error('Failed to create transaction:', createErr)
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
    }
    const transactionId = newTxn.id

    // Primary agent row
    await supabaseAdmin.from('transaction_internal_agents').insert({
      transaction_id: transactionId, agent_id: agentId, agent_role: 'primary_agent', updated_at: now,
    })
    // Cascade if a commission basis already exists on the deal; otherwise the
    // row stays until a later entry point supplies the basis.
    await autoCascadeTransaction(transactionId)

    // ── Contacts: client, title, lender, cooperating (other) agent ───────────
    const clientContactType =
      representing === 'seller' ? 'seller'
      : representing === 'landlord' ? 'landlord'
      : representing === 'tenant' ? 'tenant'
      : 'buyer' // buyer + new_construction_buyer both map to buyer
    const contactRows = [
      {
        transaction_id: transactionId, contact_type: clientContactType,
        name: client_name || null, company: null,
        email: client_email || null, phone: client_phone || null,
      },
      {
        transaction_id: transactionId, contact_type: 'title_company',
        name: title_contact_name || null, company: title_company || null,
        email: title_email || null, phone: title_phone || null,
      },
      {
        transaction_id: transactionId, contact_type: 'lender',
        name: lender_contact_name || null, company: lender_company || null,
        email: lender_email || null, phone: lender_phone || null,
      },
      {
        transaction_id: transactionId, contact_type: 'cooperating_agent',
        name: other_agent_name || null, company: null,
        email: other_agent_email || null, phone: other_agent_phone || null,
      },
    ]
    await supabaseAdmin.from('transaction_contacts').insert(contactRows)

    // ── Flyer ────────────────────────────────────────────────────────────────
    // Whether this form makes a flyer, and which type, comes from the forms
    // table (triggers_flyer / flyer_type), not from hardcoded values here.
    await createFlyerFromForm({
      form: formRecord as any,
      transactionId,
      agentId,
      flyerDivision: flyerDivisionLine,
    })

    // ── Submission record ────────────────────────────────────────────────────
    const submissionData = {
      submission_mode: 'under_contract',
      agent_name, agent_email, agent_phone,
      property_address: normalizedAddress, sales_price, commission_rate, closing_date, mls_link,
      flyer_choice, team_name: team_name || null, division_name: division_name || null,
      representing, client_name, client_phone, client_email, lead_source,
      other_agent_name, other_agent_phone, other_agent_email,
      title_company, title_contact_name, title_phone, title_email,
      lender_company, lender_contact_name, lender_phone, lender_email,
      add_transaction_coordination: !!add_transaction_coordination,
      bedrooms: bedrooms || null, bathrooms: bathrooms || null, garage: garage || null, sqft: sqft || null,
    }
    await supabaseAdmin.from('agent_form_submissions').insert({
      form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now,
      status: 'submitted', transaction_id: transactionId, data: submissionData, updated_at: now,
    })

    // ── Office notification ──────────────────────────────────────────────────
    const tcLine = add_transaction_coordination
      ? '<p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Transaction Coordination:</strong> Requested</p>'
      : ''
    const notifyHtml = getEmailLayout(
      `<p style="margin:0 0 16px;font-size:14px;color:#555555;">A new contract has been submitted for <strong style="color:#1a1a1a;">${normalizedAddress}</strong>.</p>
       <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${agent_name}</p>
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Representing:</strong> ${representing}</p>
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Closing:</strong> ${closing_date || 'N/A'}</p>
         ${tcLine}
       </div>
       <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View in Admin</a></p>
       ${buildFormAnswersHtml(submissionData)}`,
      { title: 'New Contract Submitted', preheader: `Under contract: ${normalizedAddress}` }
    )
    await sendNotifications(notificationEmails, 'New Contract', notifyHtml, normalizedAddress)

    // ── Agent confirmation with flyer link ───────────────────────────────────
    // Deep link to this form's own flyer tab, not just whichever is newest.
    // Only when the form actually creates a flyer; otherwise the email and the
    // success screen would promise one that never exists.
    const flyerUrl = formRecord?.triggers_flyer ? `${appUrl}/agent/flyer/${transactionId}?type=under_contract` : null
    try {
      const flyerParagraphs = flyerUrl
        ? `<p style="margin:0 0 16px;font-size:14px;color:#555555;">To receive your Under Contract flyer, please upload a property photo.</p>
           <p style="text-align:center;margin:24px 0 0;"><a href="${flyerUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Upload Photo &amp; Get Your Flyer</a></p>`
        : ''
      await resend.emails.send({
        from: FROM_EMAIL, to: [agent_email], subject: `New Contract Received - ${normalizedAddress}`,
        html: getEmailLayout(
          `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Your new contract for <strong style="color:#1a1a1a;">${normalizedAddress}</strong> has been received and the transaction has been created.</p>
           ${flyerParagraphs}
           ${buildFormAnswersHtml(submissionData, 'What You Submitted')}`,
          { title: 'New Contract Received', preheader: `Contract received for ${normalizedAddress}` }
        ),
      })
    } catch (err) { console.error('Failed to send agent confirmation:', err) }

    return NextResponse.json({
      success: true,
      transaction_id: transactionId,
      flyer_url: flyerUrl,
      message: flyerUrl
        ? 'Your new contract has been received and the transaction has been created. Upload a property photo to get your Under Contract flyer.'
        : 'Your new contract has been received and the transaction has been created.',
    })
  } catch (err: any) {
    console.error('under-contract POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
