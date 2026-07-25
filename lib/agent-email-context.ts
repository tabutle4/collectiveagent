/**
 * Agent Email Dashboard,  agent context fetcher for the sidebar.
 *
 * Pulls everything Dale needs on the right-side pane so she can answer
 * without opening another tab:
 *   - Identity (name, phone, email, role, division, office)
 *   - Licensing (license number, expiration, MLS choice)
 *   - Financial (commission plan, monthly fee status, unpaid invoices, credits)
 *   - Team (team name + lead)
 *   - Deals (open, closed YTD, pending CDA)
 *   - Onboarding status
 *
 * Runs in parallel where possible. Non-critical lookups are wrapped in
 * try/catch so a missing side channel never breaks the whole sidebar.
 */

import { supabaseAdmin } from './supabase'
import { preferredDisplayName } from './agent-email'

export interface AgentContextResult {
  id: string
  name: string
  email: string
  phone: string | null
  role: string | null
  status: string | null
  is_active: boolean
  office: string | null
  division: string | null
  mls_choice: string | null

  license_number: string | null
  license_expiration: string | null

  commission_plan: string | null
  lease_commission_plan: string | null

  monthly_fee_paid_through: string | null
  monthly_fee_status: 'current' | 'past_due' | 'unknown'

  team_name: string | null
  team_lead_name: string | null

  unpaid_invoice_count: number
  unpaid_invoice_total: number
  credits_balance: number

  open_deals: number
  closed_ytd_count: number
  closed_ytd_volume: number
  pending_cda_count: number

  onboarding_complete: boolean
  join_date: string | null

  is_referral: boolean
}

/**
 * Fetch full agent context. Returns null if the userId doesn't exist.
 * Individual sections that fail return safe defaults so the sidebar
 * always has something to render.
 */
export async function fetchAgentContext(userId: string): Promise<AgentContextResult | null> {
  // 1. Core user row (fatal if missing,  can't build anything without it)
  const { data: u, error } = await supabaseAdmin
    .from('users')
    .select(
      'id, email, first_name, last_name, preferred_first_name, preferred_last_name, phone, role, status, is_active, office, division, mls_choice, license_number, license_expiration, commission_plan, lease_commission_plan, monthly_fee_paid_through, join_date'
    )
    .eq('id', userId)
    .maybeSingle()

  if (error || !u) {
    console.error('fetchAgentContext user lookup error:', error)
    return null
  }

  const isReferral = u.mls_choice === 'Referral Collective (No MLS)' || u.role === 'referral'

  // 2. Team lookup (non-fatal)
  let teamName: string | null = null
  let teamLeadName: string | null = null
  try {
    const { data: memberRow } = await supabaseAdmin
      .from('team_member_agreements')
      .select('team:teams!team_member_agreements_team_id_fkey(id, team_name)')
      .eq('agent_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (memberRow?.team) {
      const t = memberRow.team as any
      teamName = t?.team_name || null
      const teamId = t?.id
      if (teamId) {
        const { data: leadRow } = await supabaseAdmin
          .from('team_leads')
          .select(
            'agent:users!team_leads_agent_id_fkey(first_name, last_name, preferred_first_name, preferred_last_name, email)'
          )
          .eq('team_id', teamId)
          .eq('is_active', true)
          .maybeSingle()
        if (leadRow?.agent) {
          teamLeadName = preferredDisplayName(leadRow.agent as any)
        }
      }
    }
  } catch (e) {
    console.error('fetchAgentContext team lookup exception:', e)
  }

  // 3. Financial: unpaid invoices, credits, monthly fee status
  let unpaidInvoiceCount = 0
  let unpaidInvoiceTotal = 0
  let creditsBalance = 0
  let monthlyFeeStatus: 'current' | 'past_due' | 'unknown' = 'unknown'
  try {
    // Monthly fee status from users.monthly_fee_paid_through vs today
    if (u.monthly_fee_paid_through) {
      const paidThrough = new Date(u.monthly_fee_paid_through)
      const now = new Date()
      monthlyFeeStatus = paidThrough >= now ? 'current' : 'past_due'
    } else {
      monthlyFeeStatus = 'unknown'
    }

    // Unpaid invoices (billing table)
    const { data: openInvoices } = await supabaseAdmin
      .from('billing')
      .select('amount_due, amount, status')
      .eq('agent_id', userId)
      .eq('status', 'outstanding')

    if (openInvoices) {
      unpaidInvoiceCount = openInvoices.length
      unpaidInvoiceTotal = openInvoices.reduce(
        (a, inv) => a + Number(inv.amount_due ?? inv.amount ?? 0),
        0
      )
    }

    // Credits (agent_credits table)
    const { data: credits } = await supabaseAdmin
      .from('agent_credits')
      .select('amount, is_applied')
      .eq('agent_id', userId)
    if (credits) {
      creditsBalance = credits
        .filter(c => !c.is_applied)
        .reduce((a, c) => a + Number(c.amount || 0), 0)
    }
  } catch (e) {
    console.error('fetchAgentContext financial exception:', e)
  }

  // 4. Deals (transactions where this agent is on the deal)
  let openDeals = 0
  let closedYtdCount = 0
  let closedYtdVolume = 0
  let pendingCdaCount = 0
  try {
    // Try transaction_agents join,  most reliable pattern in the app
    const { data: rows } = await supabaseAdmin
      .from('transaction_agents')
      .select(
        'transactions:transactions!transaction_agents_transaction_id_fkey(id, status, closed_date, sales_price, cda_status)'
      )
      .eq('agent_id', userId)

    const currentYear = new Date().getFullYear()
    for (const r of rows || []) {
      const tx = (r as any).transactions
      if (!tx) continue
      const status = String(tx.status || '').toLowerCase()
      const isClosed = status === 'closed'
      const isOpen = !isClosed && status !== 'cancelled' && status !== 'canceled'
      if (isOpen) openDeals += 1
      if (isClosed && tx.closed_date) {
        const yr = new Date(tx.closed_date).getFullYear()
        if (yr === currentYear) {
          closedYtdCount += 1
          closedYtdVolume += Number(tx.sales_price || 0)
        }
      }
      const cdaStatus = String(tx.cda_status || '').toLowerCase()
      if (cdaStatus === 'pending' || cdaStatus === 'submitted' || cdaStatus === 'awaiting_approval') {
        pendingCdaCount += 1
      }
    }
  } catch (e) {
    console.error('fetchAgentContext deals exception:', e)
  }

  // 5. Onboarding complete (heuristic: if join_date is in the past and
  //    they have a license_number, consider complete)
  const onboardingComplete = Boolean(u.join_date) && Boolean(u.license_number)

  return {
    id: u.id as string,
    name: preferredDisplayName(u as any),
    email: u.email as string,
    phone: (u.phone as string) || null,
    role: (u.role as string) || null,
    status: (u.status as string) || null,
    is_active: Boolean(u.is_active),
    office: (u.office as string) || null,
    division: (u.division as string) || null,
    mls_choice: (u.mls_choice as string) || null,

    license_number: (u.license_number as string) || null,
    license_expiration: (u.license_expiration as string) || null,

    commission_plan: (u.commission_plan as string) || null,
    lease_commission_plan: (u.lease_commission_plan as string) || null,

    monthly_fee_paid_through: (u.monthly_fee_paid_through as string) || null,
    monthly_fee_status: monthlyFeeStatus,

    team_name: teamName,
    team_lead_name: teamLeadName,

    unpaid_invoice_count: unpaidInvoiceCount,
    unpaid_invoice_total: unpaidInvoiceTotal,
    credits_balance: creditsBalance,

    open_deals: openDeals,
    closed_ytd_count: closedYtdCount,
    closed_ytd_volume: closedYtdVolume,
    pending_cda_count: pendingCdaCount,

    onboarding_complete: onboardingComplete,
    join_date: (u.join_date as string) || null,

    is_referral: isReferral,
  }
}

/**
 * Build the short context lines that appear in the escalation/assignment
 * email. Same data as the sidebar, condensed to bullet-style strings.
 */
export function contextToEmailLines(ctx: AgentContextResult): string[] {
  const lines: string[] = []
  const roleLabel = ctx.is_referral ? 'Referral agent' : ctx.role || 'Agent'
  lines.push(`${ctx.name} - ${roleLabel}${ctx.office ? ` - ${ctx.office}` : ''}`)
  if (ctx.commission_plan) {
    lines.push(
      `Plan: ${ctx.commission_plan}${
        ctx.lease_commission_plan && ctx.lease_commission_plan !== ctx.commission_plan
          ? ` (leases: ${ctx.lease_commission_plan})`
          : ''
      }`
    )
  }
  if (ctx.license_number) {
    lines.push(
      `License ${ctx.license_number}${
        ctx.license_expiration ? `, expires ${formatDate(ctx.license_expiration)}` : ''
      }`
    )
  }
  if (ctx.team_name) {
    lines.push(
      `Team: ${ctx.team_name}${ctx.team_lead_name ? ` (lead: ${ctx.team_lead_name})` : ''}`
    )
  }
  const financialBits: string[] = []
  if (ctx.monthly_fee_status === 'past_due') financialBits.push('Monthly fee PAST DUE')
  else if (ctx.monthly_fee_status === 'current') financialBits.push('Monthly fee current')
  if (ctx.unpaid_invoice_count > 0) {
    financialBits.push(
      `${ctx.unpaid_invoice_count} unpaid invoice${ctx.unpaid_invoice_count === 1 ? '' : 's'} ($${ctx.unpaid_invoice_total.toFixed(2)})`
    )
  }
  if (ctx.credits_balance > 0) {
    financialBits.push(`Credits: $${ctx.credits_balance.toFixed(2)}`)
  }
  if (financialBits.length > 0) lines.push(financialBits.join(' - '))
  const dealBits: string[] = []
  if (ctx.open_deals > 0) dealBits.push(`${ctx.open_deals} open deal${ctx.open_deals === 1 ? '' : 's'}`)
  if (ctx.closed_ytd_count > 0) dealBits.push(`${ctx.closed_ytd_count} closed YTD`)
  if (ctx.pending_cda_count > 0) dealBits.push(`${ctx.pending_cda_count} pending CDA`)
  if (dealBits.length > 0) lines.push(dealBits.join(' - '))
  return lines
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}
