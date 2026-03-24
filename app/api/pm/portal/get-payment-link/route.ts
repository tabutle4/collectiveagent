import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST - Generate payment link for one or more invoices (portal-accessible)
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
    const body = await request.json()
    
    // Support both single invoice_id and array of invoice_ids
    const invoiceIds: string[] = body.invoice_ids || (body.invoice_id ? [body.invoice_id] : [])

    if (invoiceIds.length === 0) {
      return NextResponse.json({ error: 'Invoice ID(s) required' }, { status: 400 })
    }

    // Fetch all invoices - verify they belong to this tenant
    const { data: invoices, error: fetchError } = await supabase
      .from('tenant_invoices')
      .select(`
        *,
        tenants(id, first_name, last_name, email, payload_customer_id),
        managed_properties(id, property_address, city)
      `)
      .in('id', invoiceIds)
      .eq('tenant_id', tenantId)

    if (fetchError || !invoices || invoices.length === 0) {
      return NextResponse.json({ error: 'Invoice(s) not found' }, { status: 404 })
    }

    // Verify all requested invoices were found
    if (invoices.length !== invoiceIds.length) {
      return NextResponse.json({ error: 'Some invoices not found or not authorized' }, { status: 404 })
    }

    // Check none are paid
    const paidInvoices = invoices.filter(inv => inv.status === 'paid')
    if (paidInvoices.length > 0) {
      return NextResponse.json({ error: 'One or more invoices already paid' }, { status: 400 })
    }

    // Check if Payload is configured
    if (!process.env.PAYLOAD_SECRET_KEY) {
      return NextResponse.json({ 
        error: 'Payment service not configured. Please contact pm@collectiverealtyco.com',
        fallback: true
      }, { status: 503 })
    }

    // Use first invoice's tenant info (they should all be same tenant)
    const tenant = invoices[0].tenants
    
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

    // Calculate total and earliest due date
    const totalAmount = invoices.reduce((sum, inv) => sum + inv.total_amount, 0)
    const earliestDueDate = invoices.reduce((earliest, inv) => 
      inv.due_date < earliest ? inv.due_date : earliest, 
      invoices[0].due_date
    )

    // Build description
    const description = invoices.length === 1
      ? `Rent - ${invoices[0].managed_properties?.property_address || 'Property'} - ${invoices[0].period_month}/${invoices[0].period_year}`
      : `Rent Payment - ${invoices.length} invoices`

    // Build line items for Payload invoice
    const invoiceParams = new URLSearchParams({
      type: 'bill',
      due_date: earliestDueDate,
      processing_id: process.env.PAYLOAD_PROCESSING_ID || '',
      customer_id: customerId,
      description,
    })

    // Add each invoice as a line item
    invoices.forEach((inv, index) => {
      const property = inv.managed_properties
      const itemDesc = property
        ? `${property.property_address} - ${inv.period_month}/${inv.period_year}`
        : `Rent - ${inv.period_month}/${inv.period_year}`
      
      invoiceParams.append(`items[${index}][description]`, itemDesc)
      invoiceParams.append(`items[${index}][amount]`, inv.total_amount.toString())
      invoiceParams.append(`items[${index}][entry_type]`, 'charge')
    })

    // Create Payload invoice
    const invoiceRes = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: invoiceParams,
    })

    const invoiceData = await invoiceRes.json()
    if (!invoiceRes.ok) {
      console.error('Failed to create Payload invoice:', JSON.stringify(invoiceData))
      return NextResponse.json(
        { error: invoiceData.message || 'Failed to create invoice. Please try again or contact support.' },
        { status: 500 }
      )
    }

    // Create payment link with the invoice ID
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

    // Update invoices with Payload info
    // Only store payment link on individual invoices if single payment
    // For multi-invoice, we don't store to avoid URL confusion
    if (invoices.length === 1) {
      await supabase
        .from('tenant_invoices')
        .update({
          payload_invoice_id: invoiceData.id,
          payload_payment_link_id: paymentLinkData.id,
          payload_payment_link_url: paymentLinkData.url,
          status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceIds[0])
    }
    // For multi-invoice payments, just update status but not the URL
    // This way each invoice can still get its own individual link later
    else {
      await supabase
        .from('tenant_invoices')
        .update({
          status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .in('id', invoiceIds)
    }

    console.log(`Payment link created for tenant ${tenant.email} (${invoices.length} invoices, $${totalAmount}): ${paymentLinkData.url}`)

    return NextResponse.json({
      success: true,
      payment_url: paymentLinkData.url,
      invoice_count: invoices.length,
      total_amount: totalAmount,
    })
  } catch (error: any) {
    console.error('Error creating payment link:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}