import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Verify this is called by Vercel cron or an admin
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient()
    const plAuth = 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')
    const processingId = process.env.PAYLOAD_PROCESSING_ID

    let synced = 0
    let monthlyUpdated = 0

    // Fetch all users with payload_payee_id
    const { data: users } = await supabase
      .from('users')
      .select('id, payload_payee_id, onboarding_fee_paid, monthly_fee_paid_through')
      .not('payload_payee_id', 'is', null)

    if (!users?.length) {
      return NextResponse.json({ success: true, message: 'No users with Payload IDs', synced: 0 })
    }

    const payeeIds = users.map(u => u.payload_payee_id)

    // Fetch paid invoices from Payload
    const invoicesRes = await fetch(
      `https://api.payload.com/invoices/?processing_id=${processingId}&status=paid&limit=100`,
      { headers: { 'Authorization': plAuth } }
    )
    const invoicesData = await invoicesRes.json()
    const paidInvoices = invoicesData.values || []

    // Fetch processed billing charges from Payload
    const chargesRes = await fetch(
      `https://api.payload.com/billing_charges/?processing_id=${processingId}&status=processed&limit=100`,
      { headers: { 'Authorization': plAuth } }
    )
    const chargesData = await chargesRes.json()
    const paidCharges = chargesData.values || []

    // Process paid invoices — mark onboarding fee paid
    for (const invoice of paidInvoices) {
      if (!invoice.customer_id) continue
      const user = users.find(u => u.payload_payee_id === invoice.customer_id)
      if (!user || user.onboarding_fee_paid) continue

      await supabase.from('users').update({
        onboarding_fee_paid: true,
        onboarding_fee_paid_date: invoice.paid_at?.split('T')[0] || new Date().toISOString().split('T')[0],
      }).eq('id', user.id)

      synced++
    }

    // Process paid billing charges — update monthly fee paid through
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    for (const charge of paidCharges) {
      if (!charge.customer_id) continue
      const user = users.find(u => u.payload_payee_id === charge.customer_id)
      if (!user) continue

      // Only update if not already paid through this month
      if (user.monthly_fee_paid_through && user.monthly_fee_paid_through >= endOfMonth) continue

      await supabase.from('users').update({
        monthly_fee_paid_through: endOfMonth,
      }).eq('id', user.id)

      monthlyUpdated++
    }

    return NextResponse.json({
      success: true,
      onboarding_synced: synced,
      monthly_updated: monthlyUpdated,
      checked_users: users.length,
    })
  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
