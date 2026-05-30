import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/pm/charged-basis-mgmt-fees/run
//
// For a given month/year, finds all unpaid tenant_invoices on
// charged-basis pm_agreements and creates a pending landlord_disbursement
// deduction for each (idempotent via UNIQUE source_invoice_id).
//
// This is the action endpoint - preview should be called first to show
// the admin what will happen, then run actually does it.
//
// Idempotency:
//   landlord_disbursement_deductions has a UNIQUE constraint on
//   source_invoice_id. If a deduction already exists for an invoice in
//   this batch, the INSERT will fail with code 23505. We catch that and
//   count it as already-charged rather than treat it as an error.
//
// Request body: { month: 1-12, year: number }
//
// Response: { month, year, created: number, skipped: number, errors: [] }

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

    // Re-run the same query as preview. Doing it server-side again rather
    // than trusting the client-passed list - the admin clicked Confirm on
    // a preview, but in the interval new invoices could have been paid
    // (and need to be excluded) or the agreement could have changed.
    const { data: invoices, error: invErr } = await supabaseAdmin
      .from('tenant_invoices')
      .select(`
        id,
        rent_amount,
        landlord_id,
        property_id,
        managed_properties(
          id,
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
      console.error('run query error:', invErr)
      return NextResponse.json({ error: invErr.message }, { status: 500 })
    }

    const candidates = (invoices || []).filter((inv: any) => {
      const pa = inv.managed_properties?.pm_agreements
      return pa && pa.mgmt_fee_basis === 'charged'
    })

    // Pre-filter out already-charged invoices in one query so we minimize
    // INSERT attempts (the UNIQUE constraint will still catch races, but
    // pre-filtering keeps the response counts accurate for the common case).
    const candidateIds = candidates.map((i: any) => i.id)
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

    const toInsert = candidates
      .filter((inv: any) => !alreadyChargedIds.has(inv.id))
      .map((inv: any) => {
        const pa = inv.managed_properties.pm_agreements
        const rent = Number(inv.rent_amount || 0)
        let fee = 0
        if (pa.management_fee_flat !== null && pa.management_fee_flat !== undefined) {
          fee = Number(pa.management_fee_flat)
        } else {
          fee = rent * (Number(pa.management_fee_pct || 0) / 100)
        }
        fee = Math.round(fee * 100) / 100

        const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })

        return {
          landlord_id: inv.landlord_id,
          property_id: inv.property_id,
          label: `${monthName} ${year} Management Fee (rent not collected)`,
          description: `Auto-charged per TXR-2201 Para 6(A): mgmt fee is owed even when rent is unpaid.`,
          amount: fee,
          incurred_date: new Date(year, month - 1, 1).toISOString().split('T')[0],
          source_invoice_id: inv.id,
          created_by: auth.user?.id || null,
        }
      })

    // Bulk insert. Postgres will reject duplicates via UNIQUE constraint,
    // but we've already filtered them out above. If a race condition
    // happens (parallel admin clicks), the second INSERT batch will see
    // 23505 and we report it as already-charged.
    let created = 0
    const errors: any[] = []

    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('landlord_disbursement_deductions')
        .insert(toInsert)
        .select('id')

      if (insErr) {
        // Constraint violation (23505) means concurrent run - report but don't fail
        if (insErr.code === '23505') {
          errors.push({ code: insErr.code, message: 'Some deductions were already created (concurrent run)' })
        } else {
          console.error('charged-basis run insert error:', insErr)
          return NextResponse.json({ error: insErr.message }, { status: 500 })
        }
      } else {
        created = (inserted || []).length
      }
    }

    return NextResponse.json({
      month,
      year,
      created,
      skipped: alreadyChargedIds.size,
      eligibleCount: candidates.length,
      errors,
    })
  } catch (err: any) {
    console.error('charged-basis run error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
