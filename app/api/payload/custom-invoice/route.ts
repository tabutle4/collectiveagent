import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { user_id, amount, description } = await request.json()
    if (!user_id || !amount || !description) {
      return NextResponse.json({ error: 'user_id, amount, and description are required' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json({ error: 'Agent does not have a Payload customer ID.' }, { status: 400 })
    }

    const authHeader = 'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')
    const today = new Date().toISOString().split('T')[0]

    const res = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: { 'Authorization': authHeader, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        'type': 'bill',
        'due_date': today,
        'processing_id': process.env.PAYLOAD_PROCESSING_ID!,
        'customer_id': user.payload_payee_id,
        'items[0][type]': description,
        'items[0][description]': description,
        'items[0][amount]': amount.toString(),
        'items[0][entry_type]': 'charge',
      }),
    })

    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data.message || 'Failed to create invoice' }, { status: 500 })

    return NextResponse.json({ success: true, invoice_id: data.id, invoice_url: `https://payload.com/pay/${data.id}` })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to create invoice' }, { status: 500 })
  }
}
