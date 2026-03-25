import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAYLOAD_SECRET_KEY = process.env.PAYLOAD_SECRET_KEY || ''

// Helper to delete a payment link from Payload
async function deletePayloadPaymentLink(paymentLinkId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.payload.com/payment_links/${paymentLinkId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(PAYLOAD_SECRET_KEY + ':').toString('base64'),
      },
    })
    if (res.ok) {
      console.log('Deleted Payload payment link:', paymentLinkId)
      return true
    } else {
      console.log('Failed to delete payment link:', paymentLinkId, res.status)
      return false
    }
  } catch (err) {
    console.error('Error deleting payment link:', paymentLinkId, err)
    return false
  }
}

// Helper to delete an invoice from Payload
async function deletePayloadInvoice(invoiceId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.payload.com/invoices/${invoiceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(PAYLOAD_SECRET_KEY + ':').toString('base64'),
      },
    })
    if (res.ok) {
      console.log('Deleted Payload invoice:', invoiceId)
      return true
    } else {
      console.log('Failed to delete invoice:', invoiceId, res.status)
      return false
    }
  } catch (err) {
    console.error('Error deleting invoice:', invoiceId, err)
    return false
  }
}

// Clean up Payload when lease is fully paid
async function cleanupPayloadForLease(supabase: any, leaseId: string) {
  // Get all invoices for this lease
  const { data: allInvoices } = await supabase
    .from('tenant_invoices')
    .select('id, status, payload_invoice_id, payload_payment_link_id')
    .eq('lease_id', leaseId)

  if (!allInvoices || allInvoices.length === 0) return

  // Check if any unpaid invoices remain
  const unpaidInvoices = allInvoices.filter((inv: any) => 
    !['paid', 'cancelled'].includes(inv.status)
  )

  if (unpaidInvoices.length > 0) {
    console.log(`Lease ${leaseId} still has ${unpaidInvoices.length} unpaid invoices, skipping cleanup`)
    return
  }

  console.log(`Lease ${leaseId} fully paid, cleaning up Payload...`)

  // Delete all payment links and invoices from Payload
  for (const invoice of allInvoices) {
    // Delete payment link first (it references the invoice)
    if (invoice.payload_payment_link_id) {
      await deletePayloadPaymentLink(invoice.payload_payment_link_id)
    }

    // Delete invoice from Payload
    if (invoice.payload_invoice_id) {
      await deletePayloadInvoice(invoice.payload_invoice_id)
    }

    // Clear Payload IDs from our database
    if (invoice.payload_invoice_id || invoice.payload_payment_link_id) {
      await supabase
        .from('tenant_invoices')
        .update({
          payload_invoice_id: null,
          payload_payment_link_id: null,
          payload_payment_link_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)
    }
  }

  console.log(`Cleanup complete for lease ${leaseId}`)
}

// POST - Handle tenant rent payment webhook from Payload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    console.log('PM tenant payment webhook received:', type, data?.id)

    const supabase = await createClient()

    // Payment link paid
    if (type === 'payment_link.paid' && data?.id) {
      // Find invoice by payment link ID
      const { data: invoice } = await supabase
        .from('tenant_invoices')
        .select(`
          id, tenant_id, landlord_id, property_id, lease_id,
          total_amount, period_month, period_year,
          pm_leases(id, landlord_id),
          managed_properties(id, pm_agreement_id)
        `)
        .eq('payload_payment_link_id', data.id)
        .single()

      if (!invoice) {
        console.log('No invoice found for payment link:', data.id)
        return NextResponse.json({ received: true })
      }

      const paidAmount = data.amount || invoice.total_amount
      const paidAt = data.paid_at || new Date().toISOString()

      // Update invoice to paid
      await supabase
        .from('tenant_invoices')
        .update({
          status: 'paid',
          paid_at: paidAt,
          paid_amount: paidAmount,
          payment_method: 'payload',
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id)

      console.log('Invoice marked paid:', invoice.id)

      // Get PM agreement to calculate management fee
      let managementFeePct = 10 // Default
      const property = invoice.managed_properties as any
      if (property?.pm_agreement_id) {
        const { data: agreement } = await supabase
          .from('pm_agreements')
          .select('management_fee_pct')
          .eq('id', property.pm_agreement_id)
          .single()

        if (agreement) {
          managementFeePct = agreement.management_fee_pct
        }
      }

      // Calculate disbursement amounts
      const grossRent = paidAmount
      const managementFee = grossRent * (managementFeePct / 100)
      const netAmount = grossRent - managementFee

      // Create pending disbursement for landlord
      const { error: disbError } = await supabase
        .from('landlord_disbursements')
        .insert({
          landlord_id: invoice.landlord_id,
          tenant_invoice_id: invoice.id,
          property_id: invoice.property_id,
          lease_id: invoice.lease_id,
          gross_rent: grossRent,
          management_fee: managementFee,
          net_amount: netAmount,
          amount_1099_reportable: netAmount,
          period_month: invoice.period_month,
          period_year: invoice.period_year,
          payment_status: 'pending',
        })

      if (disbError) {
        console.error('Error creating disbursement:', disbError)
      } else {
        console.log('Disbursement created for landlord:', invoice.landlord_id)
      }

      // Check if lease is fully paid and clean up Payload
      if (invoice.lease_id) {
        await cleanupPayloadForLease(supabase, invoice.lease_id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('PM tenant payment webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}