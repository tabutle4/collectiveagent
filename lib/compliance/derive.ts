// lib/compliance/derive.ts
// Single source of truth for a transaction's compliance state.
//
// Compliance status is set ONLY from the compliance request page (the
// set-status route writes agent_form_submissions.status and reviewed_at).
// Every other surface (checks page, transaction detail check rows, payouts
// report) derives from those submissions and never writes its own copy.
//
// Derivation rule (identical to the payouts report's side derivation):
//   any side incomplete            -> incomplete
//   else any side in_review or
//        submitted                 -> in_review
//   else (all sides complete)      -> complete
//   no compliance submissions      -> null (caller falls back to
//                                    transactions.compliance_status, which is
//                                    itself dual-written by the compliance page)
//
// Completion date: only meaningful when derived status is complete. It is the
// latest reviewed_at across the sides, so pay-by math keys off the date the
// LAST side finished review.
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'

// Modes that can act as a compliance side.
export const SIDE_MODES_FILTER = '("compliance","retainer")'

/**
 * Pick the submissions that act as compliance sides for ONE transaction.
 *
 * Compliance submissions win outright. The retainer is used only when the deal
 * has no compliance submission at all, which is the retainer-only prospect
 * case. This matters because the compliance form can attach to a retainer
 * prospect and convert it: from that moment the deal has a real side, and the
 * old retainer must stop contributing or a still-submitted retainer would pin a
 * fully reviewed deal at in_review forever.
 *
 * Callers holding submissions for several transactions must group by
 * transaction_id first and call this per transaction.
 */
/**
 * How many sides of the deal the submissions on hand actually cover, and how
 * many the deal expects.
 *
 * Counting submissions is wrong: two agents co-listing the buyer side file two
 * submissions but cover one side. Counting distinct `representing` values is
 * the real measure. Older submissions can carry no `representing` at all, and
 * in that case coverage cannot be determined from them, so fall back to the
 * submission count rather than collapsing every unknown into a single side and
 * reporting a complete deal as incomplete.
 */
export function sidesCovered(subs: any[]): number {
  const vals = subs.map(s => String(s.data?.representing || '').toLowerCase().trim())
  if (vals.some(v => !v)) return subs.length
  return new Set(vals).size
}

/**
 * A deal marked intermediary has CRC on both sides and needs both reviewed
 * before it is compliant. Every other deal expects one side.
 */
export function expectedSides(isIntermediary: boolean | null | undefined): number {
  return isIntermediary ? 2 : 1
}

/**
 * The worst status across the sides, with a missing side counted as outstanding.
 *
 * The ladder alone can only see sides that filed. On an intermediary deal where
 * the buyer side was approved and the seller side never submitted, the only
 * status present is 'complete' and the deal reads complete -- a side that does
 * not exist cannot be counted as outstanding. So coverage is checked first: if
 * fewer sides are covered than the deal expects, the deal is incomplete no
 * matter how good the sides on hand look.
 */
export function deriveSideStatus(
  sides: any[],
  isIntermediary: boolean | null | undefined
): string | null {
  if (sides.length === 0) return null
  if (sidesCovered(sides) < expectedSides(isIntermediary)) return 'incomplete'
  const statuses = sides.map((s: any) => s.status)
  if (statuses.includes('incomplete')) return 'incomplete'
  if (statuses.some((s: string) => s === 'in_review' || s === 'submitted')) return 'in_review'
  // Every side must actually say 'complete'. A bare `return 'complete'` here
  // would make an unrecognised status -- 'draft', null, anything a future
  // writer adds -- derive complete, and three routes share this function. It is
  // unreachable today because set-status enforces ALLOWED_STATUSES with a 400,
  // but the failure direction matters more than the current reachability: an
  // unknown status should hold a deal short of compliant, not wave it through.
  return statuses.every((s: string) => s === 'complete') ? 'complete' : null
}

export function pickSideSubmissions<T extends { data?: any }>(subs: T[]): T[] {
  const compliance = subs.filter(s => (s.data?.submission_mode || '') === 'compliance')
  if (compliance.length > 0) return compliance
  return subs.filter(s => (s.data?.submission_mode || '') === 'retainer')
}

export type DerivedCompliance = {
  status: string | null
  complete_date: string | null
}

// Transactions with zero compliance submissions (historical deals, deals
// created from the checks page) fall back to the stored per-check
// compliance_complete_date so old data keeps displaying and pay-by math
// keeps working. The moment a compliance submission exists for the
// transaction, the submissions win and the stored column is ignored.
async function storedFallback(
  txnIds: string[]
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  if (txnIds.length === 0) return out
  const { data: checks } = await supabaseAdmin
    .from('checks_received')
    .select('transaction_id, compliance_complete_date')
    .in('transaction_id', txnIds)
    .not('compliance_complete_date', 'is', null)
  for (const c of checks || []) {
    if (!c.transaction_id) continue
    const d = String(c.compliance_complete_date)
    if (!out[c.transaction_id] || d > out[c.transaction_id]!) {
      out[c.transaction_id] = d
    }
  }
  return out
}

export async function deriveComplianceForTransactions(
  transactionIds: string[]
): Promise<Record<string, DerivedCompliance>> {
  const out: Record<string, DerivedCompliance> = {}
  const ids = [...new Set(transactionIds.filter(Boolean))]
  if (ids.length === 0) return out

  const { data: subs } = await supabaseAdmin
    .from('agent_form_submissions')
    .select('transaction_id, status, reviewed_at, data')
    .in('transaction_id', ids)
    .filter('data->>submission_mode', 'in', SIDE_MODES_FILTER)

  // Group by deal first: pickSideSubmissions decides per transaction whether
  // the sides are its compliance submissions or its retainer.
  const subsByTxn: Record<string, any[]> = {}
  for (const s of subs || []) {
    if (!s.transaction_id) continue
    if (!subsByTxn[s.transaction_id]) subsByTxn[s.transaction_id] = []
    subsByTxn[s.transaction_id].push(s)
  }

  // Whether each deal has CRC on both sides. Read here because the ladder below
  // cannot see a side that never filed, and is_intermediary is the only thing
  // that says a second side was expected.
  const txnRows = await fetchAllRows<{ id: string; is_intermediary: boolean | null }>(
    'transactions',
    'id, is_intermediary',
    { filters: [{ type: 'in', column: 'id', value: ids }] }
  )
  const intermediaryByTxn: Record<string, boolean> = {}
  for (const t of txnRows || []) intermediaryByTxn[t.id] = !!t.is_intermediary

  const sidesByTxn: Record<string, any[]> = {}
  const statusesByTxn: Record<string, string[]> = {}
  const reviewedByTxn: Record<string, string[]> = {}
  for (const txnId of Object.keys(subsByTxn)) {
    sidesByTxn[txnId] = pickSideSubmissions(subsByTxn[txnId])
    for (const s of sidesByTxn[txnId]) {
      if (!statusesByTxn[txnId]) statusesByTxn[txnId] = []
      statusesByTxn[txnId].push(s.status)
      if (s.reviewed_at) {
        if (!reviewedByTxn[txnId]) reviewedByTxn[txnId] = []
        reviewedByTxn[txnId].push(s.reviewed_at)
      }
    }
  }

  const noSubIds = ids.filter(id => (statusesByTxn[id] || []).length === 0)
  const fallbackDates = await storedFallback(noSubIds)

  for (const id of ids) {
    const statuses = statusesByTxn[id] || []
    if (statuses.length === 0) {
      const stored = fallbackDates[id] || null
      out[id] = {
        status: stored ? 'complete' : null,
        complete_date: stored,
      }
      continue
    }
    const status = deriveSideStatus(sidesByTxn[id] || [], intermediaryByTxn[id])
    let complete_date: string | null = null
    if (status === 'complete') {
      const dates = (reviewedByTxn[id] || []).sort()
      complete_date = dates.length ? dates[dates.length - 1] : null
    }
    out[id] = { status, complete_date }
  }
  return out
}
