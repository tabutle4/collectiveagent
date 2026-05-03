import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { computeCommission } from '@/lib/transactions/math'
import { defaultBasisForSide, sideCategory, type Side } from '@/lib/transactions/sides'

// ─── GET: reference data + agent profile (commission plan, team, MP, YTD) ────

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')

    const [
      { data: commissionPlans },
      { data: processingFeeTypes },
    ] = await Promise.all([
      supabase.from('commission_plans').select('*').order('name'),
      supabase.from('processing_fee_types').select('*').order('code'),
    ])

    let agentDetails: any = null
    let teamMembership: any = null
    let momentumPartner: any = null
    let ytdCapProgress = 0

    if (agentId) {
      const { data: agent } = await supabase
        .from('users')
        .select(`
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          commission_plan, lease_commission_plan,
          office, office_email, email,
          referring_agent_id, revenue_share_percentage,
          waive_buyer_processing_fees, waive_seller_processing_fees,
          qualifying_transaction_count
        `)
        .eq('id', agentId)
        .single()

      if (agent) {
        agentDetails = agent

        const { data: membership } = await supabase
          .from('team_member_agreements')
          .select(`
            id, agent_id, firm_min_override,
            team:teams!team_member_agreements_team_id_fkey(id, team_name)
          `)
          .eq('agent_id', agentId)
          .is('end_date', null)
          .single()

        if (membership && membership.team) {
          const team = Array.isArray(membership.team) ? membership.team[0] : membership.team

          const { data: teamLeadRecord } = await supabase
            .from('team_leads')
            .select(`
              id, agent_id,
              agent:users!team_leads_agent_id_fkey(
                id, first_name, last_name, preferred_first_name, preferred_last_name
              )
            `)
            .eq('team_id', team.id)
            .is('end_date', null)
            .single()

          const { data: splits } = await supabase
            .from('team_agreement_splits')
            .select('id, plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
            .eq('agreement_id', membership.id)

          const teamLeadAgent = teamLeadRecord?.agent
            ? (Array.isArray(teamLeadRecord.agent) ? teamLeadRecord.agent[0] : teamLeadRecord.agent)
            : null

          teamMembership = {
            ...membership,
            team: {
              ...team,
              team_lead_id: teamLeadRecord?.agent_id || null,
              team_lead: teamLeadAgent,
            },
            splits: splits || [],
          }
        }

        if (agent.referring_agent_id) {
          const { data: partner } = await supabase
            .from('users')
            .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
            .eq('id', agent.referring_agent_id)
            .single()
          if (partner) {
            momentumPartner = {
              id: partner.id,
              name: `${partner.preferred_first_name || partner.first_name} ${partner.preferred_last_name || partner.last_name}`.trim(),
              percentage: agent.revenue_share_percentage || 0,
            }
          }
        }

        const { data: ytdTransactions } = await supabase
          .from('transaction_internal_agents')
          .select('brokerage_split, counts_toward_progress')
          .eq('agent_id', agentId)
          .eq('counts_toward_progress', true)

        ytdCapProgress = (ytdTransactions || []).reduce((sum: number, t: any) => {
          return sum + parseFloat(t.brokerage_split || 0)
        }, 0)
      }
    }

    return NextResponse.json({
      commission_plans: commissionPlans || [],
      processing_fee_types: processingFeeTypes || [],
      agent_details: agentDetails,
      team_membership: teamMembership,
      momentum_partner: momentumPartner,
      ytd_cap_progress: ytdCapProgress,
    })
  } catch (error: any) {
    console.error('Smart calc GET error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch data' }, { status: 500 })
  }
}

// ─── POST: side-aware split + fee calc ───────────────────────────────────────
//
// Inputs:
//   agent_id          required
//   side              optional ('buyer' | 'seller' | 'tenant' | 'landlord')
//   agent_basis       optional — explicit dollar basis (overrides side-derived)
//   transaction       optional — full transaction record (for side-derived basis)
//   transaction_type  optional — used for processing fee + plan type
//   lead_source       optional ('team_lead' | 'own' | 'firm') — defaults to 'own'
//   is_lease          optional — defaults to derived from transaction_type
//
// Output: agent_basis, agent_split_pct, agent_gross, brokerage_split, fees,
//   team_lead_payout, momentum_partner_payout, agent_net (via computeCommission),
//   amount_1099_reportable, plan info, side echoed back.

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      agent_id,
      side,
      agent_basis: agentBasisInput,
      transaction,
      transaction_type: txTypeInput,
      lead_source = 'own',
      is_lease: isLeaseInput,
      // Backward compat: existing callers pass office_gross
      office_gross: officeGrossLegacy,
    } = body

    if (!agent_id) {
      return NextResponse.json({ error: 'agent_id required' }, { status: 400 })
    }

    const transactionType = txTypeInput || transaction?.transaction_type || ''
    const isLease = isLeaseInput !== undefined
      ? Boolean(isLeaseInput)
      : /lease|tenant|landlord|apt/i.test(transactionType)

    // Determine basis. Priority: explicit agent_basis > side-derived from
    // transaction > legacy office_gross fallback.
    let agentBasis: number
    if (agentBasisInput !== undefined && agentBasisInput !== null && agentBasisInput !== '') {
      agentBasis = parseFloat(String(agentBasisInput)) || 0
    } else if (transaction && side) {
      agentBasis = defaultBasisForSide(transaction, side as Side)
    } else if (officeGrossLegacy !== undefined) {
      agentBasis = parseFloat(String(officeGrossLegacy)) || 0
    } else {
      agentBasis = 0
    }

    // Fetch agent
    const { data: agent } = await supabase
      .from('users')
      .select(`
        id, commission_plan, lease_commission_plan,
        referring_agent_id, revenue_share_percentage,
        waive_buyer_processing_fees, waive_seller_processing_fees
      `)
      .eq('id', agent_id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Fetch team membership
    const { data: membershipData } = await supabase
      .from('team_member_agreements')
      .select(`
        id, agent_id, firm_min_override,
        team:teams!team_member_agreements_team_id_fkey(id, team_name)
      `)
      .eq('agent_id', agent_id)
      .is('end_date', null)
      .single()

    let teamMembership: any = null
    let teamSplits: any[] = []

    if (membershipData && membershipData.team) {
      const team = Array.isArray(membershipData.team) ? membershipData.team[0] : membershipData.team

      const { data: teamLeadRecord } = await supabase
        .from('team_leads')
        .select(`
          id, agent_id,
          agent:users!team_leads_agent_id_fkey(
            id, first_name, last_name, preferred_first_name, preferred_last_name
          )
        `)
        .eq('team_id', team.id)
        .is('end_date', null)
        .single()

      const teamLeadAgent = teamLeadRecord?.agent
        ? (Array.isArray(teamLeadRecord.agent) ? teamLeadRecord.agent[0] : teamLeadRecord.agent)
        : null

      const { data: splits } = await supabase
        .from('team_agreement_splits')
        .select('plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
        .eq('agreement_id', membershipData.id)

      teamSplits = splits || []
      teamMembership = {
        ...membershipData,
        team: {
          ...team,
          team_lead_id: teamLeadRecord?.agent_id || null,
          team_lead: teamLeadAgent,
        },
      }
    }

    // Determine commission plan
    let planCode = agent.commission_plan || ''
    if (isLease && agent.lease_commission_plan) {
      planCode = agent.lease_commission_plan
    }

    const { data: commissionPlan } = await supabase
      .from('commission_plans')
      .select('*')
      .eq('code', planCode)
      .single()

    const { data: processingFeeType } = await supabase
      .from('processing_fee_types')
      .select('*')
      .eq('code', transactionType)
      .single()

    // Splits — defaults from plan, then overridden by team agreement if applicable
    let agentSplitPct = commissionPlan?.agent_split_percentage ?? 85
    let firmSplitPct  = commissionPlan?.firm_split_percentage  ?? 15
    let teamLeadPct   = 0
    let coachingFee   = commissionPlan?.coaching_fee_amount    ?? 0

    if (teamMembership && teamSplits.length > 0) {
      const planType = isLease
        ? 'leases'
        : (planCode.includes('85') || planCode.includes('no_cap')) ? 'sales_85_15' : 'sales_70_30'
      const matchingSplit = teamSplits.find(s =>
        s.plan_type === planType && s.lead_source === lead_source
      ) || teamSplits.find(s => s.plan_type === planType)
      if (matchingSplit) {
        agentSplitPct = matchingSplit.agent_pct  ?? agentSplitPct
        teamLeadPct   = matchingSplit.team_lead_pct ?? 0
        firmSplitPct  = matchingSplit.firm_pct   ?? firmSplitPct
      }
    }

    // Side-aware basis is multiplied by the split. agent_basis is already the
    // side's portion (per side semantics); team & non-team agents both
    // multiply basis by their agent_pct to derive agent_gross.
    const agentGross   = round2(agentBasis * (agentSplitPct / 100))
    const brokerageSplit = round2(agentBasis * (firmSplitPct / 100))
    const teamLeadPayout = round2(agentBasis * (teamLeadPct / 100))

    // Processing fee with waiver check (side-aware)
    let processingFee = processingFeeType?.processing_fee || 0
    const cat = sideCategory(side as Side)
    if (cat === 'buying' && agent.waive_buyer_processing_fees) processingFee = 0
    if (cat === 'listing' && agent.waive_seller_processing_fees) processingFee = 0

    // Momentum partner payout — comes from brokerage_split
    let momentumPartnerPayout = 0
    let momentumPartnerName: string | null = null
    let momentumPartnerPct = 0
    if (agent.referring_agent_id && agent.revenue_share_percentage) {
      momentumPartnerPct = agent.revenue_share_percentage
      momentumPartnerPayout = round2(brokerageSplit * (momentumPartnerPct / 100))
      const { data: partner } = await supabase
        .from('users')
        .select('first_name, last_name, preferred_first_name, preferred_last_name')
        .eq('id', agent.referring_agent_id)
        .single()
      if (partner) {
        momentumPartnerName = `${partner.preferred_first_name || partner.first_name} ${partner.preferred_last_name || partner.last_name}`.trim()
      }
    }

    // Canonical 1099 + net via the central formula.
    // Note: rebate, btsa, other_fees, debts default to 0 here. Caller can
    // overlay any existing per-row values when applying.
    const { amount_1099, agent_net } = computeCommission({
      agent_gross: agentGross,
      processing_fee: processingFee,
      coaching_fee: coachingFee,
    })

    const brokerageNet = round2(brokerageSplit - momentumPartnerPayout)

    return NextResponse.json({
      agent_id,
      side: side ?? null,
      agent_basis: agentBasis,
      agent_split_pct: agentSplitPct,
      agent_gross: agentGross,
      brokerage_split: brokerageSplit,
      processing_fee: processingFee,
      coaching_fee: coachingFee,
      team_lead_pct: teamLeadPct,
      team_lead_payout: teamLeadPayout,
      team_lead_id: teamMembership?.team?.team_lead_id || null,
      team_lead_name: teamMembership?.team?.team_lead
        ? `${teamMembership.team.team_lead.preferred_first_name || teamMembership.team.team_lead.first_name} ${teamMembership.team.team_lead.preferred_last_name || teamMembership.team.team_lead.last_name}`.trim()
        : null,
      momentum_partner_pct: momentumPartnerPct,
      momentum_partner_payout: momentumPartnerPayout,
      momentum_partner_name: momentumPartnerName,
      momentum_partner_id: agent.referring_agent_id || null,
      amount_1099_reportable: amount_1099,
      agent_net,
      brokerage_net: brokerageNet,
      plan_code: planCode,
      plan_name: commissionPlan?.name || planCode,
      is_team_member: !!teamMembership,
      lead_source,
      // Backward compat for existing callers that read office_gross
      office_gross: agentBasis,
    })
  } catch (error: any) {
    console.error('Smart calc POST error:', error)
    return NextResponse.json({ error: error.message || 'Calculation failed' }, { status: 500 })
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
