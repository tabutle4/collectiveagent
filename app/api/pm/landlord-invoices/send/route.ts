import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { pmManagementFeeEmail } from '@/lib/email/pm-layout'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

const FROM_UPN = 'tarab@collectiverealtyco.com'
const BCC_OFFICE = 'office@collectiverealtyco.com'
const REPLY_TO = 'pm@collectiverealtyco.com'

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
        managed_properties(id, property_address, city, pm_agreement_id,
          pm_agreements(crc_collects_rent))
      `)
      .eq('id', invoice_id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    // Only send management fee invoices to self-collect landlords.
    // Self-collect = landlord collects rent and pays CRC the management fee directly.
    // When crc_collects_rent = true, CRC deducts the fee from the disbursement instead.
    const prop = invoice.managed_properties as any
    const agreement = Array.isArray(prop?.pm_agreements) ? prop.pm_agreements[0] : prop?.pm_agreements
    if (agreement?.crc_collects_rent !== false) {
      return NextResponse.json(
        { error: 'This landlord is not self-collect. Management fees are deducted from disbursements.' },
        { status: 400 }
      )
    }

    const landlord = invoice.landlords as any
    const property = invoice.managed_properties as any

    const MONTH_NAMES_FULL = ['January','February','March','April','May','June',
      'July','August','September','October','November','December']
    const propertyAddr = property
      ? `${property.property_address}, ${property.city}`
      : 'your property'
    const dueDateFormatted = new Date(`${invoice.due_date}T12:00:00`).toLocaleDateString(
      'en-US', { month: 'long', day: 'numeric', year: 'numeric' }
    )
    const period = `${MONTH_NAMES_FULL[(invoice.period_month || 1) - 1]} ${invoice.period_year}`

    // Idempotency: if a payment link already exists, reuse it and just resend the email.
    if (invoice.payload_payment_link_url) {
      const html = pmManagementFeeEmail(
        landlord.first_name,
        propertyAddr,
        Number(invoice.amount),
        period,
        dueDateFormatted,
        invoice.payload_payment_link_url
      )
      try {
        await sendMailAs({
          fromUpn: FROM_UPN,
          to: landlord.email,
          bcc: BCC_OFFICE,
          replyTo: REPLY_TO,
          subject: `Management Fee Invoice - ${period} - ${propertyAddr}`,
          html,
        })
      } catch (emailErr) {
        console.error('Failed to resend management fee email:', emailErr)
      }
      return NextResponse.json({
        success: true,
        payment_link_url: invoice.payload_payment_link_url,
        resent: true,
      })
    }

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

    const description = property
      ? `Management Fee - ${property.property_address}, ${property.city} - ${period}`
      : `Management Fee - ${period}`

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

    // Send management fee invoice email to landlord via Graph (external recipient).
    const html = pmManagementFeeEmail(
      landlord.first_name,
      propertyAddr,
      Number(invoice.amount),
      period,
      dueDateFormatted,
      paymentLinkData.url
    )
    try {
      await sendMailAs({
        fromUpn: FROM_UPN,
        to: landlord.email,
        bcc: BCC_OFFICE,
        replyTo: REPLY_TO,
        subject: `Management Fee Invoice - ${period} - ${propertyAddr}`,
        html,
      })
    } catch (emailErr) {
      // Log but don't fail the request - payment link was created successfully
      console.error('Failed to send management fee email:', emailErr)
    }

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
