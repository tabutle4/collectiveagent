import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const plAuth = () => 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Returns true if the invoice's description (or first item's description) is for
// the target month and year. This is what prevents creating a duplicate invoice
// for the same month. Notably, we do NOT short-circuit because an unrelated month
// is unpaid — that was the bug that caused agents with unpaid April fees to miss
// their May invoices entirely.
function isInvoiceForTargetMonth(inv: any, monthName: string, year: number): boolean {
  const haystack = (
    (inv.description || '') + ' ' +
    (inv.items || []).map((i: any) => i.description || '').join(' ')
  ).toLowerCase()
  return haystack.includes(monthName.toLowerCase()) && haystack.includes(String(year))
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
            description: targetDescription,
            'items[0][type]': 'Monthly Fee',
            'items[0][description]': targetDescription,
            'items[0][amount]': monthlyFee.toString(),
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
      target_month: `${monthName} ${year}`,
      fee_amount: monthlyFee,
      errors: errors.length ? errors : undefined,
    })
  } catch (error: any) {
    console.error('Create monthly invoices cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
