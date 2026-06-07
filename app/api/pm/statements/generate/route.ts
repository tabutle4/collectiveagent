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

    // 2. Mgmt fees: from paid pm_landlord_invoices within the period
    // (invoices are the canonical source for all landlords - full-service
    // invoices are auto-marked paid at disbursement creation)
    const { data: paidLandlordInvoices } = await supabaseAdmin
      .from('pm_landlord_invoices')
      .select('amount, paid_at')
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .eq('status', 'paid')
      .gte('paid_at', periodStart)
      .lt('paid_at', periodEnd)

    const totalMgmtFees = (paidLandlordInvoices || []).reduce(
      (sum, inv: any) => sum + Number(inv.amount || 0),
      0
    )

    // 3. Deductions and disbursement totals: from landlord_disbursements
    // Include both paid/completed AND pending so the statement shows
    // the full picture even before the disbursement is sent.
    // Match by period_month/period_year for monthly (exact period match)
    // and by payment_date range for annual (cash basis like rent).
    let disbQuery = supabaseAdmin
      .from('landlord_disbursements')
      .select(`
        id,
        gross_rent,
        management_fee,
        other_deductions,
        deposit_amount,
        net_amount,
        payment_date,
        payment_status,
        period_month,
        period_year
      `)
      .eq('landlord_id', landlordId)
      .eq('property_id', propertyId)
      .in('payment_status', ['completed', 'paid', 'pending', 'processing'])

    if (periodType === 'monthly') {
      disbQuery = disbQuery
        .eq('period_month', periodMonth!)
        .eq('period_year', periodYear)
    } else {
      // Annual: use payment_date range for paid, period_year for pending
      disbQuery = disbQuery.eq('period_year', periodYear)
    }

    const { data: disbursements } = await disbQuery

    const paidDisbursements = (disbursements || []).filter(
      (d: any) => ['completed', 'paid'].includes(d.payment_status)
    )
    const pendingDisbursements = (disbursements || []).filter(
      (d: any) => ['pending', 'processing'].includes(d.payment_status)
    )

    // Deductions: derive from the gap between gross_rent minus mgmt_fee and
    // net_amount. This ensures the displayed deductions match exactly what
    // produced the net — no double-counting with line-item deduction rows.
    // Formula per disbursement: gross_rent - management_fee - net_amount
    const totalDeductions = (disbursements || []).reduce(
      (sum, d: any) => {
        const implied = Number(d.gross_rent || 0) - Number(d.management_fee || 0) - Number(d.net_amount || 0)
        return sum + Math.max(0, implied)
      }, 0
    )
    const totalDepositsReturnedToLandlord = (paidDisbursements).reduce(
      (sum, d: any) => sum + Number(d.deposit_amount || 0), 0
    )
    const totalNetDisbursed = (paidDisbursements).reduce(
      (sum, d: any) => sum + Number(d.net_amount || 0), 0
    )
    const totalNetPending = (pendingDisbursements).reduce(
      (sum, d: any) => sum + Number(d.net_amount || 0), 0
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
    //    so the number matches the widget exactly).
    //    Subtract pending deposit disbursements: money already committed
    //    to go out should not appear as held in trust on the statement.
    const heldInTrustResult = await computeHeldInTrust(supabaseAdmin, {
      landlordId,
      propertyId,
    })

    const pendingDepositReturn = (pendingDisbursements).reduce(
      (sum, d: any) => sum + Number(d.deposit_amount || 0), 0
    )

    const heldInTrustAtStatement = Math.max(
      0,
      heldInTrustResult.heldInTrust - pendingDepositReturn
    )

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
        total_net_pending: Math.round(totalNetPending * 100) / 100,
        held_in_trust_at_statement_date: Math.round(heldInTrustAtStatement * 100) / 100,
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
