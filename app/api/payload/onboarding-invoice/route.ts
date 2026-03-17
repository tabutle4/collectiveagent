import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { user_id, prorated_amount } = await request.json()

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id, first_name, last_name, preferred_first_name, preferred_last_name, email')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json({ error: 'Agent does not have a Payload customer ID. Create customer first.' }, { status: 400 })
    }

    const authHeader = 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')
    const processing_id = process.env.PAYLOAD_PROCESSING_ID

    // Calculate prorated monthly fee if not provided
    const today = new Date()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const remainingDays = daysInMonth - today.getDate() + 1
    const proratedFee = prorated_amount ?? Math.round((50 / daysInMonth) * remainingDays * 100) / 100

    const dueDateStr = today.toISOString().split('T')[0]

    const params = new URLSearchParams({
      'type': 'bill',
      'due_date': dueDateStr,
      'processing_id': processing_id!,
      'customer_id': user.payload_payee_id,
      'items[0][type]': 'Onboarding Fee',
      'items[0][description]': 'One-time onboarding fee',
      'items[0][amount]': '399',
      'items[0][entry_type]': 'charge',
    })

    if (proratedFee > 0) {
      params.append('items[1][type]', 'Monthly Fee (Prorated)')
      params.append('items[1][description]', `Prorated monthly fee for ${remainingDays} days remaining in ${today.toLocaleString('default', { month: 'long' })}`)
      params.append('items[1][amount]', proratedFee.toString())
      params.append('items[1][entry_type]', 'charge')
    }

    const res = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('Payload invoice creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to create invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true, invoice_id: data.id, invoice_url: `https://payload.com/pay/${data.id}`, total: 399 + proratedFee, prorated_fee: proratedFee })
  } catch (error: any) {
    console.error('Error creating onboarding invoice:', error)
    return NextResponse.json({ error: error.message || 'Failed to create invoice' }, { status: 500 })
  }
}
