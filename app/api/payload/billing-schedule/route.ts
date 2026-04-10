import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Creates a monthly billing schedule for an agent starting next month.
// Only needed if NOT using the auto_billing_toggle in checkout.
// If the agent enabled autopay at checkout, Payload handles this automatically.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { user_id } = await request.json()
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    // Fetch fee settings
    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('standard_monthly_fee')
      .single()
    
    const monthlyFee = companySettings?.standard_monthly_fee ?? 50

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json(
        { error: 'Agent does not have a Payload customer ID.' },
        { status: 400 }
      )
    }

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

    const res = await fetch('https://api.payload.com/billing_schedules/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'subscription',
        processing_id: process.env.PAYLOAD_PROCESSING_ID!,
        customer_id: user.payload_payee_id,
        start_date: startDate,
        recurring_frequency: 'monthly',
        'charges[0][type]': 'Monthly Fee',
        'charges[0][amount]': monthlyFee.toString(),
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload billing schedule creation failed:', data)
      return NextResponse.json(
        { error: data.message || 'Failed to create billing schedule' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, schedule_id: data.id, start_date: startDate })
  } catch (error: any) {
    console.error('Error creating billing schedule:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create billing schedule' },
      { status: 500 }
    )
  }
}
