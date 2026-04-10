import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body
    console.log('Payload webhook received:', type, data?.id)

    // Invoice paid
    if (type === 'invoice.paid' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id, onboarding_fee_paid')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (!user) return NextResponse.json({ received: true })

      // Check if this invoice contains an onboarding fee line item
      const hasOnboardingItem = data.items?.some((item: any) => item.type === 'Onboarding Fee')
      if (hasOnboardingItem && !user.onboarding_fee_paid) {
        await supabase
          .from('users')
          .update({
            onboarding_fee_paid: true,
            onboarding_fee_paid_date:
              data.paid_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
          })
          .eq('id', user.id)
        console.log('Marked onboarding fee paid for user:', user.id)
      }

      // Check if this invoice contains a monthly fee
      const hasMonthlyItem = data.items?.some(
        (item: any) => item.type === 'Monthly Fee' || item.type === 'Monthly Fee (Prorated)'
      )
      if (hasMonthlyItem) {
        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .split('T')[0]
        await supabase
          .from('users')
          .update({
            monthly_fee_paid_through: endOfMonth,
          })
          .eq('id', user.id)
        console.log('Updated monthly fee paid through for user:', user.id)

        // If agent saved a default payment method (enabled autopay), create billing schedule
        try {
          const pmRes = await fetch(
            `https://api.payload.com/payment_methods/?customer_id=${data.customer_id}&limit=10`,
            { headers: { Authorization: authHeader() } }
          )
          const pmData = await pmRes.json()
          const defaultMethod = pmData.values?.find(
            (pm: any) => pm.default_payment_method === true
          )

          if (defaultMethod) {
            // Check if billing schedule already exists for this customer
            const schedRes = await fetch(
              `https://api.payload.com/billing_schedules/?customer_id=${data.customer_id}&limit=1`,
              { headers: { Authorization: authHeader() } }
            )
            const schedData = await schedRes.json()
            const hasSchedule = (schedData.values?.length ?? 0) > 0

            if (!hasSchedule) {
              // Fetch monthly fee setting
              const { data: companySettings } = await supabase
                .from('company_settings')
                .select('standard_monthly_fee')
                .single()
              const monthlyFee = companySettings?.standard_monthly_fee ?? 50

              const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
              const startDate = nextMonth.toISOString().split('T')[0]
              const fiveYearsOut = new Date(now.getFullYear() + 5, now.getMonth(), 1)
                .toISOString()
                .split('T')[0]

              const scheduleRes = await fetch('https://api.payload.com/billing_schedules/', {
                method: 'POST',
                headers: {
                  Authorization: authHeader(),
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  type: 'subscription',
                  processing_id: process.env.PAYLOAD_PROCESSING_ID!,
                  customer_id: data.customer_id,
                  start_date: startDate,
                  end_date: fiveYearsOut,
                  recurring_frequency: 'monthly',
                  'charges[0][type]': 'Monthly Fee',
                  'charges[0][amount]': monthlyFee.toString(),
                }),
              })

              if (scheduleRes.ok) {
                console.log('Created billing schedule for customer:', data.customer_id)
              } else {
                const err = await scheduleRes.json()
                console.error('Failed to create billing schedule:', err.message)
              }
            } else {
              console.log('Billing schedule already exists for customer:', data.customer_id)
            }
          }
        } catch (err) {
          console.error('Error checking/creating billing schedule:', err)
        }
      }

      // Check if this is a custom invoice - mark agent_debt resolved
      const hasCustomItem = data.items?.some(
        (item: any) =>
          item.type !== 'Onboarding Fee' &&
          item.type !== 'Monthly Fee' &&
          item.type !== 'Monthly Fee (Prorated)'
          && item.type !== 'Late Fee'
      )
      if (hasCustomItem && data.id) {
        // Find matching debt by Payload invoice ID stored in notes
        const { data: debt } = await supabase
          .from('agent_debts')
          .select('id, amount_owed')
          .eq('agent_id', user.id)
          .eq('status', 'outstanding')
          .ilike('notes', `%${data.id}%`)
          .single()

        if (debt) {
          await supabase
            .from('agent_debts')
            .update({
              status: 'resolved',
              amount_paid: debt.amount_owed,
              date_resolved: data.paid_at?.split('T')[0] ?? new Date().toISOString().split('T')[0],
            })
            .eq('id', debt.id)
          console.log('Marked agent debt resolved:', debt.id)
        }
      }
    }

    // Automatic payment fired by billing schedule (autopay)
    if (type === 'automatic_payment' && data?.customer_id) {
      const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('payload_payee_id', data.customer_id)
        .single()

      if (user) {
        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .split('T')[0]
        await supabase
          .from('users')
          .update({
            monthly_fee_paid_through: endOfMonth,
          })
          .eq('id', user.id)
        console.log('Updated monthly fee via autopay for user:', user.id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}