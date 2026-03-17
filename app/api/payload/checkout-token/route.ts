import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Creates a Payload client token for the embedded checkout plugin.
// Call this after creating an invoice, pass the invoice_id.
export async function POST(request: NextRequest) {
  try {
    const { invoice_id, description }: { invoice_id: string; description: string } = await request.json()

    if (!invoice_id || !description) {
      return NextResponse.json({ error: 'invoice_id and description are required' }, { status: 400 })
    }

    const res = await fetch('https://api.payload.com/access_tokens', {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'client',
        intent: {
          checkout_plugin: {
            invoice_id,
            description,
            // Pass processing fee to the agent
            conv_fee: true,
            // Let agent save payment method and enable autopay
            auto_billing_toggle: true,
            keep_active_toggle: true,
            // Accept both cards and bank accounts
            card_payments: true,
            bank_account_payments: true,
          },
        },
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload client token creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to create checkout token' }, { status: 500 })
    }

    return NextResponse.json({ success: true, client_token: data.id })
  } catch (error: any) {
    console.error('Error creating checkout token:', error)
    return NextResponse.json({ error: error.message || 'Failed to create checkout token' }, { status: 500 })
  }
}