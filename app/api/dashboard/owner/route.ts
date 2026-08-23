import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'
import { fundingFilterState } from '@/lib/transactions/funding'

export const dynamic = 'force-dynamic'

// GET /api/dashboard/owner - data for the owner view of the admin dashboard.
//
// Both queue queries below were verified against live data before this route
// existed (Courtney's briefing system uses the same two):
//   co-sign queue:  ica_signed_at IS NOT NULL AND broker_signed_at IS NULL
//   CDA queue:      cda_sent_for_approval_at IS NOT NULL AND broker_approved_at IS NULL
// There is deliberately NO cda_status filter - 'pending_approval' does not
// exist in the live vocabulary and filtering on it returns zero rows forever.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_owner_dashboard')
  if (auth.error) return auth.error

  try {
    const [
      { data: coSign },
      { data: cdaQueue },
      transactions,
      checks,
      sessions,
      prospectUsers,
      { data: bankIssueUsers },
    ] = await Promise.all([
      supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, ica_signed_at')
        .not('ica_signed_at', 'is', null)
        .is('broker_signed_at', null)
        .order('ica_signed_at', { ascending: true }),
      supabaseAdmin
        .from('transactions')
        .select('id, property_address, cda_sent_for_approval_at, sales_price, office_net, submitted_by')
        .not('cda_sent_for_approval_at', 'is', null)
        .is('broker_approved_at', null)
        .order('cda_sent_for_approval_at', { ascending: true }),
      fetchAllRows(
        'transactions',
        'id, status, transaction_type, property_address, office_gross, compliance_status, cda_status, closing_date'
      ),
      fetchAllRows('checks_received', 'transaction_id, check_amount, cleared_date'),
      fetchAllRows('onboarding_sessions', 'user_id, current_step, fully_completed_at, created_at', {
        filters: [{ type: 'is', column: 'fully_completed_at', value: null }],
      }),
      // fetchAllRows: prospects only accumulate (182 live) and a bare
      // select truncates silently at 1,000.
      fetchAllRows('users', 'id, created_at, mls_choice, w9_completed', {
        filters: [{ type: 'eq', column: 'status', value: 'prospect' }],
      }),
      // Bank-connection issues: the population the verify-bank cron reports
      // on - active agents with a Payload billing account but no verified
      // bank connection for payouts.
      supabaseAdmin
        .from('users')
        .select('id')
        .eq('status', 'active')
        .not('payload_payee_id', 'is', null)
        .or('bank_connected.is.null,bank_connected.eq.false'),
    ])

    // ── Funding states, one definition (shared with the /transactions chips)
    const checksByTxn = new Map<string, any[]>()
    for (const c of checks as any[]) {
      if (!c.transaction_id) continue
      const list = checksByTxn.get(c.transaction_id) || []
      list.push(c)
      checksByTxn.set(c.transaction_id, list)
    }
    const fundingCounts = { waiting: 0, partial: 0, matched: 0, mismatch: 0 }
    const mismatchDeals: { id: string; property_address: string; diff: number }[] = []
    for (const t of transactions as any[]) {
      const txnChecks = checksByTxn.get(t.id) || []
      const st = fundingFilterState(t, txnChecks)
      if (!st) continue
      fundingCounts[st]++
      if (st === 'mismatch') {
        const expected = parseFloat(String(t.office_gross ?? 0)) || 0
        const received = txnChecks
          .filter((c: any) => c.cleared_date)
          .reduce((s: number, c: any) => s + (parseFloat(String(c.check_amount ?? 0)) || 0), 0)
        mismatchDeals.push({
          id: t.id,
          property_address: t.property_address || 'No address',
          diff: Math.round((received - expected) * 100) / 100,
        })
      }
    }

    // ── Eligible for payout - derived compliance, same rule as the admin
    // dashboard tile (deals with a check + compliance complete). Chunked
    // because the helper puts the whole id list in one .in() URL.
    const checkTxnIds = Array.from(checksByTxn.keys())
    const complianceByTxn: Record<string, any> = {}
    for (let i = 0; i < checkTxnIds.length; i += 200) {
      Object.assign(
        complianceByTxn,
        await deriveComplianceForTransactions(checkTxnIds.slice(i, i + 200))
      )
    }
    const eligibleForPayout = (transactions as any[]).filter(
      t => checksByTxn.has(t.id) && complianceByTxn[t.id]?.status === 'complete'
    ).length

    // ── CDA needed - same definition the admin dashboard uses.
    const isLeaseType = (t: any) => /tenant|landlord|lease/i.test(String(t.transaction_type || ''))
    const isWorking = (t: any) => ['active', 'pending'].includes(String(t.status || '').toLowerCase())
    const cdaNeeded = (transactions as any[]).filter(
      t =>
        isWorking(t) &&
        !isLeaseType(t) &&
        complianceByTxn[t.id]?.status === 'complete' &&
        String(t.cda_status || '') !== 'sent'
    ).length

    // ── Onboarding in flight
    const openSessions = (sessions as any[]) || []
    // "At W-9" must mean the same thing here as on the onboarding tracker,
    // or this tile and that header diverge: W-9 is step 5 for Referral
    // Collective and step 6 for everyone else, and an agent whose W-9 is
    // already complete is not waiting at it.
    const sessionUserIds = openSessions.map(s => s.user_id).filter(Boolean)
    const w9ById: Record<string, { is_referral: boolean; w9_completed: boolean }> = {}
    if (sessionUserIds.length > 0) {
      const sessionUsers = await fetchAllRows('users', 'id, mls_choice, w9_completed', {
        filters: [{ type: 'in', column: 'id', value: sessionUserIds }],
      })
      for (const u of sessionUsers as any[]) {
        w9ById[u.id] = {
          is_referral: u.mls_choice === 'Referral Collective (No MLS)',
          w9_completed: !!u.w9_completed,
        }
      }
    }
    const atW9 = openSessions.filter(s => {
      const u = w9ById[s.user_id]
      if (!u || u.w9_completed) return false
      return s.current_step === (u.is_referral ? 5 : 6)
    }).length
    // Untouched prospects: a prospect account exists but their onboarding
    // hasn't moved past step 1 (or never started a session).
    const sessionByUser = new Map(openSessions.map(s => [s.user_id, s]))
    const untouchedProspects = (prospectUsers || []).filter(u => {
      const s = sessionByUser.get(u.id)
      return !s || s.current_step <= 1
    }).length

    // Agent names for the CDA queue rows
    const submitterIds = Array.from(
      new Set((cdaQueue || []).map((t: any) => t.submitted_by).filter(Boolean))
    )
    const namesById: Record<string, string> = {}
    if (submitterIds.length > 0) {
      const { data: submitters } = await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', submitterIds)
      for (const u of submitters || []) {
        namesById[u.id] =
          `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
      }
    }

    return NextResponse.json({
      coSignQueue: (coSign || []).map((u: any) => ({
        id: u.id,
        name: `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim(),
        ica_signed_at: u.ica_signed_at,
      })),
      cdaQueue: (cdaQueue || []).map((t: any) => ({
        id: t.id,
        property_address: t.property_address || 'No address',
        agent_name: namesById[t.submitted_by] || '',
        office_net: t.office_net,
        sent_at: t.cda_sent_for_approval_at,
      })),
      tiles: {
        eligibleForPayout,
        waitingOnFunds: fundingCounts.waiting,
        cdaNeeded,
        onboardingInFlight: openSessions.length,
        onboardingAtW9: atW9,
      },
      fundingCounts,
      needsAttention: {
        mismatchDeals,
        bankIssueCount: (bankIssueUsers || []).length,
        untouchedProspects,
      },
    })
  } catch (err: any) {
    console.error('Owner dashboard API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
