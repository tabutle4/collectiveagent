import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAgentInvoice } from '@/lib/payload/agentInvoice'
import { isInvoiceForTargetMonth } from '@/lib/payload/agentInvoiceList'
import { requireCronSecret } from '@/lib/api-auth'

// The loop is sequential over every eligible agent and now makes one more
// Payload round trip each, to read the new invoice back. Matching the app's
// convention on long crons (verify-bank-connections, verify-licenses and
// reconcile-payouts all use 300). A timeout mid-loop would leave some agents
// with next month's invoice and some silently without one.
export const maxDuration = 300

const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// isInvoiceForTargetMonth now lives in lib/payload/agentInvoiceList, unchanged.
// It is what prevents creating a duplicate invoice for the same month here, and
// apply-late-fees now uses the same function to refuse to charge any month but
// the one that just came due. Notably, we do NOT short-circuit because an
// unrelated month is unpaid — that was the bug that caused agents with unpaid
// April fees to miss their May invoices entirely.

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const supabase = createClient()

    // Read monthly fee from company_settings instead of hardcoding $50.
    // If you later add a per-agent override column on users, this is the
    // single place that needs to consult it.
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('standard_monthly_fee')
      .single()
    const monthlyFee = companySettings?.standard_monthly_fee ?? 50

    // Get all active agents with a Payload customer ID who are NOT fee waived,
    // and skip Referral Collective (No MLS) agents — they pay annual, not monthly.
    const { data: agents } = await supabase
      .from('users')
      .select(
        'id, payload_payee_id, first_name, preferred_first_name, last_name, preferred_last_name, mls_choice'
      )
      .eq('status', 'active')
      .eq('is_active', true)
      .eq('monthly_fee_waived', false)
      .not('payload_payee_id', 'is', null)

    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'No eligible agents', created: 0 })
    }

    const eligibleAgents = agents.filter(
      (a: any) => a.mls_choice !== 'Referral Collective (No MLS)'
    )

    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const monthName = nextMonth.toLocaleString('default', { month: 'long' })
    const year = nextMonth.getFullYear()
    const dueDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 5)
      .toISOString()
      .split('T')[0]

    const targetDescription = `${monthName} ${year} Monthly Brokerage Fee`

    let created = 0
    let skipped = 0
    const errors: string[] = []
    const unconfirmed: string[] = []

    for (const agent of eligibleAgents) {
      try {
        // Pull recent invoices for this customer. We pull more than 5 because
        // an agent with several outstanding past invoices could otherwise hide
        // the answer to "do they already have one for this exact month?"
        // We also do not filter by status — a paid invoice for the target month
        // means we should still not duplicate.
        const checkRes = await fetch(
          `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&limit=50`,
          { headers: { Authorization: plAuth() } }
        )
        const checkData = await checkRes.json()
        const alreadyExists = (checkData.values || []).some((inv: any) =>
          isInvoiceForTargetMonth(inv, monthName, year)
        )

        if (alreadyExists) {
          skipped++
          continue
        }

        // The monthly fee is the one agent invoice autopay is allowed to
        // collect, so this is the only caller that passes true.
        const result = await createAgentInvoice(
          new URLSearchParams({
            type: 'bill',
            due_date: dueDate,
            processing_id: process.env.PAYLOAD_PROCESSING_ID!,
            customer_id: agent.payload_payee_id,
            description: targetDescription,
            'items[0][type]': 'Monthly Fee',
            'items[0][description]': targetDescription,
            'items[0][amount]': monthlyFee.toString(),
            'items[0][entry_type]': 'charge',
          }),
          { autopayAllowed: true }
        )

        const agentName = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`

        if (!result.ok) {
          errors.push(`${agentName}: ${result.error?.message}`)
          continue
        }

        const data = result.invoice

        // The invoice exists and is payable either way, so this is reported
        // rather than treated as a failure. An unconfirmed flag on a monthly
        // fee means autopay may not collect it, and the agent gets the payment
        // link as usual.
        if (!result.autopayConfirmed) {
          unconfirmed.push(`${agentName} (${data?.id})`)
        }

        // Send payment link so Payload emails the agent
        await fetch('https://api.payload.com/payment_links/', {
          method: 'POST',
          headers: {
            Authorization: plAuth(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            invoice_id: data.id,
            customer_id: agent.payload_payee_id,
          }),
        })

        created++
      } catch (err: any) {
        errors.push(`${agent.preferred_first_name || agent.first_name}: ${err.message}`)
      }
    }

    console.log(
      `Monthly invoices: ${created} created, ${skipped} skipped, ${errors.length} errors, ${unconfirmed.length} with an unconfirmed autopay setting`
    )
    return NextResponse.json({
      success: true,
      created,
      skipped,
      target_month: `${monthName} ${year}`,
      fee_amount: monthlyFee,
      errors: errors.length ? errors : undefined,
      autopay_unconfirmed: unconfirmed.length ? unconfirmed : undefined,
    })
  } catch (error: any) {
    console.error('Create monthly invoices cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
