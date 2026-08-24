/**
 * The shared "needs attention" counts behind BOTH dashboards.
 *
 * Server-only (it queries). One definition each, because the ops view and the
 * owner view were computing the same four numbers different ways and
 * disagreeing:
 *
 *   eligible for payout  ops required a done checklist and an unpaid row;
 *                        owner required only a check plus derived compliance,
 *                        so owner always read higher. Both linked to the same
 *                        /transactions?funding=matched list.
 *   CDA needed           ops read the STORED transactions.compliance_status,
 *                        owner read DERIVED compliance. The stored column is
 *                        dual-written and falls behind.
 *   broker approval      ops counted cda_status = 'pending_approval', a value
 *                        that does not exist in the database at all, so the
 *                        tile read zero from the day it shipped. The real
 *                        predicate is the one the owner CDA queue already
 *                        uses.
 *
 * A figure shown twice has to be the same figure, so all of it lives here and
 * both routes call this.
 */

import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'

/** Lease-side deals take the payouts checklist; sales take the CDA checklist. */
export const isLeaseType = (t: { transaction_type?: string | null }): boolean =>
  /tenant|landlord|lease/i.test(String(t?.transaction_type || ''))

/** A deal still being worked, as opposed to closed or cancelled. */
export const isWorking = (t: { status?: string | null }): boolean =>
  ['active', 'pending'].includes(String(t?.status || '').toLowerCase())

/**
 * Whether the CDA has gone to title. This is the app's canonical rule, already
 * used by /api/admin/compliance (route line 276) and the compliance page: a CDA
 * counts as sent when the automated flow sent it OR when someone marked it sent
 * by hand. Both dashboards previously tested `cda_status !== 'sent'` alone,
 * which counted 3 hand-sent deals as still needing one.
 */
export const cdaSent = (t: {
  cda_status?: string | null
  cda_manual_status?: string | null
}): boolean =>
  String(t?.cda_status || '') === 'sent' || String(t?.cda_manual_status || '') === 'sent'

/** Explicitly marked as not requiring a CDA at all. */
export const cdaNotNeeded = (t: { cda_manual_status?: string | null }): boolean =>
  String(t?.cda_manual_status || '') === 'not_needed'

export interface NeedsAttentionCounts {
  complianceRequested: number
  cdaNeeded: number
  brokerApprovalPending: number
  eligibleForPayout: number
  /** Deal ids behind eligibleForPayout, for callers that need the list. */
  eligibleForPayoutIds: string[]
}

/**
 * Computes all four counts from live data. Fetches its own transactions with
 * exactly the columns the predicates need, so the two callers cannot drift by
 * passing different column sets.
 */
export async function needsAttentionCounts(): Promise<NeedsAttentionCounts> {
  const [transactions, agentRows, { data: checkRows }, { data: templates }] = await Promise.all([
    fetchAllRows(
      'transactions',
      'id, status, transaction_type, compliance_status, cda_status, cda_manual_status, cda_sent_for_approval_at, broker_approved_at'
    ),
    // Past 1,500 rows - fetchAllRows, never a bare select.
    fetchAllRows('transaction_internal_agents', 'transaction_id, agent_role, agent_net, payment_status'),
    supabaseAdmin
      .from('checks_received')
      .select('transaction_id')
      .not('transaction_id', 'is', null),
    supabaseAdmin.from('checklist_templates').select('id, slug').in('slug', ['cda', 'payouts']),
  ])

  const txns = transactions as any[]

  // ── Compliance requested: a working deal with a submission awaiting review.
  const complianceRequested = txns.filter(
    t => isWorking(t) && ['submitted', 'incomplete'].includes(String(t.compliance_status || ''))
  ).length

  // ── Broker approval pending. cda_status='pending_approval' does not exist
  // in the live vocabulary; this is the predicate the owner CDA queue uses.
  const brokerApprovalPending = txns.filter(
    t => !!t.cda_sent_for_approval_at && !t.broker_approved_at
  ).length

  // ── Derived compliance. Scoped to deals that could plausibly qualify for
  // either count, and chunked because the helper puts every id in one .in().
  const checkTxnIds = new Set(
    (checkRows || []).map((c: any) => c.transaction_id).filter(Boolean) as string[]
  )
  const needComplianceFor = new Set<string>(checkTxnIds)
  for (const t of txns) {
    if (isWorking(t) && !isLeaseType(t) && !cdaSent(t) && !cdaNotNeeded(t)) {
      needComplianceFor.add(t.id)
    }
  }
  const complianceIds = Array.from(needComplianceFor)
  const complianceByTxn: Record<string, any> = {}
  for (let i = 0; i < complianceIds.length; i += 200) {
    Object.assign(
      complianceByTxn,
      await deriveComplianceForTransactions(complianceIds.slice(i, i + 200))
    )
  }
  const complianceComplete = (t: any) => complianceByTxn[t.id]?.status === 'complete'

  // ── CDA needed: a working sale whose compliance is done and whose CDA has
  // neither gone out nor been waived.
  const cdaNeeded = txns.filter(
    t =>
      isWorking(t) &&
      !isLeaseType(t) &&
      complianceComplete(t) &&
      !cdaSent(t) &&
      !cdaNotNeeded(t)
  ).length

  // ── Eligible for payout: a check is in, compliance is complete, the deal's
  // checklist is done, and somebody is still owed money.
  const cdaTemplateId = (templates || []).find((t: any) => t.slug === 'cda')?.id || null
  const payoutTemplateId = (templates || []).find((t: any) => t.slug === 'payouts')?.id || null
  const { data: itemRows } = await supabaseAdmin
    .from('checklist_items')
    .select('id, checklist_template_id')
    .in('checklist_template_id', [cdaTemplateId, payoutTemplateId].filter(Boolean) as string[])
    .eq('is_active', true)
  const cdaItemIds = (itemRows || [])
    .filter((i: any) => i.checklist_template_id === cdaTemplateId)
    .map((i: any) => i.id)
  const payoutItemIds = (itemRows || [])
    .filter((i: any) => i.checklist_template_id === payoutTemplateId)
    .map((i: any) => i.id)
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
      .filter(
        r =>
          ['primary_agent', 'listing_agent', 'co_agent'].includes(String(r.agent_role || '')) &&
          String(r.payment_status || '') !== 'paid' &&
          (parseFloat(String(r.agent_net ?? 0)) || 0) > 0
      )
      .map(r => r.transaction_id)
  )
  // An external brokerage still owed counts too: the agent may be paid while
  // the referral or co-op check has not gone out.
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

  const eligibleForPayoutIds = txns
    .filter(
      t =>
        checkTxnIds.has(t.id) &&
        complianceComplete(t) &&
        checklistDone(t) &&
        unpaidTxnIds.has(t.id)
    )
    .map(t => t.id)

  return {
    complianceRequested,
    cdaNeeded,
    brokerApprovalPending,
    eligibleForPayout: eligibleForPayoutIds.length,
    eligibleForPayoutIds,
  }
}
