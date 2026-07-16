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
import { supabaseAdmin } from '@/lib/supabase'

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
    .filter('data->>submission_mode', 'eq', 'compliance')

  const statusesByTxn: Record<string, string[]> = {}
  const reviewedByTxn: Record<string, string[]> = {}
  for (const s of subs || []) {
    if (!s.transaction_id) continue
    if (!statusesByTxn[s.transaction_id]) statusesByTxn[s.transaction_id] = []
    statusesByTxn[s.transaction_id].push(s.status)
    if (s.reviewed_at) {
      if (!reviewedByTxn[s.transaction_id]) reviewedByTxn[s.transaction_id] = []
      reviewedByTxn[s.transaction_id].push(s.reviewed_at)
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
    const status = statuses.includes('incomplete')
      ? 'incomplete'
      : statuses.some(s => s === 'in_review' || s === 'submitted')
        ? 'in_review'
        : 'complete'
    let complete_date: string | null = null
    if (status === 'complete') {
      const dates = (reviewedByTxn[id] || []).sort()
      complete_date = dates.length ? dates[dates.length - 1] : null
    }
    out[id] = { status, complete_date }
  }
  return out
}
