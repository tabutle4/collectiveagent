import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// POST - Create manual disbursement with fee payouts
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_process_pm_disbursements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    const {
      landlord_id,
      property_id,
      lease_id,
      tenant_invoice_id,
      gross_rent,
      management_fee,
      deposit_amount,
      reserve_amount,
      other_deductions,
      other_deductions_description,
      deduction_ids,
      period_month,
      period_year,
      notes,
    } = body

    // Validate required fields
    const disbursementType = body.disbursement_type || 'rent'
    const isDeposit = disbursementType === 'deposit'
    const isReserve = disbursementType === 'reserve'

    if (!landlord_id || !property_id || !period_month || !period_year) {
      return NextResponse.json(
        { error: 'Landlord, property, and period are required' },
        { status: 400 }
      )
    }

    // Rent disbursements require gross rent > 0.
    // Deposit disbursements require deposit_amount > 0.
    // Reserve disbursements require deposit_amount > 0 (reserve release).
    if (!isDeposit && !isReserve) {
      if (gross_rent == null || Number(gross_rent) <= 0) {
        return NextResponse.json(
          { error: 'Cannot disburse on $0 gross rent. Add the next month with rent received, and these deductions will carry over.' },
          { status: 400 }
        )
      }
    }

    if ((isDeposit || isReserve) && (!deposit_amount || Number(deposit_amount) <= 0)) {
      return NextResponse.json(
        { error: 'Deposit amount is required and must be greater than zero.' },
        { status: 400 }
      )
    }

    const mgmtFee = Number(management_fee) || 0
    const depositAmt = Number(deposit_amount) || 0
    const reserveAmt = (!isDeposit && !isReserve) ? Number(reserve_amount) || 0 : 0
    const otherDed = Number(other_deductions) || 0

    // Sum line-item deductions being attached at create time, if any.
    // Pending rows in landlord_disbursement_deductions that get attached
    // via deduction_ids reduce the net the same as legacy other_deductions.
    let lineItemTotal = 0
    if (Array.isArray(deduction_ids) && deduction_ids.length > 0) {
      const { data: dedRows } = await supabase
        .from('landlord_disbursement_deductions')
        .select('id, amount, disbursement_id')
        .in('id', deduction_ids)

      // Reject if any deduction is already attached to another disbursement
      const alreadyAttached = (dedRows || []).filter(
        (d: any) => d.disbursement_id && d.disbursement_id !== null
      )
      if (alreadyAttached.length > 0) {
        return NextResponse.json(
          { error: 'One or more selected deductions are already attached to another disbursement.' },
          { status: 400 }
        )
      }

      lineItemTotal = (dedRows || []).reduce(
        (sum: number, d: any) => sum + Number(d.amount || 0),
        0
      )
    }

    // Auto-attach recurring deductions for this property/period.
    // These are rows where is_recurring = true and the period falls within
    // their start/end date range and they haven't already been attached
    // to a disbursement for this period.
    let recurringDeductionIds: string[] = []
    let recurringLineItemTotal = 0

    if (!isDeposit && !isReserve) {
      // Period start/end for range check
      const periodStart = new Date(period_year, period_month - 1, 1).toISOString().split('T')[0]
      const periodEnd = new Date(period_year, period_month, 0).toISOString().split('T')[0]

      const { data: recurringRows } = await supabase
        .from('landlord_disbursement_deductions')
        .select('id, amount')
        .eq('property_id', property_id)
        .eq('is_recurring', true)
        .is('disbursement_id', null)
        .lte('recurring_start_date', periodEnd)
        .or(`recurring_end_date.is.null,recurring_end_date.gte.${periodStart}`)

      if (recurringRows && recurringRows.length > 0) {
        recurringDeductionIds = recurringRows.map((r: any) => r.id)
        recurringLineItemTotal = recurringRows.reduce(
          (sum: number, r: any) => sum + Number(r.amount || 0), 0
        )
      }
    }

    // Combine manual + recurring deduction totals for net calculation
    const allLineItemTotal = lineItemTotal + recurringLineItemTotal

    const netAmount = (isDeposit || isReserve)
      ? depositAmt
      : Number(gross_rent) - mgmtFee - otherDed - allLineItemTotal - reserveAmt

    if (netAmount < 0) {
      return NextResponse.json(
        { error: 'Net amount cannot be negative' },
        { status: 400 }
      )
    }

    // Check for duplicate disbursement of the same type for this property/period.
    // Rent and deposit disbursements are distinct records and can coexist
    // in the same period (e.g., first month: rent disbursement + deposit release).
    // We distinguish by whether gross_rent > 0 (rent) or deposit_amount > 0 (deposit/reserve).
    let dupQuery = supabase
      .from('landlord_disbursements')
      .select('id')
      .eq('property_id', property_id)
      .eq('period_month', period_month)
      .eq('period_year', period_year)
      .eq('disbursement_type', disbursementType)

    const { data: existing } = await dupQuery.maybeSingle()

    if (existing) {
      const typeLabel = isDeposit ? 'deposit' : isReserve ? 'reserve' : 'rent'
      return NextResponse.json(
        { error: `A ${typeLabel} disbursement already exists for this property in ${period_month}/${period_year}` },
        { status: 409 }
      )
    }

    // Fetch PM agreement scoped to THIS property (not landlord-wide).
    // A landlord may have multiple properties with different agreements;
    // the right one to use for fee splits is the one attached to the
    // specific property being disbursed.
    const { data: propertyRow } = await supabase
      .from('managed_properties')
      .select('pm_agreement_id')
      .eq('id', property_id)
      .single()

    let agreement: any = null
    if (propertyRow?.pm_agreement_id) {
      const { data: ag } = await supabase
        .from('pm_agreements')
        .select(`
          id, management_fee_pct, management_fee_flat, referring_agent_id, agent_fee_pct,
          referring_agent:users!pm_agreements_referring_agent_id_fkey(
            id, preferred_first_name, first_name, preferred_last_name, last_name
          )
        `)
        .eq('id', propertyRow.pm_agreement_id)
        .single()
      agreement = ag
    }

    // Create the disbursement
    const { data: disbursement, error } = await supabase
      .from('landlord_disbursements')
      .insert({
        landlord_id,
        property_id,
        lease_id: lease_id || null,
        tenant_invoice_id: tenant_invoice_id || null,
        gross_rent: isDeposit || isReserve ? 0 : Number(gross_rent),
        management_fee: isDeposit || isReserve ? 0 : mgmtFee,
        deposit_amount: depositAmt,
        reserve_amount: reserveAmt,
        disbursement_type: disbursementType,
        other_deductions: isDeposit || isReserve ? 0 : otherDed,
        other_deductions_description: isDeposit || isReserve ? null : (other_deductions_description || null),
        net_amount: netAmount,
        amount_1099_reportable: isDeposit || isReserve ? 0 : netAmount,
        period_month,
        period_year,
        payment_status: 'pending',
        notes: notes || null,
      })
      .select(`
        *,
        landlords(id, first_name, last_name),
        managed_properties(id, property_address)
      `)
      .single()

    if (error) throw error

    // Attach any line-item deductions to this newly-created disbursement.
    // Stamps disbursement_id and applied_at on each row.
    //
    // CRITICAL: this is a two-step write. If the UPDATE fails after the
    // disbursement INSERT succeeded, we'd leave a disbursement with the
    // deducted net but no deduction rows pointing back to it. To prevent
    // double-counting on the next disbursement, we roll back the insert
    // on failure.
    //
    // Note on cascade: landlord_disbursement_deductions.disbursement_id
    // is ON DELETE CASCADE. So if the attach actually committed but our
    // response read failed (network blip), naively deleting the disbursement
    // would also wipe the deduction rows. Detach first (NULL out
    // disbursement_id on the rows we just tried to attach), then delete the
    // disbursement. The detach is idempotent: rows already at NULL stay
    // at NULL.
    if (Array.isArray(deduction_ids) && deduction_ids.length > 0) {
      const { error: attachError } = await supabase
        .from('landlord_disbursement_deductions')
        .update({
          disbursement_id: disbursement.id,
          applied_at: new Date().toISOString(),
        })
        .in('id', deduction_ids)

      if (attachError) {
        // Detach any rows that might have committed, then delete the
        // disbursement. Deductions revert to pending and are re-suggested
        // on the next disbursement attempt.
        await supabase
          .from('landlord_disbursement_deductions')
          .update({ disbursement_id: null, applied_at: null })
          .in('id', deduction_ids)
        await supabase
          .from('landlord_disbursements')
          .delete()
          .eq('id', disbursement.id)

        console.error('Failed to attach deductions, rolled back disbursement:', attachError)
        return NextResponse.json(
          { error: 'Failed to attach deductions. Please try again.' },
          { status: 500 }
        )
      }
    }

    // Attach recurring deductions — create new deduction rows for each
    // recurring template and attach them to this disbursement. The source
    // row (is_recurring=true, disbursement_id=null) stays untouched as a
    // template; we insert a new applied row for this month.
    if (recurringDeductionIds.length > 0) {
      const { data: recurringRows } = await supabase
        .from('landlord_disbursement_deductions')
        .select('label, description, amount, sort_order')
        .in('id', recurringDeductionIds)

      if (recurringRows && recurringRows.length > 0) {
        const newRows = recurringRows.map((r: any) => ({
          landlord_id,
          property_id,
          label: r.label,
          description: r.description || null,
          amount: r.amount,
          sort_order: r.sort_order ?? 0,
          disbursement_id: disbursement.id,
          applied_at: new Date().toISOString(),
          is_recurring: false,
          created_by: auth.user.id,
        }))

        await supabase
          .from('landlord_disbursement_deductions')
          .insert(newRows)
      }
    }

    // Create pm_fee_payouts records if there's a management fee.
    // Also mark the corresponding pm_landlord_invoice as paid (the invoice
    // is the canonical source for all mgmt fee tracking).
    const feePayouts: any[] = []

    // Find the landlord invoice for this period/property and mark it paid
    let landlordInvoiceId: string | null = null
    if (mgmtFee > 0) {
      const { data: matchingInvoice } = await supabase
        .from('pm_landlord_invoices')
        .select('id')
        .eq('landlord_id', landlord_id)
        .eq('property_id', property_id)
        .eq('period_month', period_month)
        .eq('period_year', period_year)
        .neq('status', 'paid')
        .maybeSingle()

      if (matchingInvoice) {
        landlordInvoiceId = matchingInvoice.id
        await supabase
          .from('pm_landlord_invoices')
          .update({
            status: 'paid',
            paid_at: new Date().toISOString(),
            paid_amount: mgmtFee,
            payment_method: 'disbursement',
            updated_at: new Date().toISOString(),
          })
          .eq('id', matchingInvoice.id)
      }
    }

    if (mgmtFee > 0) {
      const agentFeePct = agreement?.agent_fee_pct || 0
      // Agent fee is % of gross rent (rent only), not % of management fee
      const agentAmount = Number(gross_rent) * (agentFeePct / 100)
      const brokerageAmount = mgmtFee - agentAmount

      // Agent payout (if there's a referring agent with a fee percentage)
      if (agreement?.referring_agent_id && agentAmount > 0) {
        const agent = agreement.referring_agent as any
        const agentName = agent 
          ? `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`.trim()
          : 'Unknown Agent'

        const { data: agentPayout } = await supabase
          .from('pm_fee_payouts')
          .insert({
            disbursement_id: disbursement.id,
            landlord_invoice_id: landlordInvoiceId,
            payee_type: 'agent',
            payee_id: agreement.referring_agent_id,
            payee_name: agentName,
            amount: Math.round(agentAmount * 100) / 100,
            amount_1099_reportable: Math.round(agentAmount * 100) / 100,
            payment_status: 'pending',
          })
          .select()
          .single()

        if (agentPayout) feePayouts.push(agentPayout)
      }

      // CRC/Brokerage payout
      if (brokerageAmount > 0) {
        const { data: crcPayout } = await supabase
          .from('pm_fee_payouts')
          .insert({
            disbursement_id: disbursement.id,
            landlord_invoice_id: landlordInvoiceId,
            payee_type: 'brokerage',
            payee_id: null,
            payee_name: 'Collective Realty Co.',
            amount: Math.round(brokerageAmount * 100) / 100,
            payment_status: 'pending',
          })
          .select()
          .single()

        if (crcPayout) feePayouts.push(crcPayout)
      }
    }

    return NextResponse.json({
      success: true,
      disbursement,
      fee_payouts: feePayouts,
    })
  } catch (error: any) {
    console.error('Error creating disbursement:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - List disbursements with filters
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const periodYear = searchParams.get('period_year')
    const periodMonth = searchParams.get('period_month')

    let query = supabase
      .from('landlord_disbursements')
      .select(`
        *,
        landlords(id, first_name, last_name, email, bank_status, payload_payment_method_id),
        managed_properties(id, property_address, city),
        tenant_invoices(id, period_month, period_year, total_amount, paid_at)
      `)
      .order('created_at', { ascending: false })

    if (status && status !== 'all') {
      query = query.eq('payment_status', status)
    }
    if (landlordId) {
      query = query.eq('landlord_id', landlordId)
    }
    if (propertyId) {
      query = query.eq('property_id', propertyId)
    }
    if (periodYear) {
      query = query.eq('period_year', parseInt(periodYear))
    }
    if (periodMonth) {
      query = query.eq('period_month', parseInt(periodMonth))
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ disbursements: data || [] })
  } catch (error: any) {
    console.error('Error fetching disbursements:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}