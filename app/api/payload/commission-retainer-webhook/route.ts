import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase, fetchAllRows } from '@/lib/supabase'
import { addressMatchKey } from '@/lib/transactions/utils'
import { Resend } from 'resend'
import { getEmailLayout, emailSection, emailButton } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Payload does not sign webhooks (no documented signature scheme), so this
// route is secured three ways instead:
//   1. A secret token in the registered URL, checked against
//      PAYLOAD_WEBHOOK_TOKEN (fail closed if the env var is missing).
//   2. The webhook body is never trusted for money data. The transaction is
//      re-fetched from Payload's API with the secret key, and only the
//      canonical amount / payment_link_id / attrs / customer are used.
//   3. Idempotency on checks_received.payload_transaction_id (partial unique
//      index), so a replayed or retried webhook can never duplicate a check.

// Normalize an attrs key for matching: lowercase, letters only.
// "Property Address" -> "propertyaddress", "realtor_name" -> "realtorname"
function attrKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z]/g, '')
}

// Read a custom field value out of the transaction's attrs by normalized key.
function readAttr(attrs: any, wanted: string): string {
  if (!attrs || typeof attrs !== 'object') return ''
  const target = attrKey(wanted)
  for (const [k, v] of Object.entries(attrs)) {
    if (attrKey(k) === target && typeof v === 'string') return v.trim()
  }
  return ''
}

// Map the retainer form's free-text Client Type to a transaction_type code.
// Helper text on the form says "Tenant, Buyer, or Seller"; handle common
// variants. Unknown or blank returns null so the transaction is created
// without a type and can be classified by hand.
function clientTypeToTransactionType(raw: string): string | null {
  const t = raw.toLowerCase()
  if (t.includes('tenant') || t.includes('rent') || t.includes('lease')) return 'tenant_non_apt_v2'
  if (t.includes('buy')) return 'buyer_v2'
  if (t.includes('sell')) return 'seller_v2'
  return null
}

// Match a submitted realtor name against active users, exact full-name match
// on either legal or preferred name (case-insensitive, collapsed spaces).
// Used by both the commission and retainer paths.
async function findAgentByName(realtorName: string): Promise<any | null> {
  if (!realtorName) return null
  const wanted = realtorName.toLowerCase().replace(/\s+/g, ' ').trim()
  const { data: users } = await supabase
    .from('users')
    .select('id, email, office_email, first_name, preferred_first_name, last_name, preferred_last_name, commission_plan, lease_commission_plan, office')
    .eq('is_active', true)
  return (users || []).find(u => {
    const legal = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
    const preferred = `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
    return wanted === legal || wanted === preferred
  }) || null
}

// Send the same agent notification the checks page sends, mirroring
// app/api/checks/notify-agent/route.ts (Resend + getEmailLayout, agent-facing).
async function sendCheckReceivedEmail(agent: {
  email: string | null
  office_email: string | null
  first_name: string | null
  preferred_first_name: string | null
  last_name: string | null
  preferred_last_name: string | null
}, address: string) {
  const agentEmail = agent.office_email || agent.email
  if (!agentEmail) return
  const agentName = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`

  const subject = `Check Received - ${address}`
  const htmlBody = getEmailLayout(
    `<p class="email-greeting">Hi ${agentName},</p>
    <p>A Payload payment for <strong>${address}</strong> was received and is being processed.</p>
    ${emailSection(
      'What Happens Next',
      `<p>Commission payments are processed within 10-14 business days from receiving completed compliance and check. This often happens faster, but the guarantee per your agent agreement is 30 days.</p>`
    )}
    ${emailButton('View My Checks', 'https://agent.collectiverealtyco.com/admin/checks')}
    ${emailButton('View Compliance Process', 'https://visit.collectiverealtyco.com/compliance')}
    <p style="font-size:13px;color:#888;">Questions? Reply to this email or contact transactions@collectiverealtyco.com</p>`,
    { title: 'Check Received', subtitle: address, preheader: `A payment for ${address} is being processed` }
  )

  const { error } = await resend.emails.send({
    from: 'Collective Realty Co. <tc@coachingbrokeragetools.com>',
    to: [agentEmail],
    replyTo: 'transactions@collectiverealtyco.com',
    subject,
    html: htmlBody,
  })
  if (error) console.error('Pay-link check notification failed:', error.message)
}

export async function POST(request: NextRequest) {
  // Token check, fail closed. The token lives only in the URL Payload was
  // given at registration and in the Vercel env.
  const expected = process.env.PAYLOAD_WEBHOOK_TOKEN
  const provided = request.nextUrl.searchParams.get('token')
  if (!expected || !provided || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    console.log('PAYLINK_WEBHOOK_RAW:', JSON.stringify(body))

    const trigger = body?.trigger
    const triggeredOn = body?.triggered_on
    if (triggeredOn?.object !== 'transaction' || !triggeredOn?.id) {
      return NextResponse.json({ received: true })
    }

    const isPaymentTrigger = trigger === 'processed' || trigger === 'payment'
    const isRejectTrigger = trigger === 'reject'
    if (!isPaymentTrigger && !isRejectTrigger) {
      return NextResponse.json({ received: true })
    }

    // Re-fetch the canonical transaction. Nothing from the webhook body is
    // trusted beyond the transaction id. payment_link_id is a hidden field
    // and must be requested explicitly; attrs carries the pay-link form
    // answers; customer is the nested payer account.
    const txnRes = await fetch(
      `https://api.payload.com/transactions/${triggeredOn.id}?fields[]=*&fields[]=payment_link_id&fields[]=attrs&fields[]=customer`,
      { headers: { Authorization: authHeader() } }
    )
    const txn = await txnRes.json()
    if (!txnRes.ok) {
      console.error('Pay-link webhook: transaction fetch failed:', txn)
      return NextResponse.json({ received: true })
    }
    console.log('PAYLINK_TXN_RAW:', JSON.stringify(txn))

    // Only pay-link transactions from the two configured links matter here.
    const { data: settings } = await supabase
      .from('company_settings')
      .select('payload_commission_link_id, payload_retainer_link_id, payload_retainer_fee')
      .limit(1)
      .maybeSingle()
    const commissionLinkId = settings?.payload_commission_link_id || null
    const retainerLinkId = settings?.payload_retainer_link_id || null
    const linkId = txn.payment_link_id || null
    const isCommission = !!commissionLinkId && linkId === commissionLinkId
    const isRetainer = !!retainerLinkId && linkId === retainerLinkId
    if (!isCommission && !isRetainer) {
      return NextResponse.json({ received: true })
    }

    // ACH bounce / chargeback: flag the existing check and stop counting it
    // as Pending Payload. Manual reconciliation from there.
    if (isRejectTrigger) {
      const today = new Date().toISOString().split('T')[0]
      const { data: existing } = await supabase
        .from('checks_received')
        .select('id, notes, status')
        .eq('payload_transaction_id', txn.id)
        .maybeSingle()
      if (existing && existing.status !== 'rejected') {
        await supabase
          .from('checks_received')
          .update({
            status: 'rejected',
            notes: `${existing.notes ? existing.notes + ' ' : ''}PAYLOAD REJECTED (payment returned) ${today}`.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        console.log('Pay-link check marked rejected:', existing.id)
      }
      return NextResponse.json({ received: true })
    }

    // Only act on fully processed payments. The canonical status is on the
    // re-fetched transaction, never the webhook body.
    if (txn.type !== 'payment' || txn.status !== 'processed') {
      console.log('Pay-link webhook: transaction not a processed payment', txn.id, txn.type, txn.status)
      return NextResponse.json({ received: true })
    }

    // Idempotency: a retried or replayed webhook must not duplicate a check.
    const { data: dupe } = await supabase
      .from('checks_received')
      .select('id')
      .eq('payload_transaction_id', txn.id)
      .maybeSingle()
    if (dupe) {
      console.log('Pay-link webhook: check already exists for', txn.id)
      return NextResponse.json({ received: true })
    }

    // Payer identity from the nested customer, with a direct fetch fallback.
    let payerName = ''
    let payerEmail = ''
    const customer = txn.customer
    if (customer && typeof customer === 'object') {
      payerName = customer.full_name || customer.name || ''
      payerEmail = customer.email || ''
    }
    if (!payerName && txn.customer_id) {
      try {
        const custRes = await fetch(`https://api.payload.com/customers/${txn.customer_id}`, {
          headers: { Authorization: authHeader() },
        })
        if (custRes.ok) {
          const cust = await custRes.json()
          payerName = cust.full_name || cust.name || ''
          payerEmail = cust.email || ''
        }
      } catch { /* best-effort */ }
    }

    // Canonical amount excludes the convenience fee the payer covers.
    const amount = parseFloat(txn.amount) || 0
    const paidDate = txn.processed_date || new Date().toISOString().split('T')[0]

    const baseCheck = {
      check_amount: amount,
      check_from: payerName || null,
      payment_method: 'payload',
      status: 'received',
      received_date: paidDate,
      crc_transferred: false,
      agents_paid: false,
      payload_transaction_id: txn.id,
      payload_payment_link_id: linkId,
    }

    // ── Commission link: match property address to a transaction ────────────
    if (isCommission) {
      const submittedAddress = readAttr(txn.attrs, 'Property Address')
      const key = addressMatchKey(submittedAddress)

      let matchedTxn: any = null
      if (key) {
        // fetchAllRows: the transactions table can exceed Supabase's 1000-row
        // page cap, and a bare select would silently miss older deals.
        const candidates = await fetchAllRows(
          'transactions',
          'id, property_address, submitted_by',
          { filters: [{ type: 'not', column: 'property_address', value: null }] }
        )
        matchedTxn = candidates.find(t => addressMatchKey(t.property_address) === key) || null
      }

      if (matchedTxn) {
        const { data: check, error } = await supabase
          .from('checks_received')
          .insert({
            ...baseCheck,
            transaction_id: matchedTxn.id,
            property_address: matchedTxn.property_address,
            notes: `Payload commission payment from ${payerName || 'unknown payer'}${payerEmail ? ` (${payerEmail})` : ''}`,
          })
          .select('id')
          .single()
        if (error) throw error
        console.log('Pay-link commission check created:', check.id, 'txn:', matchedTxn.id)

        // Best-effort: record the payer as a title contact on the deal.
        if (payerName || payerEmail) {
          try {
            await supabase.from('transaction_contacts').insert({
              transaction_id: matchedTxn.id,
              contact_type: 'title',
              name: payerName || null,
              company: null,
              email: payerEmail || null,
              phone: null,
            })
          } catch (err: any) {
            console.error('Pay-link contact insert failed:', err?.message || err)
          }
        }

        // Best-effort: notify the transaction's agent, same as the checks page.
        if (matchedTxn.submitted_by) {
          try {
            const { data: agent } = await supabase
              .from('users')
              .select('email, office_email, first_name, preferred_first_name, last_name, preferred_last_name')
              .eq('id', matchedTxn.submitted_by)
              .single()
            if (agent) await sendCheckReceivedEmail(agent, matchedTxn.property_address || submittedAddress)
          } catch (err: any) {
            console.error('Pay-link notify failed:', err?.message || err)
          }
        }
      } else {
        // No address match: standalone check so the money still shows in
        // No address match: create the transaction so the money has a home
        // right away. The form's Realtor Name picks the agent; if the name
        // matches an active agent the deal is created with them (plus their
        // TIA row and a notification). No name match: agent-less prospect to
        // assign by hand. If the insert fails, fall back to a standalone
        // check so the payment is never lost.
        const commissionRealtorName = readAttr(txn.attrs, 'Realtor Name')
        const commissionAgent: any = await findAgentByName(commissionRealtorName)

        let createdTxn: { id: string; property_address: string | null } | null = null
        try {
          const nowIso = new Date().toISOString()
          const { data: made, error: makeError } = await supabase
            .from('transactions')
            .insert({
              property_address: submittedAddress || `${payerName || 'Payload payment'} (Commission)`,
              status: 'prospect',
              compliance_status: 'not_requested',
              submitted_by: commissionAgent?.id ?? null,
              office_location: commissionAgent?.office ?? null,
              created_at: nowIso,
              updated_at: nowIso,
            })
            .select('id, property_address')
            .single()
          if (makeError) throw makeError
          createdTxn = made
        } catch (err: any) {
          console.error('Pay-link commission transaction create failed:', err?.message || err)
        }

        // Matched agent gets their TIA row, same shape as the retainer path's
        // primary insert. Type is unknown here (the commission form has no
        // client type), so side is null and the sale commission plan applies;
        // both settle when the type is set on the deal.
        if (createdTxn && commissionAgent) {
          try {
            const { error: tiaError } = await supabase
              .from('transaction_internal_agents')
              .insert({
                transaction_id: createdTxn.id,
                agent_id: commissionAgent.id,
                agent_role: 'primary_agent',
                side: null,
                commission_plan: commissionAgent.commission_plan || '',
                counts_toward_progress: true,
                units: 1,
                funding_source: 'crc',
                payment_status: 'pending',
                uses_canonical_math: true,
              })
            if (tiaError) console.error('Pay-link commission TIA insert failed:', tiaError.message)
          } catch (err: any) {
            console.error('Pay-link commission TIA block error:', err?.message || err)
          }
        }

        const { data: check, error } = await supabase
          .from('checks_received')
          .insert({
            ...baseCheck,
            transaction_id: createdTxn?.id || null,
            property_address: createdTxn?.property_address || submittedAddress || null,
            notes: createdTxn
              ? `Payload commission payment. Payer: ${payerName || 'unknown'}${payerEmail ? ` (${payerEmail})` : ''}.${commissionAgent ? ` Agent: ${commissionRealtorName}. New transaction created from this payment: set the transaction type.` : ` New transaction created from this payment: assign the agent and transaction type. Realtor submitted: ${commissionRealtorName || 'none'}.`}`
              : `Payload commission payment, no transaction match. Payer: ${payerName || 'unknown'}${payerEmail ? ` (${payerEmail})` : ''}. Submitted address: ${submittedAddress || 'none'}. Link to a transaction from the checks page.`,
          })
          .select('id')
          .single()
        if (error) throw error

        // Best-effort: record the payer as a title contact on the new deal.
        if (createdTxn && (payerName || payerEmail)) {
          try {
            await supabase.from('transaction_contacts').insert({
              transaction_id: createdTxn.id,
              contact_type: 'title',
              name: payerName || null,
              company: null,
              email: payerEmail || null,
              phone: null,
            })
          } catch (err: any) {
            console.error('Pay-link contact insert failed:', err?.message || err)
          }
        }

        // Best-effort: notify the matched agent, same as the matched-deal path.
        if (createdTxn && commissionAgent) {
          try {
            await sendCheckReceivedEmail(commissionAgent, createdTxn.property_address || submittedAddress)
          } catch (err: any) {
            console.error('Pay-link notify failed:', err?.message || err)
          }
        }
        console.log('Pay-link commission check created', createdTxn ? `with new txn ${createdTxn.id}:` : 'unmatched:', check.id)
      }
      return NextResponse.json({ received: true })
    }

    // ── Retainer link: match the realtor, create the transaction ────────────
    const realtorName = readAttr(txn.attrs, 'Realtor Name')
    const clientTypeRaw = readAttr(txn.attrs, 'Client Type')
    const transactionType = clientTypeToTransactionType(clientTypeRaw)

    // Match the named realtor against active users.
    const agentUser: any = await findAgentByName(realtorName)

    if (!agentUser) {
      // Realtor not matched: standalone check with everything needed to
      // finish it by hand. Money still counts in Pending Payload.
      const { data: check, error } = await supabase
        .from('checks_received')
        .insert({
          ...baseCheck,
          transaction_id: null,
          property_address: payerName ? `${payerName} (Retainer)` : 'Retainer',
          notes: `Payload retainer, no agent match. Realtor submitted: ${realtorName || 'none'}. Client type: ${clientTypeRaw || 'none'}. Payer: ${payerName || 'unknown'}${payerEmail ? ` (${payerEmail})` : ''}.`,
        })
        .select('id')
        .single()
      if (error) throw error
      console.log('Pay-link retainer check created unmatched:', check.id)
      return NextResponse.json({ received: true })
    }

    // Create the transaction, mirroring the POST /api/transactions flow:
    // insert, then auto-add the agent to transaction_internal_agents with
    // side/role/plan derived from the type code.
    const nowIso = new Date().toISOString()
    const { data: newTxn, error: txnError } = await supabase
      .from('transactions')
      .insert({
        property_address: payerName || 'Retainer client',
        client_name: payerName || null,
        transaction_type: transactionType,
        status: 'prospect',
        compliance_status: 'not_requested',
        submitted_by: agentUser.id,
        office_location: agentUser.office || null,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('id, property_address')
      .single()
    if (txnError) throw txnError

    // Role and side derive from the type code once, shared by the primary TIA
    // and the retainer row (the transaction page passes the agent row's own
    // role/side to add_retainer_row; mirror that here).
    const txnTypeCode = transactionType || ''
    const derivedIsListing = txnTypeCode.includes('landlord') || txnTypeCode.includes('seller')
    const derivedRole = derivedIsListing ? 'listing_agent' : 'primary_agent'
    const derivedSide =
      txnTypeCode.includes('landlord') ? 'landlord'
      : txnTypeCode.includes('seller') ? 'seller'
      : txnTypeCode.includes('tenant') ? 'tenant'
      : txnTypeCode.includes('buyer') ? 'buyer'
      : null

    try {
      const txnType = txnTypeCode
      const { data: pft } = await supabase
        .from('processing_fee_types')
        .select('is_lease, name')
        .eq('code', txnType)
        .maybeSingle()
      const isLease = pft?.is_lease ?? (
        txnType.includes('tenant') || txnType.includes('landlord') ||
        txnType.includes('apartment') || txnType.includes('lease')
      )
      const commissionPlan = isLease
        ? (agentUser.lease_commission_plan || agentUser.commission_plan || '')
        : (agentUser.commission_plan || '')
      const agentRole = derivedRole
      const side = derivedSide
      const countsToward = !isLease && (agentRole === 'primary_agent' || agentRole === 'listing_agent')

      const { error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .insert({
          transaction_id: newTxn.id,
          agent_id: agentUser.id,
          agent_role: agentRole,
          side,
          commission_plan: commissionPlan,
          counts_toward_progress: countsToward,
          units: 1,
          funding_source: 'crc',
          payment_status: 'pending',
          uses_canonical_math: true,
        })
      if (tiaError) console.error('Pay-link retainer TIA insert failed:', tiaError.message)
    } catch (err: any) {
      console.error('Pay-link retainer TIA block error:', err?.message || err)
    }

    // Retainer money row, mirroring the add_retainer_row action: agent gets
    // amount minus the office retainer fee (from company settings); all
    // commission fields zero. The fee is the house's cut.
    const retainerFee = parseFloat(String(settings?.payload_retainer_fee ?? 0)) || 0
    try {
      const amount1099 = Math.round((amount - retainerFee) * 100) / 100
      const { error: retainerError } = await supabase
        .from('transaction_internal_agents')
        .insert({
          transaction_id: newTxn.id,
          agent_id: agentUser.id,
          agent_role: derivedRole,
          side: derivedSide,
          installment_kind: 'retainer',
          agent_basis: amount,
          processing_fee: retainerFee,
          amount_1099_reportable: amount1099,
          agent_net: amount1099,
          payment_status: 'pending',
          split_percentage: 0,
          agent_gross: 0,
          brokerage_split: 0,
          coaching_fee: 0,
          team_lead_commission: 0,
          btsa_amount: 0,
          rebate_amount: 0,
          other_fees: 0,
          sales_volume: 0,
          units: 0,
          debts_deducted: 0,
          counts_toward_progress: false,
        })
      if (retainerError) console.error('Pay-link retainer row insert failed:', retainerError.message)
    } catch (err: any) {
      console.error('Pay-link retainer row block error:', err?.message || err)
    }

    const { data: check, error: checkError } = await supabase
      .from('checks_received')
      .insert({
        ...baseCheck,
        transaction_id: newTxn.id,
        property_address: newTxn.property_address,
        brokerage_amount: retainerFee,
        notes: `Payload retainer from ${payerName || 'unknown payer'}${payerEmail ? ` (${payerEmail})` : ''}. Client type: ${clientTypeRaw || 'not given'}.`,
      })
      .select('id')
      .single()
    if (checkError) throw checkError
    console.log('Pay-link retainer check created:', check.id, 'txn:', newTxn.id)

    // Best-effort: record the payer as the client contact.
    if (payerName || payerEmail) {
      try {
        await supabase.from('transaction_contacts').insert({
          transaction_id: newTxn.id,
          contact_type: 'client',
          name: payerName || null,
          company: null,
          email: payerEmail || null,
          phone: null,
        })
      } catch (err: any) {
        console.error('Pay-link contact insert failed:', err?.message || err)
      }
    }

    // Best-effort: notify the matched agent.
    try {
      await sendCheckReceivedEmail(agentUser, newTxn.property_address)
    } catch (err: any) {
      console.error('Pay-link notify failed:', err?.message || err)
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Pay-link webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
