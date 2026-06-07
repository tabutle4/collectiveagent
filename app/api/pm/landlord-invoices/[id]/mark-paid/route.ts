import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// POST /api/pm/landlord-invoices/[id]/mark-paid
// Marks a landlord invoice as paid and creates pm_fee_payouts rows.
// Used for manual payments (Zelle, Check, Other) and by the disbursement
// route when a Rent Disbursement is created for full-service landlords.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const body = await request.json()
    const { payment_method, payment_notes, paid_at, disbursement_id } = body

    if (!payment_method) {
      return NextResponse.json({ error: 'Payment method is required' }, { status: 400 })
    }

    // Fetch invoice with agreement details for fee split calculation
    const { data: invoice, error: fetchErr } = await supabase
      .from('pm_landlord_invoices')
      .select(`
        *,
        managed_properties(
          id,
          pm_agreement_id,
          pm_agreements(
            id,
            management_fee_pct,
            management_fee_flat,
            referring_agent_id,
            agent_fee_pct,
            referring_agent:users!pm_agreements_referring_agent_id_fkey(
              id,
              preferred_first_name,
              first_name,
              preferred_last_name,
              last_name
            )
          )
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Invoice is already paid' }, { status: 400 })
    }

    const paidAtTs = paid_at ? new Date(paid_at).toISOString() : new Date().toISOString()

    // Mark invoice paid
    const { error: updateErr } = await supabase
      .from('pm_landlord_invoices')
      .update({
        status: 'paid',
        paid_at: paidAtTs,
        paid_amount: invoice.amount,
        payment_method,
        payment_notes: payment_notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', resolvedParams.id)

    if (updateErr) throw updateErr

    // Create pm_fee_payouts (same logic as disbursement route)
    const agreement = (invoice.managed_properties as any)?.pm_agreements
    const mgmtFee = Number(invoice.amount || 0)
    const feePayouts: any[] = []

    if (mgmtFee > 0 && agreement) {
      const agentFeePct = agreement.agent_fee_pct || 0

      // Agent fee is % of gross rent implied by the mgmt fee
      // We compute agent amount as agentFeePct% of (mgmtFee / mgmtFeePct * 100)
      // to stay consistent with disbursement route which uses gross_rent
      let agentAmount = 0
      if (agreement.referring_agent_id && agentFeePct > 0) {
        const impliedGross = agreement.management_fee_flat
          ? mgmtFee  // flat fee: agent gets agentFeePct of the flat amount
          : (mgmtFee / (agreement.management_fee_pct / 100))
        agentAmount = Math.round(impliedGross * (agentFeePct / 100) * 100) / 100
      }

      const brokerageAmount = Math.round((mgmtFee - agentAmount) * 100) / 100

      if (agreement.referring_agent_id && agentAmount > 0) {
        const agent = agreement.referring_agent as any
        const agentName = agent
          ? `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`.trim()
          : 'Unknown Agent'

        const { data: agentPayout } = await supabase
          .from('pm_fee_payouts')
          .insert({
            disbursement_id: disbursement_id || null,
            landlord_invoice_id: resolvedParams.id,
            payee_type: 'agent',
            payee_id: agreement.referring_agent_id,
            payee_name: agentName,
            amount: agentAmount,
            amount_1099_reportable: agentAmount,
            payment_status: 'pending',
          })
          .select()
          .single()

        if (agentPayout) feePayouts.push(agentPayout)
      }

      if (brokerageAmount > 0) {
        const { data: crcPayout } = await supabase
          .from('pm_fee_payouts')
          .insert({
            disbursement_id: disbursement_id || null,
            landlord_invoice_id: resolvedParams.id,
            payee_type: 'brokerage',
            payee_id: null,
            payee_name: 'Collective Realty Co.',
            amount: brokerageAmount,
            payment_status: 'pending',
          })
          .select()
          .single()

        if (crcPayout) feePayouts.push(crcPayout)
      }
    }

    return NextResponse.json({ success: true, fee_payouts: feePayouts })
  } catch (error: any) {
    console.error('Error marking landlord invoice paid:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
