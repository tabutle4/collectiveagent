import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const supabase = createClient()

    const { type, data } = body

    console.log('Payload webhook received:', type, data?.id)

    // Invoice paid — mark onboarding fee paid
    if (type === 'invoice.paid' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id, onboarding_fee_paid')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (user && !user.onboarding_fee_paid) {
        await supabase.from('users').update({
          onboarding_fee_paid: true,
          onboarding_fee_paid_date: new Date().toISOString().split('T')[0],
        }).eq('id', user.id)

        console.log('Marked onboarding fee paid for user:', user.id)
      }
    }

    // Billing charge paid — update monthly_fee_paid_through
    if (type === 'billing_charge.paid' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (user) {
        // Set paid through end of current month
        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const paidThrough = endOfMonth.toISOString().split('T')[0]

        await supabase.from('users').update({
          monthly_fee_paid_through: paidThrough,
        }).eq('id', user.id)

        console.log('Updated monthly fee paid through for user:', user.id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
