import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/pm/charged-basis-mgmt-fees/preview
//
// For a given month/year, find all unpaid tenant_invoices belonging to
// properties whose pm_agreement has mgmt_fee_basis='charged'. Returns a
// preview of what auto-charge deductions WOULD be created, without
// actually creating them. Companion to /run.
//
// Why a separate preview endpoint:
//   The admin needs to see what's about to happen before clicking
//   Confirm. Showing 0 rows means "nothing owed this month" so the admin
//   doesn't need to run the job. Showing 5 rows tells the admin the
//   total $ that's about to go into pending deductions.
//
// Idempotency:
//   This route never writes. It only reads. Safe to call repeatedly.
//   Skips invoices that already have a deduction with source_invoice_id
//   pointing at them (i.e. already auto-charged for that month).
//
// Request body: { month: 1-12, year: number }
//
// Response shape:
//   {
//     month, year,
//     totalAmount: number,
//     items: Array<{
//       invoice_id, landlord_id, property_id,
//       landlord_name, property_address,
//       rent_amount, fee_basis, fee_pct, fee_flat,
//       calculated_fee, period_label, due_date,
//       already_charged: boolean,  // true if a source_invoice_id deduction already exists
//     }>
//   }

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const month = parseInt(body.month, 10)
    const year = parseInt(body.year, 10)

    if (!month || month < 1 || month > 12) {
      return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 })
    }
    if (!year || year < 2020 || year > 2100) {
      return NextResponse.json({ error: 'year invalid' }, { status: 400 })
    }

    // Find all unpaid invoices for the given period that belong to
    // properties on charged-basis pm_agreements.
    //
    // Joins:
    //   tenant_invoices → managed_properties → pm_agreements
    //   tenant_invoices → landlords  (for the name display)
    //
    // Filters:
    //   - status != 'paid'  (paid invoices already have a normal disbursement happening)
    //   - status != 'cancelled' (cancelled invoices don't owe a fee)
    //   - period matches month/year
    //   - agreement.mgmt_fee_basis = 'charged'
    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('tenant_invoices')
      .select(`
        id,
        rent_amount,
        due_date,
        status,
        period_month,
        period_year,
        landlord_id,
        property_id,
        landlords(id, first_name, last_name),
        managed_properties(
          id,
          property_address,
          unit,
          pm_agreement_id,
          pm_agreements(
            id,
            mgmt_fee_basis,
            management_fee_pct,
            management_fee_flat
          )
        )
      `)
      .eq('period_month', month)
      .eq('period_year', year)
      .neq('status', 'paid')
      .neq('status', 'cancelled')

    if (invErr) {
      console.error('preview query error:', invErr)
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    // Filter to only invoices on charged-basis agreements + compute the fee
    // for each. Also check whether each invoice already has an auto-charge
    // deduction (so the UI can show "already done").
    const candidateInvoices = (invoices || []).filter((inv: any) => {
      const mp = inv.managed_properties
      const pa = mp?.pm_agreements
      return pa && pa.mgmt_fee_basis === 'charged'
    })

    // Pull existing source_invoice_id rows in bulk
    const candidateIds = candidateInvoices.map((i: any) => i.id)
    const alreadyChargedIds = new Set<string>()
    if (candidateIds.length > 0) {
      const { data: existingDeductions } = await supabaseAdmin
        .from('landlord_disbursement_deductions')
        .select('source_invoice_id')
        .in('source_invoice_id', candidateIds)
      ;(existingDeductions || []).forEach((d: any) => {
        if (d.source_invoice_id) alreadyChargedIds.add(d.source_invoice_id)
      })
    }

    const items = candidateInvoices.map((inv: any) => {
      const pa = inv.managed_properties.pm_agreements
      const rent = Number(inv.rent_amount || 0)
      let fee = 0
      // management_fee_flat wins when set, otherwise apply pct to rent
      if (pa.management_fee_flat !== null && pa.management_fee_flat !== undefined) {
        fee = Number(pa.management_fee_flat)
      } else {
        fee = rent * (Number(pa.management_fee_pct || 0) / 100)
      }
      // Round to cents to avoid float drift
      fee = Math.round(fee * 100) / 100

      const landlord = inv.landlords
      const property = inv.managed_properties

      return {
        invoice_id: inv.id,
        landlord_id: inv.landlord_id,
        property_id: inv.property_id,
        landlord_name: landlord ? `${landlord.first_name} ${landlord.last_name}` : 'Unknown',
        property_address: property
          ? `${property.property_address}${property.unit ? ` ${property.unit}` : ''}`
          : 'Unknown',
        rent_amount: rent,
        fee_pct: Number(pa.management_fee_pct || 0),
        fee_flat: pa.management_fee_flat !== null ? Number(pa.management_fee_flat) : null,
        calculated_fee: fee,
        period_label: `${month}/${year}`,
        due_date: inv.due_date,
        status: inv.status,
        already_charged: alreadyChargedIds.has(inv.id),
      }
    })

    const totalAmount = items
      .filter(i => !i.already_charged)
      .reduce((sum, i) => sum + i.calculated_fee, 0)

    return NextResponse.json({
      month,
      year,
      totalAmount: Math.round(totalAmount * 100) / 100,
      items,
      pendingCount: items.filter(i => !i.already_charged).length,
      alreadyChargedCount: items.filter(i => i.already_charged).length,
    })
  } catch (err: any) {
    console.error('charged-basis preview error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
