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
import { emailButton } from '@/lib/email/layout'

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
 * Only the NEWEST submission per agent per side counts. An agent who files a
 * second full compliance form on a side they already filed does not create a
 * second side; they replace their own answer. Without this the stale row stays
 * in the ladder forever: on 3006 Brooks Ct the 8/25 submission was approved,
 * the agent filed again on 8/26 and 8/27, and the deal reads in_review no
 * matter which row Leah completes, because one of the other two is always
 * still open. The compliance tracker collapses these to one row on exactly
 * this key, so before this the tracker and the derivation disagreed about how
 * many sides the deal had.
 *
 * Two agents co-listing ONE side keep both rows - they are different agents,
 * and sidesCovered already counts distinct `representing` rather than rows, so
 * both still have to be approved.
 *
 * Callers holding submissions for several transactions must group by
 * transaction_id first and call this per transaction, and must SELECT
 * `agent_id` and `submitted_at` - the dedupe key and the recency test are read
 * off them.
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

export function pickSideSubmissions<
  T extends { data?: any; agent_id?: string | null; submitted_at?: string | null; id?: string }
>(subs: T[]): T[] {
  const compliance = subs.filter(s => (s.data?.submission_mode || '') === 'compliance')
  const pool = compliance.length > 0
    ? compliance
    : subs.filter(s => (s.data?.submission_mode || '') === 'retainer')

  // Newest wins per agent per side. Ties break on id so the result is stable
  // across calls rather than depending on the order the rows came back.
  const newestByKey = new Map<string, T>()
  for (const s of pool) {
    const key = `${s.agent_id || ''}:${String(s.data?.representing || '').toLowerCase().trim()}`
    const held = newestByKey.get(key)
    if (!held) { newestByKey.set(key, s); continue }
    const a = String(s.submitted_at || '')
    const b = String(held.submitted_at || '')
    if (a > b || (a === b && String(s.id || '') > String(held.id || ''))) {
      newestByKey.set(key, s)
    }
  }
  // Input order preserved: three routes render these as a side list and one
  // reads picked[0] to decide compliance vs retainer mode.
  const keep = new Set(Array.from(newestByKey.values()))
  return pool.filter(s => keep.has(s))
}

export type DerivedCompliance = {
  status: string | null
  complete_date: string | null
  /** One entry per side that has actually filed, in submission order. */
  sides: { label: string; status: string }[]
  /** How many sides this deal needs. 2 for intermediary, 1 otherwise. */
  expected: number
  /**
   * Which kind of submission the sides came from. A retainer-only deal is
   * 'retainer', and its status describes the retainer rather than closing
   * compliance, which is a different thing to tell an agent.
   */
  mode: 'compliance' | 'retainer' | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'

// Single source for the three places an agent can be sent. compliance-review
// and retainer-review import these rather than each holding their own copy.
export const COMPLIANCE_FORM_URL = `${APP_URL}/agent/forms/compliance-cda?mode=compliance`
export const RETAINER_FORM_URL = `${APP_URL}/agent/forms/compliance-cda?mode=retainer`
// External page until an in-app recheck form exists. Pull from
// company_settings once a recheck_url column is added.
export const COMPLIANCE_RECHECK_URL = 'https://visit.collectiverealtyco.com/recheck'

// Mirrors REPRESENTATION_OPTIONS in app/agent/forms/compliance-cda/page.tsx,
// which is a local const in a page component rather than a shared export.
// Worth unifying, but not by editing the compliance form in this patch.
const REPRESENTING_LABELS: Record<string, string> = {
  buyer: 'Buyer',
  nc_buyer: 'New construction buyer',
  seller: 'Seller',
  commercial_buyer: 'Commercial buyer',
  commercial_seller: 'Commercial seller',
  business_buyer: 'Business buyer',
  business_seller: 'Business seller',
  tenant: 'Tenant',
  landlord: 'Landlord',
  referred_out: 'Referred out',
}

// The full prefix, not just the side name. A retainer submission carries no
// `representing` field at all (the retainer branch of the form writes
// retainer_transaction_type instead), so forcing it through a side label
// produced "Side side: complete" in an agent-facing email.
function submissionLabel(sub: any): string {
  if (String(sub?.data?.submission_mode || '') === 'retainer') return 'Retainer'
  const key = String(sub?.data?.representing || '').toLowerCase().trim()
  if (!key) return 'Compliance'
  const name = REPRESENTING_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
  return `${name} side`
}

function sideStatusLabel(status: unknown): string {
  switch (String(status || '').toLowerCase()) {
    case 'complete':
    case 'approved':
      return 'complete'
    case 'in_review':
    case 'submitted':
    case 'pending':
      return 'in review'
    case 'incomplete':
    case 'rejected':
      return 'not complete'
    default:
      return 'not submitted'
  }
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
    .select('transaction_id, agent_id, submitted_at, status, reviewed_at, data')
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
    const expected = expectedSides(intermediaryByTxn[id])
    if (statuses.length === 0) {
      const stored = fallbackDates[id] || null
      out[id] = {
        status: stored ? 'complete' : null,
        complete_date: stored,
        // A historical deal filed no sides, so there is nothing to list. Its
        // status comes from the stored date instead.
        sides: [],
        expected,
        mode: null,
      }
      continue
    }
    const status = deriveSideStatus(sidesByTxn[id] || [], intermediaryByTxn[id])
    let complete_date: string | null = null
    if (status === 'complete') {
      const dates = (reviewedByTxn[id] || []).sort()
      complete_date = dates.length ? dates[dates.length - 1] : null
    }
    const picked = sidesByTxn[id] || []
    const sides = picked.map((sub: any) => ({
      label: submissionLabel(sub),
      status: sideStatusLabel(sub.status),
    }))
    const mode: 'compliance' | 'retainer' | null =
      String(picked[0]?.data?.submission_mode || '') === 'retainer' ? 'retainer' : 'compliance'
    out[id] = { status, complete_date, sides, expected, mode }
  }
  return out
}

/**
 * Plain-English compliance status for an agent-facing email. Deal level, not
 * side level: it describes the file rather than the reader's own paperwork, so
 * it stays accurate on an intermediary deal where the other side is the one
 * holding things up.
 */
export function complianceEmailLine(d: DerivedCompliance | undefined): string {
  // A retainer-only deal has no closing compliance on file, whatever the
  // retainer's own status says. Telling an agent "compliance is complete"
  // when a check has arrived and they still owe compliance is the worst
  // version of this email, so the retainer branch never claims it.
  if (d?.mode === 'retainer') {
    switch (d.status) {
      case 'complete':
        return 'Your retainer is on file. Closing compliance has not been submitted yet, and payment processing starts once it is received and approved.'
      case 'in_review':
        return 'Your retainer is submitted and under review. Closing compliance has not been submitted yet.'
      default:
        return 'Your retainer needs attention, and closing compliance has not been submitted yet.'
    }
  }
  switch (d?.status) {
    case 'complete':
    case 'approved':
      return 'Compliance on this file is complete.'
    case 'in_review':
    case 'submitted':
      return 'Compliance on this file is submitted and under review. Payment processing starts once it is approved.'
    case 'incomplete':
    case 'rejected':
      return 'Compliance on this file is not complete yet. Payment processing starts once it clears.'
    default:
      return 'Compliance on this file has not been submitted yet. Payment processing starts once it is received and approved.'
  }
}

/**
 * The one thing the agent should click, chosen from what they actually owe.
 * Returns an empty string when there is nothing for them to do, so a file in
 * good order does not carry a call to action.
 */
export function complianceActionHtml(d: DerivedCompliance | undefined): string {
  // No derived record means no transaction, which means no compliance to owe.
  // Defaulting to silence rather than to a call to action keeps a future
  // caller that forgets to guard from sending an agent after paperwork that
  // does not exist.
  if (!d) return ''

  let href = ''
  let label = ''

  if (d.mode === 'retainer') {
    // The retainer is the only thing on file, so the next step is either
    // fixing it or moving on to closing compliance.
    if (d.status === 'complete') {
      href = COMPLIANCE_FORM_URL
      label = 'Submit Compliance'
    } else if (d.status !== 'in_review') {
      href = RETAINER_FORM_URL
      label = 'Resubmit Retainer'
    }
  } else if (
    d.status === 'complete' ||
    d.status === 'approved' ||
    d.status === 'in_review' ||
    d.status === 'submitted'
  ) {
    // Nothing owed, including a historical deal whose completion came from a
    // stored date rather than a submission. A file in good order should not
    // carry a call to action.
    href = ''
  } else if (d.sides.length < d.expected) {
    // Incomplete because a side has not filed, not because a filed side was
    // rejected. Sending this agent to the recheck flow would imply their
    // paperwork came back with problems when none of it has been seen.
    href = COMPLIANCE_FORM_URL
    label = 'Submit Compliance'
  } else {
    href = COMPLIANCE_RECHECK_URL
    label = 'Submit Compliance Recheck'
  }

  if (!href) return ''
  return emailButton(label, href)
}

/**
 * Per-side compliance for an agent-facing email. Lists every side that has
 * filed, and names a missing side explicitly rather than leaving its absence
 * to be inferred, because on an intermediary deal the side that has not filed
 * is the one holding up payment and it files no row to be found.
 *
 * Returns the inner HTML for one paragraph, or an empty string when there is
 * nothing honest to list.
 */
export function complianceSidesHtml(d: DerivedCompliance | undefined): string {
  if (!d || d.sides.length === 0) return ''
  const rows = d.sides.map(s => `<strong>${s.label}:</strong> ${s.status}`)
  // A retainer is one submission for one deal, not one of two sides, so the
  // missing-side padding does not apply to it.
  if (d.mode !== 'retainer') {
    for (let i = d.sides.length; i < d.expected; i++) {
      rows.push('<strong>Other side:</strong> not submitted')
    }
  }
  if (d.mode === 'retainer') {
    rows.push('<strong>Closing compliance:</strong> not submitted')
  }
  return `<p style="margin:0 0 12px;line-height:1.7;">${rows.join('<br>')}</p>`
}
