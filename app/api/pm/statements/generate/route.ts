import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { computeHeldInTrust } from '@/lib/pm-calculations'

// POST /api/pm/statements/generate
//
// Computes a statement for a landlord+property+period combination and
// inserts a row into pm_statements with the cached totals.
//
// CASH BASIS: This statement reflects money that MOVED in the period
// (paid_at on invoices, payment_date on disbursements). Not what was
// invoiced/owed in the period.
//
// Body:
//   { landlord_id, property_id, period_type: 'monthly'|'annual', period_year, period_month? }
//
// Response: { statement: <pm_statements row>, totals: <computed totals> }
//
// Idempotency: unique index on (landlord_id, property_id, period_type,
// period_year, COALESCE(period_month, 0)). If a statement already exists
// for that scope, returns 409 with the existing statement id - the UI
// can route admin to view it or offer "regenerate".

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const landlordId = body.landlord_id
    const propertyId = body.property_id
    const periodType = body.period_type as 'monthly' | 'annual'
    const periodYear = parseInt(body.period_year, 10)
    const periodMonth = body.period_month ? parseInt(body.period_month, 10) : null

    if (!landlordId || !propertyId) {
      return NextResponse.json({ error: 'landlord_id and property_id required' }, { status: 400 })
    }
    if (periodType !== 'monthly' && periodType !== 'annual') {
      return NextResponse.json({ error: "period_type must be 'monthly' or 'annual'" }, { status: 400 })
    }
    if (!periodYear || periodYear < 2020 || periodYear > 2100) {
      return NextResponse.json({ error: 'period_year invalid' }, { status: 400 })
    }
    if (periodType === 'monthly' && (!periodMonth || periodMonth < 1 || periodMonth > 12)) {
      return NextResponse.json({ error: 'period_month required for monthly statements' }, { status: 400 })
    }

    // Check for existing statement (unique constraint will catch races
    // but we want to surface a clean "already exists" message here).
    //
    // Annual statements have period_month=NULL. Supabase JS .eq does NOT
    // match NULL, so we use .is for that case. The unique index uses
    // COALESCE(period_month, 0) so the DB-level constraint still catches
    // both monthly and annual duplicates.
    let existingQuery = supabaseAdmin
      .from('pm_statements')
      .select('id')
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .eq('period_type', periodType)
      .eq('period_year', periodYear)
    if (periodMonth === null) {
      existingQuery = existingQuery.is('period_month', null)
    } else {
      existingQuery = existingQuery.eq('period_month', periodMonth)
    }
    const { data: existing } = await existingQuery.maybeSingle()

    if (existing) {
      return NextResponse.json(
        {
          error: 'Statement already exists for this period',
          existingId: existing.id,
        },
        { status: 409 }
      )
    }

    // Compute the period date range. For monthly, [first of month, first of next month).
    // For annual, [first of year, first of next year).
    let periodStart: string
    let periodEnd: string
    if (periodType === 'monthly') {
      periodStart = new Date(periodYear, periodMonth! - 1, 1).toISOString().split('T')[0]
      const next = new Date(periodYear, periodMonth!, 1)
      periodEnd = next.toISOString().split('T')[0]
    } else {
      periodStart = new Date(periodYear, 0, 1).toISOString().split('T')[0]
      periodEnd = new Date(periodYear + 1, 0, 1).toISOString().split('T')[0]
    }

    // ----- Compute totals (cash basis) -----

    // 1. Rent collected this period: tenant_invoices.rent_amount where
    //    paid_at falls within period AND landlord/property match
    const { data: paidInvoices } = await supabaseAdmin
      .from('tenant_invoices')
      .select('rent_amount, deposit_amount, paid_at')
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .eq('status', 'paid')
      .gte('paid_at', periodStart)
      .lt('paid_at', periodEnd)

    const totalRentCollected = (paidInvoices || []).reduce(
      (sum, inv: any) => sum + Number(inv.rent_amount || 0),
      0
    )
    const totalDepositsIn = (paidInvoices || []).reduce(
      (sum, inv: any) => sum + Number(inv.deposit_amount || 0),
      0
    )

    // 2. Mgmt fees + deductions: from landlord_disbursements where
    //    payment_date falls in period
    const { data: disbursements } = await supabaseAdmin
      .from('landlord_disbursements')
      .select(`
        id,
        management_fee,
        other_deductions,
        deposit_amount,
        net_amount,
        payment_date,
        landlord_disbursement_deductions(amount)
      `)
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .in('payment_status', ['completed', 'paid'])
      .gte('payment_date', periodStart)
      .lt('payment_date', periodEnd)

    const totalMgmtFees = (disbursements || []).reduce(
      (sum, d: any) => sum + Number(d.management_fee || 0),
      0
    )
    const totalLineItemDeductions = (disbursements || []).reduce(
      (sum, d: any) => sum + ((d.landlord_disbursement_deductions || []).reduce(
        (s: number, lid: any) => s + Number(lid.amount || 0),
        0
      )),
      0
    )
    const totalOtherDeductions = (disbursements || []).reduce(
      (sum, d: any) => sum + Number(d.other_deductions || 0),
      0
    )
    const totalDeductions = totalLineItemDeductions + totalOtherDeductions
    const totalDepositsReturnedToLandlord = (disbursements || []).reduce(
      (sum, d: any) => sum + Number(d.deposit_amount || 0),
      0
    )
    const totalNetDisbursed = (disbursements || []).reduce(
      (sum, d: any) => sum + Number(d.net_amount || 0),
      0
    )

    // 3. Tenant disbursements (deposit refunds to tenants) within period
    const { data: tenantDisb } = await supabaseAdmin
      .from('tenant_disbursements')
      .select('amount, payment_date')
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .in('payment_status', ['completed', 'paid'])
      .gte('payment_date', periodStart)
      .lt('payment_date', periodEnd)

    const totalDepositsRefundedToTenant = (tenantDisb || []).reduce(
      (sum, td: any) => sum + Number(td.amount || 0),
      0
    )

    // 4. Held in trust at statement date (uses computeHeldInTrust helper
    //    so the number matches the widget exactly)
    const heldInTrustResult = await computeHeldInTrust(supabaseAdmin, {
      landlordId,
      propertyId,
    })

    // ----- Insert pm_statements row -----
    const { data: statement, error: insErr } = await supabaseAdmin
      .from('pm_statements')
      .insert({
        landlord_id: landlordId,
        property_id: propertyId,
        period_type: periodType,
        period_month: periodMonth,
        period_year: periodYear,
        statement_date: new Date().toISOString().split('T')[0],
        total_rent_collected: Math.round(totalRentCollected * 100) / 100,
        total_management_fees: Math.round(totalMgmtFees * 100) / 100,
        total_deductions: Math.round(totalDeductions * 100) / 100,
        total_deposits_in: Math.round(totalDepositsIn * 100) / 100,
        total_deposits_returned_to_landlord: Math.round(totalDepositsReturnedToLandlord * 100) / 100,
        total_deposits_refunded_to_tenant: Math.round(totalDepositsRefundedToTenant * 100) / 100,
        total_net_disbursed: Math.round(totalNetDisbursed * 100) / 100,
        held_in_trust_at_statement_date: Math.round(heldInTrustResult.heldInTrust * 100) / 100,
        created_by: auth.user?.id || null,
      })
      .select('*')
      .single()

    if (insErr) {
      // Unique violation - statement was created concurrently
      if (insErr.code === '23505') {
        let lookupQuery = supabaseAdmin
          .from('pm_statements')
          .select('id')
          .eq('landlord_id', landlordId)
          .eq('property_id', propertyId)
          .eq('period_type', periodType)
          .eq('period_year', periodYear)
        if (periodMonth === null) {
          lookupQuery = lookupQuery.is('period_month', null)
        } else {
          lookupQuery = lookupQuery.eq('period_month', periodMonth)
        }
        const { data: nowExisting } = await lookupQuery.maybeSingle()
        return NextResponse.json(
          { error: 'Statement already exists', existingId: nowExisting?.id },
          { status: 409 }
        )
      }
      console.error('Statement generate insert error:', insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }

    return NextResponse.json({ statement })
  } catch (err: any) {
    console.error('Statement generate error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
