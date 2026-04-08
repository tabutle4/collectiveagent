import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET: Fetch reference data and agent details ─────────────────────────────

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const agentId = searchParams.get('agent_id')
    const transactionId = searchParams.get('transaction_id')

    // Fetch commission plans and processing fee types
    const [
      { data: commissionPlans },
      { data: processingFeeTypes },
    ] = await Promise.all([
      supabase.from('commission_plans').select('*').order('name'),
      supabase.from('processing_fee_types').select('*').order('type_code'),
    ])

    // If agent_id provided, fetch agent details with team membership and momentum partner
    let agentDetails = null
    let teamMembership = null
    let momentumPartner = null
    let ytdCapProgress = 0

    if (agentId) {
      // Get agent with their momentum partner (referring_agent_id)
      const { data: agent } = await supabase
        .from('users')
        .select(`
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          commission_plan, lease_commission_plan, lease_custom_split,
          office, office_email, email,
          referring_agent_id, revenue_share_percentage,
          waive_buyer_processing_fees, waive_seller_processing_fees,
          qualifying_transaction_count, cap_year
        `)
        .eq('id', agentId)
        .single()

      if (agent) {
        agentDetails = agent

        // Fetch team membership if exists
        const { data: membership } = await supabase
          .from('team_member_agreements')
          .select(`
            id, agent_id, firm_min_override,
            team:teams!team_member_agreements_team_id_fkey(
              id, team_name, team_lead_id,
              team_lead:users!teams_team_lead_id_fkey(
                id, first_name, last_name, preferred_first_name, preferred_last_name
              )
            )
          `)
          .eq('agent_id', agentId)
          .is('end_date', null)
          .single()

        if (membership) {
          // Fetch splits for this membership
          const { data: splits } = await supabase
            .from('team_agreement_splits')
            .select('id, plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
            .eq('agreement_id', membership.id)

          teamMembership = { ...membership, splits: splits || [] }
        }

        // Fetch momentum partner if exists
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

        // Calculate YTD cap progress for cap plans
        const currentYear = new Date().getFullYear()
        const { data: ytdTransactions } = await supabase
          .from('transaction_internal_agents')
          .select('brokerage_split, counts_toward_progress')
          .eq('agent_id', agentId)
          .eq('counts_toward_progress', true)

        // Filter by cap_year if present, otherwise use current year
        // Note: cap_year stored on agent record indicates when their cap year started
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

// ─── POST: Calculate agent split and fees ────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      agent_id,
      office_gross,
      transaction_type,
      lead_source = 'own', // 'team_lead', 'own', 'firm'
      is_lease = false,
    } = body

    if (!agent_id || office_gross === undefined) {
      return NextResponse.json({ error: 'agent_id and office_gross required' }, { status: 400 })
    }

    const officeGross = parseFloat(office_gross) || 0

    // Fetch agent details
    const { data: agent } = await supabase
      .from('users')
      .select(`
        id, commission_plan, lease_commission_plan, lease_custom_split,
        referring_agent_id, revenue_share_percentage,
        waive_buyer_processing_fees, waive_seller_processing_fees
      `)
      .eq('id', agent_id)
      .single()

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Fetch team membership if exists
    const { data: teamMembership } = await supabase
      .from('team_member_agreements')
      .select(`
        id, agent_id, firm_min_override,
        team:teams!team_member_agreements_team_id_fkey(
          id, team_name, team_lead_id,
          team_lead:users!teams_team_lead_id_fkey(
            id, first_name, last_name, preferred_first_name, preferred_last_name
          )
        )
      `)
      .eq('agent_id', agent_id)
      .is('end_date', null)
      .single()

    let teamSplits: any[] = []
    if (teamMembership) {
      const { data: splits } = await supabase
        .from('team_agreement_splits')
        .select('plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
        .eq('agreement_id', teamMembership.id)

      teamSplits = splits || []
    }

    // Determine agent's commission plan
    let planCode = agent.commission_plan || ''
    if (is_lease && agent.lease_commission_plan) {
      planCode = agent.lease_commission_plan
    }

    // Fetch commission plan details
    const { data: commissionPlan } = await supabase
      .from('commission_plans')
      .select('*')
      .eq('code', planCode)
      .single()

    // Fetch processing fee for transaction type
    const { data: processingFeeType } = await supabase
      .from('processing_fee_types')
      .select('*')
      .eq('type_code', transaction_type)
      .single()

    // ─── Calculate splits ────────────────────────────────────────────────────

    let agentSplitPct = 85 // default
    let firmSplitPct = 15
    let teamLeadPct = 0
    let coachingFee = 0

    // Get base split from commission plan
    if (commissionPlan) {
      agentSplitPct = commissionPlan.agent_split_percentage || 85
      firmSplitPct = commissionPlan.firm_split_percentage || 15
      coachingFee = commissionPlan.coaching_fee_amount || 0
    }

    // Handle custom lease split
    if (is_lease && agent.lease_commission_plan === 'custom' && agent.lease_custom_split) {
      agentSplitPct = agent.lease_custom_split
      firmSplitPct = 100 - agent.lease_custom_split
    }

    // Apply team splits if team member
    if (teamMembership && teamSplits.length > 0) {
      // Determine plan type for split lookup
      const planType = is_lease ? 'leases' : (planCode.includes('85') || planCode.includes('no_cap')) ? 'sales_85_15' : 'sales_70_30'
      
      // Find matching split
      const matchingSplit = teamSplits.find(s => 
        s.plan_type === planType && s.lead_source === lead_source
      ) || teamSplits.find(s => s.plan_type === planType)

      if (matchingSplit) {
        agentSplitPct = matchingSplit.agent_pct || agentSplitPct
        teamLeadPct = matchingSplit.team_lead_pct || 0
        firmSplitPct = matchingSplit.firm_pct || firmSplitPct
      }
    }

    // Calculate amounts
    const agentGross = officeGross * (agentSplitPct / 100)
    const brokerageSplit = officeGross * (firmSplitPct / 100)
    const teamLeadPayout = officeGross * (teamLeadPct / 100)

    // Processing fee (check waiver)
    let processingFee = processingFeeType?.fee_amount || 0
    const txType = (transaction_type || '').toLowerCase()
    if (txType.includes('buyer') && agent.waive_buyer_processing_fees) {
      processingFee = 0
    }
    if ((txType.includes('seller') || txType.includes('listing')) && agent.waive_seller_processing_fees) {
      processingFee = 0
    }

    // Momentum partner calculation (from brokerage side, NOT agent side)
    let momentumPartnerPayout = 0
    let momentumPartnerName = null
    let momentumPartnerPct = 0

    if (agent.referring_agent_id && agent.revenue_share_percentage) {
      momentumPartnerPct = agent.revenue_share_percentage
      momentumPartnerPayout = brokerageSplit * (momentumPartnerPct / 100)

      // Fetch partner name
      const { data: partner } = await supabase
        .from('users')
        .select('first_name, last_name, preferred_first_name, preferred_last_name')
        .eq('id', agent.referring_agent_id)
        .single()

      if (partner) {
        momentumPartnerName = `${partner.preferred_first_name || partner.first_name} ${partner.preferred_last_name || partner.last_name}`.trim()
      }
    }

    // Agent net = agent_gross - processing_fee - coaching_fee - team_lead_commission
    const agentNet = agentGross - processingFee - coachingFee - teamLeadPayout

    // Brokerage net = brokerage_split - momentum_partner_payout
    const brokerageNet = brokerageSplit - momentumPartnerPayout

    return NextResponse.json({
      agent_id,
      office_gross: officeGross,
      agent_split_pct: agentSplitPct,
      agent_gross: agentGross,
      brokerage_split: brokerageSplit,
      processing_fee: processingFee,
      coaching_fee: coachingFee,
      team_lead_pct: teamLeadPct,
      team_lead_payout: teamLeadPayout,
      team_lead_id: teamMembership?.team?.team_lead_id || null,
      team_lead_name: teamMembership?.team?.team_lead ? 
        `${teamMembership.team.team_lead.preferred_first_name || teamMembership.team.team_lead.first_name} ${teamMembership.team.team_lead.preferred_last_name || teamMembership.team.team_lead.last_name}`.trim() : null,
      momentum_partner_pct: momentumPartnerPct,
      momentum_partner_payout: momentumPartnerPayout,
      momentum_partner_name: momentumPartnerName,
      momentum_partner_id: agent.referring_agent_id || null,
      agent_net: agentNet,
      brokerage_net: brokerageNet,
      plan_code: planCode,
      plan_name: commissionPlan?.name || planCode,
      is_team_member: !!teamMembership,
      lead_source,
    })
  } catch (error: any) {
    console.error('Smart calc POST error:', error)
    return NextResponse.json({ error: error.message || 'Calculation failed' }, { status: 500 })
  }
}
