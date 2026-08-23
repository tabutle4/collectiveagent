import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'

export async function GET(request: NextRequest) {
  try {
    // Company-wide numbers: admin dashboard only. requireAuth here would let
    // any logged-in agent pull every transaction row by calling the URL.
    const auth = await requirePermission(request, 'can_view_all_transactions')
    if (auth.error) return auth.error

    const [transactions, agentRows, typesRes, teamsRes] = await Promise.all([
      fetchAllRows(
        'transactions',
        'id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net, office_location, compliance_status, cda_status'
      ),
      fetchAllRows(
        'transaction_internal_agents',
        'transaction_id, agent_id, agent_role, agent_net, sales_volume, payment_status'
      ),
      supabaseAdmin.from('processing_fee_types').select('name, is_lease').eq('is_active', true),
      supabaseAdmin
        .from('team_member_agreements')
        .select('agent_id, team:teams(team_name)')
        .is('end_date', null),
    ])

    // Build agent_id -> team_name lookup
    const agentTeamMap: Record<string, string> = {}
    if (teamsRes.data) {
      teamsRes.data.forEach((row: any) => {
        if (row.agent_id && row.team?.team_name) {
          agentTeamMap[row.agent_id] = row.team.team_name
        }
      })
    }

    // Enrich agent rows with team names
    const enrichedAgentRows = agentRows.map((row: any) => ({
      ...row,
      team_name: agentTeamMap[row.agent_id] || null,
    }))

    // Needs Attention counts. Definitions mirror the compliance tracker page:
    //   compliance requested = working deal with a submission awaiting review
    //   CDA needed           = sale, compliance complete, CDA not sent yet
    //   broker approval      = CDA sent for approval, broker has not approved
    //   eligible for payout  = check received + compliance complete +
    //                          checklist done, with an unpaid commission row
    const isLeaseType = (t: any) => /tenant|landlord|lease/i.test(String(t.transaction_type || ''))
    const isWorking = (t: any) => ['active', 'pending'].includes(String(t.status || '').toLowerCase())
    const complianceRequested = (transactions as any[]).filter(
      t => isWorking(t) && ['submitted', 'incomplete'].includes(String(t.compliance_status || ''))
    ).length
    const cdaNeeded = (transactions as any[]).filter(
      t => isWorking(t) && !isLeaseType(t) && String(t.compliance_status || '') === 'complete' && String(t.cda_status || '') !== 'sent'
    ).length
    const brokerApprovalPending = (transactions as any[]).filter(
      t => String(t.cda_status || '') === 'pending_approval'
    ).length
    // Eligible for payout = a check has been received AND compliance is
    // complete AND the deal's checklist is done (sales use the cda checklist,
    // leases the payouts checklist - same rule as the compliance tracker).
    // Deals whose commission rows are all already paid drop off the count.
    const [{ data: checkRows }, { data: templates }] = await Promise.all([
      supabaseAdmin.from('checks_received').select('transaction_id').not('transaction_id', 'is', null),
      supabaseAdmin.from('checklist_templates').select('id, slug').in('slug', ['cda', 'payouts']),
    ])
    const checkTxnIds = new Set((checkRows || []).map((c: any) => c.transaction_id))
    // DERIVED compliance for the payout-eligibility tile. The stored
    // transactions.compliance_status is dual-written and falls behind what
    // the compliance page actually recorded, which made this tile miscount.
    // Derivation is scoped to deals that have a check — eligibility requires
    // one anyway, so this keeps the submission query small. Chunked because
    // the helper puts the whole id list in one .in() URL.
    const eligibleIds = Array.from(checkTxnIds).filter(Boolean) as string[]
    const complianceByTxn: Record<string, any> = {}
    for (let i = 0; i < eligibleIds.length; i += 200) {
      Object.assign(
        complianceByTxn,
        await deriveComplianceForTransactions(eligibleIds.slice(i, i + 200))
      )
    }
    const cdaTemplateId = (templates || []).find((t: any) => t.slug === 'cda')?.id || null
    const payoutTemplateId = (templates || []).find((t: any) => t.slug === 'payouts')?.id || null
    const { data: itemRows } = await supabaseAdmin
      .from('checklist_items')
      .select('id, checklist_template_id')
      .in('checklist_template_id', [cdaTemplateId, payoutTemplateId].filter(Boolean) as string[])
      .eq('is_active', true)
    const cdaItemIds = (itemRows || []).filter((i: any) => i.checklist_template_id === cdaTemplateId).map((i: any) => i.id)
    const payoutItemIds = (itemRows || []).filter((i: any) => i.checklist_template_id === payoutTemplateId).map((i: any) => i.id)
    const completions = await fetchAllRows('checklist_completions', 'transaction_id, checklist_item_id')
    const doneByTxn: Record<string, Set<string>> = {}
    for (const c of completions as any[]) {
      if (!doneByTxn[c.transaction_id]) doneByTxn[c.transaction_id] = new Set()
      doneByTxn[c.transaction_id].add(c.checklist_item_id)
    }
    const checklistDone = (t: any) => {
      const required = isLeaseType(t) ? payoutItemIds : cdaItemIds
      const done = doneByTxn[t.id] || new Set<string>()
      return required.length > 0 && required.every((iid: string) => done.has(iid))
    }
    const unpaidTxnIds = new Set(
      (agentRows as any[])
        .filter(r =>
          ['primary_agent', 'listing_agent', 'co_agent'].includes(String(r.agent_role || '')) &&
          String(r.payment_status || '') !== 'paid' &&
          (parseFloat(String(r.agent_net ?? 0)) || 0) > 0
        )
        .map(r => r.transaction_id)
    )
    // External brokerage payouts count too: a deal whose agent is paid but
    // whose referral / co-op brokerage check hasn't gone out is still owed.
    const { data: tebRows } = await supabaseAdmin
      .from('transaction_external_brokerages')
      .select('transaction_id, payment_status, amount_1099_reportable')
    for (const e of tebRows || []) {
      if (
        e.transaction_id &&
        String(e.payment_status || '') !== 'paid' &&
        (parseFloat(String(e.amount_1099_reportable ?? 0)) || 0) > 0
      ) {
        unpaidTxnIds.add(e.transaction_id)
      }
    }
    const eligibleForPayout = (transactions as any[]).filter(
      t =>
        checkTxnIds.has(t.id) &&
        complianceByTxn[t.id]?.status === 'complete' &&
        checklistDone(t) &&
        unpaidTxnIds.has(t.id)
    ).length

    return NextResponse.json({
      transactions,
      agentRows: enrichedAgentRows,
      processingFeeTypes: typesRes.data || [],
      needsAttention: {
        complianceRequested,
        cdaNeeded,
        brokerApprovalPending,
        eligibleForPayout,
      },
    })
  } catch (err: any) {
    console.error('Dashboard transactions API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}