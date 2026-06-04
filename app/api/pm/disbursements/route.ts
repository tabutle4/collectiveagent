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
      other_deductions,
      other_deductions_description,
      deduction_ids,
      period_month,
      period_year,
      notes,
    } = body

    // Validate required fields
    if (!landlord_id || !property_id || gross_rent == null || !period_month || !period_year) {
      return NextResponse.json(
        { error: 'Landlord, property, gross rent, and period are required' },
        { status: 400 }
      )
    }

    // Block $0 gross rent. Without rent there is nothing to disburse;
    // pending deductions stay pending until the next month with rent.
    if (Number(gross_rent) <= 0) {
      return NextResponse.json(
        { error: 'Cannot disburse on $0 gross rent. Add the next month with rent received, and these deductions will carry over.' },
        { status: 400 }
      )
    }

    const mgmtFee = Number(management_fee) || 0
    const depositAmt = Number(deposit_amount) || 0
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

    const netAmount = Number(gross_rent) - mgmtFee - otherDed - lineItemTotal

    if (netAmount < 0) {
      return NextResponse.json(
        { error: 'Net amount cannot be negative' },
        { status: 400 }
      )
    }

    // Check for duplicate disbursement for same property/period
    const { data: existing } = await supabase
      .from('landlord_disbursements')
      .select('id')
      .eq('property_id', property_id)
      .eq('period_month', period_month)
      .eq('period_year', period_year)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `A disbursement already exists for this property in ${period_month}/${period_year}` },
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
        gross_rent,
        management_fee: mgmtFee,
        deposit_amount: depositAmt,
        other_deductions: otherDed,
        other_deductions_description: other_deductions_description || null,
        net_amount: netAmount,
        amount_1099_reportable: netAmount,
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