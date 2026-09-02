import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'
import { Resend } from 'resend'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import { qualifyingCountsForAgents } from '@/lib/transactions/qualifyingCount'
import { resolveGoverningTeamAgreement, resolveGoverningTeamLeads } from '@/lib/transactions/teamAgreement'
import { computeCommission } from '@/lib/transactions/math'
import { markAgentPaid } from '@/lib/transactions/markPaid'
import { isLeaseType, num, computeCommissionBreakdown, recomputeOfficeNet, recomputeGrossAndOffice, cascadePrimarySplit, autoCascadeTransaction, rebalanceThreeWaySplit } from '@/lib/transactions/cascade'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'
import { parseCustomPlanSplit } from '@/lib/transactions/customPlanParser'
import { settlePayloadInvoiceForDebt } from '@/lib/payload/settleInvoiceForDebt'
import {
  applyCommissionOffset,
  writeCommissionOffset,
  removeCommissionOffsets,
  extractPayloadInvoiceId,
  recordInvoiceSettlement,
  reverseInvoiceSettlements,
} from '@/lib/payload/commissionOffset'
import { buildStatementEmail, buildCdaEmail } from '@/lib/email/buildTransactionEmails'
import { getEmailLayout } from '@/lib/email/layout'
import { fundingStatus, btsaTotalFromAgentRows, fundingExpectedLabel, effectiveAgentNetTotal, MATH_TOLERANCE } from '@/lib/transactions/funding'
import { processPayout, previewPayout, payoutStatus, recentPayoutCredits } from '@/lib/payload/processPayout'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)

// ─── Commission field lock set ──────────────────────────────────────────────
/**
 * What the team leads linked to this primary row are actually owed.
 *
 * Read off the linked rows rather than the primary's team_lead_commission,
 * which is informational and drifts: on 4219 Stonehenge it said $2,628 while
 * the lead's own row said $1,971, and the firm's share had been derived from
 * neither.
 */
async function sumLinkedTeamLead(
  supabase: any,
  transactionId: string,
  primaryTiaId: string
): Promise<number> {
  const { data } = await supabase
    .from('transaction_internal_agents')
    .select('agent_gross')
    .eq('transaction_id', transactionId)
    .eq('agent_role', 'team_lead')
    .eq('source_tia_id', primaryTiaId)
  return (data || []).reduce((t: number, r: any) => t + num(r.agent_gross), 0)
}

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
  'other_fees_lines',
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
  'manual_split',
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

// ─── Gate helpers ────────────────────────────────────────────────────────────
// Same checklist rule the dashboard uses: sales must finish the 'cda'
// template, leases the 'payouts' template, and "complete" means every ACTIVE
// item on that template has a completion row for this deal.
async function dealChecklistComplete(
  transactionId: string,
  isLeaseDeal: boolean
): Promise<boolean> {
  const slug = isLeaseDeal ? 'payouts' : 'cda'
  const { data: template } = await supabase
    .from('checklist_templates')
    .select('id')
    .eq('slug', slug)
    .single()
  if (!template?.id) return false
  const { data: items } = await supabase
    .from('checklist_items')
    .select('id')
    .eq('checklist_template_id', template.id)
    .eq('is_active', true)
  const required = (items || []).map((i: any) => i.id)
  if (required.length === 0) return false
  const { data: completions } = await supabase
    .from('checklist_completions')
    .select('checklist_item_id')
    .eq('transaction_id', transactionId)
  const done = new Set((completions || []).map((c: any) => c.checklist_item_id))
  return required.every((iid: string) => done.has(iid))
}

// Funding state for a deal, from its checks vs what the deal expects. One
// read, one definition — the same fundingStatus() the banner and the list
// filter use.
//
// What the deal expects is office_gross + BTSA, not office_gross alone. BTSA
// arrives in the same check from title and passes through to the agent, and
// the sum is already what computeGrossFromSides() calls gross_commission. The
// BTSA figure comes from transaction_internal_agents.btsa_amount, which is the
// same column recomputeGrossAndOffice() sums. Reading office_gross alone made
// the close and payout gates block correct BTSA deals.
async function dealFundingStatus(transactionId: string) {
  const [{ data: checks }, { data: txnRow }, { data: btsaRows }] = await Promise.all([
    supabase
      .from('checks_received')
      .select('check_amount, cleared_date')
      .eq('transaction_id', transactionId),
    supabase.from('transactions').select('office_gross').eq('id', transactionId).single(),
    supabase
      .from('transaction_internal_agents')
      .select('btsa_amount')
      .eq('transaction_id', transactionId),
  ])
  return fundingStatus(
    checks || [],
    txnRow?.office_gross,
    btsaTotalFromAgentRows(btsaRows)
  )
}

// Alias to central helper - keeps existing call sites stable
async function resolveAgentPlanSplit(
  agentId: string,
  transactionType: string | null,
): Promise<{ planCode: string; planId: string | null; agentSplitPct: number } | null> {
  const { data: agent } = await supabase
    .from('users')
    .select('commission_plan, lease_commission_plan')
    .eq('id', agentId)
    .single()
  if (!agent) return null

  const isLease = isLeaseType(transactionType)
  const planCode = isLease && agent.lease_commission_plan
    ? agent.lease_commission_plan
    : agent.commission_plan || ''
  if (!planCode) return null

  // Fuzzy match (data mixes codes and names) - same approach the cascade uses.
  const { data: plans } = await supabase
    .from('commission_plans')
    .select('id, code, name, agent_split_percentage')
    .eq('is_active', true)
  const plan = (plans || []).find((p: any) =>
    (p.code && p.code.toLowerCase() === planCode.toLowerCase()) ||
    (p.name && p.name.toLowerCase() === planCode.toLowerCase())
  )

  let agentSplitPct: number | null = plan?.agent_split_percentage ?? null

  // Custom plan string fallback (e.g., "Custom 85/15 Cap") - parser is the
  // same one cascadePrimarySplit calls.
  if (agentSplitPct == null) {
    const parsed = parseCustomPlanSplit(planCode)
    if (parsed) agentSplitPct = parsed.agentPct
  }

  // Final safety net - match the cascade's `?? 85` default so behavior
  // stays consistent across the codebase.
  if (agentSplitPct == null) agentSplitPct = 85

  return {
    planCode,
    planId: plan?.id || null,
    agentSplitPct,
  }
}

/**
 * rebalanceReferralCarveouts - when a referral_agent's agent_basis changes
 * (set, edited, or deleted), the SAME-SIDE primary's agent_basis must be
 * adjusted so the two pools sum to the side commission. Example: side
 * commission $5,000, referral basis $2,000 → primary basis $3,000.
 *
 * Trigger points (callers must invoke this manually):
 *   • update_internal_agent  - when role=referral_agent AND agent_basis touched
 *   • delete_internal_agent  - when the deleted row was a referral_agent
 *   • delete_internal_agent_cascade - same
 *
 * Scope decisions:
 *   • Only rebalances if a same-side primary exists. Otherwise no-op.
 *   • Primary lookup prefers primary_agent > listing_agent > co_agent. If
 *     multiple matches exist on a side, only the first one is adjusted -
 *     multi-primary same-side carve-out splits are out of scope and the
 *     admin handles those manually.
 *   • Skips if the target primary is paid (basis is locked).
 *   • Skips if the txn is closed.
 *   • Skips if side commission is 0 (nothing to rebalance against).
 *   • Idempotent: if the primary's basis already matches the new target
 *     within $0.01, no write is issued (prevents redundant cascades).
 *
 * Uses cascadePrimarySplit to write the new basis so all derived fields
 * (agent_gross, brokerage_split, processing/coaching, linked team_lead /
 * momentum_partner rows) re-stamp consistently.
 */
async function rebalanceReferralCarveouts(
  transactionId: string,
  side: string | null,
): Promise<void> {
  if (!side) return

  const { data: txn } = await supabase
    .from('transactions')
    .select('listing_side_commission, buying_side_commission, status')
    .eq('id', transactionId)
    .single()
  if (!txn) return
  if (txn.status === 'closed') return

  let sideCommission = 0
  if (side === 'buyer' || side === 'tenant') {
    sideCommission = num(txn.buying_side_commission)
  } else if (side === 'seller' || side === 'landlord') {
    sideCommission = num(txn.listing_side_commission)
  }
  if (sideCommission <= 0) return

  // Sum all referral_agent agent_basis on this side.
  const { data: referralRows } = await supabase
    .from('transaction_internal_agents')
    .select('agent_basis')
    .eq('transaction_id', transactionId)
    .eq('agent_role', 'referral_agent')
    .eq('side', side)

  const totalReferralBasis = (referralRows || []).reduce(
    (sum: number, r: any) => sum + num(r.agent_basis),
    0
  )

  const newPrimaryBasis = Math.round((sideCommission - totalReferralBasis) * 100) / 100

  // Find the same-side primary. Prefer primary_agent, then listing_agent,
  // then co_agent. If multiple, only the first one is adjusted.
  const { data: candidates } = await supabase
    .from('transaction_internal_agents')
    .select('id, agent_role, payment_status, agent_basis, lead_source, referred_agent_id')
    .eq('transaction_id', transactionId)
    .in('agent_role', ['primary_agent', 'listing_agent', 'co_agent'])
    .eq('side', side)

  if (!candidates || candidates.length === 0) return

  const rolePref: Record<string, number> = {
    primary_agent: 0,
    listing_agent: 1,
    co_agent: 2,
  }
  const ordered = [...candidates].sort(
    (a: any, b: any) => (rolePref[a.agent_role] ?? 99) - (rolePref[b.agent_role] ?? 99)
  )
  const target = ordered[0]
  if (target.payment_status === 'paid') return

  // Idempotent: don't re-run the cascade if basis is already at target.
  const currentBasis = num(target.agent_basis)
  if (Math.abs(currentBasis - newPrimaryBasis) < 0.01) return

  await cascadePrimarySplit({
    transactionId,
    internalAgentId: target.id,
    commissionAmount: newPrimaryBasis,
    leadSource: target.lead_source || 'own',
    referredAgentId: target.referred_agent_id || null,
  })
}

/**
 * recomputePercentageBasedReferrals - when the side commission on a deal
 * changes, every referral_agent row on that side with basis_input_mode =
 * 'percentage' needs its agent_basis re-derived as
 *   new_basis = new_side_commission × basis_percentage / 100
 * along with its dependent fields (agent_gross, brokerage_split, agent_net,
 * amount_1099_reportable).
 *
 * Caller responsibilities:
 *   • Pass `side` matching the side commission column that changed
 *     ('seller' / 'landlord' for listing_side_commission,
 *      'buyer' / 'tenant' for buying_side_commission).
 *   • Pass the NEW side commission as it should now be (already saved).
 *   • Run rebalanceReferralCarveouts(transactionId, side) AFTER this - the
 *     same-side primary's basis needs to absorb the new referral total.
 *
 * Safety guards:
 *   • Skips paid rows (basis is locked).
 *   • Skips closed transactions.
 *   • Skips rows where basis_percentage is null/invalid.
 *   • Idempotent: no-op when the existing agent_basis already matches
 *     within $0.01.
 *
 * Returns the count of rows actually updated, so callers can decide whether
 * to also fire downstream side-effects.
 */
async function recomputePercentageBasedReferrals(
  transactionId: string,
  side: string,
  newSideCommission: number,
): Promise<number> {
  if (!side || newSideCommission <= 0) return 0

  const { data: txn } = await supabase
    .from('transactions')
    .select('status')
    .eq('id', transactionId)
    .single()
  if (!txn || txn.status === 'closed') return 0

  const { data: rows } = await supabase
    .from('transaction_internal_agents')
    .select('id, agent_basis, basis_percentage, split_percentage, payment_status')
    .eq('transaction_id', transactionId)
    .eq('agent_role', 'referral_agent')
    .eq('side', side)
    .eq('basis_input_mode', 'percentage')

  if (!rows || rows.length === 0) return 0

  let updatedCount = 0
  for (const row of rows) {
    if (row.payment_status === 'paid') continue
    const pct = num(row.basis_percentage)
    if (pct <= 0) continue

    const newBasis = Math.round(newSideCommission * pct) / 100
    const currentBasis = num(row.agent_basis)
    if (Math.abs(currentBasis - newBasis) < 0.01) continue

    // Mirror Phase 2.7 rounding rule: round agent_gross first, derive
    // brokerage_split as the residual so the two ALWAYS sum to basis.
    const splitPct = num(row.split_percentage)
    const newGross = Math.round(newBasis * splitPct) / 100
    const newBrokerage = Math.round((newBasis - newGross) * 100) / 100

    await supabase
      .from('transaction_internal_agents')
      .update({
        agent_basis: newBasis,
        agent_gross: newGross,
        brokerage_split: newBrokerage,
        // Referral rows have no team_lead / processing / coaching / debts;
        // agent_net = agent_gross and 1099 = agent_gross (existing model).
        agent_net: newGross,
        amount_1099_reportable: newGross,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)

    updatedCount++
  }

  return updatedCount
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
        { data: settings },
        // External brokerages come down with the main payload, not from the
        // Check & Payouts tab's own lazy fetch. The pipeline rail's Paid Out
        // gate needs them on EVERY tab: sourcing them from tab-scoped state
        // meant the rail read Paid Out on Overview and changed when the tab
        // was opened.
        { data: externalBrokeragesFull },
      ] = await Promise.all([
          supabase.from('transactions').select('*').eq('id', id).single(),
          // is_active, is_licensed_agent and mls_choice are the three roster
          // conditions behind the "With firm" label on the payout row and in
          // the agent sidebar. firmStatus() tests them with a strict === true,
          // so a column left out of this select arrives undefined and every
          // agent reads as Not with firm - which is exactly what happened
          // while is_active was missing here.
          supabase.from('transaction_internal_agents').select(`
            *,
            user:users!transaction_internal_agents_agent_id_fkey(
              id, first_name, last_name, preferred_first_name, preferred_last_name,
              office_email, email, phone, office, commission_plan, lease_commission_plan, license_number,
              license_expiration, nrds_id, mls_id, association, join_date,
              division, revenue_share, revenue_share_percentage, referring_agent,
              referring_agent_id, referred_agents,
              qualifying_transaction_count, qualifying_transaction_target,
              waive_buyer_processing_fees, half_buyer_processing_fees,
              half_seller_processing_fees, waive_seller_processing_fees, waive_coaching_fee,
              cap_amount_override, post_cap_split_override,
              special_commission_notes, headshot_url,
              monthly_fee_paid_through, bank_connected,
              is_active, is_licensed_agent, mls_choice
            )
          `).eq('transaction_id', id),
          supabase
            .from('company_settings')
            .select('referral_tracking_url, crm_url, crm_name')
            .single(),
          supabase
            .from('transaction_external_brokerages')
            .select('*')
            .eq('transaction_id', id)
            .order('created_at', { ascending: true }),
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

      // Find the actual primary agent on this deal by TIA role, not by
      // txn.submitted_by. submitted_by can be the admin who created the
      // transaction (e.g., office support submitting on the agent's behalf),
      // which would cause the right-sidebar Agent Billing block to load
      // the admin's debts/credits instead of the actual agent's. Order:
      // primary_agent → listing_agent → first row.
      const primaryTia =
        (agents || []).find((a: any) => a.agent_role === 'primary_agent') ||
        (agents || []).find((a: any) => a.agent_role === 'listing_agent') ||
        (agents || [])[0]
      const primaryAgentId = primaryTia?.agent_id || txn.submitted_by
      const primaryAgent =
        (agentUsers || []).find((u: any) => u.id === primaryAgentId) || (agentUsers || [])[0]

      // Team affiliation is scoped to the deal, not to today. This page was
      // showing whichever agreement is open right now, so an agent who has
      // since left a team kept showing team splits on their old deals and an
      // agent who just joined picked them up on deals that predate the
      // agreement -- and it disagreed with the commission math, which has
      // always been dated. resolveGoverningTeamAgreement is the same resolver
      // cascade.ts and smart-calc use: purchase agreement execution date for
      // sales, tenant move-in for leases, falling back to closing.
      const governingDate =
        (txnIsLease ? txn.move_in_date : txn.acceptance_date) ||
        txn.closing_date ||
        null
      const governingByAgent = await Promise.all(
        agentIds.map(async (aid: string) => ({
          agentId: aid,
          agreement: await resolveGoverningTeamAgreement(supabase, aid, governingDate),
        }))
      )
      // The resolver returns the governing agreement's identity; this page also
      // renders agreement_document_url, so re-read the full rows by those ids
      // rather than restating the date logic here.
      const governingIds = governingByAgent
        .map(g => g.agreement?.id)
        .filter(Boolean) as string[]
      const { data: teamMemberships } = governingIds.length > 0
        ? await supabase
            .from('team_member_agreements')
            .select(`
              id, agent_id, agreement_document_url, firm_min_override,
              team:teams!team_member_agreements_team_id_fkey(id, team_name)
            `)
            .in('id', governingIds)
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
      // Scoped to the deal date like membership above -- leadership changes
      // hands, and the current lead's name does not belong on an older deal.
      const teamLeads = await resolveGoverningTeamLeads(
        supabase,
        teamIdsFromMemberships,
        governingDate
      )

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
      // Compliance is single-sourced from the compliance request page
      // (submission statuses + reviewed_at). Override the stored per-check
      // compliance_complete_date with the derived value so pay-by math and
      // the check rows always reflect what Leah set on the compliance page.
      const complianceByTxn = await deriveComplianceForTransactions([id])
      const derivedCompliance = complianceByTxn[id] || { status: null, complete_date: null }
      const checks = (checksData || []).map((c: any) => ({
        ...c,
        compliance_complete_date: derivedCompliance.complete_date
          ? derivedCompliance.complete_date.split('T')[0]
          : null,
      }))

      // Checklist
      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('checklist_item_id, completed_by, completed_at, notes, auto_verified')
        .eq('transaction_id', id)

      // Pick the checklist template by deal type: leases use the 'payouts'
      // (Commission Check Processing) template, sales use the 'cda' (CDA Checklist)
      // template. Both exist in checklist_templates with applies_to lease/sale.
      const checklistSlug = txnIsLease ? 'payouts' : 'cda'
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('slug', checklistSlug)
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

      // Resolve the actor ids on this deal to display names in ONE query:
      // whoever verified each checklist item, plus whoever sent and whoever
      // marked each payout. The ids were already stored - completed_by has
      // been populated on 1,161 of 1,181 completion rows, the 20 blanks
      // being the auto_verified ones - they were simply never resolved for
      // display, so the page could only ever show a bare date.
      const actorIds = Array.from(
        new Set(
          [
            ...(completions || []).map((c: any) => c.completed_by),
            ...(agents || []).map((a: any) => a.payment_sent_by),
            ...(agents || []).map((a: any) => a.paid_by),
          ].filter(Boolean)
        )
      )
      const actorNameById = new Map<string, string>()
      if (actorIds.length > 0) {
        const { data: actors } = await supabase
          .from('users')
          .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
          .in('id', actorIds)
        for (const a of actors || []) {
          const name = `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
          if (name) actorNameById.set(a.id, name)
        }
      }

      const completionMap = new Map((completions || []).map((c: any) => [c.checklist_item_id, c]))
      const checklist = checklistItems.map((item: any) => {
        const completion = completionMap.get(item.id) || null
        return {
          ...item,
          completion: completion
            ? {
                ...completion,
                completed_by_name: completion.completed_by
                  ? actorNameById.get(completion.completed_by) || null
                  : null,
              }
            : null,
        }
      })

      // Resolve referred-agent UUIDs to display names. The
      // `users.referred_agents` column stores an array of UUIDs (agents
      // this user has referred). The right-sidebar UI renders the array
      // joined as a comma-separated string, so we need to swap UUIDs for
      // human-readable names before sending the response. Single batch
      // query covers every referenced UUID across all agents on this txn.
      const referredAgentIds = new Set<string>()
      for (const a of agents || []) {
        const list = a.user?.referred_agents
        if (Array.isArray(list)) {
          for (const refId of list) {
            if (typeof refId === 'string' && refId) referredAgentIds.add(refId)
          }
        }
      }
      const referredNamesById: Record<string, string> = {}
      if (referredAgentIds.size > 0) {
        const { data: namedAgents } = await supabase
          .from('users')
          .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
          .in('id', Array.from(referredAgentIds))
        for (const r of namedAgents || []) {
          const first = (r as any).preferred_first_name || (r as any).first_name || ''
          const last = (r as any).preferred_last_name || (r as any).last_name || ''
          const display = `${first} ${last}`.trim()
          if (display) referredNamesById[(r as any).id] = display
        }
      }

      // Derived New Agent Plan counts for every agent on this deal, so the
      // "Qualifying Txns" figure agrees with the statement and the preview.
      const qualifyingByAgent = await qualifyingCountsForAgents(
        (agents || []).map((a: any) => String(a.agent_id)).filter(Boolean)
      )

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
          // Replace referred_agents UUIDs with names so the sidebar
          // "Referred: ..." line renders human-readable.
          const referredNames = Array.isArray(u.referred_agents)
            ? u.referred_agents
                .map((rid: string) => referredNamesById[rid])
                .filter((n: string | undefined): n is string => !!n)
            : []
          return {
            ...a,
            // Who sent the payout and who marked it paid, resolved for
            // display. Null on every row that predates these columns and on
            // rows the reconciliation cron settled, which is not a person.
            payment_sent_by_name: a.payment_sent_by
              ? actorNameById.get(a.payment_sent_by) || null
              : null,
            paid_by_name: a.paid_by ? actorNameById.get(a.paid_by) || null : null,
            user: { ...u, referred_agents: referredNames, qualifying_transaction_count: qualifyingByAgent[String(u.id)] ?? 0 },
            team_membership: membershipByAgent[a.agent_id] || null,
            billing: billingByAgent[a.agent_id] || null,
            commission_plan_friendly: friendlyPlanLabel(planCode),
          }
        }),
        primary_agent: primaryAgent || null,
        external_brokerages: externalBrokeragesFull || [],
        agent_billing: agentBilling,
        team_info: teamInfo,
        checks,
        checklist,
        company_settings: settings || null,
        // The Overview tab's Compliance control reads the stored
        // transactions.compliance_status, which is dual-written and can fall
        // behind what the compliance page actually recorded. Send the derived
        // view alongside it so Overview can show the same status and side
        // fraction the payouts report shows, instead of a stale dropdown.
        compliance_derived: {
          status: derivedCompliance.status || null,
          complete_date: derivedCompliance.complete_date || null,
          sides_expected: derivedCompliance.expected ?? null,
          sides_complete: (derivedCompliance.sides || []).filter(
            (side: { status: string }) => side.status === 'complete'
          ).length,
          sides_filed: (derivedCompliance.sides || []).length,
        },
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

    // ── Archive / unarchive ──────────────────────────────────────────────────
    // Archive, never delete. transactions has 15 tables pointing at it by
    // foreign key and none were created ON DELETE CASCADE, so a DELETE either
    // fails or, with cascades added, silently removes checks, ledger entries
    // and payout history. Archiving hides the deal from agents, keeps it fully
    // visible to the office, and is reversible.
    //
    // Guarded on status: only a cancelled deal can be archived. Archiving a
    // live deal would hide it from the agent working it, and archiving a
    // closed one would pull it out of that agent's cap progress and New Agent
    // Plan count. Cancel it first, then archive.
    if (action === 'archive_transaction' || action === 'unarchive_transaction') {
      const archiving = action === 'archive_transaction'
      const { data: current, error: readErr } = await supabase
        .from('transactions')
        .select('id, status, property_address, archived_at')
        .eq('id', id)
        .single()
      if (readErr || !current) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      if (archiving && current.status !== 'cancelled') {
        return NextResponse.json({
          error: 'Only a cancelled deal can be archived. Cancel it first, then archive.',
        }, { status: 400 })
      }
      if (archiving && current.archived_at) {
        return NextResponse.json({ success: true, already: true, archived_at: current.archived_at })
      }

      const { error: archErr } = await supabase
        .from('transactions')
        .update(archiving
          ? {
              archived_at: new Date().toISOString(),
              archived_by: auth.user.id,
              archive_reason: String(body.archive_reason || '').trim() || 'Cancelled duplicate',
              updated_at: new Date().toISOString(),
            }
          : {
              archived_at: null,
              archived_by: null,
              archive_reason: null,
              updated_at: new Date().toISOString(),
            })
        .eq('id', id)
      if (archErr) {
        return NextResponse.json({ error: archErr.message }, { status: 400 })
      }
      return NextResponse.json({
        success: true,
        archived: archiving,
        property_address: current.property_address,
      })
    }

    // ── Update transaction fields ────────────────────────────────────────────
    if (action === 'update_transaction') {
      const { updates } = body
      const cleanUpdates: any = { ...updates }

      // ── Auto-derive related transaction fields ──────────────────────────────
      // Whenever inputs that drive computed fields are touched, fetch the
      // current row, recompute, and merge into the update. Skip a derived
      // field if the caller already passed it (manual override).
      const COMPUTE_TRIGGERS = [
        'sales_price', 'monthly_rent', 'lease_term', 'move_in_date',
        'gross_commission', 'listing_side_commission',
        'buying_side_commission', 'office_gross',
        'transaction_type', 'is_intermediary',
      ]
      const triggered = COMPUTE_TRIGGERS.some(k => k in cleanUpdates)
      if (triggered) {
        const { data: current } = await supabase
          .from('transactions')
          .select(
            'transaction_type, is_intermediary, sales_price, monthly_rent, lease_term, move_in_date, ' +
            'sales_volume, gross_commission, listing_side_commission, ' +
            'buying_side_commission, office_gross, closing_date'
          )
          .eq('id', id)
          .single()

        if (current) {
          // Effective values = caller's update if present, else current row.
          const eff = (k: string) => (k in cleanUpdates ? cleanUpdates[k] : (current as any)[k])
          const txnType = eff('transaction_type')
          const isLease = isLeaseTransactionType(txnType)
          const isIntermediary = !!eff('is_intermediary')

          // Sales volume auto-broadcast (matches Tara's spec 2026-05-07):
          //   - Lease: sales_volume = monthly_rent × lease_term
          //   - Sale:  sales_volume = sales_price
          //
          // Editing the source field (rent/term for leases, sales_price for
          // sales) ALWAYS broadcasts to sales_volume, overriding any prior
          // manual value. To set a custom sales_volume permanently, the
          // source must already be set; then editing sales_volume directly
          // sticks until a driver changes again. Direct sales_volume edits
          // are preserved by the `'sales_volume' in cleanUpdates`
          // short-circuit - when the caller passes sales_volume explicitly,
          // no broadcast runs.
          if (!('sales_volume' in cleanUpdates)) {
            if (isLease) {
              if ('monthly_rent' in cleanUpdates || 'lease_term' in cleanUpdates) {
                const rent = parseFloat(eff('monthly_rent') ?? 0)
                const term = parseInt(eff('lease_term') ?? 0, 10)
                if (rent > 0 && term > 0) {
                  cleanUpdates.sales_volume = rent * term
                }
              }
            } else if ('sales_price' in cleanUpdates) {
              const price = parseFloat(eff('sales_price') ?? 0)
              if (price > 0) {
                cleanUpdates.sales_volume = price
              }
            }
          }

          // Move-in date IS the closing date for leases. The schema keeps
          // both columns because reports historically split lease
          // qualification (move_in_date) from 1099 timing (closed_date) and
          // some agent-side queries fall back to closing_date when
          // move_in_date is null. Keeping the two columns in lockstep on
          // leases avoids that fallback divergence - every report sees the
          // same value regardless of which column it queries. Only fires
          // when the caller didn't already pass closing_date explicitly.
          if (isLease && 'move_in_date' in cleanUpdates && !('closing_date' in cleanUpdates)) {
            cleanUpdates.closing_date = cleanUpdates.move_in_date
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

          // Intermediary commission flow.
          // For intermediary (dual-sided) deals the brokerage represents
          // both buyer and seller, so the user enters BOTH side commissions
          // and the totals broadcast together. office_gross + gross_commission
          // = listing_side + buying_side.
          //
          // Why we need this: the overview tab now displays office_gross as
          // read-only and removed the editable Gross Commission row, so the
          // only user-editable inputs for an intermediary deal are the two
          // side commissions. Without this block, office_gross would stay
          // stale after side edits - breaking office_net (which depends on
          // it) and the per-agent basis fallback in lib/transactions/sides.ts
          // which uses office_gross when no side is set.
          if (
            isIntermediary &&
            ('listing_side_commission' in cleanUpdates || 'buying_side_commission' in cleanUpdates)
          ) {
            const listing = parseFloat(eff('listing_side_commission') ?? 0)
            const buying = parseFloat(eff('buying_side_commission') ?? 0)
            const total = (Number.isFinite(listing) ? listing : 0) + (Number.isFinite(buying) ? buying : 0)
            if (!('gross_commission' in cleanUpdates)) cleanUpdates.gross_commission = total
            if (!('office_gross' in cleanUpdates)) cleanUpdates.office_gross = total
          }
        }
      }

      const { error } = await supabase
        .from('transactions')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error

      // ── Auto-recompute %-based referrals on side-commission edits ──────────
      // When listing_side_commission or buying_side_commission changes (either
      // directly OR via the auto-derive logic above that broadcasts from
      // gross_commission / office_gross / sales_price etc.), any referral_agent
      // row on that side with basis_input_mode='percentage' must have its
      // agent_basis recomputed from the new side commission. After the
      // referral rows update, the same-side primary's basis needs to absorb
      // the change - same flow as a manual referral basis edit.
      const listingChanged = 'listing_side_commission' in cleanUpdates
      const buyingChanged = 'buying_side_commission' in cleanUpdates

      if (listingChanged || buyingChanged) {
        try {
          // Re-fetch the now-saved row so we use canonical values (the
          // auto-derive may have rewritten side commissions from a different
          // driver like gross_commission).
          const { data: saved } = await supabase
            .from('transactions')
            .select('listing_side_commission, buying_side_commission')
            .eq('id', id)
            .single()

          if (saved) {
            if (listingChanged) {
              const newListing = num(saved.listing_side_commission)
              // Pick whichever side label the existing referral rows use -
              // sellers + landlords both map to listing_side_commission.
              for (const sideLabel of ['seller', 'landlord']) {
                const updated = await recomputePercentageBasedReferrals(id, sideLabel, newListing)
                if (updated > 0) {
                  await rebalanceReferralCarveouts(id, sideLabel)
                }
              }
            }
            if (buyingChanged) {
              const newBuying = num(saved.buying_side_commission)
              for (const sideLabel of ['buyer', 'tenant']) {
                const updated = await recomputePercentageBasedReferrals(id, sideLabel, newBuying)
                if (updated > 0) {
                  await rebalanceReferralCarveouts(id, sideLabel)
                }
              }
            }
          }
        } catch (recomputeErr: any) {
          // Log but don't fail the user's transaction save - the txn IS
          // saved; downstream rows can be re-triggered by editing again.
          console.error('Percentage-based referral recompute failed:', recomputeErr)
        }
      }

      // office_gross + gross_commission are DERIVED from side commissions and
      // total BTSA (never entered directly). recomputeOfficeNet settles those
      // first, then office_net. Trigger it whenever a side commission, a
      // legacy gross/office driver, transaction_type, or is_intermediary was
      // touched.
      const grossDrivers = [
        'listing_side_commission',
        'buying_side_commission',
        'gross_commission',
        'office_gross',
        'transaction_type',
        'is_intermediary',
      ]
      if (grossDrivers.some(k => k in cleanUpdates)) {
        await recomputeOfficeNet(id)
      }
      return NextResponse.json({ success: true })
    }

    // ── Toggle checklist item ────────────────────────────────────────────────
    if (action === 'toggle_checklist') {
      const { checklist_item_id, completing } = body
      // Who verified the item comes from the SESSION, not the request body.
      // The client still sends completed_by and the server now ignores it:
      // this value is displayed on the deal page as the person who checked
      // the box, so accepting a caller-supplied id would let anyone stamp
      // anyone else's name on a compliance step.
      const completed_by = auth.user.id

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
      // compliance_complete_date is single-sourced from the compliance
      // request page and derived at read time. Strip it so no client can
      // write a stale copy onto the check.
      if (updates && 'compliance_complete_date' in updates) {
        delete updates.compliance_complete_date
      }
      const DATE_FIELDS = ['check_date', 'received_date', 'deposited_date', 'cleared_date']
      // A number input that the user typed in and then cleared sends '' , not
      // undefined. Postgres rejects '' for a numeric column (22P02), so these
      // get the same empty-to-null treatment the date fields already get.
      const NUMERIC_FIELDS = ['check_amount', 'brokerage_amount', 'hold_amount']
      const cleanUpdates: any = { ...updates }
      for (const f of DATE_FIELDS) {
        if (cleanUpdates[f] === '') cleanUpdates[f] = null
      }
      for (const f of NUMERIC_FIELDS) {
        if (cleanUpdates[f] === '') cleanUpdates[f] = null
      }
      const { error } = await supabase
        .from('checks_received')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
        .eq('id', check_id)
      if (error) throw error

      // When check_amount is saved, auto-populate base commission on the
      // correct side if not already set, then recompute gross/office_net.
      // Non-base checks (retainer, BTSA, additional commission) pass
      // skip_base_autofill so they never set the deal's base commission.
      if ('check_amount' in cleanUpdates && !body.skip_base_autofill) {
        const amount = parseFloat(cleanUpdates.check_amount) || 0
        if (amount > 0) {
          const { data: txn } = await supabase
            .from('transactions')
            .select('transaction_type, listing_base_commission, buying_base_commission, listing_side_commission, buying_side_commission')
            .eq('id', id)
            .single()

          if (txn) {
            const txnType = (txn.transaction_type || '').toLowerCase()
            let impliedSide: 'listing' | 'buying' | null = null
            if (txnType.includes('landlord') || txnType.includes('seller')) impliedSide = 'listing'
            else if (txnType.includes('tenant') || txnType.includes('buyer')) impliedSide = 'buying'

            if (impliedSide) {
              const baseField = impliedSide === 'listing' ? 'listing_base_commission' : 'buying_base_commission'
              const sideField = impliedSide === 'listing' ? 'listing_side_commission' : 'buying_side_commission'
              const existingBase = parseFloat((txn as any)[baseField] ?? 0) || 0
              const existingSide = parseFloat((txn as any)[sideField] ?? 0) || 0
              if (existingBase === 0 && existingSide === 0) {
                await supabase
                  .from('transactions')
                  .update({
                    [baseField]: amount,
                    [sideField]: amount,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', id)
                await recomputeGrossAndOffice(id)
              }
            }
          }
        }
        // A check amount is a commission basis signal: cascade so tia rows
        // reflect the new numbers without a manual Recalculate.
        await autoCascadeTransaction(id)
      }

      return NextResponse.json({ success: true })
    }

    // ── Create check linked to transaction ───────────────────────────────────
    if (action === 'create_check') {
      const { check } = body
      // Same empty-to-null rule as update_check: this object is spread straight
      // into the insert, so a cleared number or date input would reach Postgres
      // as '' and be rejected.
      const cleanCheck: any = { ...check }
      for (const f of ['received_date', 'deposited_date', 'cleared_date', 'compliance_complete_date', 'check_date', 'check_amount', 'brokerage_amount', 'hold_amount']) {
        if (cleanCheck[f] === '') cleanCheck[f] = null
      }
      const { data, error } = await supabase
        .from('checks_received')
        .insert({ ...cleanCheck, transaction_id: id })
        .select()
        .single()
      if (error) throw error
      // A new check may carry the deal's first commission amount: cascade so
      // tia rows populate without a manual Recalculate.
      await autoCascadeTransaction(id)
      // A check added to a deal whose compliance is already complete needs the
      // compliance date stamped on it too, or it would never get a pay-by date.
      await syncCheckComplianceDate(id)
      return NextResponse.json({ check: data })
    }

    // ── Link existing check to transaction ───────────────────────────────────
    if (action === 'link_check') {
      const { check_id } = body
      // Read the deal the check is leaving before the write, so both sides can
      // be brought back in step afterwards.
      const { data: priorCheck } = await supabase
        .from('checks_received')
        .select('transaction_id')
        .eq('id', check_id)
        .single()
      const priorTxnId = priorCheck?.transaction_id || null
      // Clear the stamp in the same write, for the same reason the relink route
      // does: the date belongs to the deal the check is leaving, and the sync
      // below writes nothing when the destination has no submissions yet.
      const { error } = await supabase
        .from('checks_received')
        .update({
          transaction_id: id,
          compliance_complete_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', check_id)
      if (error) throw error
      // Linking an existing check can complete a deal's commission picture:
      // cascade so tia rows reflect it.
      await autoCascadeTransaction(id)
      // Same reason create_check syncs: a check joining an already complete
      // deal needs the compliance date stamped on it or it never gets a
      // pay-by date on the payouts report.
      await syncCheckComplianceDate(id)
      if (priorTxnId && priorTxnId !== id) {
        await autoCascadeTransaction(priorTxnId)
        await syncCheckComplianceDate(priorTxnId)
      }
      return NextResponse.json({ success: true })
    }

    // ── Additional Compensation ──────────────────────────────────────────────
    // Creates a co_agent payout row for the additional amount and updates the
    // primary TIA (btsa_amount for BTSA, or transaction_additional_income for
    // Additional Commission). Primary agent_net is NOT changed -- only btsa/1099
    // and gross_commission update. The co_agent row carries agent_net only.
    if (action === 'add_additional_comp') {
      const { primary_tia_id, comp_type, amount, amount_1099, agent_net, side, commission_plan, funding_source } = body
      if (!primary_tia_id) return NextResponse.json({ error: 'primary_tia_id required' }, { status: 400 })
      if (!amount || parseFloat(amount) <= 0) return NextResponse.json({ error: 'amount required' }, { status: 400 })
      if (!['btsa', 'additional_commission'].includes(comp_type)) return NextResponse.json({ error: 'invalid comp_type' }, { status: 400 })

      const amt = parseFloat(amount)
      const agentNetAmt = parseFloat(agent_net) || 0
      const amount1099Amt = parseFloat(amount_1099) || agentNetAmt // fallback to agentNet if not provided

      // Fetch primary TIA to get agent_id and current btsa_amount
      const { data: primaryTia } = await supabase
        .from('transaction_internal_agents')
        .select('id, agent_id, btsa_amount, amount_1099_reportable, payment_status')
        .eq('id', primary_tia_id)
        .eq('transaction_id', id)
        .single()
      if (!primaryTia) return NextResponse.json({ error: 'Primary TIA not found' }, { status: 404 })

      if (comp_type === 'btsa') {
        // Add to primary TIA btsa_amount only. amount_1099_reportable and agent_net
        // stay frozen on the primary row. The co_agent row carries the additional
        // 1099 and payout, keeping both types consistent.
        const currentBtsa = parseFloat(String(primaryTia.btsa_amount ?? 0)) || 0
        const newBtsa = Math.round((currentBtsa + amt) * 100) / 100

        // Bypass locked check -- deliberate additional comp on paid row.
        // Only update btsa_amount -- amount_1099_reportable and agent_net stay
        // frozen. The co_agent row carries the additional 1099 and payout.
        await supabase
          .from('transaction_internal_agents')
          .update({
            btsa_amount: newBtsa,
            updated_at: new Date().toISOString(),
          })
          .eq('id', primary_tia_id)

        await recomputeGrossAndOffice(id)
      } else {
        // Additional Commission: write to transaction_additional_income
        const txnType = (await supabase.from('transactions').select('transaction_type').eq('id', id).single()).data?.transaction_type || ''
        const txnTypeLower = txnType.toLowerCase()
        let impliedSide: 'listing' | 'buying' = 'buying'
        if (txnTypeLower.includes('landlord') || txnTypeLower.includes('seller')) impliedSide = 'listing'

        const sideToUse = side
          ? ((side === 'seller' || side === 'landlord') ? 'listing' : 'buying')
          : impliedSide

        await supabase
          .from('transaction_additional_income')
          .insert({ transaction_id: id, side: sideToUse, label: 'Additional Commission', amount: amt })

        // recomputeSide updates base+side commission and calls recomputeGrossAndOffice
        const baseField = sideToUse === 'listing' ? 'listing_base_commission' : 'buying_base_commission'
        const sideField = sideToUse === 'listing' ? 'listing_side_commission' : 'buying_side_commission'
        const { data: txnCurrent } = await supabase
          .from('transactions')
          .select(`${baseField}, ${sideField}`)
          .eq('id', id)
          .single()
        const currentBase = parseFloat(String((txnCurrent as any)?.[baseField] ?? 0)) || 0
        const additionalRows = await supabase
          .from('transaction_additional_income')
          .select('amount')
          .eq('transaction_id', id)
          .eq('side', sideToUse)
        const additionalTotal = (additionalRows.data || []).reduce((s: number, r: any) => s + (parseFloat(r.amount) || 0), 0)
        const newSideTotal = currentBase + additionalTotal
        await supabase.from('transactions').update({
          [sideField]: newSideTotal,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
        await recomputeGrossAndOffice(id)
      }

      // Create co_agent payout row with agent_net only -- no gross, no fees, no 1099
      const { data: newTia, error: tiaError } = await supabase
        .from('transaction_internal_agents')
        .insert({
          transaction_id: id,
          agent_id: primaryTia.agent_id,
          agent_role: 'co_agent',
          side: side || null,
          commission_plan: commission_plan || '',
          funding_source: funding_source || 'crc',
          payment_status: 'pending',
          counts_toward_progress: false,
          units: 0,
          agent_gross: 0,
          brokerage_split: 0,
          processing_fee: 0,
          coaching_fee: 0,
          other_fees: 0,
          agent_net: agentNetAmt,
          amount_1099_reportable: amount1099Amt, // no gross on this row; 1099 = gross - fees
          uses_canonical_math: false, // do not recompute from formula
        })
        .select('id')
        .single()
      if (tiaError) throw tiaError

      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true, tia_id: newTia.id })
    }

    // ── Delete check ────────────────────────────────────────────────────────
    if (action === 'delete_check') {
      const { check_id } = body
      if (!check_id) return NextResponse.json({ error: 'check_id required' }, { status: 400 })
      // Delete check_payouts first (may not cascade)
      await supabase.from('check_payouts').delete().eq('check_id', check_id)
      const { error } = await supabase.from('checks_received').delete().eq('id', check_id).eq('transaction_id', id)
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
        .select('payment_status, agent_role, agent_basis, lead_source, referred_agent_id, side, split_percentage, installment_kind, agent_gross, brokerage_split, team_lead_commission, manual_split')
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

      // ── Server-authoritative percentage-based referral basis ─────────────
      // When the FE saves a referral_agent row with basis_input_mode =
      // 'percentage', the dollar agent_basis is derived server-side from
      // the current side commission. This protects against stale-state
      // drift (FE's cached side commission older than the DB's) and means
      // the FE doesn't need to know the formula - it just sends mode +
      // percentage. agent_gross and brokerage_split are also recomputed
      // from the new basis using the row's split_percentage (Phase 2.7
      // rounding rule: round gross first, derive brokerage as residual).
      //
      // For 'amount' mode (or when mode is absent), behavior is unchanged -
      // the FE's agent_basis flows through as-is.
      const cleanUpdates: any = { ...(updates || {}) }

      // ── Negotiated three-way split ───────────────────────────────────────
      // A team can agree a different cut with its lead for one particular
      // lead, and the office needs to enter it. Before this, typing any one of
      // the three shares recomputed the firm as basis - agent and left the
      // lead's own row untouched, so the deal allocated more than it earned
      // and nothing said so.
      //
      // Firm is the anchor: CRC keeps what its agreement says and the agent
      // absorbs the negotiation, because a team's private arrangement is not
      // the brokerage's concern. Typing the firm share is the one case that
      // moves the anchor, and the agent absorbs there too.
      //
      // Marking the row manual_split is what makes the number survive. Any
      // later recalculation - a compliance resubmission, a commission edit -
      // would otherwise put the agreement's percentages back, usually after
      // someone had already been told what they were getting.
      const SPLIT_FIELDS: Record<string, 'agent' | 'team_lead' | 'firm'> = {
        agent_gross: 'agent',
        split_percentage: 'agent',
        team_lead_commission: 'team_lead',
        brokerage_split: 'firm',
      }
      // A basis edit is NOT a split edit, even though it arrives carrying
      // agent_gross and brokerage_split.
      //
      // The client derives those two from the existing percentage whenever the
      // basis changes, so the payload looks identical to someone typing the
      // agent's share. Treating it as typed rebalances against the OLD basis
      // while the new one is being written, which silently re-cuts the team
      // lead: on a 50/30/20 deal, changing the basis from $6,570 to $8,000
      // moved the lead from 30% to 15.7% and stamped the row manual_split, so
      // no later recalculation could put it back. Changing the commission is
      // the most ordinary edit there is, so this has to be excluded by name
      // rather than left to the shape of the payload.
      //
      // Falling through is correct: agent_basis is a DRIVER_FIELD, so the
      // auto-cascade below re-derives all three shares - from the agreement,
      // or from the negotiated percentages when manual_split is set.
      const typedSplitField = 'agent_basis' in cleanUpdates
        ? undefined
        : Object.keys(cleanUpdates).find(k => k in SPLIT_FIELDS)
      const cascadeRolesForSplit = ['primary_agent', 'listing_agent', 'co_agent']
      if (
        typedSplitField &&
        current &&
        cascadeRolesForSplit.includes(current.agent_role) &&
        current.payment_status !== 'paid'
      ) {
        const { data: existingLeadRows } = await supabase
          .from('transaction_internal_agents')
          .select('id')
          .eq('transaction_id', id)
          .eq('agent_role', 'team_lead')
          .eq('source_tia_id', internal_agent_id)
        const heldTeamLead = await sumLinkedTeamLead(supabase, id, internal_agent_id)
        const typedIsTeamLead = SPLIT_FIELDS[typedSplitField] === 'team_lead'
        // A linked lead row must exist, or there is nobody to give a share to
        // and the rebalance would take it off the agent for no one.
        //
        // When that row sits at $0 the deal is arithmetically a two-way one,
        // so an agent or firm edit is left to the existing two-way path, which
        // is correct there. Typing the LEAD's share is the exception: that is
        // the edit that fixes a $0 row, and it has to be allowed through or
        // the number lands only on the informational column and the lead is
        // still owed nothing.
        if ((existingLeadRows || []).length > 0 && (heldTeamLead > 0 || typedIsTeamLead)) {
          const basis = num(current.agent_basis)
          const typed = SPLIT_FIELDS[typedSplitField]
          // split_percentage arrives as a percentage; the helper works in
          // dollars so the three shares can be summed against the basis.
          const typedAmount =
            typedSplitField === 'split_percentage'
              ? Math.round(basis * num(cleanUpdates.split_percentage)) / 100
              : num(cleanUpdates[typedSplitField])

          const rebalanced = rebalanceThreeWaySplit({
            basis,
            currentBrokerage: num(current.brokerage_split),
            currentTeamLead: heldTeamLead,
            currentAgentGross: num(current.agent_gross),
            typed,
            typedAmount,
          })
          if ('error' in rebalanced) {
            return NextResponse.json({ error: rebalanced.error }, { status: 400 })
          }

          cleanUpdates.agent_gross = rebalanced.agentGross
          cleanUpdates.brokerage_split = rebalanced.brokerage
          cleanUpdates.team_lead_commission = rebalanced.teamLead
          cleanUpdates.split_percentage =
            basis > 0 ? Math.round((rebalanced.agentGross / basis) * 10000) / 100 : 0
          cleanUpdates.manual_split = true

          // The lead's own row is what gets paid, so it has to move with the
          // number. Split evenly across co-leads, the same rule the agreement
          // path uses. A paid row is never rewritten.
          const { data: leadRows } = await supabase
            .from('transaction_internal_agents')
            .select('id, payment_status')
            .eq('transaction_id', id)
            .eq('agent_role', 'team_lead')
            .eq('source_tia_id', internal_agent_id)
          const payableLeads = (leadRows || []).filter((r: any) => r.payment_status !== 'paid')
          if (payableLeads.length > 0) {
            const per = Math.round((rebalanced.teamLead / payableLeads.length) * 100) / 100
            const perPct = basis > 0 ? Math.round((per / basis) * 10000) / 100 : 0
            for (const lead of payableLeads) {
              await supabase
                .from('transaction_internal_agents')
                .update({
                  agent_gross: per,
                  agent_net: per,
                  amount_1099_reportable: per,
                  split_percentage: perPct,
                  brokerage_split: 0,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', lead.id)
            }
          }
        }
      }

      // ── Multiple other-fee lines ─────────────────────────────────────────
      // The FE can save an array of { amount, description } fee lines. The
      // server is authoritative for the summed other_fees (which the 1099
      // formula, CDA, and referral cascade all read) and for the combined
      // other_fees_description (legacy single-string field). Each line's own
      // description is preserved in other_fees_lines for the commission
      // statement. Setting cleanUpdates.other_fees below makes the existing
      // FORMULA_INPUTS resync recompute amount_1099_reportable + agent_net.
      if ('other_fees_lines' in cleanUpdates) {
        const rawLines = Array.isArray(cleanUpdates.other_fees_lines)
          ? cleanUpdates.other_fees_lines
          : []
        const cleanLines = rawLines
          .map((l: any) => ({
            amount: Math.round(num(l?.amount) * 100) / 100,
            description: String(l?.description ?? '').trim(),
          }))
          .filter((l: any) => l.amount !== 0 || l.description.length > 0)
        cleanUpdates.other_fees_lines = cleanLines
        cleanUpdates.other_fees = Math.round(
          cleanLines.reduce((t: number, l: any) => t + num(l.amount), 0) * 100
        ) / 100
        cleanUpdates.other_fees_description = cleanLines
          .map((l: any) => l.description)
          .filter((d: string) => d.length > 0)
          .join('; ')
      }

      if (
        current?.agent_role === 'referral_agent' &&
        cleanUpdates.basis_input_mode === 'percentage' &&
        cleanUpdates.basis_percentage != null
      ) {
        try {
          const { data: txn } = await supabase
            .from('transactions')
            .select('listing_side_commission, buying_side_commission')
            .eq('id', id)
            .single()

          const sideForLookup = current.side
          let sideCommission = 0
          if (sideForLookup === 'seller' || sideForLookup === 'landlord') {
            sideCommission = num(txn?.listing_side_commission)
          } else if (sideForLookup === 'buyer' || sideForLookup === 'tenant') {
            sideCommission = num(txn?.buying_side_commission)
          }

          const pct = num(cleanUpdates.basis_percentage)
          if (sideCommission > 0 && pct > 0) {
            const newBasis = Math.round(sideCommission * pct) / 100
            // Round gross first, derive brokerage as residual.
            const splitPct = num(
              'split_percentage' in cleanUpdates
                ? cleanUpdates.split_percentage
                : current.split_percentage
            )
            const newGross = Math.round(newBasis * splitPct) / 100
            // Three-way, not two. On a deal with a team lead the firm's share
            // is what is left after BOTH the agent and the lead, and deriving
            // it as basis - agent pays the lead's cut twice: once inside an
            // inflated agent share and again on the lead's own row.
            const teamLeadHeld = await sumLinkedTeamLead(supabase, id, internal_agent_id)
            const newBrokerage = Math.round((newBasis - newGross - teamLeadHeld) * 100) / 100

            cleanUpdates.agent_basis = newBasis
            cleanUpdates.agent_gross = newGross
            cleanUpdates.brokerage_split = newBrokerage
            cleanUpdates.agent_net = newGross
            cleanUpdates.amount_1099_reportable = newGross
          }
        } catch (pctErr: any) {
          console.error('Percentage basis recompute failed (falling back to FE-provided amount):', pctErr)
        }
      }

      // When switching FROM percentage TO amount mode, clear the stale
      // basis_percentage so the column reflects the source of truth.
      if (cleanUpdates.basis_input_mode === 'amount' && !('basis_percentage' in cleanUpdates)) {
        cleanUpdates.basis_percentage = null
      }

      const { error } = await supabase
        .from('transaction_internal_agents')
        .update({ ...cleanUpdates, updated_at: new Date().toISOString() })
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

          // Only cascade when we have a real basis (>0) - otherwise nothing to
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
          // Log but don't fail the user's field update - the primary row IS
          // updated; the cascade can be re-triggered by editing again.
          console.error('Auto-cascade failed:', cascadeErr)
        }
      }

      // ── Referral carve-out rebalance ────────────────────────────────────────
      // When a referral_agent's agent_basis changes, the SAME-SIDE primary's
      // basis must shrink/grow to keep the pool = side commission. Runs
      // before recomputeOfficeNet so office_net reflects the new primary
      // basis on the same request. (Phase 2.7 fix - change #2.)
      //
      // Also fires on basis_input_mode / basis_percentage edits: the BE may
      // have just recomputed agent_basis from a new percentage value, and
      // we want the same-side primary to re-absorb. Checking these keys in
      // `updates` (not cleanUpdates) is intentional - they describe what
      // the USER changed, not server-side derivations.
      if (
        current?.agent_role === 'referral_agent' &&
        (
          'agent_basis' in (updates || {}) ||
          'basis_input_mode' in (updates || {}) ||
          'basis_percentage' in (updates || {})
        )
      ) {
        try {
          await rebalanceReferralCarveouts(id, current.side ?? null)
        } catch (rebalanceErr: any) {
          // Log but don't fail the user's update - the referral row IS saved.
          console.error('Referral carve-out rebalance failed:', rebalanceErr)
        }
      }

      // Resync derived row fields (amount_1099_reportable + agent_net) whenever
      // any formula input was touched. Keeps the DB row in sync without
      // requiring Mark Paid to run. Skipped for paid rows (locked above) and
      // for rows where credits_applied is non-zero (those were set by Mark
      // Paid and would be clobbered here). credits_applied is not stored on
      // the row, so for unpaid rows we always pass 0; debts_deducted is
      // stored and carried through.
      const FORMULA_INPUTS = [
        'agent_gross',
        'btsa_amount',
        'processing_fee',
        'coaching_fee',
        'other_fees',
        'rebate_amount',
        'debts_deducted',
      ]
      const touchedFormula = Object.keys(cleanUpdates).some(k => FORMULA_INPUTS.includes(k))
      // For retainer rows, agent_basis is the source-of-truth gross (not
      // agent_gross), and the main cascade above returns early for retainer
      // rows. Without an explicit resync trigger here, editing the retainer
      // amount would update agent_basis but leave amount_1099_reportable and
      // agent_net stale at whatever value they held at creation.
      const touchedRetainerBasis = 'agent_basis' in cleanUpdates && current?.installment_kind === 'retainer'
      if ((touchedFormula || touchedRetainerBasis) && current?.payment_status !== 'paid') {
        const { data: fresh } = await supabase
          .from('transaction_internal_agents')
          .select('agent_gross, btsa_amount, processing_fee, coaching_fee, other_fees, rebate_amount, debts_deducted, installment_kind, agent_basis')
          .eq('id', internal_agent_id)
          .single()
        if (fresh) {
          // Retainer rows use agent_basis as the gross (not agent_gross).
          // Mirrors the convention used in the Mark Paid path elsewhere in
          // this route.
          const grossForFormula = fresh.installment_kind === 'retainer'
            ? num(fresh.agent_basis)
            : num(fresh.agent_gross)
          const { amount_1099, agent_net } = computeCommission({
            agent_gross: grossForFormula,
            btsa_amount: fresh.btsa_amount,
            processing_fee: fresh.processing_fee,
            coaching_fee: fresh.coaching_fee,
            other_fees: fresh.other_fees,
            rebate_amount: fresh.rebate_amount,
            credits_applied: 0,
            debts_deducted: fresh.debts_deducted ?? 0,
          })
          await supabase
            .from('transaction_internal_agents')
            .update({
              amount_1099_reportable: amount_1099,
              agent_net,
              updated_at: new Date().toISOString(),
            })
            .eq('id', internal_agent_id)
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
        .select('id, payment_status, agent_role, side')
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

      // Rebalance the same-side primary if we removed a referral_agent -
      // their carve-out is gone so the primary's basis goes back up.
      if (existing.agent_role === 'referral_agent') {
        try {
          await rebalanceReferralCarveouts(id, existing.side ?? null)
        } catch (rebalanceErr: any) {
          console.error('Referral carve-out rebalance on delete failed:', rebalanceErr)
        }
      }

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
        .select('id, agent_role, payment_status, side')
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

      // Delete the primary - DB cascades the linked rows
      const { error: delErr } = await supabase
        .from('transaction_internal_agents')
        .delete()
        .eq('id', internal_agent_id)
      if (delErr) throw delErr

      // Rebalance the same-side primary if we removed a referral_agent -
      // their carve-out is gone so the primary's basis goes back up.
      if (row.agent_role === 'referral_agent') {
        try {
          await rebalanceReferralCarveouts(id, row.side ?? null)
        } catch (rebalanceErr: any) {
          console.error('Referral carve-out rebalance on cascade-delete failed:', rebalanceErr)
        }
      }

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

      // The client may omit counts_toward_progress -- the payout modal does not
      // send it. Defaulting to true silently added lease rows to cap progress,
      // which the cap rule excludes ("leases never count toward cap"). Resolve
      // the default the same way AddAgentModal already does: non-lease, and a
      // primary or listing role. An explicit value from the client still wins.
      let defaultCountsToward = true
      if (agent.counts_toward_progress === undefined || agent.counts_toward_progress === null) {
        const { data: txnForFlag } = await supabase
          .from('transactions')
          .select('transaction_type')
          .eq('id', id)
          .single()
        const roleForFlag = agent.agent_role || 'co_agent'
        defaultCountsToward =
          !isLeaseTransactionType(txnForFlag?.transaction_type) &&
          (roleForFlag === 'primary_agent' || roleForFlag === 'listing_agent')
      }

      const insertData: Record<string, any> = {
        transaction_id: id,
        agent_id: agent.agent_id,
        agent_role: agent.agent_role || 'co_agent',
        payment_status: agent.payment_status || 'pending',
        funding_source: agent.funding_source || 'crc',
        counts_toward_progress: agent.counts_toward_progress ?? defaultCountsToward,
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
            waive_buyer_processing_fees, half_buyer_processing_fees,
            half_seller_processing_fees, waive_seller_processing_fees, waive_coaching_fee,
            cap_amount_override, post_cap_split_override,
            monthly_fee_paid_through
          )
        `)
        .single()
      if (error) throw error

      // Auto-stamp commission math when adding a roleable agent on a
      // commission-bearing role. Derives basis from the agent's side commission
      // (when known) or falls back to office_gross. Skipped silently if no
      // basis available - admin can click Recalculate later.
      if (data && ['primary_agent', 'listing_agent', 'co_agent'].includes(data.agent_role) && !agent.skip_auto_stamp) {
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
                    waive_buyer_processing_fees, half_buyer_processing_fees,
                    half_seller_processing_fees, waive_seller_processing_fees, waive_coaching_fee,
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

      // For referral_agent: don't cascade math (basis is unknown until admin
      // enters the carve-out manually), but DO stamp the agent's commission
      // plan default split so the row arrives pre-filled with e.g. 90/10
      // instead of 0/100. Admin can override after. (Phase 2.7 fix.)
      if (data && data.agent_role === 'referral_agent') {
        try {
          const { data: txn } = await supabase
            .from('transactions')
            .select('transaction_type, status')
            .eq('id', id)
            .single()

          if (txn && txn.status !== 'closed') {
            const planInfo = await resolveAgentPlanSplit(data.agent_id, txn.transaction_type || null)
            if (planInfo) {
              const planUpdates: Record<string, any> = {
                split_percentage: planInfo.agentSplitPct,
                commission_plan: planInfo.planCode,
                updated_at: new Date().toISOString(),
              }
              if (planInfo.planId) planUpdates.commission_plan_id = planInfo.planId

              await supabase
                .from('transaction_internal_agents')
                .update(planUpdates)
                .eq('id', data.id)

              // Re-fetch so the response reflects the stamped plan.
              const { data: stamped } = await supabase
                .from('transaction_internal_agents')
                .select(`
                  *,
                  user:users!transaction_internal_agents_agent_id_fkey(
                    id, first_name, last_name, preferred_first_name, preferred_last_name,
                    office_email, email, phone, office, commission_plan, license_number,
                    license_expiration, referring_agent_id, revenue_share_percentage,
                    qualifying_transaction_count, qualifying_transaction_target,
                    waive_buyer_processing_fees, half_buyer_processing_fees,
                    half_seller_processing_fees, waive_seller_processing_fees, waive_coaching_fee,
                    cap_amount_override, post_cap_split_override,
                    monthly_fee_paid_through
                  )
                `)
                .eq('id', data.id)
                .single()
              if (stamped) {
                await recomputeOfficeNet(id)
                return NextResponse.json({ agent: stamped })
              }
            }
          }
        } catch (err) {
          // Plan stamp failed but row was inserted; admin can set split manually.
          console.error('Plan-default stamp on referral_agent add failed:', err)
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
        'agent_name', 'agent_email', 'agent_phone',
        'broker_name', 'broker_phone', 'broker_email',
        'brokerage_dba',
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

      // Retainer rows don't use the commission cascade. They have their own
      // simple structure (basis minus retainer_fee = net). Running apply_primary_split
      // on a retainer would overwrite the correct retainer values with commission
      // split math. The UI hides the Recalculate button on retainer rows, but
      // we enforce here too in case the action is hit via API directly.
      if (primaryTia.installment_kind === 'retainer') {
        return NextResponse.json(
          { error: 'Cannot apply commission split on a retainer row. Retainer rows use their own fee structure (basis minus retainer_fee = net) and do not split via commission plan.' },
          { status: 400 }
        )
      }

      // Get transaction type + status. Never overwrite a closed transaction's
      // commission values - they may be migrated historical data.
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

      // Same rounding rule as the recalc path: round agent_gross and
      // team_lead first, derive brokerage_split as the residual so the
      // three slices ALWAYS sum to commAmt (no $0.01 over-attribution
      // when both raw values would round-half-up).
      const roundedAgentGross = Math.round(breakdown.agentGross * 100) / 100
      const roundedTeamLead = Math.round(breakdown.teamLeadPayout * 100) / 100

      // Update primary row - uses canonical computeCommission() which
      // includes existing btsa, other_fees, rebate, debts so manual
      // adjustments are preserved.
      const primaryUpdates: any = {
        // Recalculate IS the reset. Clicking it says "go back to what the team
        // agreement says", so it clears any negotiated split rather than
        // preserving one - otherwise there would be no way out of a manual
        // number once entered.
        manual_split: false,
        commission_plan: breakdown.planCode,
        agent_basis: commAmt,
        split_percentage: breakdown.agentSplitPct,
        agent_gross: roundedAgentGross,
        brokerage_split: Math.round((commAmt - roundedAgentGross - roundedTeamLead) * 100) / 100,
        processing_fee: Math.round(breakdown.processingFee * 100) / 100,
        coaching_fee: Math.round(breakdown.coachingFee * 100) / 100,
        team_lead_commission: roundedTeamLead,
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

      // Helper - build full column set for a linked (team_lead or momentum_partner) row.
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

      // Upsert team_lead rows - one per active co-lead, each receiving an equal
      // share of the total team_lead_pct payout. Keyed by (source_tia_id, agent_id)
      // so re-applying a split updates existing rows without touching rows from
      // other contributing primaries.
      const teamLeadTiaIds: string[] = []
      if (breakdown.teamLeadIds.length > 0 && breakdown.teamLeadPayout > 0) {
        const perLeadAmount = Math.round((breakdown.teamLeadPayout / breakdown.teamLeadIds.length) * 100) / 100
        const perLeadPct = Math.round((breakdown.teamLeadPct / breakdown.teamLeadIds.length) * 100) / 100
        for (const tlAgentId of breakdown.teamLeadIds) {
          const { data: existingTl } = await supabase
            .from('transaction_internal_agents')
            .select('id, payment_status')
            .eq('transaction_id', id)
            .eq('agent_role', 'team_lead')
            .eq('source_tia_id', internal_agent_id)
            .eq('agent_id', tlAgentId)
            .maybeSingle()

          const tlFields = await buildLinkedRowFields(
            tlAgentId,
            perLeadAmount,
            perLeadPct,
            commAmt,
          )

          if (existingTl) {
            teamLeadTiaIds.push(existingTl.id)
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
                agent_id: tlAgentId,
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
            teamLeadTiaIds.push(newTl.id)
          }
        }
        // Remove stale TL rows for leads no longer active on this team
        const { data: allTlRows } = await supabase
          .from('transaction_internal_agents')
          .select('id, agent_id, payment_status')
          .eq('transaction_id', id)
          .eq('agent_role', 'team_lead')
          .eq('source_tia_id', internal_agent_id)
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
          .eq('transaction_id', id)
          .eq('agent_role', 'team_lead')
          .eq('source_tia_id', internal_agent_id)
        for (const row of allTlRows || []) {
          if (row.payment_status !== 'paid') {
            await supabase.from('transaction_internal_agents').delete().eq('id', row.id)
          }
        }
      }


      // Upsert momentum_partner row - same provenance pattern
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
        // Basis = primary's commission_amount (agent_basis). Momentum partner
        // is paid a % of the agent's full commission, not of brokerage_split.
        const mpFields = await buildLinkedRowFields(
          breakdown.momentumPartnerId,
          mpAmount,
          breakdown.momentumPartnerPct,
          commAmt,
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
        team_lead_tia_ids: teamLeadTiaIds,
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
    // payment_status - that's a separate Mark Paid step.
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
        .select('id, status, record_type, amount_owed, amount_paid, amount_remaining, offset_transaction_id, offset_transaction_agent_id, notes')
        .eq('id', recordId)
        .single()
      if (!rec) {
        return NextResponse.json({ error: 'Billing record not found' }, { status: 404 })
      }
      if (rec.status !== 'outstanding') {
        return NextResponse.json({ error: 'Only outstanding records can be staged' }, { status: 409 })
      }
      // Already staged on a DIFFERENT txn - refuse.
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

      // If this debt has a linked Payload invoice (written by sendDebtInvoice
      // as "Payload invoice: <id>" or "payload_invoice_id:<id>"), settle it
      // in Payload via a commission-offset line item so the agent cannot also
      // pay it directly and get double-collected. Non-fatal if Payload fails.
      let payloadWarning: string | undefined
      if (rec.record_type !== 'credit') {
        const invoiceId = extractPayloadInvoiceId(rec.notes)
        if (invoiceId) {
          const applied = await applyCommissionOffset(invoiceId)
          if (!applied.ok) {
            payloadWarning = applied.error
          } else if (applied.amountOffset > 0) {
            await recordInvoiceSettlement({
              invoiceId,
              actor: auth.user,
              method: 'offset',
              source: 'commission_offset',
              amount: applied.amountOffset,
              note: 'Withheld from commission',
            })
          }
        }
      }

      // Staging a debt/credit changes the brokerage's net for the txn under
      // the new formula, so refresh it.
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true, payload_warning: payloadWarning })
    }

    // ── Stage a Payload monthly fee invoice as a commission-offset debt ────────
    // Staging a Payload monthly invoice does two things atomically:
    //   1. Creates (or reuses) an agent_debts row (debt_type='monthly_fee',
    //      notes='payload_invoice_id:XXX') so the standard staging/mark-paid
    //      pipeline can deduct the amount from the agent's commission net.
    //   2. Settles the Payload invoice immediately via a negative line item
    //      (method=offset) so Payload shows $0 due and monthly_fee_paid_through
    //      advances. This mirrors what mark-invoice-paid does for manual payments.
    //
    // On unstage the Payload invoice is re-opened by appending a positive
    // reversal line item (handled in unstage_debt below).
    //
    // The agent_debts row is NOT a second invoice — it is the internal ledger
    // entry that lets the commission payout system know about the deduction.
    // It carries the Payload invoice_id in notes for linkage and reversal.
    //
    // body: { internal_agent_id, agent_id, invoice_id, amount, description, date_incurred }
    if (action === 'stage_monthly_invoice') {
      const { internal_agent_id, agent_id, invoice_id, amount, description, date_incurred } = body
      if (!internal_agent_id || !agent_id || !invoice_id || !amount) {
        return NextResponse.json(
          { error: 'internal_agent_id, agent_id, invoice_id, and amount required' },
          { status: 400 }
        )
      }

      const payloadAuth = () =>
        'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

      // Check if an agent_debts row already exists for this invoice (idempotent).
      const { data: existing } = await supabase
        .from('agent_debts')
        .select('id, status, offset_transaction_id')
        .eq('agent_id', agent_id)
        .eq('debt_type', 'monthly_fee')
        .ilike('notes', `%payload_invoice_id:${invoice_id}%`)
        .maybeSingle()

      if (existing?.status === 'paid' && existing.offset_transaction_id && existing.offset_transaction_id !== id) {
        return NextResponse.json(
          { error: 'This invoice is already staged on another transaction. Unstage it there first.' },
          { status: 409 }
        )
      }

      // Clear any leftover commission-offset or offset-reversal line items
      // BEFORE reading the balance, not after, so an invoice inflated by the
      // old reversal-charge behavior is repaired here and balanceDue below is
      // the repaired figure.
      //
      // The offset itself is then written with writeCommissionOffset(that same
      // balanceDue), not applyCommissionOffset - so the number stored in
      // agent_debts.amount_owed and the number offset in Payload come from ONE
      // read of amount_due. The earlier version read it twice and claimed the
      // two agreed "by construction", which was not true: they agreed only
      // because the window between the reads was short.
      await removeCommissionOffsets(invoice_id)

      // Verify Payload invoice is still open before settling it
      const invRes = await fetch(`https://api.payload.com/invoices/${invoice_id}?fields[]=*&fields[]=items`, {
        headers: { Authorization: payloadAuth() },
      })
      if (!invRes.ok) {
        return NextResponse.json({ error: 'Could not verify Payload invoice status' }, { status: 500 })
      }
      const payloadInvoice = await invRes.json()
      const balanceDue = Number(payloadInvoice.amount_due ?? 0)
      if (balanceDue <= 0) {
        return NextResponse.json(
          { error: 'This invoice has already been paid in Payload. Staging is not needed.' },
          { status: 409 }
        )
      }

      let debtId: string

      if (existing) {
        debtId = existing.id
      } else {
        // Create the agent_debts row to track the offset
        const { data: created, error: createErr } = await supabase
          .from('agent_debts')
          .insert({
            agent_id,
            debt_type: 'monthly_fee',
            description: description || 'Monthly Brokerage Fee',
            // balanceDue, not the request body's `amount`. The body value is
            // whatever the panel last rendered; balanceDue is what Payload
            // says is open on this invoice right now, read a few lines above.
            // A money figure is never taken from the request.
            amount_owed: balanceDue,
            amount_paid: 0,
            date_incurred: date_incurred || new Date().toISOString().split('T')[0],
            status: 'outstanding',
            notes: `payload_invoice_id:${invoice_id}`,
          })
          .select('id')
          .single()
        if (createErr || !created) {
          return NextResponse.json({ error: createErr?.message || 'Failed to create debt record' }, { status: 500 })
        }
        debtId = created.id
      }

      // Stage the debt row (mark it paid against this transaction)
      const today = new Date().toISOString().split('T')[0]
      const { data: rec } = await supabase
        .from('agent_debts')
        .select('id, amount_owed, amount_paid, amount_remaining')
        .eq('id', debtId)
        .single()
      if (!rec) return NextResponse.json({ error: 'Debt record not found' }, { status: 500 })

      const amountRemaining = num(rec.amount_remaining ?? rec.amount_owed)
      const { error: stageErr } = await supabase
        .from('agent_debts')
        .update({
          amount_paid: num(rec.amount_paid) + amountRemaining,
          status: 'paid',
          date_resolved: today,
          offset_transaction_id: id,
          offset_transaction_agent_id: internal_agent_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', debtId)
      if (stageErr) throw stageErr

      // Settle the Payload invoice via negative line item (commission offset).
      // If this call fails we still return success for the staging — the
      // internal ledger is correct. Log the error so it can be fixed manually.
      let payloadWarning: string | undefined
      try {
        const applied = await writeCommissionOffset(invoice_id, balanceDue)
        if (!applied.ok) {
          payloadWarning = applied.error
          console.error('stage_monthly_invoice: Payload settlement failed', applied.error)
        } else {
          await recordInvoiceSettlement({
            invoiceId: invoice_id,
            agentId: agent_id,
            actor: auth.user,
            method: 'offset',
            source: 'commission_offset',
            amount: applied.amountOffset,
            note: 'Withheld from commission',
          })
          // Advance monthly_fee_paid_through based on the invoice month
          const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december']
          const haystack = (
            (payloadInvoice?.description || '') + ' ' +
            (payloadInvoice?.items || []).map((i: any) => i?.description || '').join(' ')
          ).toLowerCase()
          // String.raw is required here. In a plain template literal the
          // string parser consumes the backslashes before RegExp ever sees
          // them: \b becomes a backspace character (U+0008), \s becomes the
          // letter s and \d becomes the letter d. The pattern then compiles
          // to something no invoice description can match, so `best` stayed
          // null and monthly_fee_paid_through was never advanced on a
          // commission offset. String.raw keeps the escapes intact while
          // still interpolating the month list normally.
          const re = new RegExp(String.raw`\b(${MONTHS.join('|')})\s+(20\d{2})\b`, 'g')
          let best: { year: number; monthIdx: number } | null = null
          let m: RegExpExecArray | null
          while ((m = re.exec(haystack)) !== null) {
            const monthIdx = MONTHS.indexOf(m[1])
            const year = parseInt(m[2], 10)
            if (!best || year > best.year || (year === best.year && monthIdx > best.monthIdx)) {
              best = { year, monthIdx }
            }
          }
          if (best) {
            const billedMonthEnd = new Date(best.year, best.monthIdx + 1, 0).toISOString().split('T')[0]
            const { data: agentUser } = await supabase
              .from('users')
              .select('monthly_fee_paid_through')
              .eq('id', agent_id)
              .single()
            const existing_paid_through = agentUser?.monthly_fee_paid_through ?? null
            const newPaidThrough = !existing_paid_through || billedMonthEnd > existing_paid_through
              ? billedMonthEnd
              : existing_paid_through
            if (newPaidThrough !== existing_paid_through) {
              await supabase
                .from('users')
                .update({ monthly_fee_paid_through: newPaidThrough })
                .eq('id', agent_id)
            }
          }
        }
      } catch (payloadErr) {
        console.error('stage_monthly_invoice: Payload call threw', payloadErr)
      }

      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true, debt_id: debtId, payload_warning: payloadWarning })
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
        .select('id, status, debt_type, record_type, amount_owed, amount_paid, amount_remaining, offset_transaction_id, offset_transaction_agent_id, notes')
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

      // If this debt had a linked Payload invoice (monthly fee OR custom invoice
      // sent via sendDebtInvoice), re-open it by DELETING the commission-offset
      // line item that staging wrote.
      //
      // This used to append a positive reversal charge instead, which is what
      // made the invoice amount duplicate: a $50 fee staged then unstaged left
      // the invoice carrying $50 + $50 of charges against one $50 offset. The
      // balance due came out right, but the invoice gross, its line item
      // breakdown, and Payment History all read double, and every further
      // stage/unstage cycle added another $50. Removing the offset restores
      // the balance without inventing a second charge.
      //
      // Credits are skipped, mirroring stage_credit, which never writes an
      // offset for a credit in the first place.
      let payloadWarning: string | undefined
      const invoiceId = rec.record_type === 'credit' ? null : extractPayloadInvoiceId(rec.notes)
      if (invoiceId) {
        const cleared = await removeCommissionOffsets(invoiceId)
        if (!cleared.ok) {
          payloadWarning = `${cleared.error || 'Payload could not be updated.'} The fee still shows settled in Payload - clear the Commission Offset line item there by hand.`
        } else {
          await reverseInvoiceSettlements(invoiceId)
        }
      }

      // Unstaging changes the brokerage's net for the txn under the new
      // formula, so refresh it.
      await recomputeOfficeNet(id)
      return NextResponse.json({ success: true, payload_warning: payloadWarning })
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

    // ── Process payout (Payload ACH) ────────────────────────────────────────
    // Sends the agent's net through Payload. Hard server-side gates, no
    // override: every one of these must hold before money moves, whatever
    // the client claimed. Mark Paid stays ungated — it records that funds
    // cleared, including payments made outside the app.
    if (action === 'process_payout') {
      // Money-movement actions carry their own permission on top of the
      // handler's can_edit_transactions: sending, previewing, status-checking
      // and clearing a payout all require can_process_payouts, matching the
      // permission that already gates Send Bank Connect.
      const payoutAuth = await requirePermission(request, 'can_process_payouts')
      if (payoutAuth.error) return payoutAuth.error
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }

      const [{ data: gateTxn }, funding, complianceByTxnGate] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, status, transaction_type, office_gross')
          .eq('id', id)
          .single(),
        dealFundingStatus(id),
        deriveComplianceForTransactions([id]),
      ])
      if (!gateTxn) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
      }
      const gateIsLease = isLeaseTransactionType(gateTxn.transaction_type)
      const [checklistDone, { data: gateTia }] = await Promise.all([
        dealChecklistComplete(id, gateIsLease),
        supabase
          .from('transaction_internal_agents')
          .select('id, agent_statement_sent')
          .eq('id', internal_agent_id)
          .eq('transaction_id', id)
          .single(),
      ])
      if (!gateTia) {
        return NextResponse.json({ error: 'Agent record not found on this deal' }, { status: 404 })
      }

      const blocks: string[] = []
      const gateCompliance = complianceByTxnGate[id]
      if (gateCompliance?.status !== 'complete') {
        blocks.push('Compliance is not complete - finish the compliance review first')
      }
      if (funding.state === 'waiting') {
        blocks.push(
          `No checks received yet - expecting $${funding.expected.toFixed(2)} (${fundingExpectedLabel(funding.btsa)})`
        )
      } else if (funding.state === 'partial') {
        blocks.push(
          `${funding.checkCount - funding.clearedCount} of ${funding.checkCount} checks have not cleared - mark them cleared when the bank clears them`
        )
      } else if (funding.state === 'mismatch') {
        blocks.push(
          `Checks received ($${funding.received.toFixed(2)}) do not match ${fundingExpectedLabel(funding.btsa)} ($${funding.expected.toFixed(2)}) - fix the deal before paying`
        )
      }
      if (String(gateTxn.status || '') !== 'closed') {
        blocks.push('Deal is not closed - close the transaction first')
      }
      if (!checklistDone) {
        blocks.push(
          `Checklist is not complete - finish the ${gateIsLease ? 'payouts' : 'CDA'} checklist`
        )
      }
      if (!gateTia.agent_statement_sent) {
        blocks.push('Statement not sent - send it from the Commissions tab')
      }
      if (blocks.length > 0) {
        return NextResponse.json(
          { error: `This payout is blocked: ${blocks.join(' · ')}`, blocks },
          { status: 400 }
        )
      }

      // Bank verification (connection, type, status, and customer ownership)
      // lives inside processPayout, right next to the money.
      const result = await processPayout({
        transactionId: id,
        internalAgentId: internal_agent_id,
        initiatedBy: payoutAuth.user.id,
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error, blocks: [result.error] }, { status: 400 })
      }

      // The app sends NO email of its own here. The agent is notified by
      // Payload's receipt, addressed to the `receipts` recipient that
      // processPayout names from their DB email - see the note there for why
      // that parameter is passed rather than trusting Payload to infer a
      // recipient. The agent gets exactly two things: their commission
      // statement, sent manually by the office, and Payload's receipt.
      return NextResponse.json({
        success: true,
        payout_id: result.payoutId,
        amount: result.amount,
        payment_sent_date: result.paymentSentDate,
        receipt_email: result.receiptEmail ?? null,
      })
    }

    // ── Payout preview (read-only) ───────────────────────────────────────────
    // Everything the confirm modal shows before any money moves: the
    // server-computed amount plus the customer name/email and bank details
    // pulled LIVE from Payload. No writes, no gates weakened - the send
    // itself still re-checks everything.
    if (action === 'payout_preview') {
      const payoutAuth = await requirePermission(request, 'can_process_payouts')
      if (payoutAuth.error) return payoutAuth.error
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }
      const preview = await previewPayout({ transactionId: id, internalAgentId: internal_agent_id })
      if (!preview.ok) {
        return NextResponse.json({ error: preview.error }, { status: 400 })
      }
      return NextResponse.json({
        success: true,
        amount: preview.amount,
        description: preview.description,
        paying_from: preview.payingFrom,
        customer_name: preview.customerName,
        customer_email: preview.customerEmail,
        account_holder: preview.accountHolder,
        bank_name: preview.bankName,
        account_type: preview.accountType,
        account_last4: preview.accountLast4,
        bank_status: preview.bankStatus,
        can_receive_credit: preview.canReceiveCredit,
        transfer_type: preview.transferType,
      })
    }

    // ── Payout status (read-only) ────────────────────────────────────────────
    // In-app answer to "did this payout land," so nobody needs Payload's own
    // dashboard. With a payment_reference: GET /transactions/{id}. Without
    // one (the ambiguous send path - no response, nothing captured): list
    // recent credits for the payee customer since just before the send so
    // the operator can visually match one or see there is none.
    if (action === 'payout_status') {
      const payoutAuth = await requirePermission(request, 'can_process_payouts')
      if (payoutAuth.error) return payoutAuth.error
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }
      const { data: statusTia } = await supabase
        .from('transaction_internal_agents')
        .select('id, agent_id, payment_sent_date, payment_reference')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()
      if (!statusTia) {
        return NextResponse.json({ error: 'Agent record not found on this deal' }, { status: 404 })
      }
      if (!statusTia.payment_sent_date) {
        return NextResponse.json({ error: 'No payout has been initiated for this row.' }, { status: 400 })
      }

      if (statusTia.payment_reference) {
        const lookup = await payoutStatus(statusTia.payment_reference)
        if (!lookup.ok) {
          return NextResponse.json({ error: lookup.error }, { status: 502 })
        }
        return NextResponse.json({
          success: true,
          mode: 'reference',
          not_found: !!lookup.notFound,
          status: lookup.status ?? null,
          status_message: lookup.statusMessage ?? null,
          funding_status: lookup.fundingStatus ?? null,
          amount: lookup.amount ?? null,
          processed_date: lookup.processedDate ?? null,
        })
      }

      const { data: statusUser } = await supabase
        .from('users')
        .select('id, payload_payout_customer_id, payload_payee_id')
        .eq('id', statusTia.agent_id)
        .single()
      const statusCustomer = String(
        statusUser?.payload_payout_customer_id || statusUser?.payload_payee_id || ''
      )
      if (!statusCustomer) {
        return NextResponse.json(
          { error: 'Agent has no Payload customer on file, so there is nothing to search.' },
          { status: 400 }
        )
      }
      // Since two days before the recorded send date, to absorb timezone and
      // clock skew around the moment the response was lost.
      const sinceMs = new Date(statusTia.payment_sent_date).getTime() - 2 * 86400000
      const sinceIso = new Date(sinceMs).toISOString().split('T')[0]
      const search = await recentPayoutCredits(statusCustomer, sinceIso)
      if (!search.ok) {
        return NextResponse.json({ error: search.error }, { status: 502 })
      }
      return NextResponse.json({
        success: true,
        mode: 'search',
        candidates: search.candidates || [],
      })
    }

    // ── Clear payment sent (re-enable the payout button) ─────────────────────
    // For a payout the status lookup shows does NOT exist in Payload: releases
    // the claim so the button works again. Refuses on a row already marked
    // paid. Clears the reference too, so a retry starts clean.
    if (action === 'clear_payment_sent') {
      const payoutAuth = await requirePermission(request, 'can_process_payouts')
      if (payoutAuth.error) return payoutAuth.error
      const { internal_agent_id } = body
      if (!internal_agent_id) {
        return NextResponse.json({ error: 'internal_agent_id required' }, { status: 400 })
      }
      const { data: clearTia } = await supabase
        .from('transaction_internal_agents')
        .select('id, payment_status, payment_sent_date')
        .eq('id', internal_agent_id)
        .eq('transaction_id', id)
        .single()
      if (!clearTia) {
        return NextResponse.json({ error: 'Agent record not found on this deal' }, { status: 404 })
      }
      if (clearTia.payment_status === 'paid') {
        return NextResponse.json(
          { error: 'This row is already marked paid - clearing the sent date is not allowed.' },
          { status: 400 }
        )
      }
      if (!clearTia.payment_sent_date) {
        return NextResponse.json({ error: 'No payout has been initiated for this row.' }, { status: 400 })
      }
      await supabase
        .from('transaction_internal_agents')
        .update({
          payment_sent_date: null,
          payment_reference: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', internal_agent_id)
      return NextResponse.json({ success: true })
    }

    // ── Mark all checks processed ────────────────────────────────────────────
    // Bulk form of the per-check "Payment Processed" toggle: flips
    // crc_transferred on every check of the deal in one click.
    // Sets crc_transferred on EVERY check on the deal, in both directions.
    // The deal page has one "Payment Processed" toggle for the whole deal
    // rather than one per check, so this needs to clear as well as set.
    // `processed` defaults to true so an older caller sending no flag keeps
    // the original set-only behaviour. crc_transferred semantics are
    // unchanged - the payouts report reads it exactly as before.
    if (action === 'set_all_checks_processed') {
      const processed = body.processed === undefined ? true : !!body.processed
      const { data: flipped, error: bulkError } = await supabase
        .from('checks_received')
        .update({ crc_transferred: processed, updated_at: new Date().toISOString() })
        .eq('transaction_id', id)
        .select('id')
      if (bulkError) throw bulkError
      return NextResponse.json({
        success: true,
        processed,
        updated: (flipped || []).length,
      })
    }

    // ── Mark agent paid (TIA) ────────────────────────────────────────────────
    // Writes payment metadata + debts + recomputes agent_net to reflect debts.
    // Does NOT recompute amount_1099_reportable (that was set at edit time).
    if (action === 'mark_paid') {
      const {
        internal_agent_id,
        payment_date,
        payment_method,
        payment_reference,
        funding_source,
        debts_to_apply,
        credits_to_apply,
        counts_toward_progress,
      } = body

      // The whole body of this action now lives in lib/transactions/markPaid.ts
      // so the reconciliation cron marks payouts paid through the SAME code -
      // same staged-debt folding, same canonical formula, same office-net
      // recompute. No money math is duplicated anywhere else.
      const markResult = await markAgentPaid({
        transactionId: id,
        internalAgentId: internal_agent_id,
        paymentDate: payment_date,
        paymentMethod: payment_method,
        paymentReference: payment_reference,
        fundingSource: funding_source,
        debtsToApply: debts_to_apply,
        creditsToApply: credits_to_apply,
        countsTowardProgress: counts_toward_progress,
        paidBy: auth.user.id,
      })

      if (markResult.alreadyPaid) {
        return NextResponse.json(
          { error: 'Row is already marked paid. Unmark first to re-mark.' },
          { status: 409 }
        )
      }

      return NextResponse.json({
        success: true,
        updates: markResult.updates,
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

      // Hard gates, no override (Tara: no exceptions on close-transaction
      // gating). Referred-out deals get NO exemption — checks come in for
      // referred-out deals too, so their money must reconcile the same way.
      const [funding, { data: closeTxn }, { data: closeAgents }, { data: closeTebs }, { data: closeStaged }] =
        await Promise.all([
          dealFundingStatus(id),
          supabase
            .from('transactions')
            .select('id, office_gross, office_net')
            .eq('id', id)
            .single(),
          supabase
            .from('transaction_internal_agents')
            .select('id, agent_net, payment_status')
            .eq('transaction_id', id),
          supabase
            .from('transaction_external_brokerages')
            .select('commission_amount')
            .eq('transaction_id', id),
          // Staged debts and credits against this deal. recomputeOfficeNet
          // already folded these into office_net, so the payee side has to
          // account for them too or the reconciliation below is comparing two
          // different points in time.
          supabase
            .from('agent_debts')
            .select('offset_transaction_agent_id, record_type, amount_owed, amount_remaining')
            .eq('offset_transaction_id', id)
            .eq('status', 'paid'),
        ])

      const closeBlocks: string[] = []
      if (funding.state === 'waiting') {
        closeBlocks.push(
          `No checks received yet - expecting $${funding.expected.toFixed(2)} (${fundingExpectedLabel(funding.btsa)})`
        )
      } else if (funding.state === 'partial') {
        closeBlocks.push(
          `${funding.checkCount - funding.clearedCount} of ${funding.checkCount} checks have not cleared`
        )
      } else if (funding.state === 'mismatch') {
        closeBlocks.push(
          `Checks received total $${funding.received.toFixed(2)} but ${fundingExpectedLabel(funding.btsa)} is $${funding.expected.toFixed(2)} - ${funding.diff > 0 ? `$${funding.diff.toFixed(2)} over` : `waiting on $${Math.abs(funding.diff).toFixed(2)}`}`
        )
      }
      // agent_net already carries BTSA, so the payee side reconciles to office
      // gross PLUS BTSA. funding.btsa is the same sum dealFundingStatus used,
      // so this gate and the funding gate above cannot disagree.
      const closeOfficeGross = num(closeTxn?.office_gross) + funding.btsa
      // Same helper the close dialog uses, so the button and the route cannot
      // disagree. Unpaid rows have staged debts/credits applied; paid rows are
      // taken as-is because Mark Paid already stamped debts_deducted into
      // their agent_net.
      const closeAgentNets = effectiveAgentNetTotal(closeAgents || [], closeStaged || [])
      const closeExternal = (closeTebs || []).reduce(
        (s: number, b: any) => s + num(b.commission_amount),
        0
      )
      const closeActual = closeAgentNets + closeExternal + num(closeTxn?.office_net)
      if (Math.abs(closeOfficeGross - closeActual) > MATH_TOLERANCE) {
        closeBlocks.push(
          `Payees don't add up: agent nets + external + office net ($${closeActual.toFixed(2)}) is $${Math.abs(closeOfficeGross - closeActual).toFixed(2)} ${closeActual < closeOfficeGross ? 'short of' : 'over'} ${fundingExpectedLabel(funding.btsa)} ($${closeOfficeGross.toFixed(2)})`
        )
      }
      if (closeBlocks.length > 0) {
        return NextResponse.json(
          { error: `Can't close yet - fix the deal first: ${closeBlocks.join(' · ')}`, blocks: closeBlocks },
          { status: 400 }
        )
      }

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

    // ── Send a CDA for broker approval (per deal) ────────────────────────────
    if (action === 'send_cda_for_approval') {
      const { data: txnRow } = await supabase
        .from('transactions').select('id, property_address').eq('id', id).single()
      if (!txnRow) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

      // Flip the status FIRST so the approval request always registers (shows
      // on the Needs CDA tab and can be approved) even if the notification
      // email can't be sent. Clearing the prior approval here also drops a
      // stale broker signature when a CDA is re-requested after edits.
      const { error: statusErr } = await supabase.from('transactions')
        .update({
          cda_status: 'pending_approval',
          cda_sent_for_approval_at: new Date().toISOString(),
          broker_approved_at: null,
          broker_approved_by: null,
        })
        .eq('id', id)
      if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

      // Notify approvers (operations + broker) — best effort. Resolve by
      // office_email first (their real CRC mailbox), then personal email.
      const { data: approvers } = await supabase
        .from('users').select('email, office_email').in('role', ['operations', 'broker'])
      const approverEmails = Array.from(new Set(
        (approvers || []).map((a: any) => a.office_email || a.email).filter(Boolean)
      )) as string[]

      let warning: string | null = null
      if (approverEmails.length === 0) {
        warning = 'Marked pending approval, but no operations/broker approver email was found to notify. Approve it from the Needs CDA tab.'
      } else {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
        const propertyLabel = txnRow.property_address || 'Transaction'
        try {
          const { error: apprSendError } = await resend.emails.send({
            from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
            to: approverEmails,
            subject: `CDA needs approval: ${propertyLabel}`,
            html: getEmailLayout(
              `<p>A CDA is ready for your approval.</p>
               <p style="margin:0 0 16px;"><strong>${propertyLabel}</strong></p>
               <p style="text-align:center;margin:24px 0;">
                 <a href="${appUrl}/admin/cda-approval/${id}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Review &amp; Approve</a>
               </p>
               <p style="font-size:13px;color:#888888;">You can also approve it from the Needs CDA tab on the Compliance page.</p>`,
              { title: 'CDA Approval Needed', subtitle: propertyLabel, preheader: `CDA approval needed for ${propertyLabel}` }
            ),
          })
          if (apprSendError) warning = `Marked pending approval, but the notification email failed: ${apprSendError.message || 'send error'}`
        } catch (e: any) {
          warning = `Marked pending approval, but the notification email failed: ${e?.message || 'send error'}`
        }
      }
      return NextResponse.json({ success: true, sent_to: approverEmails, warning })
    }

    // ── Approve a CDA (broker sign-off, per deal) ────────────────────────────
    if (action === 'approve_cda') {
      if (!auth.permissions?.has('can_approve_cda')) {
        return NextResponse.json({ error: 'You are not authorized to approve CDAs' }, { status: 403 })
      }
      const nowIso = new Date().toISOString()
      const { error: apprErr } = await supabase.from('transactions')
        .update({ broker_approved_at: nowIso, broker_approved_by: auth.user?.id || null, cda_status: 'approved' })
        .eq('id', id)
      if (apprErr) return NextResponse.json({ error: apprErr.message }, { status: 500 })
      const { error: auditErr } = await supabase.from('document_signing_events').insert({
        user_id: auth.user?.id || null, signer_id: auth.user?.id || null,
        signer_type: 'broker', signer_name: 'Courtney Okanlomo',
        document_type: 'cda', document_subtype: 'transaction', is_final_version: true,
      })
      if (auditErr) console.error('CDA approval audit insert failed:', auditErr)
      return NextResponse.json({ success: true })
    }

    // ── Send a statement or CDA email ────────────────────────────────────────
    // Rebuilds the preview from fresh DB data (never trusts client copy), then
    // fires via Resend. Requires either brokerage_main_email (CRC) or
    // referral_brokerage_email (RC) to be configured for the cc.
    if (action === 'send_email') {
      const { email_type, internal_agent_id } = body
      if (email_type === 'cda') {
        const { data: gateTxn } = await supabase
          .from('transactions').select('cda_status').eq('id', id).single()
        if (gateTxn?.cda_status !== 'approved' && gateTxn?.cda_status !== 'sent') {
          return NextResponse.json(
            { error: 'This CDA must be approved before it can be sent to the agent.' },
            { status: 400 }
          )
        }
      }
      if (email_type === 'statement') {
        // A statement promises the agent a number. Derived compliance (never
        // the stored column) and the deal's checklist must both be done
        // before that promise goes out. Hard gate, no override.
        const { data: gateTxn } = await supabase
          .from('transactions')
          .select('transaction_type')
          .eq('id', id)
          .single()
        const gateIsLease = isLeaseTransactionType(gateTxn?.transaction_type)
        const [complianceByTxnGate, checklistDone] = await Promise.all([
          deriveComplianceForTransactions([id]),
          dealChecklistComplete(id, gateIsLease),
        ])
        const gateBlocks: string[] = []
        if (complianceByTxnGate[id]?.status !== 'complete') {
          gateBlocks.push('Compliance is not complete - finish the compliance review first')
        }
        if (!checklistDone) {
          gateBlocks.push(
            `Checklist is not complete - finish the ${gateIsLease ? 'payouts' : 'CDA'} checklist`
          )
        }
        if (gateBlocks.length > 0) {
          return NextResponse.json(
            { error: `This statement is blocked: ${gateBlocks.join(' · ')}`, blocks: gateBlocks },
            { status: 400 }
          )
        }
      }
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

      // Track sent date on TIA row and update CDA status on transaction.
      // Only a STATEMENT send sets agent_statement_sent — sending a CDA used
      // to flip it too, which falsely satisfied "statement sent" checks on
      // deals where no statement ever went out. (Historical rows keep
      // whatever the old behavior wrote; that ambiguity is accepted.)
      if (email_type === 'statement') {
        await supabase
          .from('transaction_internal_agents')
          .update({ agent_statement_sent: true, agent_statement_sent_date: new Date().toISOString() })
          .eq('id', internal_agent_id)
      } else if (email_type === 'cda') {
        await supabase
          .from('transactions')
          .update({
            cda_status: 'sent',
            cda_completed_at: new Date().toISOString(),
            cda_completed_by: auth.user?.id || null,
          })
          .eq('id', id)
      }

      return NextResponse.json({ success: true, sent_to: preview.to, cc: preview.cc })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('Transaction detail POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
