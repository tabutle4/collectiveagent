import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { Resend } from 'resend'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import { getLeadSourceBucket } from '@/lib/transactions/constants'
import { computeCommission } from '@/lib/transactions/math'
import { parseCustomPlanSplit } from '@/lib/transactions/customPlanParser'
import {
  buildStatementEmail,
  buildCdaEmail,
} from '@/lib/email/buildTransactionEmails'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── Commission field lock set ──────────────────────────────────────────────
// When a TIA row is marked paid, these fields become uneditable.
// Unmark Paid must be used to reopen them.
const LOCKED_TIA_FIELDS = new Set([
  'agent_id',
  'agent_role',
  'commission_plan',
  'commission_plan_id',
  'agent_basis',
  'split_percentage',
  'agent_gross',
  'processing_fee',
  'coaching_fee',
  'other_fees',
  'other_fees_description',
  'rebate_amount',
  'rebate_type',
  'btsa_amount',
  'team_lead_commission',
  'brokerage_split',
  'amount_1099_reportable',
  'agent_net',
  'sales_volume',
  'units',
  'counts_toward_progress',
  'pre_split_deductions',
  'pre_split_deductions_description',
])

const LOCKED_TEB_FIELDS = new Set([
  'brokerage_name',
  'brokerage_role',
  'brokerage_ein',
  'federal_id_type',
  'federal_id_number',
  'commission_amount',
  'amount_1099_reportable',
  'w9_on_file',
  'w9_date_received',
  'broker_name',
  'agent_name',
  'agent_email',
  'agent_phone',
])

// Alias to central helper — keeps existing call sites stable
const isLeaseType = isLeaseTransactionType

function num(v: any): number {
  return parseFloat(v ?? 0) || 0
}

// ─── Commission calculation core ─────────────────────────────────────────────
// Model A (locked 2026-04-22): For agents on a team, team_agreement_splits
// drives all three percentages (agent, team_lead, firm). For agents NOT on a
// team, the plan's agent/firm split drives agent_gross and firm portion;
// no team_lead row is created.
//
// team_lead_commission on the primary's TIA row is informational tracking only
// and is NOT deducted from agent_net or amount_1099_reportable — the team
// lead's cut has already been carved out of agent_gross at the team-split step.
async function computeCommissionBreakdown(args: {
  agentId: string
  transactionId: string
  internalAgentId: string
  commissionAmount: number
  leadSource: string
  referredAgentId?: string | null
  transactionType: string | null
}) {
  const {
    agentId,
    internalAgentId,
    commissionAmount,
    leadSource,
    referredAgentId,
    transactionType,
  } = args
  const isLease = isLeaseType(transactionType)

  // Existing TIA row — preserves manual fields (btsa, other_fees, rebate,
  // debts) when recalculating so ad-hoc adjustments survive.
  const { data: existingTia } = await supabase
    .from('transaction_internal_agents')
    .select('btsa_amount, other_fees, rebate_amount, debts_deducted')
    .eq('id', internalAgentId)
    .single()

  // Agent record
  const { data: agent } = await supabase
    .from('users')
    .select(`
      id, commission_plan, lease_commission_plan,
      referring_agent_id, revenue_share_percentage,
      waive_buyer_processing_fees, waive_seller_processing_fees,
      waive_coaching_fee
    `)
    .eq('id', agentId)
    .single()

  if (!agent) throw new Error('Agent not found')

  // Plan code
  const planCode = isLease && agent.lease_commission_plan
    ? agent.lease_commission_plan
    : agent.commission_plan || ''

  // Commission plan (fuzzy match — data mixes codes and names)
  const { data: plans } = await supabase
    .from('commission_plans')
    .select('*')
    .eq('is_active', true)
  const commissionPlan = (plans || []).find(
    (p: any) =>
      (p.code && p.code.toLowerCase() === planCode.toLowerCase()) ||
      (p.name && p.name.toLowerCase() === planCode.toLowerCase())
  )

  // Processing fee type
  const { data: pftAll } = await supabase
    .from('processing_fee_types')
    .select('*')
    .eq('is_active', true)
  const pft = (pftAll || []).find(
    (p: any) => p.code?.toLowerCase() === (transactionType || '').toLowerCase()
  )

  // Team membership
  const { data: membership } = await supabase
    .from('team_member_agreements')
    .select(`
      id, team:teams!team_member_agreements_team_id_fkey(id, team_name)
    `)
    .eq('agent_id', agentId)
    .is('end_date', null)
    .maybeSingle()

  let teamLeadId: string | null = null
  let teamSplits: any[] = []
  if (membership?.team) {
    const teamRow: any = Array.isArray(membership.team) ? membership.team[0] : membership.team
    const { data: teamLead } = await supabase
      .from('team_leads')
      .select('agent_id')
      .eq('team_id', teamRow.id)
      .is('end_date', null)
      .maybeSingle()
    teamLeadId = teamLead?.agent_id || null

    const { data: splits } = await supabase
      .from('team_agreement_splits')
      .select('plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
      .eq('agreement_id', (membership as any).id)
    teamSplits = splits || []
  }

  // Start with plan defaults
  let agentSplitPct = commissionPlan?.agent_split_percentage ?? 85
  let firmSplitPct = commissionPlan?.firm_split_percentage ?? 15

  // If no DB row matched, parse the embedded split out of the custom plan
  // string. See lib/transactions/customPlanParser.ts for format details.
  if (!commissionPlan && planCode) {
    const parsed = parseCustomPlanSplit(planCode)
    if (parsed) {
      agentSplitPct = parsed.agentPct
      firmSplitPct = parsed.firmPct
    }
  }
  let teamLeadPct = 0
  let onTeamWithSplit = false
  // Coaching fee comes from the commission plan, but can be waived per-agent.
  // When agent.waive_coaching_fee is true, force the fee to 0 regardless of
  // the plan default. Used for custom arrangements (e.g., Glenn Amakwe).
  const coachingFee = agent.waive_coaching_fee === true
    ? 0
    : num(commissionPlan?.coaching_fee_amount)

  // If on a team AND a matching team split exists, OVERRIDE with team splits.
  // The team split determines all three percentages (agent/TL/firm).
  if (membership && teamSplits.length > 0 && teamLeadId) {
    const planType = isLease
      ? 'leases'
      : planCode.toLowerCase().includes('85') ||
        planCode.toLowerCase().includes('no cap') ||
        planCode.toLowerCase().includes('no_cap')
        ? 'sales_85_15'
        : 'sales_70_30'

    // Translate the user-facing lead source into one of the 3 buckets that
    // team_agreement_splits.lead_source uses: own | team_lead | firm.
    const bucket = getLeadSourceBucket(
      leadSource,
      referredAgentId ?? null,
      teamLeadId
    )

    const match =
      teamSplits.find((s: any) => s.plan_type === planType && s.lead_source === bucket) ||
      teamSplits.find((s: any) => s.plan_type === planType && s.lead_source === 'own') ||
      teamSplits.find((s: any) => s.plan_type === planType)

    if (match) {
      agentSplitPct = num(match.agent_pct)
      firmSplitPct = num(match.firm_pct)
      teamLeadPct = num(match.team_lead_pct)
      onTeamWithSplit = true
    }
  }

  // Processing fee with waivers. Tenant transactions are treated as the
  // "buyer side" of a lease for waiver purposes.
  let processingFee = num(pft?.processing_fee)
  const tt = (transactionType || '').toLowerCase()
  if (
    (tt.includes('buyer') || tt.includes('tenant')) &&
    agent.waive_buyer_processing_fees
  ) processingFee = 0
  if (
    (tt.includes('seller') || tt.includes('listing') || tt.includes('landlord')) &&
    agent.waive_seller_processing_fees
  ) processingFee = 0

  // Amounts — all percentages apply to the commission_amount (basis).
  const agentGross = commissionAmount * (agentSplitPct / 100)
  const brokerageSplit = commissionAmount * (firmSplitPct / 100)
  // Team lead payout is ONLY non-zero when the agent is on a team with a split
  const teamLeadPayout = onTeamWithSplit
    ? commissionAmount * (teamLeadPct / 100)
    : 0

  // Momentum partner takes from the brokerage side
  let momentumPartnerId: string | null = null
  let momentumPartnerPct = 0
  let momentumPartnerPayout = 0
  if (agent.referring_agent_id && agent.revenue_share_percentage) {
    momentumPartnerId = agent.referring_agent_id
    momentumPartnerPct = num(agent.revenue_share_percentage)
    momentumPartnerPayout = brokerageSplit * (momentumPartnerPct / 100)
  }

  // Under Model A: team_lead is already carved out of agent_gross by the team
  // split. Do NOT deduct it again from agent_net or 1099. Use canonical math.
  const { amount_1099, agent_net } = computeCommission({
    agent_gross: agentGross,
    btsa_amount: existingTia?.btsa_amount ?? 0,
    processing_fee: processingFee,
    coaching_fee: coachingFee,
    other_fees: existingTia?.other_fees ?? 0,
    rebate_amount: existingTia?.rebate_amount ?? 0,
    debts_deducted: existingTia?.debts_deducted ?? 0,
  })
  const primaryAgentNet = agent_net
  const primary1099 = amount_1099

  return {
    planCode,
    isLease,
    commissionPlanId: commissionPlan?.id || null,
    agentSplitPct,
    firmSplitPct,
    teamLeadPct,
    coachingFee,
    processingFee,
    agentGross,
    brokerageSplit,
    teamLeadPayout,
    teamLeadId: onTeamWithSplit ? teamLeadId : null,
    momentumPartnerId,
    momentumPartnerPct,
    momentumPartnerPayout,
    primaryAgentNet,
    primary1099,
    onTeamWithSplit,
  }
}

/**
 * cascadePrimarySplit — shared helper used by both the apply_primary_split
 * action and the update_internal_agent auto-cascade. Recomputes the primary
 * row's commission math AND upserts the linked team_lead / momentum_partner
 * rows so derived payouts stay consistent.
 *
 * Intentionally does NOT block on closed transactions; callers validate that
 * themselves. Does skip paid linked rows (they're frozen).
 */
/**
 * Recompute and write office_net for a transaction. Call this after any
 * mutation that changes brokerage income lines (brokerage_split, fees,
 * external 1099) or staged debts/credits applied against this transaction.
 *
 * Formula (rewritten 2026-05-05 to fix BTSA/rebate/debt edge cases):
 *
 *   office_net =
 *       sum(TIA.brokerage_split)                  -- brokerage's % cut
 *     + sum(TIA.processing_fee + coaching_fee + other_fees)  -- fees retained
 *     + sum(staged debts applied against this txn)   -- debts collected here
 *     - sum(staged credits applied against this txn) -- credits paid out here
 *     - sum(TEB.amount_1099_reportable)              -- paid to other brokerages
 *
 * Why this formula and not the old gross-minus-agent_net version:
 *   The old formula assumed agent_net came out of office_gross. That breaks
 *   on deals with BTSA (paid to agent by buyer, never on brokerage books)
 *   or rebates (agent's own funds going to client) — both inflate agent_net
 *   without touching brokerage cash, so subtracting agent_net from office_gross
 *   over-deducts and produces wrong (sometimes negative) results.
 *
 *   The new formula traces brokerage cash directly: what the brokerage
 *   keeps, plus what they collect, minus what they pay out. office_gross
 *   doesn't appear because it's already split into brokerage_split (kept)
 *   and agent_gross (paid out) on the TIA rows.
 *
 * Idempotent and safe to call repeatedly. Failures are logged but never throw.
 */
async function recomputeOfficeNet(transactionId: string): Promise<void> {
  try {
    const [{ data: tias }, { data: tebs }, { data: stagedRecs }] = await Promise.all([
      supabase
        .from('transaction_internal_agents')
        .select('brokerage_split, processing_fee, coaching_fee, other_fees')
        .eq('transaction_id', transactionId),
      supabase
        .from('transaction_external_brokerages')
        .select('amount_1099_reportable')
        .eq('transaction_id', transactionId),
      // Staged debts/credits applied against this txn. record_type='credit'
      // is a credit (reduces office_net); anything else is a debt
      // (increases office_net). amount_owed - amount_remaining = what's
      // actually been applied.
      supabase
        .from('agent_debts')
        .select('record_type, amount_owed, amount_remaining')
        .eq('offset_transaction_id', transactionId),
    ])

    const brokerageSplitTotal = (tias || []).reduce(
      (s, t) => s + parseFloat(String(t.brokerage_split ?? 0)),
      0
    )
    const feesTotal = (tias || []).reduce(
      (s, t) =>
        s +
        parseFloat(String(t.processing_fee ?? 0)) +
        parseFloat(String(t.coaching_fee ?? 0)) +
        parseFloat(String(t.other_fees ?? 0)),
      0
    )
    const externalTotal = (tebs || []).reduce(
      (s, e) => s + parseFloat(String(e.amount_1099_reportable ?? 0)),
      0
    )

    let stagedDebtsTotal = 0
    let stagedCreditsTotal = 0
    for (const r of stagedRecs || []) {
      const owed = parseFloat(String(r.amount_owed ?? 0))
      const remaining = parseFloat(String(r.amount_remaining ?? 0))
      const applied = Math.max(0, owed - remaining)
      if (r.record_type === 'credit') stagedCreditsTotal += applied
      else stagedDebtsTotal += applied
    }

    const officeNet =
      Math.round(
        (brokerageSplitTotal +
          feesTotal +
          stagedDebtsTotal -
          stagedCreditsTotal -
          externalTotal) *
          100
      ) / 100

    await supabase
      .from('transactions')
      .update({ office_net: officeNet, updated_at: new Date().toISOString() })
      .eq('id', transactionId)
  } catch (err) {
    console.error('recomputeOfficeNet failed for', transactionId, err)
  }
}

async function cascadePrimarySplit(args: {
  transactionId: string
  internalAgentId: string
  commissionAmount: number
  leadSource: string
  referredAgentId: string | null
}): Promise<void> {
  const {
    transactionId,
    internalAgentId,
    commissionAmount,
    leadSource,
    referredAgentId,
  } = args

  const { data: primaryTia } = await supabase
    .from('transaction_internal_agents')
    .select('id, agent_id, agent_role, payment_status, side, installment_kind')
    .eq('id', internalAgentId)
    .eq('transaction_id', transactionId)
    .single()
  if (!primaryTia) return
  if (primaryTia.payment_status === 'paid') return
  // Retainer rows are not part of commission cascade. They have their own
  // simple structure (basis - retainer_fee = net) and never spawn TL/MP rows.
  if (primaryTia.installment_kind === 'retainer') return

  const { data: txn } = await supabase
    .from('transactions')
    .select('transaction_type, status')
    .eq('id', transactionId)
    .single()
  if (txn?.status === 'closed') return

  const breakdown = await computeCommissionBreakdown({
    agentId: primaryTia.agent_id,
    transactionId,
    internalAgentId,
    commissionAmount,
    leadSource,
    referredAgentId,
    transactionType: txn?.transaction_type || null,
  })

  // Update primary row — commission math via canonical computeCommission().
  // Existing manual fields (btsa_amount, other_fees, rebate_amount,
  // debts_deducted) are loaded from the row and used in the calculation,
  // so ad-hoc adjustments are preserved through recalc. Every recalc
  // freshly overwrites the computed columns — there is no per-field
  // override flag.
  const primaryUpdates: Record<string, any> = {
    commission_plan: breakdown.planCode,
    agent_basis: commissionAmount,
    split_percentage: breakdown.agentSplitPct,
    agent_gross: Math.round(breakdown.agentGross * 100) / 100,
    brokerage_split: Math.round(breakdown.brokerageSplit * 100) / 100,
    processing_fee: Math.round(breakdown.processingFee * 100) / 100,
    coaching_fee: Math.round(breakdown.coachingFee * 100) / 100,
    team_lead_commission: Math.round(breakdown.teamLeadPayout * 100) / 100,
    agent_net: Math.round(breakdown.primaryAgentNet * 100) / 100,
    amount_1099_reportable: Math.round(breakdown.primary1099 * 100) / 100,
    updated_at: new Date().toISOString(),
  }
  if (breakdown.commissionPlanId) {
    primaryUpdates.commission_plan_id = breakdown.commissionPlanId
  }
  await supabase
    .from('transaction_internal_agents')
    .update(primaryUpdates)
    .eq('id', internalAgentId)

  async function buildLinkedRowFields(
    linkedAgentId: string,
    amount: number,
    pct: number,
    basis: number
  ): Promise<any> {
    const { data: linkedUser } = await supabase
      .from('users')
      .select('commission_plan, lease_commission_plan')
      .eq('id', linkedAgentId)
      .single()
    const linkedPlanCode = breakdown.isLease && linkedUser?.lease_commission_plan
      ? linkedUser.lease_commission_plan
      : linkedUser?.commission_plan || null
    let linkedPlanId: string | null = null
    if (linkedPlanCode) {
      const { data: planRow } = await supabase
        .from('commission_plans')
        .select('id')
        .or(`code.ilike.${linkedPlanCode},name.ilike.${linkedPlanCode}`)
        .limit(1)
        .maybeSingle()
      linkedPlanId = planRow?.id || null
    }
    return {
      agent_gross: amount,
      agent_net: amount,
      amount_1099_reportable: amount,
      brokerage_split: 0,
      processing_fee: 0,
      coaching_fee: 0,
      other_fees: 0,
      other_fees_description: null,
      btsa_amount: 0,
      team_lead_commission: 0,
      debts_deducted: 0,
      rebate_amount: 0,
      rebate_type: null,
      pre_split_deductions: 0,
      pre_split_deductions_description: null,
      sales_volume: 0,
      units: 0,
      split_percentage: pct,
      agent_basis: basis,
      commission_plan: linkedPlanCode,
      commission_plan_id: linkedPlanId,
      counts_toward_progress: false,
    }
  }

  // Team lead row upsert
  if (breakdown.teamLeadId && breakdown.teamLeadPayout > 0) {
    const { data: existingTl } = await supabase
      .from('transaction_internal_agents')
      .select('id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'team_lead')
      .eq('source_tia_id', internalAgentId)
      .maybeSingle()
    const tlAmount = Math.round(breakdown.teamLeadPayout * 100) / 100
    const tlFields = await buildLinkedRowFields(
      breakdown.teamLeadId,
      tlAmount,
      breakdown.teamLeadPct,
      commissionAmount
    )
    if (existingTl && existingTl.payment_status !== 'paid') {
      await supabase
        .from('transaction_internal_agents')
        .update({ ...tlFields, side: primaryTia.side ?? null, updated_at: new Date().toISOString() })
        .eq('id', existingTl.id)
    } else if (!existingTl) {
      await supabase.from('transaction_internal_agents').insert({
        transaction_id: transactionId,
        agent_id: breakdown.teamLeadId,
        agent_role: 'team_lead',
        side: primaryTia.side ?? null,
        payment_status: 'pending',
        funding_source: 'crc',
        source_tia_id: internalAgentId,
        ...tlFields,
      })
    }
  } else {
    // Remove stale TL if not paid
    const { data: staleTl } = await supabase
      .from('transaction_internal_agents')
      .select('id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'team_lead')
      .eq('source_tia_id', internalAgentId)
      .maybeSingle()
    if (staleTl && staleTl.payment_status !== 'paid') {
      await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', staleTl.id)
    }
  }

  // Momentum partner row upsert
  if (breakdown.momentumPartnerId && breakdown.momentumPartnerPayout > 0) {
    const { data: existingMp } = await supabase
      .from('transaction_internal_agents')
      .select('id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'momentum_partner')
      .eq('source_tia_id', internalAgentId)
      .maybeSingle()
    const mpAmount = Math.round(breakdown.momentumPartnerPayout * 100) / 100
    const mpFields = await buildLinkedRowFields(
      breakdown.momentumPartnerId,
      mpAmount,
      breakdown.momentumPartnerPct,
      Math.round(breakdown.brokerageSplit * 100) / 100
    )
    if (existingMp && existingMp.payment_status !== 'paid') {
      await supabase
        .from('transaction_internal_agents')
        .update({ ...mpFields, side: primaryTia.side ?? null, updated_at: new Date().toISOString() })
        .eq('id', existingMp.id)
    } else if (!existingMp) {
      await supabase.from('transaction_internal_agents').insert({
        transaction_id: transactionId,
        agent_id: breakdown.momentumPartnerId,
        agent_role: 'momentum_partner',
        side: primaryTia.side ?? null,
        payment_status: 'pending',
        funding_source: 'crc',
        source_tia_id: internalAgentId,
        ...mpFields,
      })
    }
  } else {
    const { data: staleMp } = await supabase
      .from('transaction_internal_agents')
      .select('id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'momentum_partner')
      .eq('source_tia_id', internalAgentId)
      .maybeSingle()
    if (staleMp && staleMp.payment_status !== 'paid') {
      await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', staleMp.id)
    }
  }

  // Office_net depends on every TIA agent_net; recompute now that the cascade
  // has finished writing primary + linked rows.
  await recomputeOfficeNet(transactionId)
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section')

    // ── Full transaction detail load ─────────────────────────────────────────
    if (!section || section === 'full') {
      const [
        { data: txn, error: txnError },
        { data: agents, error: agentsError },
        { data: settings }
      ] = await Promise.all([
          supabase.from('transactions').select('*').eq('id', id).single(),
          supabase.from('transaction_internal_agents').select(`
            *,
            user:users!transaction_internal_agents_agent_id_fkey(
              id, first_name, last_name, preferred_first_name, preferred_last_name,
              office_email, email, phone, office, commission_plan, lease_commission_plan, license_number,
              license_expiration, nrds_id, mls_id, association, join_date,
              division, revenue_share, revenue_share_percentage, referring_agent,
              referring_agent_id, referred_agents,
              qualifying_transaction_count, qualifying_transaction_target,
              waive_buyer_processing_fees,
              waive_seller_processing_fees, waive_coaching_fee,
              cap_amount_override, post_cap_split_override,
              special_commission_notes, headshot_url,
              monthly_fee_paid_through
            )
          `).eq('transaction_id', id),
          supabase
            .from('company_settings')
            .select('referral_tracking_url, crm_url, crm_name')
            .single(),
        ])

      if (txnError || !txn) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }

      // Build a code→friendly-name map for commission plans so the UI can
      // display "Custom - 85/15 Cap" instead of the raw code "Custom Plan".
      // Plans store user-facing names in `name`; codes in `code`. Some rows
      // mix the two, so the lookup tries both directions.
      const { data: allPlans } = await supabase
        .from('commission_plans')
        .select('code, name')
        .eq('is_active', true)
      const planFriendly = new Map<string, string>()
      for (const p of allPlans || []) {
        if (p.code) planFriendly.set(String(p.code).toLowerCase(), p.name || p.code)
        if (p.name) planFriendly.set(String(p.name).toLowerCase(), p.name)
      }
      const friendlyPlanLabel = (code: string | null | undefined): string | null => {
        if (!code) return null
        const hit = planFriendly.get(String(code).toLowerCase())
        return hit || code
      }
      const txnIsLease = isLeaseTransactionType(txn.transaction_type)

      const agentIds = (agents || []).map((a: any) => a.agent_id).filter(Boolean)
      const agentUsers = (agents || []).map((a: any) => a.user).filter(Boolean)

      const primaryAgentId = txn.submitted_by
      const primaryAgent =
        (agentUsers || []).find((u: any) => u.id === primaryAgentId) || (agentUsers || [])[0]

      const { data: teamMemberships } = agentIds.length > 0
        ? await supabase
            .from('team_member_agreements')
            .select(`
              id, agent_id, agreement_document_url, firm_min_override,
              team:teams!team_member_agreements_team_id_fkey(id, team_name)
            `)
            .in('agent_id', agentIds)
            .is('end_date', null)
        : { data: [] }

      const membershipIds = (teamMemberships || []).map((m: any) => m.id).filter(Boolean)
      const { data: allSplits } = membershipIds.length > 0
        ? await supabase
            .from('team_agreement_splits')
            .select('id, agreement_id, plan_type, lead_source, agent_pct, team_lead_pct, firm_pct')
            .in('agreement_id', membershipIds)
            .order('plan_type')
            .order('lead_source')
        : { data: [] }

      // Fetch team leads for each team
      const teamIdsFromMemberships = (teamMemberships || [])
        .map((m: any) => (Array.isArray(m.team) ? m.team[0]?.id : m.team?.id))
        .filter(Boolean)
      const { data: teamLeads } = teamIdsFromMemberships.length > 0
        ? await supabase
            .from('team_leads')
            .select(`
              team_id, agent_id,
              agent:users!team_leads_agent_id_fkey(
                id, first_name, last_name, preferred_first_name, preferred_last_name
              )
            `)
            .in('team_id', teamIdsFromMemberships)
            .is('end_date', null)
        : { data: [] }

      const membershipByAgent: Record<string, any> = {}
      for (const m of teamMemberships || []) {
        const teamRow: any = Array.isArray(m.team) ? m.team[0] : m.team
        const lead = (teamLeads || []).find((tl: any) => tl.team_id === teamRow?.id)
        const leadUser: any = lead?.agent
          ? (Array.isArray(lead.agent) ? lead.agent[0] : lead.agent)
          : null
        membershipByAgent[m.agent_id] = {
          ...m,
          team: teamRow ? { ...teamRow, team_lead_id: lead?.agent_id || null, team_lead: leadUser } : null,
          splits: (allSplits || []).filter((s: any) => s.agreement_id === m.id),
        }
      }

      // Per-agent billing (debts)
      const billingByAgent: Record<string, any> = {}
      if (agentIds.length > 0) {
        const [{ data: outstandingRecords }, { data: stagedRecords }] = await Promise.all([
          supabase
            .from('agent_debts')
            .select(
              'id, agent_id, record_type, debt_type, description, amount_owed, amount_paid, amount_remaining, date_incurred, status, offset_transaction_id, offset_transaction_agent_id'
            )
            .in('agent_id', agentIds)
            .eq('status', 'outstanding')
            .order('date_incurred', { ascending: false }),
          // Records previously staged or paid against THIS transaction.
          // Staged debts move to status='paid' with offset_* set to this txn,
          // so the payouts tab can render them by joining on agent_id +
          // offset match below.
          supabase
            .from('agent_debts')
            .select(
              'id, agent_id, record_type, debt_type, description, amount_owed, amount_paid, amount_remaining, date_incurred, status, offset_transaction_id, offset_transaction_agent_id'
            )
            .in('agent_id', agentIds)
            .eq('offset_transaction_id', id)
            .eq('status', 'paid')
            .order('date_incurred', { ascending: false }),
        ])
        const billingRecords = outstandingRecords || []
        const staged = stagedRecords || []

        for (const aid of agentIds) {
          const rows = billingRecords.filter((r: any) => r.agent_id === aid)
          const debts = rows.filter((r: any) => r.record_type !== 'credit')
          const credits = rows.filter((r: any) => r.record_type === 'credit')
          const stagedRows = staged.filter((r: any) => r.agent_id === aid)
          const totalDebts = debts.reduce(
            (s: number, d: any) => s + parseFloat(d.amount_remaining ?? d.amount_owed ?? 0),
            0
          )
          const totalCredits = credits.reduce(
            (s: number, c: any) => s + parseFloat(c.amount_remaining ?? c.amount_owed ?? 0),
            0
          )
          billingByAgent[aid] = {
            debts,
            credits,
            staged: stagedRows,
            total_debts: totalDebts,
            total_credits: totalCredits,
            net_balance: totalDebts - totalCredits,
          }
        }
      }

      // Legacy agent_billing (primary only) for existing UI
      const agentBilling = primaryAgentId ? billingByAgent[primaryAgentId] || null : null

      // Team info for primary
      let teamInfo = null
      if (txn.team_agreement_id) {
        const { data: memberAgreement } = await supabase
          .from('team_member_agreements')
          .select(`
            id,
            team:teams!team_member_agreements_team_id_fkey(id, team_name)
          `)
          .eq('id', txn.team_agreement_id)
          .maybeSingle()
        if (memberAgreement) {
          teamInfo = memberAgreement
        }
      }

      // Checks
      const { data: checksData } = await supabase
        .from('checks_received')
        .select(`*, check_payouts (*)`)
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      const checks = checksData || []

      // Checklist
      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('checklist_item_id, completed_by, completed_at, notes, auto_verified')
        .eq('transaction_id', id)

      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('slug', 'payouts')
        .single()

      let checklistItems: any[] = []
      if (template?.id) {
        const { data: items } = await supabase
          .from('checklist_items')
          .select('id, section, label, description, display_order')
          .eq('checklist_template_id', template.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
        checklistItems = items || []
      }

      const completionMap = new Map((completions || []).map((c: any) => [c.checklist_item_id, c]))
      const checklist = checklistItems.map((item: any) => ({
        ...item,
        completion: completionMap.get(item.id) || null,
      }))

      return NextResponse.json({
        transaction: txn,
        agents: (agents || []).map((a: any) => {
          // For lease transactions, prefer the agent's lease_commission_plan
          // (falling back to commission_plan). For sales, always commission_plan.
          // Then resolve to the friendly name from commission_plans.
          const u = a.user || {}
          const planCode = txnIsLease
            ? (u.lease_commission_plan || u.commission_plan)
            : u.commission_plan
          return {
            ...a,
            team_membership: membershipByAgent[a.agent_id] || null,
            billing: billingByAgent[a.agent_id] || null,
            commission_plan_friendly: friendlyPlanLabel(planCode),
          }
        }),
        primary_agent: primaryAgent || null,
        agent_billing: agentBilling,
        team_info: teamInfo,
        checks,
        checklist,
        company_settings: settings || null,
      })
    }

    // ── External brokerages ──────────────────────────────────────────────────
    if (section === 'external_brokerages') {
      const { data: externalBrokerages, error } = await supabase
        .from('transaction_external_brokerages')
        .select('*')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ external_brokerages: externalBrokerages || [] })
    }

    // ── Contacts ─────────────────────────────────────────────────────────────
    if (section === 'contacts') {
      const { data: contacts, error } = await supabase
        .from('transaction_contacts')
        .select('*')
        .eq('transaction_id', id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ contacts: contacts || [] })
    }

    if (section === 'checklist') {
      return NextResponse.json({ error: 'Use POST for checklist updates' }, { status: 405 })
    }

    return NextResponse.json({ error: 'Unknown section' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const { action } = body

    // ── Update transaction fields ────────────────────────────────────────────
    if (action === 'update_transaction') {
      const { updates } = body
      const cleanUpdates: any = { ...updates }

      // ── Auto-derive related transaction fields ──────────────────────────────
      // Whenever inputs that drive computed fields are touched, fetch the
      // current row, recompute, and merge into the update. Skip a derived
      // field if the caller already passed it (manual override).
      const COMPUTE_TRIGGERS = [
        'monthly_rent', 'lease_term',
        'gross_commission', 'listing_side_commission',
        'buying_side_commission', 'office_gross',
        'transaction_type', 'is_intermediary',
      ]
      const triggered = COMPUTE_TRIGGERS.some(k => k in cleanUpdates)
      if (triggered) {
        const { data: current } = await supabase
          .from('transactions')
          .select(
            'transaction_type, is_intermediary, monthly_rent, lease_term, ' +
            'sales_volume, gross_commission, listing_side_commission, ' +
            'buying_side_commission, office_gross'
          )
          .eq('id', id)
          .single()

        if (current) {
          // Effective values = caller's update if present, else current row.
          const eff = (k: string) => (k in cleanUpdates ? cleanUpdates[k] : (current as any)[k])
          const txnType = eff('transaction_type')
          const isLease = isLeaseTransactionType(txnType)
          const isIntermediary = !!eff('is_intermediary')

          // Lease volume: monthly_rent × lease_term
          if (isLease && !('sales_volume' in cleanUpdates)) {
            const rent = parseFloat(eff('monthly_rent') ?? 0)
            const term = parseInt(eff('lease_term') ?? 0, 10)
            if (rent > 0 && term > 0) {
              cleanUpdates.sales_volume = rent * term
            }
          }

          // Single-sided commission flow.
          // For single-sided deals the side WE represent is implied by
          // transaction_type:
          //   buyer / tenant types → we earn buying_side_commission
          //   seller / landlord types → we earn listing_side_commission
          // Gross Commission = our side = Office Gross. The other side stays 0.
          if (!isIntermediary && txnType) {
            const t = String(txnType).toLowerCase()
            const isOurSideListing = t.includes('seller') || t.includes('landlord')
            const ourSideField = isOurSideListing
              ? 'listing_side_commission'
              : 'buying_side_commission'
            const otherSideField = isOurSideListing
              ? 'buying_side_commission'
              : 'listing_side_commission'

            // Pick the most recently touched driver. Order of precedence:
            //   1) gross_commission (if user typed it, broadcast to side + office)
            //   2) our_side_commission (broadcast to gross + office)
            //   3) office_gross (broadcast to gross + side)
            let driver: number | null = null
            if ('gross_commission' in cleanUpdates) {
              driver = parseFloat(cleanUpdates.gross_commission ?? 0)
            } else if (ourSideField in cleanUpdates) {
              driver = parseFloat(cleanUpdates[ourSideField] ?? 0)
            } else if ('office_gross' in cleanUpdates) {
              driver = parseFloat(cleanUpdates.office_gross ?? 0)
            }

            if (driver != null && Number.isFinite(driver)) {
              if (!('gross_commission' in cleanUpdates)) cleanUpdates.gross_commission = driver
              if (!(ourSideField in cleanUpdates)) cleanUpdates[ourSideField] = driver
              if (!('office_gross' in cleanUpdates)) cleanUpdates.office_gross = driver
              // Other side is always 0 for single-sided unless the caller
              // explicitly set it (which is unusual but allowed).
              if (!(otherSideField in cleanUpdates)) cleanUpdates[otherSideField] = 0
            }
          }
        }
      }

      const { error } = await supabase
        .from('transactions')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      // Office_net depends on office_gross. Recompute when office_gross was
      // touched (directly OR via the auto-derive above).
      if ('office_gross' in cleanUpdates) await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Toggle checklist item ────────────────────────────────────────────────
    if (action === 'toggle_checklist') {
      const { checklist_item_id, completed_by, completing } = body

      if (completing) {
        const { data: existing } = await supabase
          .from('checklist_completions')
          .select('id')
          .eq('transaction_id', id)
          .eq('checklist_item_id', checklist_item_id)
          .single()

        if (!existing) {
          const { error } = await supabase.from('checklist_completions').insert({
            transaction_id: id,
            checklist_item_id,
            completed_by,
            completed_at: new Date().toISOString(),
          })
          if (error) throw error
        }
      } else {
        const { error } = await supabase
          .from('checklist_completions')
          .delete()
          .eq('transaction_id', id)
          .eq('checklist_item_id', checklist_item_id)
        if (error) throw error
      }
      return NextResponse.json({ success: true })
    }

    // ── Update check ─────────────────────────────────────────────────────────
    if (action === 'update_check') {
      const { check_id, updates } = body
      const DATE_FIELDS = ['received_date', 'deposited_date', 'cleared_date', 'compliance_complete_date']
      const cleanUpdates: any = { ...updates }
      for (const f of DATE_FIELDS) {
        if (cleanUpdates[f] === '') cleanUpdates[f] = null
      }
      const { error } = await supabase
        .from('checks_received')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
        .eq('id', check_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Create check linked to transaction ───────────────────────────────────
    if (action === 'create_check') {
      const { check } = body
      const { data, error } = await supabase
        .from('checks_received')
        .insert({ ...check, transaction_id: id })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ check: data })
    }

    // ── Link existing check to transaction ───────────────────────────────────
    if (action === 'link_check') {
      const { check_id } = body
      const { error } = await supabase
        .from('checks_received')
        .update({ transaction_id: id, updated_at: new Date().toISOString() })
        .eq('id', check_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Payout CRUD ──────────────────────────────────────────────────────────
    if (action === 'add_payout') {
      const { payout } = body
      const { data, error } = await supabase.from('check_payouts').insert(payout).select().single()
      if (error) throw error
      return NextResponse.json({ payout: data })
    }
    if (action === 'update_payout') {
      const { payout_id, updates } = body
      const { error } = await supabase.from('check_payouts').update(updates).eq('id', payout_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (action === 'delete_payout') {
      const { payout_id } = body
      const { error } = await supabase.from('check_payouts').delete().eq('id', payout_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Update internal agent ────────────────────────────────────────────────
    // Guards commission-field edits when payment_status='paid'.
    // Unmark Paid is required to reopen those fields.
    if (action === 'update_internal_agent') {
      const { internal_agent_id, updates } = body

      // Check current row + payment status
      const { data: current } = await supabase
        .from('transaction_internal_agents')
        .select('payment_status, agent_role, agent_basis, lead_source, referred_agent_id')
        .eq('id', internal_agent_id)
        .single()

      if (current?.payment_status === 'paid') {
        const blocked = Object.keys(updates || {}).filter(k => LOCKED_TIA_FIELDS.has(k))
        if (blocked.length > 0) {
          return NextResponse.json(
            { error: `This row is marked paid. Unmark paid first to edit: ${blocked.join(', ')}` },
            { status: 409 }
          )
        }
      }

      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', internal_agent_id)
      if (error) throw error

      // ── Side propagation ──────────────────────────────────────────────────
      // When a primary/listing/co_agent's `side` changes, propagate to any
      // linked team_lead and momentum_partner rows tied via source_tia_id
      // (unless those linked rows are paid).
      if (
        'side' in (updates || {}) &&
        current &&
        ['primary_agent', 'listing_agent', 'co_agent'].includes(current.agent_role)
      ) {
        const newSide = updates.side ?? null
        await supabase
          .from('transaction_internal_agents')
          .update({ side: newSide, updated_at: new Date().toISOString() })
          .eq('source_tia_id', internal_agent_id)
          .in('agent_role', ['team_lead', 'momentum_partner'])
          .neq('payment_status', 'paid')
      }

      // ── Auto-cascade on primary driver changes ──────────────────────────────
      // If this row is a primary/listing/co_agent AND the update touched a
      // driver field (basis, plan, lead_source, referred_agent_id), re-run the
      // primary-split calculation so linked team_lead and momentum_partner
      // rows stay consistent without requiring a separate Apply Split click.
      const DRIVER_FIELDS = ['agent_basis', 'commission_plan', 'commission_plan_id', 'lead_source', 'referred_agent_id']
      const touchedDriver = Object.keys(updates || {}).some(k => DRIVER_FIELDS.includes(k))
      const cascadeRoles = ['primary_agent', 'listing_agent', 'co_agent']
      if (
        touchedDriver &&
        current &&
        cascadeRoles.includes(current.agent_role)
      ) {
        try {
          // Merge current + updates to get effective values. Check key
          // PRESENCE (via 'in') rather than value, so an explicit null in
          // updates (e.g. clearing referred_agent_id when user moves off
          // internal_agent_referral) overrides the stored value.
          const effectiveBasis = 'agent_basis' in (updates || {})
            ? num(updates.agent_basis)
            : num(current.agent_basis)
          const effectiveLeadSource = 'lead_source' in (updates || {})
            ? (updates.lead_source || 'own')
            : (current.lead_source || 'own')
          const effectiveReferredAgent = 'referred_agent_id' in (updates || {})
            ? (updates.referred_agent_id || null)
            : (current.referred_agent_id || null)

          // Only cascade when we have a real basis (>0) — otherwise nothing to
          // compute and we'd write zero values into linked rows.
          if (effectiveBasis > 0) {
            await cascadePrimarySplit({
              transactionId: id,
              internalAgentId: internal_agent_id,
              commissionAmount: effectiveBasis,
              leadSource: effectiveLeadSource,
              referredAgentId: effectiveReferredAgent,
            })
          }
        } catch (cascadeErr: any) {
          // Log but don't fail the user's field update — the primary row IS
          // updated; the cascade can be re-triggered by editing again.
          console.error('Auto-cascade failed:', cascadeErr)
        }
      }

      // Office_net depends on every TIA agent_net.
      await recomputeOfficeNet(id)

      return NextResponse.json({ success: true })
    }

    // ── Delete internal agent (no cascade) ───────────────────────────────────
    if (action === 'delete_internal_agent') {
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }
      const { data: existing } = await supabase
        .from('transaction_internal_agents')
        .select('id, payment_status')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()
      if (!existing) {
        return NextResponse.json({ error: 'Agent not found on this transaction' }, { status: 404 })
      }
      if (existing.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Cannot delete a paid row. Unmark paid first.' },
          { status: 409 }
        )
      }
      const { error } = await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', internal_agent_id)
      if (error) throw error
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Delete internal agent with cascade ───────────────────────────────────
    // Team_lead and momentum_partner rows with source_tia_id = this primary
    // are automatically deleted by the database (ON DELETE CASCADE on the
    // source_tia_id foreign key). We just need to preview them for the warn
    // modal, then delete the primary.
    if (action === 'delete_internal_agent_cascade') {
      const { internal_agent_id } = body

      const { data: row } = await supabase
        .from('transaction_internal_agents')
        .select('id, agent_role, payment_status')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()

      if (!row) {
        return NextResponse.json({ error: 'Agent not found on this transaction' }, { status: 404 })
      }

      // Find linked TL/MP rows (will be cascade-deleted by DB)
      const { data: linkedRows } = await supabase
        .from('transaction_internal_agents')
        .select(`
          id, agent_id, agent_role, agent_net, payment_status,
          user:users!transaction_internal_agents_agent_id_fkey(
            id, first_name, last_name, preferred_first_name, preferred_last_name
          )
        `)
        .eq('source_tia_id', internal_agent_id)

      // Preview mode
      if (body.preview) {
        return NextResponse.json({ linked_rows: linkedRows || [] })
      }

      // Block if primary is paid
      if (row.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Cannot delete a paid row. Unmark paid first.' },
          { status: 409 }
        )
      }

      // Block if any linked row is paid (cascade would try to delete them too)
      const paidLinked = (linkedRows || []).filter((r: any) => r.payment_status === 'paid')
      if (paidLinked.length > 0) {
        return NextResponse.json(
          {
            error: 'Cannot delete: one or more linked rows (team lead, momentum partner) are paid. Unmark paid first.',
          },
          { status: 409 }
        )
      }

      // Delete the primary — DB cascades the linked rows
      const { error: delErr } = await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', internal_agent_id)
      if (delErr) throw delErr

      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        deleted_linked_ids: (linkedRows || []).map((r: any) => r.id),
        deleted_primary_id: internal_agent_id,
      })
    }

    // ── Update external brokerage ────────────────────────────────────────────
    if (action === 'update_external_brokerage') {
      const { brokerage_id, updates } = body

      const { data: current } = await supabase
        .from('transaction_external_brokerages')
        .select('payment_status')
        .eq('id', brokerage_id)
        .single()

      if (current?.payment_status === 'paid') {
        const blocked = Object.keys(updates || {}).filter(k => LOCKED_TEB_FIELDS.has(k))
        if (blocked.length > 0) {
          return NextResponse.json(
            { error: `This brokerage is marked paid. Unmark paid first to edit: ${blocked.join(', ')}` },
            { status: 409 }
          )
        }
      }

      const { error } = await supabase
        .from('transaction_external_brokerages')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', brokerage_id)
      if (error) throw error
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Delete external brokerage ────────────────────────────────────────────
    if (action === 'delete_external_brokerage') {
      const { brokerage_id } = body
      const { data: existing } = await supabase
        .from('transaction_external_brokerages')
        .select('id, payment_status')
        .eq('id', brokerage_id)
        .eq('transaction_id', id)
        .single()
      if (!existing) {
        return NextResponse.json({ error: 'Brokerage not found on this transaction' }, { status: 404 })
      }
      if (existing.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Cannot delete a paid brokerage. Unmark paid first.' },
          { status: 409 }
        )
      }
      const { error } = await supabase
        .from('transaction_external_brokerages')
        .delete()
        .eq('id', brokerage_id)
      if (error) throw error
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Add internal agent ───────────────────────────────────────────────────
    if (action === 'add_internal_agent') {
      const { agent } = body

      if (!agent.agent_id || agent.agent_id === '') {
        return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
      }

      const insertData: Record<string, any> = {
        transaction_id: id,
        agent_id: agent.agent_id,
        agent_role: agent.agent_role || 'co_agent',
        payment_status: agent.payment_status || 'pending',
        funding_source: agent.funding_source || 'crc',
        counts_toward_progress: agent.counts_toward_progress ?? true,
      }

      // Optional fields
      const optional = [
        'side', 'lead_source', 'source_tia_id', 'referred_agent_id',
        'uses_canonical_math', 'agent_basis',
        'commission_plan', 'commission_plan_id', 'agent_gross', 'brokerage_split',
        'processing_fee', 'coaching_fee', 'other_fees', 'other_fees_description',
        'btsa_amount', 'debts_deducted', 'team_lead_commission', 'agent_net',
        'amount_1099_reportable', 'payment_date', 'payment_method', 'payment_reference',
        'sales_volume', 'units', 'split_percentage', 'rebate_amount', 'rebate_type',
        'pre_split_deductions', 'pre_split_deductions_description',
        'agent_basis_type', 'split_percentage_type', 'pre_split_deductions_type',
        'processing_fee_type', 'coaching_fee_type', 'other_fees_type',
        'rebate_amount_type', 'btsa_amount_type', 'processing_fee_type_id',
      ]
      for (const f of optional) {
        if (agent[f] != null && agent[f] !== '') insertData[f] = agent[f]
      }

      const { data, error } = await supabase
        .from('transaction_internal_agents')
        .insert(insertData)
        .select(`
          *,
          user:users!transaction_internal_agents_agent_id_fkey(
            id, first_name, last_name, preferred_first_name, preferred_last_name,
            office_email, email, phone, office, commission_plan, license_number,
            license_expiration, referring_agent_id, revenue_share_percentage,
            qualifying_transaction_count, qualifying_transaction_target,
            waive_buyer_processing_fees,
            waive_seller_processing_fees, waive_coaching_fee,
            cap_amount_override, post_cap_split_override,
            monthly_fee_paid_through
          )
        `)
        .single()
      if (error) throw error

      // Auto-stamp commission math when adding a roleable agent on a
      // commission-bearing role. Derives basis from the agent's side commission
      // (when known) or falls back to office_gross. Skipped silently if no
      // basis available — admin can click Recalculate later.
      if (data && ['primary_agent', 'listing_agent', 'co_agent'].includes(data.agent_role)) {
        const { data: txn } = await supabase
          .from('transactions')
          .select('listing_side_commission, buying_side_commission, office_gross, status')
          .eq('id', id)
          .single()

        if (txn && txn.status !== 'closed') {
          let basis = 0
          if (data.side === 'seller' || data.side === 'landlord') {
            basis = num(txn.listing_side_commission)
          } else if (data.side === 'buyer' || data.side === 'tenant') {
            basis = num(txn.buying_side_commission)
          }
          if (!basis) basis = num(txn.office_gross)

          if (basis > 0) {
            try {
              await cascadePrimarySplit({
                transactionId: id,
                internalAgentId: data.id,
                commissionAmount: basis,
                leadSource: data.lead_source || 'own',
                referredAgentId: data.referred_agent_id || null,
              })
              // Re-fetch the now-stamped row so the response reflects the math
              const { data: stamped } = await supabase
                .from('transaction_internal_agents')
                .select(`
                  *,
                  user:users!transaction_internal_agents_agent_id_fkey(
                    id, first_name, last_name, preferred_first_name, preferred_last_name,
                    office_email, email, phone, office, commission_plan, license_number,
                    license_expiration, referring_agent_id, revenue_share_percentage,
                    qualifying_transaction_count, qualifying_transaction_target,
                    waive_buyer_processing_fees,
                    waive_seller_processing_fees, waive_coaching_fee,
                    cap_amount_override, post_cap_split_override,
                    monthly_fee_paid_through
                  )
                `)
                .eq('id', data.id)
                .single()
              if (stamped) return NextResponse.json({ agent: stamped })
            } catch (err) {
              // Auto-stamp failed but row was inserted; admin can Recalculate.
              console.error('Auto-stamp on agent add failed:', err)
            }
          }
        }
      }

      // Cascade may not have run (no basis or non-roleable role). Office_net
      // still depends on this row's agent_net (which may be 0).
      await recomputeOfficeNet(id)

      return NextResponse.json({ agent: data })
    }

    // ── Add retainer row ─────────────────────────────────────────────────────
    // Creates a NEW TIA row marked as installment_kind='retainer' for the
    // given agent. Retainer rows are payment events independent from
    // commission. Only basis (retainer amount), processing_fee (office's
    // retainer cut), and payment fields are populated. All other
    // commission fields are 0.
    //
    // body: { retainer: { agent_id, agent_role, side, retainer_amount, retainer_fee, payment_date?, payment_method?, payment_reference? } }
    if (action === 'add_retainer_row') {
      const { retainer } = body
      if (!retainer?.agent_id) {
        return NextResponse.json({ error: 'agent_id is required' }, { status: 400 })
      }
      if (retainer.retainer_amount == null) {
        return NextResponse.json({ error: 'retainer_amount is required' }, { status: 400 })
      }

      const retainerAmount = num(retainer.retainer_amount)
      const retainerFee = num(retainer.retainer_fee)
      const amount1099 = retainerAmount - retainerFee
      const agentNet = amount1099 // debts/credits applied at mark_paid time

      const insertData: Record<string, any> = {
        transaction_id: id,
        agent_id: retainer.agent_id,
        agent_role: retainer.agent_role || 'primary_agent',
        side: retainer.side || null,
        installment_kind: 'retainer',
        // Retainer-only fields populated:
        agent_basis: retainerAmount,
        processing_fee: retainerFee,
        amount_1099_reportable: Math.round(amount1099 * 100) / 100,
        agent_net: Math.round(agentNet * 100) / 100,
        // Payment metadata:
        payment_status: retainer.payment_status || 'pending',
        payment_date: retainer.payment_date || null,
        payment_method: retainer.payment_method || null,
        payment_reference: retainer.payment_reference || null,
        // All other commission fields zero/null on retainer rows:
        split_percentage: 0,
        agent_gross: 0,
        brokerage_split: 0,
        coaching_fee: 0,
        team_lead_commission: 0,
        btsa_amount: 0,
        rebate_amount: 0,
        other_fees: 0,
        sales_volume: 0,
        units: 0,
        debts_deducted: 0,
        counts_toward_progress: false,
      }

      const { data, error } = await supabase
        .from('transaction_internal_agents')
        .insert(insertData)
        .select()
        .single()
      if (error) throw error

      await recomputeOfficeNet(id)

      return NextResponse.json({ agent: data })
    }

    // ── Add external brokerage ───────────────────────────────────────────────
    if (action === 'add_external_brokerage') {
      const { brokerage } = body

      if (!brokerage.brokerage_name || brokerage.brokerage_name === '') {
        return NextResponse.json({ error: 'brokerage_name is required' }, { status: 400 })
      }

      const insertData: Record<string, any> = {
        transaction_id: id,
        brokerage_name: brokerage.brokerage_name,
        brokerage_role: brokerage.brokerage_role || 'other',
        payment_status: brokerage.payment_status || 'pending',
      }
      const optional = [
        'side',
        'agent_name', 'agent_email', 'agent_phone', 'broker_name', 'brokerage_dba',
        'brokerage_ein', 'brokerage_address', 'brokerage_city', 'brokerage_state',
        'brokerage_zip', 'federal_id_type', 'federal_id_number', 'commission_amount',
        'amount_1099_reportable', 'w9_on_file', 'w9_date_received', 'payment_date',
        'payment_method', 'payment_reference', 'notes',
      ]
      for (const f of optional) {
        if (brokerage[f] != null && brokerage[f] !== '') insertData[f] = brokerage[f]
      }

      const { data, error } = await supabase
        .from('transaction_external_brokerages')
        .insert(insertData)
        .select()
        .single()
      if (error) throw error
      await recomputeOfficeNet(id)
      return NextResponse.json({ brokerage: data })
    }

    // ── Apply primary split ──────────────────────────────────────────────────
    // Takes the primary agent, a commission amount, and a lead_source.
    // Computes all derived numbers and upserts the team_lead and
    // momentum_partner linked TIA rows atomically.
    if (action === 'apply_primary_split') {
      const {
        internal_agent_id,
        commission_amount,
        lead_source = 'own',
        referred_agent_id = null,
      } = body

      if (!internal_agent_id || commission_amount == null) {
        return NextResponse.json(
          { error: 'internal_agent_id and commission_amount required' },
          { status: 400 }
        )
      }

      // Fetch primary TIA
      const { data: primaryTia, error: pErr } = await supabase
        .from('transaction_internal_agents')
        .select('*, user:users!transaction_internal_agents_agent_id_fkey(id, referring_agent_id)')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()
      if (pErr || !primaryTia) {
        return NextResponse.json({ error: 'Primary agent row not found' }, { status: 404 })
      }

      if (primaryTia.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Cannot apply split on a paid row. Unmark paid first.' },
          { status: 409 }
        )
      }

      if (!['primary_agent', 'listing_agent', 'co_agent'].includes(primaryTia.agent_role)) {
        return NextResponse.json(
          { error: `apply_primary_split is only valid for primary_agent/listing_agent/co_agent rows (got ${primaryTia.agent_role})` },
          { status: 400 }
        )
      }

      // Get transaction type + status. Never overwrite a closed transaction's
      // commission values — they may be migrated historical data.
      const { data: txn } = await supabase
        .from('transactions')
        .select('transaction_type, status')
        .eq('id', id)
        .single()

      if (txn?.status === 'closed') {
        return NextResponse.json(
          { error: 'Cannot apply split on a closed transaction. Commission values on closed transactions are preserved as-is. Edit individual fields manually if needed.' },
          { status: 409 }
        )
      }

      const commAmt = num(commission_amount)
      const breakdown = await computeCommissionBreakdown({
        agentId: primaryTia.agent_id,
        transactionId: id,
        internalAgentId: internal_agent_id,
        commissionAmount: commAmt,
        leadSource: lead_source,
        referredAgentId: referred_agent_id,
        transactionType: txn?.transaction_type || null,
      })

      // Update primary row — uses canonical computeCommission() which
      // includes existing btsa, other_fees, rebate, debts so manual
      // adjustments are preserved.
      const primaryUpdates: any = {
        commission_plan: breakdown.planCode,
        agent_basis: commAmt,
        split_percentage: breakdown.agentSplitPct,
        agent_gross: Math.round(breakdown.agentGross * 100) / 100,
        brokerage_split: Math.round(breakdown.brokerageSplit * 100) / 100,
        processing_fee: Math.round(breakdown.processingFee * 100) / 100,
        coaching_fee: Math.round(breakdown.coachingFee * 100) / 100,
        team_lead_commission: Math.round(breakdown.teamLeadPayout * 100) / 100,
        agent_net: Math.round(breakdown.primaryAgentNet * 100) / 100,
        amount_1099_reportable: Math.round(breakdown.primary1099 * 100) / 100,
        counts_toward_progress: !breakdown.isLease,
        lead_source,
        referred_agent_id: referred_agent_id || null,
        updated_at: new Date().toISOString(),
      }
      if (breakdown.commissionPlanId) primaryUpdates.commission_plan_id = breakdown.commissionPlanId

      const { error: updErr } = await supabase
        .from('transaction_internal_agents')
        .update(primaryUpdates)
        .eq('id', internal_agent_id)
      if (updErr) throw updErr

      // Helper — build full column set for a linked (team_lead or momentum_partner) row.
      // Every non-manual field is set explicitly so nothing is left at DB default.
      async function buildLinkedRowFields(
        linkedAgentId: string,
        amount: number,
        pct: number,
        basis: number,
      ) {
        // Look up linked agent's own commission_plan for reporting continuity
        const { data: linkedUser } = await supabase
          .from('users')
          .select('commission_plan, lease_commission_plan')
          .eq('id', linkedAgentId)
          .single()
        const linkedPlanCode = breakdown.isLease && linkedUser?.lease_commission_plan
          ? linkedUser.lease_commission_plan
          : linkedUser?.commission_plan || null
        let linkedPlanId: string | null = null
        if (linkedPlanCode) {
          const { data: planRow } = await supabase
            .from('commission_plans')
            .select('id')
            .or(`code.ilike.${linkedPlanCode},name.ilike.${linkedPlanCode}`)
            .limit(1)
            .maybeSingle()
          linkedPlanId = planRow?.id || null
        }

        return {
          // Core amounts
          agent_gross: amount,
          agent_net: amount,
          amount_1099_reportable: amount,
          brokerage_split: 0,
          processing_fee: 0,
          coaching_fee: 0,
          other_fees: 0,
          other_fees_description: null,
          btsa_amount: 0,
          team_lead_commission: 0,
          debts_deducted: 0,
          rebate_amount: 0,
          rebate_type: null,
          pre_split_deductions: 0,
          pre_split_deductions_description: null,
          // Attribution
          sales_volume: 0,
          units: 0,
          split_percentage: pct,
          agent_basis: basis,
          commission_plan: linkedPlanCode,
          commission_plan_id: linkedPlanId,
          counts_toward_progress: false,
        }
      }

      // Upsert team_lead row — keyed by source_tia_id so each primary gets its
      // own dedicated TL row. On re-apply, we find the existing row by
      // source_tia_id and update it; we never blow away TL rows from other
      // contributing primaries.
      let teamLeadTiaId: string | null = null
      if (breakdown.teamLeadId && breakdown.teamLeadPayout > 0) {
        const { data: existingTl } = await supabase
          .from('transaction_internal_agents')
          .select('id, payment_status')
          .eq('transaction_id', id)
          .eq('agent_role', 'team_lead')
          .eq('source_tia_id', internal_agent_id)
          .maybeSingle()

        const tlAmount = Math.round(breakdown.teamLeadPayout * 100) / 100
        const tlFields = await buildLinkedRowFields(
          breakdown.teamLeadId,
          tlAmount,
          breakdown.teamLeadPct,
          commAmt,
        )

        if (existingTl) {
          teamLeadTiaId = existingTl.id
          if (existingTl.payment_status !== 'paid') {
            const { error: tlUpdErr } = await supabase
              .from('transaction_internal_agents')
              .update({ ...tlFields, side: primaryTia.side ?? null, updated_at: new Date().toISOString() })
              .eq('id', existingTl.id)
            if (tlUpdErr) throw tlUpdErr
          }
        } else {
          const { data: newTl, error: tlInsErr } = await supabase
            .from('transaction_internal_agents')
            .insert({
              transaction_id: id,
              agent_id: breakdown.teamLeadId,
              agent_role: 'team_lead',
              side: primaryTia.side ?? null,
              payment_status: 'pending',
              funding_source: 'crc',
              source_tia_id: internal_agent_id,
              ...tlFields,
            })
            .select('id')
            .single()
          if (tlInsErr) throw tlInsErr
          teamLeadTiaId = newTl.id
        }
      } else {
        // No TL payout this round — if a stale TL row exists tied to this
        // primary from a prior apply, clean it up (unless paid).
        const { data: staleTl } = await supabase
          .from('transaction_internal_agents')
          .select('id, payment_status')
          .eq('transaction_id', id)
          .eq('agent_role', 'team_lead')
          .eq('source_tia_id', internal_agent_id)
          .maybeSingle()
        if (staleTl && staleTl.payment_status !== 'paid') {
          await supabase
            .from('transaction_internal_agents')
            .delete()
            .eq('id', staleTl.id)
        }
      }

      // Upsert momentum_partner row — same provenance pattern
      let momentumTiaId: string | null = null
      if (breakdown.momentumPartnerId && breakdown.momentumPartnerPayout > 0) {
        const { data: existingMp } = await supabase
          .from('transaction_internal_agents')
          .select('id, payment_status')
          .eq('transaction_id', id)
          .eq('agent_role', 'momentum_partner')
          .eq('source_tia_id', internal_agent_id)
          .maybeSingle()

        const mpAmount = Math.round(breakdown.momentumPartnerPayout * 100) / 100
        const mpFields = await buildLinkedRowFields(
          breakdown.momentumPartnerId,
          mpAmount,
          breakdown.momentumPartnerPct,
          Math.round(breakdown.brokerageSplit * 100) / 100,
        )

        if (existingMp) {
          momentumTiaId = existingMp.id
          if (existingMp.payment_status !== 'paid') {
            const { error: mpUpdErr } = await supabase
              .from('transaction_internal_agents')
              .update({ ...mpFields, side: primaryTia.side ?? null, updated_at: new Date().toISOString() })
              .eq('id', existingMp.id)
            if (mpUpdErr) throw mpUpdErr
          }
        } else {
          const { data: newMp, error: mpInsErr } = await supabase
            .from('transaction_internal_agents')
            .insert({
              transaction_id: id,
              agent_id: breakdown.momentumPartnerId,
              agent_role: 'momentum_partner',
              side: primaryTia.side ?? null,
              payment_status: 'pending',
              funding_source: 'crc',
              source_tia_id: internal_agent_id,
              ...mpFields,
            })
            .select('id')
            .single()
          if (mpInsErr) throw mpInsErr
          momentumTiaId = newMp.id
        }
      } else {
        // Clean up stale MP row if momentum no longer applies
        const { data: staleMp } = await supabase
          .from('transaction_internal_agents')
          .select('id, payment_status')
          .eq('transaction_id', id)
          .eq('agent_role', 'momentum_partner')
          .eq('source_tia_id', internal_agent_id)
          .maybeSingle()
        if (staleMp && staleMp.payment_status !== 'paid') {
          await supabase
            .from('transaction_internal_agents')
            .delete()
            .eq('id', staleMp.id)
        }
      }

      // After all primary/TL/MP row updates land, refresh the brokerage
      // net since office_net depends on the sum of every TIA agent_net.
      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        breakdown,
        primary_tia_id: internal_agent_id,
        team_lead_tia_id: teamLeadTiaId,
        momentum_partner_tia_id: momentumTiaId,
      })
    }

    // ── BTSA redistribution (low-commission flag) ────────────────────────────
    // When a side commission is below the configured threshold AND the side
    // has BTSA, admin can move shortfall from BTSA into side commission.
    if (action === 'redistribute_btsa') {
      const { side: targetSide } = body as { side?: 'listing' | 'buying' }
      if (targetSide !== 'listing' && targetSide !== 'buying') {
        return NextResponse.json({ error: 'side must be "listing" or "buying"' }, { status: 400 })
      }

      // Load transaction + TIAs + settings
      const { data: txnRow, error: txnErr } = await supabase
        .from('transactions')
        .select('id, transaction_type, sales_price, monthly_rent, listing_side_commission, buying_side_commission, status, notes')
        .eq('id', id)
        .single()
      if (txnErr || !txnRow) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      if (txnRow.status === 'closed') {
        return NextResponse.json({ error: 'Cannot redistribute on a closed transaction' }, { status: 409 })
      }

      const { data: tiaRows, error: tiaErr } = await supabase
        .from('transaction_internal_agents')
        .select('id, side, btsa_amount, payment_status')
        .eq('transaction_id', id)
      if (tiaErr) throw tiaErr

      const { data: settingsRow } = await supabase
        .from('company_settings')
        .select('btsa_min_sale_pct, btsa_min_lease_pct')
        .single()

      const { computeLowCommissionFlags, planRedistribution } = await import('@/lib/transactions/lowCommissionFlag')
      const flags = computeLowCommissionFlags({
        transaction: txnRow as any,
        internalAgents: (tiaRows || []) as any,
        settings: settingsRow as any,
      })
      const flag = flags.find(f => f.side === targetSide)
      if (!flag || !flag.can_redistribute) {
        return NextResponse.json({ error: 'No redistribution available for this side' }, { status: 409 })
      }

      const plan = planRedistribution({
        flag,
        internalAgents: (tiaRows || []) as any,
      })
      if (!plan) {
        return NextResponse.json({ error: 'Could not plan redistribution' }, { status: 409 })
      }

      // Block if the TIA holding BTSA is paid
      const targetRow = (tiaRows || []).find((r: any) => r.id === plan.tiaRow.id)
      if (targetRow?.payment_status === 'paid') {
        return NextResponse.json({ error: 'Cannot redistribute. The BTSA row has already been paid' }, { status: 409 })
      }

      // Apply: update transaction side commission + tia btsa
      const sideCol = targetSide === 'listing' ? 'listing_side_commission' : 'buying_side_commission'
      const { error: updTxnErr } = await supabase
        .from('transactions')
        .update({
          [sideCol]: plan.newSideCommission,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (updTxnErr) throw updTxnErr

      const { error: updTiaErr } = await supabase
        .from('transaction_internal_agents')
        .update({
          btsa_amount: plan.tiaRow.newBtsa,
          updated_at: new Date().toISOString(),
        })
        .eq('id', plan.tiaRow.id)
      if (updTiaErr) throw updTiaErr

      // Append note
      const today = new Date().toISOString().slice(0, 10)
      const sideTitle = targetSide === 'listing' ? 'Listing side' : 'Buying side'
      const noteLine = `[${today}] ${sideTitle} commission redistributed from $${plan.oldSideCommission.toFixed(2)} to $${plan.newSideCommission.toFixed(2)} (low-commission threshold). $${plan.movedAmount.toFixed(2)} reduced from BTSA on TIA ${plan.tiaRow.id}. action=redistribute_btsa`
      const newNotes = txnRow.notes ? `${txnRow.notes}\n${noteLine}` : noteLine
      await supabase
        .from('transactions')
        .update({ notes: newNotes })
        .eq('id', id)

      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        side: targetSide,
        moved: plan.movedAmount,
        new_side_commission: plan.newSideCommission,
        new_btsa_amount: plan.tiaRow.newBtsa,
        tia_id: plan.tiaRow.id,
        warning: plan.multipleBtsaRows ? 'Multiple TIAs on this side hold BTSA. Only the largest was reduced.' : null,
      })
    }

    // ── BTSA redistribution UNDO ─────────────────────────────────────────────
    // Reverses a prior redistribute_btsa. Caller must supply the side, the
    // moved amount, and the TIA id that previously had BTSA reduced.
    if (action === 'undo_redistribute_btsa') {
      const {
        side: targetSide,
        moved_amount,
        tia_id,
      } = body as { side?: 'listing' | 'buying'; moved_amount?: number; tia_id?: string }

      if (targetSide !== 'listing' && targetSide !== 'buying') {
        return NextResponse.json({ error: 'side must be "listing" or "buying"' }, { status: 400 })
      }
      if (!moved_amount || moved_amount <= 0) {
        return NextResponse.json({ error: 'moved_amount required and must be positive' }, { status: 400 })
      }
      if (!tia_id) {
        return NextResponse.json({ error: 'tia_id required' }, { status: 400 })
      }

      const { data: txnRow, error: txnErr } = await supabase
        .from('transactions')
        .select('id, listing_side_commission, buying_side_commission, status, notes')
        .eq('id', id)
        .single()
      if (txnErr || !txnRow) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      if (txnRow.status === 'closed') {
        return NextResponse.json({ error: 'Cannot undo redistribution on a closed transaction' }, { status: 409 })
      }

      const { data: tiaRow, error: tiaErr } = await supabase
        .from('transaction_internal_agents')
        .select('id, btsa_amount, payment_status')
        .eq('id', tia_id)
        .eq('transaction_id', id)
        .single()
      if (tiaErr || !tiaRow) {
        return NextResponse.json({ error: 'TIA row not found on this transaction' }, { status: 404 })
      }
      if (tiaRow.payment_status === 'paid') {
        return NextResponse.json({ error: 'Cannot undo. The BTSA row has already been paid' }, { status: 409 })
      }

      const sideCol = targetSide === 'listing' ? 'listing_side_commission' : 'buying_side_commission'
      const currentSideCommission = num(txnRow[sideCol])
      if (currentSideCommission < moved_amount) {
        return NextResponse.json(
          { error: `Cannot undo. Current ${targetSide} side commission ($${currentSideCommission.toFixed(2)}) is less than the move amount ($${moved_amount.toFixed(2)}).` },
          { status: 409 }
        )
      }

      const newSideCommission = Math.round((currentSideCommission - moved_amount) * 100) / 100
      const newBtsa = Math.round((num(tiaRow.btsa_amount) + moved_amount) * 100) / 100

      const { error: updTxnErr } = await supabase
        .from('transactions')
        .update({
          [sideCol]: newSideCommission,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (updTxnErr) throw updTxnErr

      const { error: updTiaErr } = await supabase
        .from('transaction_internal_agents')
        .update({
          btsa_amount: newBtsa,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tia_id)
      if (updTiaErr) throw updTiaErr

      const today = new Date().toISOString().slice(0, 10)
      const sideTitle = targetSide === 'listing' ? 'Listing side' : 'Buying side'
      const noteLine = `[${today}] UNDO: ${sideTitle} redistribution reverted. Side commission moved from $${currentSideCommission.toFixed(2)} to $${newSideCommission.toFixed(2)}. $${moved_amount.toFixed(2)} restored to BTSA on TIA ${tia_id}. action=undo_redistribute_btsa`
      const newNotes = txnRow.notes ? `${txnRow.notes}\n${noteLine}` : noteLine
      await supabase
        .from('transactions')
        .update({ notes: newNotes })
        .eq('id', id)

      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        side: targetSide,
        new_side_commission: newSideCommission,
        new_btsa_amount: newBtsa,
        tia_id,
      })
    }

    // ── Stage debt/credit (mark paid against this transaction) ──────────────
    // Used when admin checks a debt/credit on the agent's billing panel.
    // Funds are in hand by the time staging happens, so the debt is fully
    // marked paid right away (status=paid, amount_paid bumped to owed,
    // offset_* set, date_resolved=today). Does NOT touch the TIA's
    // payment_status — that's a separate Mark Paid step.
    //
    // body: { internal_agent_id, debt_id?, credit_id? }
    if (action === 'stage_debt' || action === 'stage_credit') {
      const { internal_agent_id, debt_id, credit_id } = body
      const recordId = debt_id || credit_id
      if (!internal_agent_id || !recordId) {
        return NextResponse.json(
          { error: 'internal_agent_id and (debt_id or credit_id) required' },
          { status: 400 }
        )
      }

      const { data: rec } = await supabase
        .from('agent_debts')
        .select('id, status, amount_owed, amount_paid, amount_remaining, offset_transaction_id, offset_transaction_agent_id')
        .eq('id', recordId)
        .single()
      if (!rec) {
        return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
      }
      if (rec.status !== 'outstanding') {
        return NextResponse.json({ error: 'Only outstanding records can be staged' }, { status: 409 })
      }
      // Already staged on a DIFFERENT txn — refuse.
      if (
        rec.offset_transaction_id &&
        rec.offset_transaction_id !== id
      ) {
        return NextResponse.json(
          { error: 'Already staged on another transaction. Unstage there first.' },
          { status: 409 }
        )
      }

      const amountRemaining = num(rec.amount_remaining ?? rec.amount_owed)
      const today = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from('agent_debts')
        .update({
          amount_paid: num(rec.amount_paid) + amountRemaining,
          status: 'paid',
          date_resolved: today,
          offset_transaction_id: id,
          offset_transaction_agent_id: internal_agent_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
      if (error) throw error
      // Staging a debt/credit changes the brokerage's net for the txn under
      // the new formula, so refresh it.
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Unstage debt/credit (revert single record to outstanding) ───────────
    // Used when admin unchecks a previously-staged debt/credit. Reverses ONLY
    // this record (status=outstanding, amount_paid restored, offset cleared).
    // Does NOT touch the TIA or other debts. Use reverse_mark_paid for the
    // post-Mark-Paid full-reversal case.
    //
    // body: { internal_agent_id, debt_id?, credit_id? }
    if (action === 'unstage_debt' || action === 'unstage_credit') {
      const { internal_agent_id, debt_id, credit_id } = body
      const recordId = debt_id || credit_id
      if (!internal_agent_id || !recordId) {
        return NextResponse.json(
          { error: 'internal_agent_id and (debt_id or credit_id) required' },
          { status: 400 }
        )
      }

      const { data: rec } = await supabase
        .from('agent_debts')
        .select('id, status, amount_owed, amount_paid, amount_remaining, offset_transaction_id, offset_transaction_agent_id')
        .eq('id', recordId)
        .single()
      if (!rec) {
        return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
      }
      if (
        rec.offset_transaction_id !== id ||
        rec.offset_transaction_agent_id !== internal_agent_id
      ) {
        return NextResponse.json(
          { error: 'Record is not staged on this transaction/agent.' },
          { status: 409 }
        )
      }

      // Reverse the amount applied at staging. Mirrors reverse_mark_paid math:
      // amount applied = owed - currentRemaining (which was 0 right after stage).
      const owed = num(rec.amount_owed)
      const currentRemaining = num(rec.amount_remaining ?? 0)
      const appliedHere = owed - currentRemaining
      const { error } = await supabase
        .from('agent_debts')
        .update({
          amount_paid: Math.max(0, num(rec.amount_paid) - appliedHere),
          status: 'outstanding',
          date_resolved: null,
          offset_transaction_id: null,
          offset_transaction_agent_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recordId)
      if (error) throw error
      // Unstaging changes the brokerage's net for the txn under the new
      // formula, so refresh it.
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true })
    }

    // ── Reverse mark paid for a single debt or credit ────────────────────────
    // Triggered when admin unchecks a debt/credit on a paid TIA. Reverses
    // the agent_debts row (status → outstanding, amount_paid reduced, offset
    // links cleared) AND reverts the TIA to pending so it can be re-paid.
    //
    // body: { internal_agent_id, debt_id?, credit_id? }  (one of debt_id|credit_id)
    if (action === 'reverse_mark_paid') {
      const { internal_agent_id, debt_id, credit_id } = body
      const recordId = debt_id || credit_id
      if (!internal_agent_id || !recordId) {
        return NextResponse.json(
          { error: 'internal_agent_id and (debt_id or credit_id) required' },
          { status: 400 }
        )
      }

      // Validate the trigger record exists and was applied here
      const { data: rec } = await supabase
        .from('agent_debts')
        .select('id, record_type, offset_transaction_id, offset_transaction_agent_id')
        .eq('id', recordId)
        .single()

      if (!rec) {
        return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
      }
      if (rec.offset_transaction_id !== id || rec.offset_transaction_agent_id !== internal_agent_id) {
        return NextResponse.json(
          { error: 'This record was not applied to this transaction/agent.' },
          { status: 400 }
        )
      }

      // Reverse ALL agent_debts rows applied to this TIA (debts AND credits).
      // Why: leaving some applied while unmarking the TIA creates inconsistent
      // state ("paid via offset to this txn" but txn is no longer paid). Cleaner
      // to clear everything and let admin re-check what they want.
      const { data: allApplied } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('offset_transaction_agent_id', internal_agent_id)
        .eq('offset_transaction_id', id)
        .eq('status', 'paid')

      for (const r of allApplied || []) {
        await supabase
          .from('agent_debts')
          .update({
            amount_paid: 0,
            status: 'outstanding',
            offset_transaction_id: null,
            offset_transaction_agent_id: null,
            date_resolved: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.id)
      }

      // Now recompute the TIA using canonical formula with no debts/credits
      // (since we just cleared them all). Rebate stays.
      const { data: tia } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('id', internal_agent_id)
        .single()

      if (tia) {
        // For retainer rows, basis acts as gross (see mark_paid for canonical
        // explanation).
        const isRetainer = tia.installment_kind === 'retainer'
        const grossForFormula = isRetainer ? tia.agent_basis : tia.agent_gross

        const { amount_1099: restored1099, agent_net: restoredNet } = computeCommission({
          agent_gross: grossForFormula,
          btsa_amount: tia.btsa_amount,
          processing_fee: tia.processing_fee,
          coaching_fee: tia.coaching_fee,
          other_fees: tia.other_fees,
          rebate_amount: tia.rebate_amount,
          credits_applied: 0,
          debts_deducted: 0,
        })

        await supabase
          .from('transaction_internal_agents')
          .update({
            amount_1099_reportable: restored1099,
            agent_net: restoredNet,
            debts_deducted: 0,
            payment_status: 'pending',
            payment_date: null,
            payment_method: null,
            payment_reference: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', internal_agent_id)
      }

      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        reversed_id: recordId,
        all_reversed_ids: (allApplied || []).map(r => r.id),
      })
    }

    // ── Mark agent paid (TIA) ────────────────────────────────────────────────
    // Writes payment metadata + debts + recomputes agent_net to reflect debts.
    // Does NOT recompute amount_1099_reportable (that was set at edit time).
    if (action === 'mark_paid') {
      const {
        internal_agent_id,
        transaction_type,
        payment_date,
        payment_method,
        payment_reference,
        funding_source,
        debts_to_apply,
        credits_to_apply,
        counts_toward_progress,
      } = body

      const { data: tia, error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('id', internal_agent_id)
        .single()
      if (tiaError || !tia) throw new Error('Agent record not found')

      if (tia.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Row is already marked paid. Unmark first to re-mark.' },
          { status: 409 }
        )
      }

      const { data: agentUser, error: userError } = await supabase
        .from('users')
        .select('id, commission_plan, qualifying_transaction_count, qualifying_transaction_target')
        .eq('id', tia.agent_id)
        .single()
      if (userError) throw userError

      // Sum debts to apply
      let totalDebtsDeducted = 0
      if (debts_to_apply && debts_to_apply.length > 0) {
        for (const debtApp of debts_to_apply) {
          totalDebtsDeducted += num(debtApp.amount)
        }
      }

      // Sum credits to apply
      let totalCreditsApplied = 0
      if (credits_to_apply && credits_to_apply.length > 0) {
        for (const creditApp of credits_to_apply) {
          totalCreditsApplied += num(creditApp.amount)
        }
      }

      // Also fold in any debts/credits that were previously STAGED on this
      // txn/tia (status='paid' with offset_* matching). Their agent_debts row
      // was already updated at stage time; we just need their amount in the
      // TIA totals so agent_net / debts_deducted reflect them.
      const { data: stagedRecords } = await supabase
        .from('agent_debts')
        .select('id, record_type, amount_owed, amount_paid, amount_remaining')
        .eq('offset_transaction_id', id)
        .eq('offset_transaction_agent_id', internal_agent_id)
        .eq('status', 'paid')
      const debtAppliedIds = new Set(
        (debts_to_apply || []).map((d: any) => d.debt_id).filter(Boolean)
      )
      const creditAppliedIds = new Set(
        (credits_to_apply || []).map((c: any) => c.credit_id).filter(Boolean)
      )
      for (const sr of stagedRecords || []) {
        // Skip records that are also in *_to_apply (avoid double counting).
        if (debtAppliedIds.has(sr.id) || creditAppliedIds.has(sr.id)) continue
        // Amount that was actually applied at stage time =
        //   amount_owed - amount_remaining (mirrors reverse_mark_paid math).
        const owed = num(sr.amount_owed)
        const remaining = num(sr.amount_remaining ?? 0)
        const appliedAtStage = Math.max(0, owed - remaining)
        if (sr.record_type === 'credit') {
          totalCreditsApplied += appliedAtStage
        } else {
          totalDebtsDeducted += appliedAtStage
        }
      }

      // Use the CANONICAL commission formula from lib/transactions/math.ts.
      // Locked 2026-05-04 (Phase 2.6).
      //   amount_1099 = agent_gross + btsa − processing − coaching − other_fees − rebate + credits
      //   agent_net   = amount_1099 − debts
      //
      // team_lead_commission on primary TIA is informational only — it was
      // carved out of agent_gross at apply_primary_split time. Do NOT pass
      // it as a deduction here.
      //
      // RETAINER rows: the formula above also works for retainer rows because
      // we map agent_basis -> agent_gross (the income before any fee), and
      // processing_fee carries the office's retainer fee. All other fields
      // are 0 on a retainer row by construction, so the formula reduces to:
      //   amount_1099 = basis − retainer_fee + credits
      //   agent_net   = amount_1099 − debts
      const isRetainer = tia.installment_kind === 'retainer'
      const grossForFormula = isRetainer ? tia.agent_basis : tia.agent_gross

      const { amount_1099: amount1099, agent_net: agentNet } = computeCommission({
        agent_gross: grossForFormula,
        btsa_amount: tia.btsa_amount,
        processing_fee: tia.processing_fee,
        coaching_fee: tia.coaching_fee,
        other_fees: tia.other_fees,
        rebate_amount: tia.rebate_amount,
        credits_applied: totalCreditsApplied,
        debts_deducted: totalDebtsDeducted,
      })

      const tiaUpdate: any = {
        payment_status: 'paid',
        payment_date,
        payment_method: payment_method || null,
        payment_reference: payment_reference || null,
        funding_source: funding_source || 'crc',
        amount_1099_reportable: amount1099,
        debts_deducted: Math.round(totalDebtsDeducted * 100) / 100,
        agent_net: agentNet,
        updated_at: new Date().toISOString(),
      }

      const { error: updateTiaError } = await supabase
        .from('transaction_internal_agents')
        .update(tiaUpdate)
        .eq('id', internal_agent_id)
      if (updateTiaError) throw updateTiaError

      // Apply debts
      if (debts_to_apply && debts_to_apply.length > 0) {
        for (const debtApp of debts_to_apply) {
          const { data: debt } = await supabase
            .from('agent_debts')
            .select('*')
            .eq('id', debtApp.debt_id)
            .single()

          if (debt) {
            const amountRemaining = num(debt.amount_remaining ?? debt.amount_owed)
            const amountApplied = num(debtApp.amount)
            const newRemaining = amountRemaining - amountApplied

            const debtUpdate: any = {
              amount_paid: num(debt.amount_paid) + amountApplied,
              offset_transaction_id: id,
              offset_transaction_agent_id: internal_agent_id,
              updated_at: new Date().toISOString(),
            }
            if (newRemaining <= 0) {
              debtUpdate.status = 'paid'
              debtUpdate.date_resolved = payment_date
            }
            await supabase.from('agent_debts').update(debtUpdate).eq('id', debtApp.debt_id)
          }
        }
      }

      // Apply credits — same agent_debts table, record_type='credit'.
      // Mark the credit row as paid (consumed) and link to this transaction.
      if (credits_to_apply && credits_to_apply.length > 0) {
        for (const creditApp of credits_to_apply) {
          const { data: credit } = await supabase
            .from('agent_debts')
            .select('*')
            .eq('id', creditApp.credit_id)
            .single()

          if (credit) {
            const amountRemaining = num(credit.amount_remaining ?? credit.amount_owed)
            const amountApplied = num(creditApp.amount)
            const newRemaining = amountRemaining - amountApplied

            const creditUpdate: any = {
              amount_paid: num(credit.amount_paid) + amountApplied,
              offset_transaction_id: id,
              offset_transaction_agent_id: internal_agent_id,
              updated_at: new Date().toISOString(),
            }
            if (newRemaining <= 0) {
              creditUpdate.status = 'paid'
              creditUpdate.date_resolved = payment_date
            }
            await supabase.from('agent_debts').update(creditUpdate).eq('id', creditApp.credit_id)
          }
        }
      }

      // Increment qualifying_transaction_count for new_agent plan primary/listing on non-lease.
      // Fires ONCE per (transaction_id, agent_id) pair — not once per installment.
      // Check first: has any other paid TIA row exists for this agent on this transaction?
      const countsThis = counts_toward_progress !== false
      if (
        countsThis &&
        (tia.agent_role === 'primary_agent' || tia.agent_role === 'listing_agent') &&
        agentUser
      ) {
        const { data: otherPaidRows } = await supabase
          .from('transaction_internal_agents')
          .select('id')
          .eq('transaction_id', id)
          .eq('agent_id', tia.agent_id)
          .eq('payment_status', 'paid')
          .neq('id', internal_agent_id)

        const alreadyCountedForThisDeal = (otherPaidRows || []).length > 0
        if (!alreadyCountedForThisDeal) {
          const plan = (agentUser.commission_plan || '').toLowerCase().trim()
          const txnIsLease = transaction_type ? isLeaseType(transaction_type) : false
          if (!txnIsLease) {
            const isNewAgentPlan =
              plan === 'new_agent' ||
              plan === 'new agent plan' ||
              (plan.includes('new') && plan.includes('agent'))
            if (isNewAgentPlan) {
              await supabase
                .from('users')
                .update({
                  qualifying_transaction_count: (agentUser.qualifying_transaction_count || 0) + 1,
                })
                .eq('id', tia.agent_id)
            }
          }
        }
      }

      await recomputeOfficeNet(id)

      return NextResponse.json({
        success: true,
        updates: { ...tiaUpdate, debts_applied: debts_to_apply?.length || 0 },
      })
    }

    // ── Unmark paid (TIA) ────────────────────────────────────────────────────
    // Reverses a mark_paid:
    //   - Clears payment fields
    //   - Reverses any agent_debts applications tied to this row
    //   - Decrements qualifying_transaction_count if applicable
    //   - Recomputes agent_net without debts (gross+btsa-fees-team_lead)
    if (action === 'unmark_paid') {
      const { internal_agent_id } = body

      const { data: tia, error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .select('*')
        .eq('id', internal_agent_id)
        .single()
      if (tiaError || !tia) throw new Error('Agent record not found')

      if (tia.payment_status !== 'paid') {
        return NextResponse.json({ error: 'Row is not marked paid' }, { status: 409 })
      }

      // Reverse linked debts
      const { data: linkedDebts } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('offset_transaction_agent_id', internal_agent_id)

      for (const debt of linkedDebts || []) {
        // How much of this debt was applied on this payment?
        // We can only safely reverse what was tracked on the debt itself,
        // but multiple payments could have touched it. For the common case
        // where this row applied the most recent payment, restore using
        // the TIA's debts_deducted proportionally.
        //
        // Safer approach: since agent_debts.amount_paid represents cumulative,
        // and there's no per-payment audit trail, we assume this TIA applied
        // its recorded amount. We subtract it and clear offset refs.
        const appliedHere = num(tia.debts_deducted) // approximation when one debt
        // If multiple debts were applied by this TIA, amount_paid on each
        // was bumped individually during mark_paid. Without a per-debt
        // ledger, we reverse by using the current amount_paid minus
        // what the debt had before: not available. So we unlink and
        // reduce by the whole debts_deducted only if this debt is the
        // sole one. For multiple, admin should review.
        //
        // Pragmatic rule: flip status back to 'outstanding' if paid,
        // subtract the portion stored on this debt's offset link. Since
        // we can't reliably split across multiple debts, we reset
        // amount_paid by subtracting the amount_remaining delta.

        const currentPaid = num(debt.amount_paid)
        const owed = num(debt.amount_owed)
        const currentRemaining = num(debt.amount_remaining ?? (owed - currentPaid))
        // Amount applied by this payout = owed - currentRemaining - prior_paid
        // We don't have prior_paid, so we assume this TIA is the only payment
        // that touched the debt (the common case). Revert fully.
        const updated: any = {
          amount_paid: Math.max(0, currentPaid - (owed - currentRemaining)),
          status: 'outstanding',
          date_resolved: null,
          offset_transaction_id: null,
          offset_transaction_agent_id: null,
          updated_at: new Date().toISOString(),
        }
        // If amount_paid is a generated column in some setups, this will
        // be recomputed; in current schema amount_remaining is the generated column.
        await supabase.from('agent_debts').update(updated).eq('id', debt.id)
      }

      // Recompute agent_net using canonical formula. Debts cleared (we
      // just reversed them); credits cleared on unmark. Rebate is preserved
      // on the row and stays in the formula.
      // For retainer rows, basis acts as gross.
      const isRetainerUnmark = tia.installment_kind === 'retainer'
      const grossForFormulaUnmark = isRetainerUnmark ? tia.agent_basis : tia.agent_gross
      const { amount_1099: restored1099, agent_net: restoredNet } = computeCommission({
        agent_gross: grossForFormulaUnmark,
        btsa_amount: tia.btsa_amount,
        processing_fee: tia.processing_fee,
        coaching_fee: tia.coaching_fee,
        other_fees: tia.other_fees,
        rebate_amount: tia.rebate_amount,
        credits_applied: 0,
        debts_deducted: 0,
      })

      const { error: updErr } = await supabase
        .from('transaction_internal_agents')
        .update({
          payment_status: 'pending',
          payment_date: null,
          payment_method: null,
          payment_reference: null,
          debts_deducted: 0,
          amount_1099_reportable: restored1099,
          agent_net: restoredNet,
          updated_at: new Date().toISOString(),
        })
        .eq('id', internal_agent_id)
      if (updErr) throw updErr

      // Decrement qualifying_transaction_count if this was a non-lease primary/listing on new_agent plan.
      // Only decrement if NO other paid TIA row remains for this agent on this transaction
      // (i.e., this was the last installment that had been paid).
      if (tia.agent_role === 'primary_agent' || tia.agent_role === 'listing_agent') {
        const { data: stillPaid } = await supabase
          .from('transaction_internal_agents')
          .select('id')
          .eq('transaction_id', id)
          .eq('agent_id', tia.agent_id)
          .eq('payment_status', 'paid')
          .neq('id', internal_agent_id)

        const lastPaidRow = (stillPaid || []).length === 0
        if (lastPaidRow) {
        const { data: txn } = await supabase
          .from('transactions')
          .select('transaction_type')
          .eq('id', id)
          .single()
        const txnIsLease = isLeaseType(txn?.transaction_type || '')
        if (!txnIsLease) {
          const { data: agentUser } = await supabase
            .from('users')
            .select('commission_plan, qualifying_transaction_count')
            .eq('id', tia.agent_id)
            .single()
          if (agentUser) {
            const plan = (agentUser.commission_plan || '').toLowerCase().trim()
            const isNewAgentPlan =
              plan === 'new_agent' ||
              plan === 'new agent plan' ||
              (plan.includes('new') && plan.includes('agent'))
            const current = agentUser.qualifying_transaction_count || 0
            if (isNewAgentPlan && current > 0) {
              await supabase
                .from('users')
                .update({ qualifying_transaction_count: current - 1 })
                .eq('id', tia.agent_id)
            }
          }
        }
        }  // close if (lastPaidRow)
      }

      await recomputeOfficeNet(id)

      return NextResponse.json({ success: true })
    }

    // ── Mark brokerage paid (TEB) ────────────────────────────────────────────
    if (action === 'mark_brokerage_paid') {
      const { brokerage_id, payment_date, payment_method, payment_reference } = body

      const { data: teb } = await supabase
        .from('transaction_external_brokerages')
        .select('payment_status')
        .eq('id', brokerage_id)
        .single()

      if (teb?.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'Already marked paid. Unmark first.' },
          { status: 409 }
        )
      }

      const { error } = await supabase
        .from('transaction_external_brokerages')
        .update({
          payment_status: 'paid',
          payment_date: payment_date || null,
          payment_method: payment_method || null,
          payment_reference: payment_reference || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', brokerage_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Unmark brokerage paid (TEB) ──────────────────────────────────────────
    if (action === 'unmark_brokerage_paid') {
      const { brokerage_id } = body

      const { data: teb } = await supabase
        .from('transaction_external_brokerages')
        .select('payment_status')
        .eq('id', brokerage_id)
        .single()

      if (teb?.payment_status !== 'paid') {
        return NextResponse.json({ error: 'Not marked paid' }, { status: 409 })
      }

      const { error } = await supabase
        .from('transaction_external_brokerages')
        .update({
          payment_status: 'pending',
          payment_date: null,
          payment_method: null,
          payment_reference: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', brokerage_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Close transaction ────────────────────────────────────────────────────
    if (action === 'close_transaction') {
      const { closed_date, userId } = body

      const updates: any = {
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (closed_date) updates.closed_date = closed_date
      if (userId) updates.closed_by = userId

      const { error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Get agent debts ──────────────────────────────────────────────────────
    if (action === 'get_agent_debts') {
      const { agent_id } = body
      const { data: debts, error } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('agent_id', agent_id)
        .eq('status', 'outstanding')
        .order('date_incurred', { ascending: true })
      if (error) throw error
      return NextResponse.json({ debts: debts || [] })
    }

    // ── Contact CRUD ─────────────────────────────────────────────────────────
    if (action === 'create_contact') {
      const { contact } = body
      const { data, error } = await supabase
        .from('transaction_contacts')
        .insert({
          transaction_id: id,
          contact_type: contact.contact_type,
          contact_type_other: contact.contact_type_other || null,
          name: contact.name || null,
          phone: contact.phone || null,
          email: contact.email || null,
          company: contact.company || null,
          notes: contact.notes || null,
        })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ success: true, contact: data })
    }
    if (action === 'update_contact') {
      const { contact_id, updates } = body
      const { error } = await supabase
        .from('transaction_contacts')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', contact_id)
        .eq('transaction_id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    if (action === 'delete_contact') {
      const { contact_id } = body
      const { error } = await supabase
        .from('transaction_contacts')
        .delete()
        .eq('id', contact_id)
        .eq('transaction_id', id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // ── Preview a statement or CDA email ─────────────────────────────────────
    // Returns { preview: { subject, html, to, cc, replyTo } } without sending.
    // Used by EmailPreviewModal to show a read-only rendered preview before
    // the user confirms with Send.
    if (action === 'preview_email') {
      const { email_type, internal_agent_id } = body
      if (!internal_agent_id || !email_type) {
        return NextResponse.json(
          { error: 'email_type and internal_agent_id required' },
          { status: 400 }
        )
      }
      let preview
      if (email_type === 'statement') {
        preview = await buildStatementEmail(id, internal_agent_id)
      } else if (email_type === 'cda') {
        preview = await buildCdaEmail(id, internal_agent_id)
      } else {
        return NextResponse.json(
          { error: `Unknown email_type: ${email_type}` },
          { status: 400 }
        )
      }
      return NextResponse.json({ preview })
    }

    // ── Send a statement or CDA email ────────────────────────────────────────
    // Rebuilds the preview from fresh DB data (never trusts client copy), then
    // fires via Resend. Requires either brokerage_main_email (CRC) or
    // referral_brokerage_email (RC) to be configured for the cc.
    if (action === 'send_email') {
      const { email_type, internal_agent_id } = body
      if (!internal_agent_id || !email_type) {
        return NextResponse.json(
          { error: 'email_type and internal_agent_id required' },
          { status: 400 }
        )
      }
      let preview
      if (email_type === 'statement') {
        preview = await buildStatementEmail(id, internal_agent_id)
      } else if (email_type === 'cda') {
        preview = await buildCdaEmail(id, internal_agent_id)
      } else {
        return NextResponse.json(
          { error: `Unknown email_type: ${email_type}` },
          { status: 400 }
        )
      }

      if (!preview.to) {
        return NextResponse.json(
          { error: 'Agent has no email address on file' },
          { status: 400 }
        )
      }

      const { error: sendError } = await resend.emails.send({
        from: 'Collective Realty Co. <transactions@coachingbrokeragetools.com>',
        to: [preview.to],
        cc: preview.cc ? [preview.cc] : undefined,
        replyTo: preview.replyTo,
        subject: preview.subject,
        html: preview.html,
      })
      if (sendError) {
        return NextResponse.json(
          { error: sendError.message || 'Send failed' },
          { status: 500 }
        )
      }

      return NextResponse.json({ success: true, sent_to: preview.to, cc: preview.cc })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
