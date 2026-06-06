import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Parse a monthly fee invoice's description to figure out which calendar month
// it covers, and return the end-of-month date for that period. Falls back to
// null if no recognizable month/year is found so the caller can decide what to
// do (we keep the existing paid_through value rather than overwrite it wrong).
function endOfBilledMonthFromInvoice(data: any): string | null {
  const MONTHS = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december',
  ]
  const haystack = (
    (data.description || '') + ' ' +
    (data.items || []).map((i: any) => i.description || '').join(' ')
  ).toLowerCase()

  // Find every "<month> <year>" pair and keep the LATEST one. A single invoice
  // can bundle more than one month (for example a prepayment whose line items
  // are "June 2026 Monthly Brokerage Fee" and "July 2026 Monthly Brokerage
  // Fee"), and paid_through must advance to the last month covered, not the
  // first. The old logic stopped at the first month it saw and left those
  // agents short a month.
  const re = new RegExp(`\\b(${MONTHS.join('|')})\\s+(20\\d{2})\\b`, 'g')
  let best: { year: number; monthIdx: number } | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(haystack)) !== null) {
    const monthIdx = MONTHS.indexOf(m[1])
    const year = parseInt(m[2], 10)
    if (!best || year > best.year || (year === best.year && monthIdx > best.monthIdx)) {
      best = { year, monthIdx }
    }
  }

  // Fallback for descriptions that mention a month and a year but not adjacent
  // (e.g. a prorated onboarding line "...remaining in May"): take the first
  // month found and the first year found, matching the previous behavior.
  if (!best) {
    let monthIdx = -1
    for (let i = 0; i < MONTHS.length; i++) {
      if (haystack.includes(MONTHS[i])) { monthIdx = i; break }
    }
    const yearMatch = haystack.match(/\b(20\d{2})\b/)
    if (monthIdx === -1 || !yearMatch) return null
    best = { year: parseInt(yearMatch[1], 10), monthIdx }
  }

  // day 0 of next month == last day of this month
  return new Date(best.year, best.monthIdx + 1, 0).toISOString().split('T')[0]
}

// Pick the later of two YYYY-MM-DD date strings. Used to make sure
// monthly_fee_paid_through never rolls backward when a stale invoice
// (e.g., a late March payment) lands after a later month was already paid.
function laterDate(existing: string | null | undefined, candidate: string): string {
  if (!existing) return candidate
  return existing >= candidate ? existing : candidate
}

// Resolve a Payload transaction id to its underlying invoice (with line items).
// A payment webhook only carries a transaction id; the invoice it paid is
// linked through the transaction's allocations or its payment_link. We expand
// both, read the invoice id from whichever is present, then fetch the full
// invoice (and its items) which is what every downstream fee check needs.
// Heavy logging is intentional so a single real test payment reveals the exact
// shapes in the Vercel logs if any field does not line up.
async function resolveInvoiceFromTransaction(txnId: string): Promise<any | null> {
  try {
    const txnRes = await fetch(
      `https://api.payload.com/transactions/${txnId}?fields[]=*&fields[]=allocations&fields[]=payment_link`,
      { headers: { Authorization: authHeader() } }
    )
    const txn = await txnRes.json()
    if (!txnRes.ok) {
      console.error('Payload transaction fetch failed:', txn)
      return null
    }
    console.log('PAYLOAD_TXN_RAW:', JSON.stringify(txn))

    const allocations = Array.isArray(txn.allocations) ? txn.allocations : []
    const invoiceId =
      txn.invoice_id ||
      allocations.find((a: any) => a?.invoice_id)?.invoice_id ||
      txn.payment_link?.invoice_id ||
      null

    if (!invoiceId) {
      console.log('Payload webhook: transaction has no linked invoice', txnId)
      return null
    }

    const invRes = await fetch(
      `https://api.payload.com/invoices/${invoiceId}?fields[]=*&fields[]=items`,
      { headers: { Authorization: authHeader() } }
    )
    const invoice = await invRes.json()
    if (!invRes.ok) {
      console.error('Payload invoice fetch failed:', invoice)
      return null
    }
    console.log('PAYLOAD_INVOICE_RAW:', JSON.stringify(invoice))
    return invoice
  } catch (err) {
    console.error('resolveInvoiceFromTransaction error:', err)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Log the raw event so a real test payment reveals the exact shape in the
    // Vercel logs if anything does not line up.
    console.log('PAYLOAD_WEBHOOK_RAW:', JSON.stringify(body))

    // Payload sends webhook triggers in the shape:
    //   { object: 'webhook_trigger', trigger: 'payment',
    //     triggered_on: { id: 'txn_...', object: 'transaction', value: 'processed' } }
    // The trigger only carries a transaction id, so resolve it to the invoice
    // (and its line items) before applying any fee logic. 'payment' covers
    // manually authorized payments; 'automatic_payment' covers autopay.
    const trigger = body?.trigger
    const triggeredOn = body?.triggered_on
    const isPaymentTrigger = trigger === 'payment' || trigger === 'automatic_payment' || trigger === 'processed'

    // Handle agent bank activation status changes
    if (trigger === 'payment_activation:status' && triggeredOn?.id) {
      const activationStatus = triggeredOn.value
      if (activationStatus === 'accepted') {
        const activationRes = await fetch(`https://api.payload.com/payment_activations/${triggeredOn.id}`, {
          headers: { Authorization: authHeader() },
        })
        const activation = activationRes.ok ? await activationRes.json() : null
        const paymentMethodId = activation?.payment_method_id || null

        // Match agent by payload_activation_id
        const { data: agent } = await supabase
          .from('users')
          .select('id, email')
          .eq('payload_activation_id', triggeredOn.id)
          .maybeSingle()

        if (agent) {
          await supabase
            .from('users')
            .update({
              bank_connected: true,
              bank_connected_at: new Date().toISOString(),
              payload_payment_method_id: paymentMethodId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', agent.id)
          console.log('Agent bank connected:', agent.email, 'payment_method_id:', paymentMethodId)
        } else {
          console.log('No agent found for activation:', triggeredOn.id)
        }
      }
      return NextResponse.json({ received: true })
    }

    if (!isPaymentTrigger || triggeredOn?.object !== 'transaction' || !triggeredOn?.id) {
      return NextResponse.json({ received: true })
    }

    const invoice = await resolveInvoiceFromTransaction(triggeredOn.id)
    if (!invoice) {
      console.log('Payload webhook: no invoice resolved for transaction', triggeredOn.id)
      return NextResponse.json({ received: true })
    }

    // Only act once the invoice is actually settled. amount_due <= 0 is the
    // robust signal regardless of how Payload labels the status string.
    if (Number(invoice.amount_due ?? 0) > 0) {
      console.log(
        'Payload webhook: invoice not fully paid yet',
        invoice.id,
        'amount_due',
        invoice.amount_due
      )
      return NextResponse.json({ received: true })
    }

    if (!invoice.customer_id) {
      return NextResponse.json({ received: true })
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, onboarding_fee_paid, monthly_fee_paid_through')
      .eq('payload_payee_id', invoice.customer_id)
      .single()

    if (!user) {
      // Not an agent/user payment. Check if this is a PM tenant rent payment
      // by matching the Payload invoice id against tenant_invoices.
      if (invoice.id) {
        const { data: tenantInvoice } = await supabase
          .from('tenant_invoices')
          .select(`
            id, tenant_id, landlord_id, property_id, lease_id,
            rent_amount, deposit_amount, total_amount,
            period_month, period_year, status,
            managed_properties(id, pm_agreement_id)
          `)
          .eq('payload_invoice_id', invoice.id)
          .maybeSingle()

        if (tenantInvoice && tenantInvoice.status !== 'paid') {
          const paidAt = invoice.paid_timestamp
            ? String(invoice.paid_timestamp).split('T')[0]
            : new Date().toISOString().split('T')[0]

          // Mark invoice paid
          await supabase
            .from('tenant_invoices')
            .update({
              status: 'paid',
              paid_at: new Date(paidAt + 'T12:00:00').toISOString(),
              paid_amount: tenantInvoice.total_amount,
              payment_method: 'payload',
              updated_at: new Date().toISOString(),
            })
            .eq('id', tenantInvoice.id)

          console.log('PM tenant invoice marked paid:', tenantInvoice.id)

          // Fetch agreement for mgmt fee calculation
          let managementFeePct = 10
          let managementFeeFlat: number | null = null
          let referringAgentId: string | null = null
          let agentFeePct = 0
          const property = tenantInvoice.managed_properties as any
          if (property?.pm_agreement_id) {
            const { data: agreement } = await supabase
              .from('pm_agreements')
              .select(`
                management_fee_pct, management_fee_flat,
                referring_agent_id, agent_fee_pct
              `)
              .eq('id', property.pm_agreement_id)
              .single()
            if (agreement) {
              managementFeePct = agreement.management_fee_pct
              managementFeeFlat = agreement.management_fee_flat
              referringAgentId = agreement.referring_agent_id
              agentFeePct = agreement.agent_fee_pct || 0
            }
          }

          const rentAmount = Number(tenantInvoice.rent_amount || 0)
          const managementFee = managementFeeFlat != null
            ? Number(managementFeeFlat)
            : rentAmount * (managementFeePct / 100)

          // Attach any pending deductions for this property
          const { data: pendingDeductions } = await supabase
            .from('landlord_disbursement_deductions')
            .select('id, amount')
            .eq('property_id', tenantInvoice.property_id)
            .is('disbursement_id', null)

          const pendingDeductionsTotal = (pendingDeductions || []).reduce(
            (sum: number, d: any) => sum + Number(d.amount || 0), 0
          )

          const netAmount = rentAmount - managementFee - pendingDeductionsTotal

          // Create pending disbursement
          const { data: createdDisb } = await supabase
            .from('landlord_disbursements')
            .insert({
              landlord_id: tenantInvoice.landlord_id,
              tenant_invoice_id: tenantInvoice.id,
              property_id: tenantInvoice.property_id,
              lease_id: tenantInvoice.lease_id,
              gross_rent: rentAmount,
              management_fee: managementFee,
              deposit_amount: 0,
              net_amount: netAmount,
              amount_1099_reportable: netAmount,
              period_month: tenantInvoice.period_month,
              period_year: tenantInvoice.period_year,
              payment_status: 'pending',
            })
            .select('id')
            .single()

          if (createdDisb) {
            console.log('PM disbursement created for landlord:', tenantInvoice.landlord_id)

            // Attach pending deductions
            if (pendingDeductions && pendingDeductions.length > 0) {
              await supabase
                .from('landlord_disbursement_deductions')
                .update({
                  disbursement_id: createdDisb.id,
                  applied_at: new Date().toISOString(),
                })
                .in('id', pendingDeductions.map((d: any) => d.id))
            }

            // Mark the corresponding landlord invoice paid and create fee payouts
            const { data: landlordInv } = await supabase
              .from('pm_landlord_invoices')
              .select('id')
              .eq('landlord_id', tenantInvoice.landlord_id)
              .eq('property_id', tenantInvoice.property_id)
              .eq('period_month', tenantInvoice.period_month)
              .eq('period_year', tenantInvoice.period_year)
              .neq('status', 'paid')
              .maybeSingle()

            let landlordInvoiceId: string | null = null
            if (landlordInv) {
              landlordInvoiceId = landlordInv.id
              await supabase
                .from('pm_landlord_invoices')
                .update({
                  status: 'paid',
                  paid_at: new Date().toISOString(),
                  paid_amount: managementFee,
                  payment_method: 'disbursement',
                  updated_at: new Date().toISOString(),
                })
                .eq('id', landlordInv.id)
            }

            // Create pm_fee_payouts
            if (managementFee > 0) {
              const agentAmount = rentAmount * (agentFeePct / 100)
              const brokerageAmount = managementFee - agentAmount

              if (referringAgentId && agentAmount > 0) {
                const { data: agentRow } = await supabase
                  .from('users')
                  .select('preferred_first_name, first_name, preferred_last_name, last_name')
                  .eq('id', referringAgentId)
                  .single()
                const agentName = agentRow
                  ? `${agentRow.preferred_first_name || agentRow.first_name} ${agentRow.preferred_last_name || agentRow.last_name}`.trim()
                  : 'Unknown Agent'
                await supabase.from('pm_fee_payouts').insert({
                  disbursement_id: createdDisb.id,
                  landlord_invoice_id: landlordInvoiceId,
                  payee_type: 'agent',
                  payee_id: referringAgentId,
                  payee_name: agentName,
                  amount: Math.round(agentAmount * 100) / 100,
                  amount_1099_reportable: Math.round(agentAmount * 100) / 100,
                  payment_status: 'pending',
                })
              }

              if (brokerageAmount > 0) {
                await supabase.from('pm_fee_payouts').insert({
                  disbursement_id: createdDisb.id,
                  landlord_invoice_id: landlordInvoiceId,
                  payee_type: 'brokerage',
                  payee_id: null,
                  payee_name: 'Collective Realty Co.',
                  amount: Math.round(brokerageAmount * 100) / 100,
                  payment_status: 'pending',
                })
              }
            }
          }
        }
      }
      return NextResponse.json({ received: true })
    }

    const paidDate = invoice.paid_timestamp
      ? String(invoice.paid_timestamp).split('T')[0].split(' ')[0]
      : new Date().toISOString().split('T')[0]
    const items = Array.isArray(invoice.items) ? invoice.items : []

    // Onboarding fee
    const hasOnboardingItem = items.some((item: any) => item.type === 'Onboarding Fee')
    if (hasOnboardingItem && !user.onboarding_fee_paid) {
      await supabase
        .from('users')
        .update({ onboarding_fee_paid: true, onboarding_fee_paid_date: paidDate })
        .eq('id', user.id)
      console.log('Marked onboarding fee paid for user:', user.id)
    }

    // Monthly fee (covers both manual payment and autopay). Use the month/year
    // parsed from the invoice, not the date the payment landed; fall back to
    // end-of-current-month. laterDate makes sure we never roll the value back.
    const hasMonthlyItem = items.some(
      (item: any) => item.type === 'Monthly Fee' || item.type === 'Monthly Fee (Prorated)'
    )
    if (hasMonthlyItem) {
      const billedMonthEnd = endOfBilledMonthFromInvoice(invoice)
      const fallback = (() => {
        const now = new Date()
        return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
      })()
      const newPaidThrough = laterDate(user.monthly_fee_paid_through, billedMonthEnd ?? fallback)
      await supabase
        .from('users')
        .update({ monthly_fee_paid_through: newPaidThrough })
        .eq('id', user.id)
      console.log(
        'Updated monthly fee paid through for user:',
        user.id,
        'to',
        newPaidThrough,
        billedMonthEnd ? '(from invoice month)' : '(fallback)'
      )
    }

    // Custom invoice: resolve matching agent_debts. One invoice can bundle
    // multiple custom fees, each its own debt row carrying this invoice id in
    // notes, so resolve every match. The previous .single() threw on 2+ rows
    // and left all of them unresolved.
    const hasCustomItem = items.some(
      (item: any) =>
        item.type !== 'Onboarding Fee' &&
        item.type !== 'Monthly Fee' &&
        item.type !== 'Monthly Fee (Prorated)' &&
        item.type !== 'Late Fee'
    )
    if (hasCustomItem && invoice.id) {
      const { data: debts } = await supabase
        .from('agent_debts')
        .select('id, amount_owed')
        .eq('agent_id', user.id)
        .eq('status', 'outstanding')
        .ilike('notes', `%${invoice.id}%`)

      if (debts && debts.length > 0) {
        for (const debt of debts) {
          await supabase
            .from('agent_debts')
            .update({
              status: 'resolved',
              amount_paid: debt.amount_owed,
              date_resolved: paidDate,
            })
            .eq('id', debt.id)
          console.log('Marked agent debt resolved:', debt.id)
        }
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
