import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// Creates a Payload client token for the embedded checkout plugin.
// Call this after creating an invoice, pass the invoice_id.
//
// The amount and description are read from the invoice on Payload's side, never
// from the request body. The body is what the agent's browser controls, so
// trusting it let anyone charge themselves a dollar against a fifty dollar
// invoice and have the app record it as a payment.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { invoice_id }: { invoice_id: string } = await request.json()

    if (!invoice_id) {
      return NextResponse.json({ error: 'invoice_id is required' }, { status: 400 })
    }

    // Always fetch the invoice. This used to run only for non-admins, purely as
    // an ownership check. It is now the source of the amount, the description
    // and the customer, so it has to run for everyone.
    //
    // fields[]=* keeps every default attribute and fields[]=items adds the
    // nested line items that the description fallback reads. Payload documents
    // fields[] on single objects as well as list endpoints:
    // https://docs.payload.com/apis/api-design/
    const invoiceRes = await fetch(
      `https://api.payload.com/invoices/${invoice_id}?fields[]=*&fields[]=items`,
      { headers: { Authorization: authHeader() } }
    )

    if (!invoiceRes.ok) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const invoice = await invoiceRes.json()
    const customerId = invoice.customer_id

    // Agents may only pay their own invoices. Admins with billing permission
    // may pay anyone's.
    if (!auth.permissions.has('can_manage_agent_billing')) {
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

    // amount_due rather than amount, so a partially paid invoice or one already
    // reduced by a staged commission offset charges the balance and not the
    // original figure.
    const amountDue = Number(invoice.amount_due ?? 0)
    if (!(amountDue > 0)) {
      return NextResponse.json(
        { error: 'This invoice has no balance due.' },
        { status: 400 }
      )
    }

    // Same fallback chain the open-invoices and receipts routes use, so the
    // label on the checkout matches the label on the Fees page.
    const description =
      invoice.description ||
      invoice.items?.[0]?.description ||
      invoice.items?.[0]?.type ||
      'Invoice'

    if (!customerId) {
      return NextResponse.json(
        { error: 'This invoice has no customer on it, so it cannot be paid here.' },
        { status: 400 }
      )
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
            amount: amountDue,
            description,
            // Ties the resulting payment to this invoice rather than leaving it
            // as a loose credit on the customer.
            invoice_id,
            // Without customer_id there is no account to store a payment method
            // on, so Payload renders neither of the two toggles below and the
            // agent is never offered the choice. This omission is why the save
            // and autopay options were invisible in the app but present on a
            // payment link generated from the Payload dashboard.
            customer_id: customerId,
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
