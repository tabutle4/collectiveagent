import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    console.log('Payload webhook received:', type, data?.id)

    const supabase = createClient()

    // Invoice paid
    if (type === 'invoice.paid' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id, onboarding_fee_paid')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (!user) return NextResponse.json({ received: true })

      // Check if this invoice contains an onboarding fee line item
      const hasOnboardingItem = data.items?.some((item: any) =>
        item.type === 'Onboarding Fee'
      )

      if (hasOnboardingItem && !user.onboarding_fee_paid) {
        await supabase.from('users').update({
          onboarding_fee_paid: true,
          onboarding_fee_paid_date: data.paid_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
        }).eq('id', user.id)
        console.log('Marked onboarding fee paid for user:', user.id)
      }

      // Check if this invoice contains a monthly fee (prorated counts too)
      const hasMonthlyItem = data.items?.some((item: any) =>
        item.type === 'Monthly Fee' || item.type === 'Monthly Fee (Prorated)'
      )

      if (hasMonthlyItem) {
        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
        await supabase.from('users').update({
          monthly_fee_paid_through: endOfMonth,
        }).eq('id', user.id)
        console.log('Updated monthly fee paid through for user:', user.id)
      }
    }

    // Billing schedule charge paid (autopay) — always a monthly fee
    if (type === 'billing_charge.paid' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (user) {
        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
        await supabase.from('users').update({
          monthly_fee_paid_through: endOfMonth,
        }).eq('id', user.id)
        console.log('Updated monthly fee via autopay for user:', user.id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}