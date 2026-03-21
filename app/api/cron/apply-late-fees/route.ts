import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient()

    // Get all active non-division agents with a Payload customer ID
    const { data: agents } = await supabase
      .from('users')
      .select(
        'id, payload_payee_id, first_name, preferred_first_name, last_name, preferred_last_name'
      )
      .eq('status', 'active')
      .is('division', null)
      .not('payload_payee_id', 'is', null)

    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'No eligible agents', applied: 0 })
    }

    let applied = 0
    let skipped = 0
    const errors: string[] = []

    for (const agent of agents) {
      try {
        // Find unpaid monthly invoices for this agent
        const res = await fetch(
          `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&status=unpaid&limit=5`,
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

        // Add $25 late fee line item to each unpaid monthly invoice
        for (const inv of unpaidMonthly) {
          const updateRes = await fetch(`https://api.payload.com/invoices/${inv.id}`, {
            method: 'PUT',
            headers: {
              Authorization: plAuth(),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              'items[0][type]': 'Late Fee',
              'items[0][description]': 'Late fee — payment not received by the 5th',
              'items[0][amount]': '25',
              'items[0][entry_type]': 'charge',
            }),
          })

          if (updateRes.ok) {
            applied++
            // Resend the invoice so agent is notified of the late fee
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
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Apply late fees cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
