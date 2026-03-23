import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST - Handle tenant rent payment webhook from Payload
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, data } = body

    console.log('PM tenant payment webhook received:', type, data?.id)

    const supabase = createClient()

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
      if (invoice.managed_properties?.pm_agreement_id) {
        const { data: agreement } = await supabase
          .from('pm_agreements')
          .select('management_fee_pct')
          .eq('id', invoice.managed_properties.pm_agreement_id)
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
    }

    return NextResponse.json({ received: true })
  } catch (error: any) {
    console.error('PM tenant payment webhook error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
