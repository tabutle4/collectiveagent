import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCronSecret } from '@/lib/api-auth'
import {
  isInvoiceForTargetMonth,
  isMonthlyFeeInvoice,
  hasLateFeeLine,
} from '@/lib/payload/agentInvoiceList'

const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const supabase = createClient()

    // Read late fee amount from company_settings instead of hardcoding $25.
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('standard_late_fee')
      .single()
    const lateFeeAmount = companySettings?.standard_late_fee ?? 25

    // The month this run is allowed to touch, and nothing else.
    //
    // This cron runs on the 6th, the morning after the 5th that
    // create-monthly-invoices set as the due date, so "now" is always inside
    // the month that just came due. Derived the same way send-monthly-fee-
    // reminders derives the month it reminds about, so the 5th and the 6th
    // always talk about the same invoice.
    const now = new Date()
    const monthName = now.toLocaleString('default', { month: 'long' })
    const year = now.getFullYear()

    // Eligibility mirrors create-monthly-invoices: active, licensed, has a Payload
    // customer, not fee-waived. Division-based agents are caught by
    // monthly_fee_waived=true (every division member has fee waived), so we
    // do not need a separate division filter. The previous .is('division', null)
    // filter was redundant given the waiver check.
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
      return NextResponse.json({ success: true, message: 'No eligible agents', applied: 0 })
    }

    // Skip Referral Collective (No MLS) — RC agents pay annual, not monthly fees.
    const eligibleAgents = agents.filter(
      (a: any) => a.mls_choice !== 'Referral Collective (No MLS)'
    )

    let applied = 0
    let skipped = 0
    const errors: string[] = []

    for (const agent of eligibleAgents) {
      try {
        // Find this month's unpaid monthly invoice for this agent.
        //
        // limit=20 because an agent who is behind several months has several
        // open invoices, and this month's has to be reachable past them. It is
        // no longer a licence to charge all of them: see the month test below.
        //
        // fields[]=*&fields[]=items asks for the default attributes plus the
        // nested line items. Payload returns items on a list response anyway,
        // which is how late fees have been applied all along, but this run now
        // also reads amount_due, so the request says what it needs rather than
        // relying on the default set staying as it is.
        // https://docs.payload.com/apis/api-design/
        const res = await fetch(
          `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&status=unpaid&limit=20&fields[]=*&fields[]=items`,
          { headers: { Authorization: plAuth() } }
        )
        const data = await res.json()
        const unpaidMonthly = (data.values || []).filter(
          (inv: any) =>
            // THIS MONTH ONLY. Before this guard the filter had no month test
            // at all and the comment above it read "each owed month should get
            // its own late fee", so every unpaid monthly invoice an agent still
            // carried was charged $25 on the 6th and re-emailed a payment link.
            //
            // That was survivable only because an invoice whose line item type
            // had been dropped was invisible. Fixing the matching without this
            // guard would have reached back and charged September, and every
            // earlier month that was skipped for the same reason, all at once.
            //
            // Ruled by Tara, 17 September 2026: an agent who is behind more
            // than one month is charged one late fee, for the current month.
            // Older unpaid months are collected, but never re-penalised.
            isInvoiceForTargetMonth(inv, monthName, year) &&
            // The whole-invoice test, not just "has a monthly fee line". A join
            // invoice carries 'Onboarding Fee' alongside a prorated monthly fee
            // and must never take a late fee; isMonthlyFeeInvoice refuses it
            // because the onboarding line is neither a monthly fee nor a late
            // fee. Matches by description as well as type, so an invoice whose
            // type Payload dropped is no longer silently skipped.
            isMonthlyFeeInvoice(inv) &&
            // Nothing owing, nothing late. Payload documents amount_due as the
            // readonly "Remaining amount due".
            // https://docs.payload.com/apis/object-reference/invoices/
            Number(inv?.amount_due ?? 0) > 0 &&
            // Skip if late fee already applied
            !hasLateFeeLine(inv)
        )

        if (!unpaidMonthly.length) {
          skipped++
          continue
        }

        // Add a Late Fee line item to each unpaid monthly invoice by POSTing
        // to /line_items/ with the invoice_id reference. This is the Payload-
        // documented way to append a line item; PUT /invoices/{id} would
        // replace the items array and wipe out the Monthly Fee charge.
        for (const inv of unpaidMonthly) {
          const updateRes = await fetch('https://api.payload.com/line_items/', {
            method: 'POST',
            headers: {
              Authorization: plAuth(),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              invoice_id: inv.id,
              type: 'Late Fee',
              description: 'Late fee: payment not received by the 5th',
              amount: String(lateFeeAmount),
              entry_type: 'charge',
            }),
          })

          if (updateRes.ok) {
            applied++
            // Resend the invoice so the agent is notified of the new balance.
            await fetch('https://api.payload.com/payment_links/', {
              method: 'POST',
              headers: {
                Authorization: plAuth(),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                invoice_id: inv.id,
                customer_id: agent.payload_payee_id,
              }),
            })
          } else {
            const errData = await updateRes.json()
            errors.push(
              `${agent.preferred_first_name || agent.first_name} (inv ${inv.id}): ${errData.message}`
            )
          }
        }
      } catch (err: any) {
        errors.push(`${agent.preferred_first_name || agent.first_name}: ${err.message}`)
      }
    }

    console.log(
      `Late fees for ${monthName} ${year}: ${applied} applied, ${skipped} skipped, ${errors.length} errors`
    )

    return NextResponse.json({
      success: true,
      applied,
      skipped,
      target_month: `${monthName} ${year}`,
      fee_amount: lateFeeAmount,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Apply late fees cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
