// lib/transactions/cascade.ts
// Shared commission cascade. Moved verbatim from
// app/api/admin/transactions/[id]/route.ts so that entry points outside the
// admin route (agent form submissions, check creation, Payload webhook,
// link-transaction) can trigger the same primary/team-lead/momentum cascade
// and office-net recompute. No logic changes in this move.
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import { getLeadSourceBucket } from '@/lib/transactions/constants'
import { computeCommission, computeGrossFromSides } from '@/lib/transactions/math'
import { parseCustomPlanSplit } from '@/lib/transactions/customPlanParser'
import { resolveGoverningTeamAgreement } from '@/lib/transactions/teamAgreement'

export const isLeaseType = isLeaseTransactionType

export function num(v: any): number {
  return parseFloat(v ?? 0) || 0
}

// ─── Commission calculation core ─────────────────────────────────────────────
// Model A (locked 2026-04-22): For agents on a team, team_agreement_splits
// drives all three percentages (agent, team_lead, firm). For agents NOT on a
// team, the plan's agent/firm split drives agent_gross and firm portion;
// no team_lead row is created.
//
// team_lead_commission on the primary's TIA row is informational tracking only
// and is NOT deducted from agent_net or amount_1099_reportable - the team
// lead's cut has already been carved out of agent_gross at the team-split step.
export async function computeCommissionBreakdown(args: {
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
    transactionId,
    internalAgentId,
    commissionAmount,
    leadSource,
    referredAgentId,
    transactionType,
  } = args
  const isLease = isLeaseType(transactionType)

  // Existing TIA row - preserves manual fields (btsa, other_fees, rebate,
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

  // Commission plan (fuzzy match - data mixes codes and names)
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

  // Team membership governing this deal's date. Sales are governed by the
  // purchase agreement execution date, leases by the tenant move-in date,
  // falling back to the closing date. This keeps a pending deal on the team
  // splits that were in effect when it was signed, even if the membership has
  // since ended. See resolveGoverningTeamAgreement.
  const { data: txnDates } = await supabase
    .from('transactions')
    .select('acceptance_date, move_in_date, closing_date')
    .eq('id', transactionId)
    .maybeSingle()
  const governingDate =
    (isLease ? txnDates?.move_in_date : txnDates?.acceptance_date) ||
    txnDates?.closing_date ||
    null
  const membership = await resolveGoverningTeamAgreement(supabase, agentId, governingDate)

  let teamLeadIds: string[] = []
  let teamSplits: any[] = []
  if (membership?.team) {
    const teamRow: any = Array.isArray(membership.team) ? membership.team[0] : membership.team
    // Fetch all active co-leads. The total team_lead_pct payout is split
    // equally among them; each gets their own TIA row.
    const { data: leads } = await supabase
      .from('team_leads')
      .select('agent_id, start_date, created_at')
      .eq('team_id', teamRow.id)
      .is('end_date', null)
      .order('start_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    teamLeadIds = (leads || []).map((l: any) => l.agent_id).filter(Boolean)

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
  if (membership && teamSplits.length > 0 && teamLeadIds.length > 0) {
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
      teamLeadIds[0] ?? null
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

  // Amounts - all percentages apply to the commission_amount (basis).
  const agentGross = commissionAmount * (agentSplitPct / 100)
  const brokerageSplit = commissionAmount * (firmSplitPct / 100)
  // Team lead payout is ONLY non-zero when the agent is on a team with a split
  const teamLeadPayout = onTeamWithSplit
    ? commissionAmount * (teamLeadPct / 100)
    : 0

  // Momentum partner is paid revenue_share_percentage of the primary's
  // commission_amount (agent_basis), NOT of the brokerage_split. The cash
  // still comes from the brokerage's portion (deducted via
  // recomputeOfficeNet), but the BASE of the calculation is the full
  // commission earned for the brokerage.
  let momentumPartnerId: string | null = null
  let momentumPartnerPct = 0
  let momentumPartnerPayout = 0
  if (agent.referring_agent_id && agent.revenue_share_percentage) {
    momentumPartnerId = agent.referring_agent_id
    momentumPartnerPct = num(agent.revenue_share_percentage)
    momentumPartnerPayout = commissionAmount * (momentumPartnerPct / 100)
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
    teamLeadIds: onTeamWithSplit ? teamLeadIds : [],
    momentumPartnerId,
    momentumPartnerPct,
    momentumPartnerPayout,
    primaryAgentNet,
    primary1099,
    onTeamWithSplit,
  }
}

/**
 * cascadePrimarySplit - shared helper used by both the apply_primary_split
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
 * Formula (rewritten 2026-05-05 to fix BTSA/rebate/debt edge cases;
 * extended 2026-05-07 to subtract momentum partner payouts):
 *
 *   office_net =
 *       sum(TIA.brokerage_split)                  -- brokerage's % cut
 *     + sum(TIA.processing_fee + coaching_fee + other_fees)  -- fees retained
 *     + sum(staged debts applied against this txn)   -- debts collected here
 *     - sum(staged credits applied against this txn) -- credits paid out here
 *     - sum(TEB.amount_1099_reportable)              -- paid to other brokerages
 *     - sum(momentum_partner TIA.agent_gross)        -- paid to referrers
 *
 * Why momentum gets subtracted explicitly:
 *   Momentum partner rows have brokerage_split = 0 by construction (linked
 *   row design - brokerage cut lives on the source primary's row), so they
 *   don't appear in the brokerage_split sum. But the cash IS paid out of
 *   the brokerage's portion. Without this subtraction office_net would
 *   over-count by the momentum payout total.
 *
 * Why this formula and not the old gross-minus-agent_net version:
 *   The old formula assumed agent_net came out of office_gross. That breaks
 *   on deals with BTSA (paid to agent by buyer, never on brokerage books)
 *   or rebates (agent's own funds going to client) - both inflate agent_net
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
export async function recomputeOfficeNet(transactionId: string): Promise<void> {
  // office_gross + gross_commission are inputs that must be current before
  // office_net is derived. Every caller of recomputeOfficeNet is a mutation
  // that could also have changed a side commission or a TIA btsa_amount, so
  // settle the derived gross fields first. Safe: recomputeGrossAndOffice
  // writes office_gross/gross_commission only; the office_net math below
  // reads brokerage_split/fees (not office_gross), so there is no cycle.
  await recomputeGrossAndOffice(transactionId)
  try {
    const [{ data: tias }, { data: tebs }, { data: stagedRecs }] = await Promise.all([
      supabase
        .from('transaction_internal_agents')
        .select('brokerage_split, processing_fee, coaching_fee, other_fees, agent_role, agent_gross')
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
    // Momentum partner payouts come from the brokerage's portion. Their own
    // brokerage_split row is 0, but their agent_gross is real cash leaving
    // the brokerage and must be subtracted here.
    //
    // NOTE: team_lead payouts are NOT subtracted here. Under Model A team
    // splits, the team lead portion is already carved out of the primary
    // row's brokerage_split by computeCommissionBreakdown (the three
    // percentages — agent_split + firm_split + team_lead — sum to 100%
    // of basis). Subtracting team_lead.agent_gross here would
    // double-deduct it.
    const momentumPayoutsTotal = (tias || []).reduce(
      (s, t) =>
        t.agent_role === 'momentum_partner'
          ? s + parseFloat(String(t.agent_gross ?? 0))
          : s,
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
          externalTotal -
          momentumPayoutsTotal) *
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

/**
 * Recompute and persist office_gross and gross_commission from the deal's
 * side commissions and the total BTSA across its internal-agent rows.
 *
 *   office_gross     = listing_side_commission + buying_side_commission
 *   gross_commission = office_gross + sum(TIA.btsa_amount)
 *
 * Must run BEFORE recomputeOfficeNet at every mutation that can change a
 * side commission or any TIA btsa_amount, because office_net derivation
 * downstream depends on a correct office_gross. Idempotent; logged, never
 * throws.
 */
export async function recomputeGrossAndOffice(transactionId: string): Promise<void> {
  try {
    const [{ data: txn }, { data: tias }] = await Promise.all([
      supabase
        .from('transactions')
        .select('listing_side_commission, buying_side_commission')
        .eq('id', transactionId)
        .single(),
      supabase
        .from('transaction_internal_agents')
        .select('btsa_amount')
        .eq('transaction_id', transactionId),
    ])
    if (!txn) return

    // Legacy data protection: if both sides are NULL (absent, not zero),
    // this is legacy data imported from Brokermint with office_gross
    // populated but no per-side breakdown. Computing 0+0=0 would wipe
    // real commission data. Leave office_gross AND gross_commission
    // alone; the runtime never had jurisdiction over these rows. As
    // soon as either side gets populated through the UI, this function
    // takes over.
    if (txn.listing_side_commission == null && txn.buying_side_commission == null) {
      return
    }

    const btsaTotal = (tias || []).reduce(
      (s, t) => s + (parseFloat(String(t.btsa_amount ?? 0)) || 0),
      0
    )
    const { office_gross, gross_commission } = computeGrossFromSides({
      listing_side_commission: txn.listing_side_commission,
      buying_side_commission: txn.buying_side_commission,
      btsa_total: btsaTotal,
    })
    await supabase
      .from('transactions')
      .update({
        office_gross,
        gross_commission,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId)
  } catch (err) {
    console.error('recomputeGrossAndOffice failed for', transactionId, err)
  }
}

export async function cascadePrimarySplit(args: {
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

  // Update primary row - commission math via canonical computeCommission().
  // Existing manual fields (btsa_amount, other_fees, rebate_amount,
  // debts_deducted) are loaded from the row and used in the calculation,
  // so ad-hoc adjustments are preserved through recalc. Every recalc
  // freshly overwrites the computed columns - there is no per-field
  // override flag.
  //
  // Rounding rule: round agent_gross and team_lead to 2 decimals FIRST, then
  // derive brokerage_split = commissionAmount - rounded(agent_gross) -
  // rounded(team_lead). This guarantees the three values ALWAYS sum to
  // commissionAmount and eliminates the "$0.01 too high" rounding artifact
  // that came from independently rounding each from raw basis x pct. For
  // non-team rows breakdown.teamLeadPayout is 0, reducing to the original
  // two-way residual safely.
  const roundedAgentGross = Math.round(breakdown.agentGross * 100) / 100
  const roundedTeamLead = Math.round(breakdown.teamLeadPayout * 100) / 100
  const primaryUpdates: Record<string, any> = {
    commission_plan: breakdown.planCode,
    agent_basis: commissionAmount,
    split_percentage: breakdown.agentSplitPct,
    agent_gross: roundedAgentGross,
    brokerage_split: Math.round((commissionAmount - roundedAgentGross - roundedTeamLead) * 100) / 100,
    processing_fee: Math.round(breakdown.processingFee * 100) / 100,
    coaching_fee: Math.round(breakdown.coachingFee * 100) / 100,
    team_lead_commission: roundedTeamLead,
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

  // Team lead rows upsert - one TIA row per active co-lead, each receiving
  // an equal share of the total team_lead_pct payout.
  if (breakdown.teamLeadIds.length > 0 && breakdown.teamLeadPayout > 0) {
    const perLeadAmount = Math.round((breakdown.teamLeadPayout / breakdown.teamLeadIds.length) * 100) / 100
    const perLeadPct = Math.round((breakdown.teamLeadPct / breakdown.teamLeadIds.length) * 100) / 100
    for (const tlAgentId of breakdown.teamLeadIds) {
      const { data: existingTl } = await supabase
        .from('transaction_internal_agents')
        .select('id, payment_status')
        .eq('transaction_id', transactionId)
        .eq('agent_role', 'team_lead')
        .eq('source_tia_id', internalAgentId)
        .eq('agent_id', tlAgentId)
        .maybeSingle()
      const tlFields = await buildLinkedRowFields(
        tlAgentId,
        perLeadAmount,
        perLeadPct,
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
          agent_id: tlAgentId,
          agent_role: 'team_lead',
          side: primaryTia.side ?? null,
          payment_status: 'pending',
          funding_source: 'crc',
          source_tia_id: internalAgentId,
          ...tlFields,
        })
      }
    }
    // Remove any stale TL rows for this primary whose agent_id is no longer
    // an active lead (e.g. a lead was removed from the team).
    const { data: allTlRows } = await supabase
      .from('transaction_internal_agents')
      .select('id, agent_id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'team_lead')
      .eq('source_tia_id', internalAgentId)
    for (const row of allTlRows || []) {
      if (!breakdown.teamLeadIds.includes(row.agent_id) && row.payment_status !== 'paid') {
        await supabase.from('transaction_internal_agents').delete().eq('id', row.id)
      }
    }
  } else {
    // No TL payout this round - remove all stale TL rows for this primary
    const { data: allTlRows } = await supabase
      .from('transaction_internal_agents')
      .select('id, payment_status')
      .eq('transaction_id', transactionId)
      .eq('agent_role', 'team_lead')
      .eq('source_tia_id', internalAgentId)
    for (const row of allTlRows || []) {
      if (row.payment_status !== 'paid') {
        await supabase.from('transaction_internal_agents').delete().eq('id', row.id)
      }
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
    // Basis = primary's commission_amount (agent_basis). Momentum partner is
    // paid a % of the agent's full commission, not of the brokerage_split.
    const mpFields = await buildLinkedRowFields(
      breakdown.momentumPartnerId,
      mpAmount,
      breakdown.momentumPartnerPct,
      commissionAmount,
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

/**
 * resolveAgentPlanSplit - looks up an agent's commission plan and returns
 * its default agent split percentage. Mirrors the plan-resolution logic
 * inside computeCommissionBreakdown (lines ~120-186) but skips the team /
 * processing-fee / momentum-partner work, because for a referral_agent row
 * on add we ONLY want the plan's default split. Used by add_internal_agent
 * to pre-fill split_percentage / commission_plan / commission_plan_id on
 * a new referral row so it arrives with the agent's plan default instead
 * of blank. Admin can still override after.
 *
 * Falls back through the same custom-plan parser the cascade uses, then
 * to 85 as a final safety net (matching the cascade's `?? 85` default).
 */
