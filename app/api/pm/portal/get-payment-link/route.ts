import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST - Generate payment link for invoice (portal-accessible)
// Validates via PM session cookie - tenant can only pay their own invoices
export async function POST(request: NextRequest) {
  try {
    // Validate PM session
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('pm_session')?.value
    
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const supabase = createClient()

    // Verify session
    const { data: session } = await supabase
      .from('pm_sessions')
      .select('user_id, user_type, expires_at')
      .eq('session_token', sessionToken)
      .single()

    if (!session || new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    if (session.user_type !== 'tenant') {
      return NextResponse.json({ error: 'Only tenants can request payment links' }, { status: 403 })
    }

    const tenantId = session.user_id
    const { invoice_id } = await request.json()

    if (!invoice_id) {
      return NextResponse.json({ error: 'Invoice ID required' }, { status: 400 })
    }

    // Fetch invoice - verify it belongs to this tenant
    const { data: invoice, error: fetchError } = await supabase
      .from('tenant_invoices')
      .select(`
        *,
        tenants(id, first_name, last_name, email, payload_customer_id),
        managed_properties(id, property_address, city)
      `)
      .eq('id', invoice_id)
      .eq('tenant_id', tenantId)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 })
    }

    // If payment link already exists, return it
    if (invoice.payload_payment_link_url) {
      return NextResponse.json({
        success: true,
        payment_url: invoice.payload_payment_link_url,
        existing: true
      })
    }

    // Check if Payload is configured
    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json({ 
        error: 'Payment service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true
      }, { status: 503 })
    }

    const tenant = invoice.tenants
    const property = invoice.managed_properties

    // Create Payload customer if needed
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
          { error: 'Failed to set up payment. Please contact support.' },
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

    // First create a Payload invoice
    const description = property
      ? `Rent - ${property.property_address}, ${property.city} - ${invoice.period_month}/${invoice.period_year}`
      : `Rent Payment - ${invoice.period_month}/${invoice.period_year}`

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
        'items[0][amount]': invoice.total_amount.toString(),
        'items[0][entry_type]': 'charge',
      }),
    })

    const invoiceData = await invoiceRes.json()
    if (!invoiceRes.ok) {
      console.error('Failed to create Payload invoice:', JSON.stringify(invoiceData))
      return NextResponse.json(
        { error: invoiceData.message || 'Failed to create invoice. Please try again or contact support.' },
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
      console.error('Failed to create Payload payment link:', JSON.stringify(paymentLinkData))
      return NextResponse.json(
        { error: paymentLinkData.message || 'Failed to create payment link. Please try again or contact support.' },
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
        status: invoice.status === 'pending' ? 'sent' : invoice.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice_id)

    console.log(`Payment link created for tenant ${tenant.email}: ${paymentLinkData.url}`)

    return NextResponse.json({
      success: true,
      payment_url: paymentLinkData.url,
    })
  } catch (error: any) {
    console.error('Error creating payment link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}