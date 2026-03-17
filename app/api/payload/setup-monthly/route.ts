import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id, email')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json({ error: 'Agent does not have a Payload customer ID.' }, { status: 400 })
    }

    const authHeader = 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')
    const processing_id = process.env.PAYLOAD_PROCESSING_ID

    // Start next month
    const today = new Date()
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    const startDate = nextMonth.toISOString().split('T')[0]

    const res = await fetch('https://api.payload.com/billing_schedules/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'type': 'subscription',
        'processing_id': processing_id!,
        'customer_id': user.payload_payee_id,
        'start_date': startDate,
        'recurring_frequency': 'monthly',
        'charges[0][type]': 'Monthly Fee',
        'charges[0][amount]': '50',
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Payload billing schedule creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to create billing schedule' }, { status: 500 })
    }

    // Update user record
    await supabase.from('users').update({
      monthly_fee_paid_through: startDate,
    }).eq('id', user_id)

    return NextResponse.json({ success: true, schedule_id: data.id, start_date: startDate })
  } catch (error: any) {
    console.error('Error creating billing schedule:', error)
    return NextResponse.json({ error: error.message || 'Failed to create billing schedule' }, { status: 500 })
  }
}
