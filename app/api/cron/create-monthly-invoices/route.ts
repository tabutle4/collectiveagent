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

    // Get all active agents with a Payload customer ID who are NOT fee waived
    const { data: agents } = await supabase
      .from('users')
      .select(
        'id, payload_payee_id, first_name, preferred_first_name, last_name, preferred_last_name'
      )
      .eq('status', 'active')
      .eq('monthly_fee_waived', false)
      .not('payload_payee_id', 'is', null)

    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'No eligible agents', created: 0 })
    }

    const now = new Date()
    const monthName = now.toLocaleString('default', { month: 'long' })
    const year = now.getFullYear()
    const dueDate = new Date(now.getFullYear(), now.getMonth(), 5).toISOString().split('T')[0]

    let created = 0
    let skipped = 0
    const errors: string[] = []

    for (const agent of agents) {
      try {
        // Check if they already have an unpaid monthly invoice this month
        const checkRes = await fetch(
          `https://api.payload.com/invoices/?customer_id=${agent.payload_payee_id}&status=unpaid&limit=5`,
          { headers: { Authorization: plAuth() } }
        )
        const checkData = await checkRes.json()
        const existingMonthly = (checkData.values || []).some((inv: any) =>
          inv.items?.some((item: any) => item.type === 'Monthly Fee')
        )

        if (existingMonthly) {
          skipped++
          continue
        }

        // Create the invoice
        const res = await fetch('https://api.payload.com/invoices/', {
          method: 'POST',
          headers: {
            Authorization: plAuth(),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            type: 'bill',
            due_date: dueDate,
            processing_id: process.env.PAYLOAD_PROCESSING_ID!,
            customer_id: agent.payload_payee_id,
            description: `${monthName} ${year} Monthly Brokerage Fee`,
            'items[0][type]': 'Monthly Fee',
            'items[0][description]': `${monthName} ${year} Monthly Brokerage Fee`,
            'items[0][amount]': '50',
            'items[0][entry_type]': 'charge',
          }),
        })

        const data = await res.json()
        if (!res.ok) {
          errors.push(
            `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}: ${data.message}`
          )
          continue
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

    console.log(`Monthly invoices: ${created} created, ${skipped} skipped, ${errors.length} errors`)
    return NextResponse.json({
      success: true,
      created,
      skipped,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Create monthly invoices cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
