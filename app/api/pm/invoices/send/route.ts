import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { invoice_id } = await request.json()

    if (!invoice_id) {
      return NextResponse.json({ error: 'Invoice ID is required' }, { status: 400 })
    }

    // Fetch invoice with tenant and property info
    const { data: invoice, error: fetchError } = await supabase
      .from('tenant_invoices')
      .select(`
        *,
        tenants(id, first_name, last_name, email, payload_customer_id),
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

    const tenant = invoice.tenants
    const property = invoice.managed_properties

    // Create Payload customer if tenant doesn't have one
    let customerId = tenant.payload_customer_id
    if (!customerId) {
      const customerRes = await fetch('https://api.payload.com/customers/', {
        method: 'POST',
        headers: {
          Authorization: authHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          name: `${tenant.first_name} ${tenant.last_name}`,
          email: tenant.email,
        }),
      })

      const customerData = await customerRes.json()
      if (!customerRes.ok) {
        console.error('Failed to create Payload customer:', customerData)
        return NextResponse.json(
          { error: 'Failed to create payment customer' },
          { status: 500 }
        )
      }

      customerId = customerData.id

      // Save customer ID to tenant
      await supabase
        .from('tenants')
        .update({ payload_customer_id: customerId })
        .eq('id', tenant.id)
    }

    // Create payment link (NOT invoice — payment_links returns URL)
    const description = property
      ? `Rent - ${property.property_address}, ${property.city} - ${invoice.period_month}/${invoice.period_year}`
      : `Rent Payment - ${invoice.period_month}/${invoice.period_year}`

    // First create a Payload invoice
    const invoiceRes = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        type: 'bill',
        processing_id: process.env.PAYLOAD_PROCESSING_ID || '',
        customer_id: customerId,
        description,
        'items[0][description]': description,
        'items[0][amount]': invoice.total_amount.toString(),
        'items[0][entry_type]': 'charge',
      }),
    })

    const invoiceData = await invoiceRes.json()
    if (!invoiceRes.ok) {
      console.error('Failed to create Payload invoice:', invoiceData)
      return NextResponse.json(
        { error: invoiceData.message || 'Failed to create invoice' },
        { status: 500 }
      )
    }

    // Now create payment link with the invoice ID
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
      console.error('Failed to create Payload payment link:', paymentLinkData)
      return NextResponse.json(
        { error: paymentLinkData.message || 'Failed to create payment link' },
        { status: 500 }
      )
    }

    // Update invoice with Payload info
    await supabase
      .from('tenant_invoices')
      .update({
        payload_invoice_id: invoiceData.id,
        payload_payment_link_id: paymentLinkData.id,
        payload_payment_link_url: paymentLinkData.url,
        status: 'sent',
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)

    // TODO: Send email to tenant with payment link
    // For now, log the URL
    console.log(`Payment link for ${tenant.email}: ${paymentLinkData.url}`)

    return NextResponse.json({
      success: true,
      payment_link_id: paymentLinkData.id,
      payment_link_url: paymentLinkData.url,
    })
  } catch (error: any) {
    console.error('Error sending invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}