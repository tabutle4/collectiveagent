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
      other_deductions,
      other_deductions_description,
      period_month,
      period_year,
      notes,
    } = body

    // Validate required fields
    if (!landlord_id || !property_id || !gross_rent || !period_month || !period_year) {
      return NextResponse.json(
        { error: 'Landlord, property, gross rent, and period are required' },
        { status: 400 }
      )
    }

    // Calculate net amount
    const mgmtFee = management_fee || 0
    const otherDed = other_deductions || 0
    const netAmount = gross_rent - mgmtFee - otherDed

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
      .single()

    if (existing) {
      return NextResponse.json(
        { error: `A disbursement already exists for this property in ${period_month}/${period_year}` },
        { status: 409 }
      )
    }

    // Fetch PM agreement to get agent fee split
    const { data: agreement } = await supabase
      .from('pm_agreements')
      .select(`
        id, management_fee_pct, referring_agent_id, agent_fee_pct,
        referring_agent:users!pm_agreements_referring_agent_id_fkey(
          id, preferred_first_name, first_name, preferred_last_name, last_name
        )
      `)
      .eq('landlord_id', landlord_id)
      .eq('status', 'active')
      .single()

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

    // Create pm_fee_payouts records if there's a management fee
    const feePayouts: any[] = []
    if (mgmtFee > 0) {
      const agentFeePct = agreement?.agent_fee_pct || 0
      const agentAmount = mgmtFee * (agentFeePct / 100)
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
            payee_type: 'agent',
            payee_id: agreement.referring_agent_id,
            payee_name: agentName,
            amount: Math.round(agentAmount * 100) / 100,
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
