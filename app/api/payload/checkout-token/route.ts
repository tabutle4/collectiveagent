import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Creates a Payload client token for the embedded checkout plugin.
// Call this after creating an invoice, pass the invoice_id.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { invoice_id, amount, description }: { invoice_id: string; amount: number; description: string } =
  await request.json()

    if (!invoice_id || !description) {
      return NextResponse.json(
        { error: 'invoice_id and description are required' },
        { status: 400 }
      )
    }

    // Verify the invoice belongs to the requesting user OR user has admin permissions
    if (!auth.permissions.has('can_manage_agent_billing')) {
      // Fetch invoice from Payload to get customer_id
      const invoiceRes = await fetch(`https://api.payload.com/invoices/${invoice_id}`, {
        headers: { Authorization: authHeader() },
      })

      if (!invoiceRes.ok) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
      }

      const invoice = await invoiceRes.json()
      const customerId = invoice.customer_id

      // Look up which user owns this Payload customer
      const supabase = createClient()
      const { data: invoiceOwner } = await supabase
        .from('users')
        .select('id')
        .eq('payload_payee_id', customerId)
        .single()

      if (!invoiceOwner || invoiceOwner.id !== auth.user.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const res = await fetch('https://api.payload.com/access_tokens', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'client',
        intent: {
          checkout_plugin: {
            amount,
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
      return NextResponse.json(
        { error: data.message || 'Failed to create checkout token' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, client_token: data.id })
  } catch (error: any) {
    console.error('Error creating checkout token:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout token' },
      { status: 500 }
    )
  }
}