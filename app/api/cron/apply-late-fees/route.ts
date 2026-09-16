import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireCronSecret } from '@/lib/api-auth'

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
        // Find unpaid monthly invoices for this agent. limit=20 so we catch
        // agents who are behind multiple months — each owed month should get
        // its own late fee.
        const res = await fetch(
          `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&status=unpaid&limit=20`,
          { headers: { Authorization: plAuth() } }
        )
        const data = await res.json()
        const unpaidMonthly = (data.values || []).filter(
          (inv: any) =>
            inv.items?.some((item: any) => item.type === 'Monthly Fee') &&
            // Skip if late fee already applied
            !inv.items?.some((item: any) => item.type === 'Late Fee')
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

    console.log(`Late fees: ${applied} applied, ${skipped} skipped, ${errors.length} errors`)

    return NextResponse.json({
      success: true,
      applied,
      skipped,
      fee_amount: lateFeeAmount,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Apply late fees cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
