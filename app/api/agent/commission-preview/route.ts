import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getFirmMinimumPct } from '@/lib/transactions/cascade'
import { parseCustomPlanSplit } from '@/lib/transactions/customPlanParser'

export const dynamic = 'force-dynamic'

// POST /api/agent/commission-preview
// Live "your plan" numbers for the compliance form's Commission Summary box:
// plan + splits, side-aware processing fee with waive/half state, coaching
// fee, firm minimum percent, and cap progress. Read-only. Self-scoped;
// admin-ish roles may preview for the agent they are submitting on behalf of.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const isLease = !!body.is_lease
    const requested = String(body.agent_id || '')
    const callerRole = String((auth.user as any).role || '')
    const adminish = ['operations', 'broker', 'admin', 'tc', 'staff', 'support'].includes(callerRole)
    const agentId = requested && adminish ? requested : auth.user.id

    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('id, commission_plan, lease_commission_plan, waive_buyer_processing_fees, waive_seller_processing_fees, half_buyer_processing_fees, half_seller_processing_fees, waive_coaching_fee')
      .eq('id', agentId)
      .single()
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

    const planCode = String((isLease ? (agent as any).lease_commission_plan : agent.commission_plan) || agent.commission_plan || '')
    // Fuzzy plan match (code OR name) - same intent as the cascade's matcher.
    let plan: any = null
    if (planCode) {
      const { data: plans } = await supabaseAdmin
        .from('commission_plans')
        .select('*')
        .eq('is_active', true)
      const lc = planCode.toLowerCase()
      plan = (plans || []).find((p: any) =>
        String(p.code || '').toLowerCase() === lc || String(p.name || '').toLowerCase() === lc
      ) || (plans || []).find((p: any) =>
        lc.includes(String(p.code || '').toLowerCase()) || String(p.name || '').toLowerCase().includes(lc)
      ) || null
    }
    let agentSplitPct = Number(plan?.agent_split_percentage ?? 85)
    let firmSplitPct = Number(plan?.firm_split_percentage ?? 15)
    // No DB row matched: parse the split embedded in a custom plan string,
    // same fallback the cascade uses (covers the broker lease magic string).
    if (!plan && planCode) {
      const parsed = parseCustomPlanSplit(planCode)
      if (parsed) {
        agentSplitPct = parsed.agentPct
        firmSplitPct = parsed.firmPct
      }
    }
    // Broker plan (same rule as the cascade): broker keeps no commission -
    // BTSA goes to the brokerage and eCommission repays from brokerage net.
    const isBrokerPlan =
      /broker/i.test(planCode) ||
      /^custom\s+lease\s+0\s*\/\s*100$/i.test(planCode.trim()) ||
      (agentSplitPct === 0 && firmSplitPct === 100)

    // Side-aware processing fee with waive / half-off state.
    const side = String(body.side || '')
    const txnType = String(body.transaction_type || '')
    const { data: pfts } = await supabaseAdmin.from('processing_fee_types').select('*')
    const pft = (pfts || []).find((f: any) => String(f.code || '') === txnType)
      || (pfts || []).find((f: any) => String(f.code || '').includes(isLease ? 'tenant' : 'buyer'))
      || null
    const baseFee = Number(pft?.processing_fee ?? 0)
    const buySide = side === 'buyer' || side === 'tenant'
    let fee = baseFee
    let feeStatus: 'standard' | 'half' | 'waived' = 'standard'
    if (buySide && agent.waive_buyer_processing_fees) { fee = 0; feeStatus = 'waived' }
    else if (buySide && (agent as any).half_buyer_processing_fees) { fee = Math.round(baseFee * 50) / 100; feeStatus = 'half' }
    else if (!buySide && agent.waive_seller_processing_fees) { fee = 0; feeStatus = 'waived' }
    else if (!buySide && (agent as any).half_seller_processing_fees) { fee = Math.round(baseFee * 50) / 100; feeStatus = 'half' }

    const coachingWaived = agent.waive_coaching_fee === true
    const coachingFee = coachingWaived ? 0 : Number(plan?.coaching_fee_amount ?? 0)
    const firmMinimumPct = await getFirmMinimumPct(isLease)

    // Cap progress: brokerage splits credited this calendar year.
    let capAmount = Number(plan?.cap_amount ?? 0) || 0
    let ytd = 0
    if (capAmount > 0) {
      const yearStart = `${new Date().getFullYear()}-01-01`
      const { data: rows } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('brokerage_split, created_at')
        .eq('agent_id', agentId)
        .gte('created_at', yearStart)
        .limit(1000)
      ytd = (rows || []).reduce((s: number, r: any) => s + (parseFloat(String(r.brokerage_split ?? 0)) || 0), 0)
    }

    return NextResponse.json({
      plan_name: plan?.name || planCode || 'Standard',
      agent_split_pct: agentSplitPct,
      firm_split_pct: firmSplitPct,
      processing_fee: fee,
      processing_fee_original: baseFee,
      processing_fee_status: feeStatus,
      coaching_fee: coachingFee,
      coaching_waived: coachingWaived,
      firm_minimum_pct: firmMinimumPct,
      cap_amount: capAmount,
      ytd_brokerage_split: Math.round(ytd * 100) / 100,
      capped: capAmount > 0 && ytd >= capAmount,
      is_broker_plan: isBrokerPlan,
    })
  } catch (err: any) {
    console.error('commission-preview error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
