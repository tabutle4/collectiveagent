import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Creates a payment link tied to an invoice and emails it to the agent via Payload.
// Passing customer_id triggers Payload to send the email automatically.
export async function POST(request: NextRequest) {
  try {
    const { invoice_id, user_id } = await request.json()

    if (!invoice_id || !user_id) {
      return NextResponse.json({ error: 'invoice_id and user_id are required' }, { status: 400 })
    }

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

    const res = await fetch('https://api.payload.com/payment_links/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        invoice_id,
        customer_id: user.payload_payee_id,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload payment link creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to send invoice' }, { status: 500 })
    }

    // Store payment link for receipt display
    if (data.url) {
      await supabase.from('payment_links').insert({
        agent_id: user_id,
        invoice_id,
        payment_link_id: data.id,
        url: data.url,
        description: data.description || null,
        amount: data.amount || null,
        status: data.status || 'active',
      })
    }

    return NextResponse.json({ success: true, payment_link_id: data.id })
  } catch (error: any) {
    console.error('Error sending invoice:', error)
    return NextResponse.json({ error: error.message || 'Failed to send invoice' }, { status: 500 })
  }
}
