import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
// Imported rather than redefined: two copies of a function that deletes a
// payment instrument is how they drift.
import {
  deletePayloadPaymentLink,
  deletePayloadInvoice,
} from '@/lib/payload/voidTenantPaymentLink'

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
      // Find invoice by payment link ID. We need rent_amount + deposit_amount
      // separately so the auto-created disbursement reflects only the rent
      // (the deposit stays in trust until later released to landlord or
      // tenant via a separate disbursement).
      const { data: invoice } = await supabase
        .from('tenant_invoices')
        .select(`
          id, tenant_id, landlord_id, property_id, lease_id,
          rent_amount, deposit_amount, total_amount, period_month, period_year,
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

      // Get PM agreement to calculate management fee.
      // management_fee_flat overrides management_fee_pct when set (not null).
      // The percentage applies to rent only - never to the security deposit
      // portion of the invoice (deposit stays in trust until released).
      let managementFeePct = 10 // Default
      let managementFeeFlat: number | null = null
      const property = invoice.managed_properties as any
      if (property?.pm_agreement_id) {
        const { data: agreement } = await supabase
          .from('pm_agreements')
          .select('management_fee_pct, management_fee_flat')
          .eq('id', property.pm_agreement_id)
          .single()

        if (agreement) {
          managementFeePct = agreement.management_fee_pct
          managementFeeFlat = agreement.management_fee_flat
        }
      }

      // Disbursement gross is rent only - the deposit portion goes into
      // trust and is released later via a separate disbursement when the
      // lease ends (to landlord, tenant, or split).
      const rentAmount = Number(invoice.rent_amount || 0)
      const managementFee = managementFeeFlat != null
        ? Number(managementFeeFlat)
        : rentAmount * (managementFeePct / 100)

      // Look up any PENDING deductions for this property so they get attached
      // to this auto-created disbursement (matches the admin form behavior).
      // Without this, deductions sit pending forever and never reduce the
      // landlord's net check.
      const { data: pendingDeductions } = await supabase
        .from('landlord_disbursement_deductions')
        .select('id, amount')
        .eq('property_id', invoice.property_id)
        .is('disbursement_id', null)

      const pendingDeductionsTotal = (pendingDeductions || []).reduce(
        (sum: number, d: any) => sum + Number(d.amount || 0),
        0
      )

      const netAmount = rentAmount - managementFee - pendingDeductionsTotal

      // Create pending disbursement for landlord (rent portion only)
      const { data: createdDisb, error: disbError } = await supabase
        .from('landlord_disbursements')
        .insert({
          landlord_id: invoice.landlord_id,
          tenant_invoice_id: invoice.id,
          property_id: invoice.property_id,
          lease_id: invoice.lease_id,
          gross_rent: rentAmount,
          management_fee: managementFee,
          deposit_amount: 0,
          net_amount: netAmount,
          amount_1099_reportable: netAmount,
          period_month: invoice.period_month,
          period_year: invoice.period_year,
          payment_status: 'pending',
        })
        .select('id')
        .single()

      if (disbError) {
        console.error('Error creating disbursement:', disbError)
      } else if (createdDisb) {
        console.log('Disbursement created for landlord:', invoice.landlord_id)

        // Attach pending deductions to this newly-created disbursement.
        // If attach fails, log it but don't roll back; the disbursement is
        // already pending and a human can reconcile via the admin UI.
        // The orphaned pending deductions will still show in the next
        // disbursement attempt for this property.
        if (pendingDeductions && pendingDeductions.length > 0) {
          const { error: attachError } = await supabase
            .from('landlord_disbursement_deductions')
            .update({
              disbursement_id: createdDisb.id,
              applied_at: new Date().toISOString(),
            })
            .in('id', pendingDeductions.map((d: any) => d.id))

          if (attachError) {
            console.error(
              'Failed to attach pending deductions to disbursement',
              createdDisb.id,
              attachError
            )
          }
        }
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