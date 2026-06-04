import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST /api/pm/landlord-invoices/send
// Creates a Payload invoice + payment link and marks the landlord invoice as sent.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { invoice_id } = await request.json()

    if (!invoice_id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    const { data: invoice, error: fetchError } = await supabase
      .from('pm_landlord_invoices')
      .select(`
        *,
        landlords(id, first_name, last_name, email, payload_payee_id),
        managed_properties(id, property_address, city)
      `)
      .eq('id', invoice_id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    const landlord = invoice.landlords as any
    const property = invoice.managed_properties as any

    // Create Payload customer for landlord if needed
    let customerId = landlord.payload_payee_id
    if (!customerId) {
      const customerRes = await fetch('https://api.payload.com/customers/', {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: `${landlord.first_name} ${landlord.last_name}`,
          email: landlord.email,
        }),
      })

      const customerData = await customerRes.json()
      if (!customerRes.ok) {
        console.error('Failed to create Payload customer for landlord:', customerData)
        return NextResponse.json(
          { error: 'Failed to create payment customer' },
          { status: 500 }
        )
      }

      customerId = customerData.id

      await supabase
        .from('landlords')
        .update({ payload_payee_id: customerId })
        .eq('id', landlord.id)
    }

    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const monthLabel = MONTH_NAMES[(invoice.period_month || 1) - 1]
    const description = property
      ? `Management Fee - ${property.property_address}, ${property.city} - ${monthLabel} ${invoice.period_year}`
      : `Management Fee - ${monthLabel} ${invoice.period_year}`

    // Create Payload invoice
    const invoiceRes = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'bill',
        due_date: invoice.due_date,
        processing_id: process.env.PAYLOAD_PROCESSING_ID || '',
        customer_id: customerId,
        description,
        'items[0][description]': description,
        'items[0][amount]': invoice.amount.toString(),
        'items[0][entry_type]': 'charge',
      }),
    })

    const invoiceData = await invoiceRes.json()
    if (!invoiceRes.ok) {
      console.error('Failed to create Payload invoice for landlord:', invoiceData)
      return NextResponse.json(
        { error: invoiceData.message || 'Failed to create invoice' },
        { status: 500 }
      )
    }

    // Create payment link
    const paymentLinkRes = await fetch('https://api.payload.com/payment_links/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        invoice_id: invoiceData.id,
        customer_id: customerId,
      }),
    })

    const paymentLinkData = await paymentLinkRes.json()
    if (!paymentLinkRes.ok) {
      console.error('Failed to create Payload payment link for landlord:', paymentLinkData)
      return NextResponse.json(
        { error: paymentLinkData.message || 'Failed to create payment link' },
        { status: 500 }
      )
    }

    await supabase
      .from('pm_landlord_invoices')
      .update({
        payload_invoice_id: invoiceData.id,
        payload_payment_link_id: paymentLinkData.id,
        payload_payment_link_url: paymentLinkData.url,
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)

    console.log(`Landlord invoice payment link for ${landlord.email}: ${paymentLinkData.url}`)

    return NextResponse.json({
      success: true,
      payment_link_id: paymentLinkData.id,
      payment_link_url: paymentLinkData.url,
    })
  } catch (error: any) {
    console.error('Error sending landlord invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
