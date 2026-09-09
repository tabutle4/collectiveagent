// lib/compliance/sideLock.ts
//
// When one side of a deal stops accepting agent-driven changes.
//
// A locked side does NOT reject the agent's submission. The filing is always
// recorded and the office is always emailed; what the lock stops is the deal's
// own data - price, gross commission, dates, BTSA, bonus, rebate, referral fees
// and the cascade - being rewritten underneath a review that has already
// happened.
//
// Two ways a side locks (Tara's rule, Sep 9 2026):
//
//   1. The side's compliance submission is COMPLETE. The office signed it off.
//      Only the office moves it back, so reopening the checklist does NOT
//      release this one.
//
//   2. The side has been FILED at all (submitted, in_review or incomplete) AND
//      the deal's checklist is complete. Once the office has worked the
//      checklist, the numbers under it stop moving.
//
//      This one is releasable on purpose: un-tick any checklist item and the
//      side unlocks, so an agent can send the correction Leah asked for on a
//      side she marked incomplete. The checklist is the release valve.
//
// Locking is per SIDE, keyed on canonicalSide, so a side approved as `buyer`
// also locks a refile arriving as `nc_buyer`. The checklist half is per DEAL -
// there is one checklist per transaction, not one per side - so on an
// intermediary deal a complete checklist arms condition 2 for both sides, and
// each still needs its own filing before it locks.
import { supabaseAdmin } from '@/lib/supabase'
import { canonicalSide } from '@/lib/compliance/derive'
import { isLeaseType } from '@/lib/transactions/cascade'

export type SideLockReason = 'side_complete' | 'checklist_complete'

/**
 * Is every active item on this deal's checklist ticked?
 *
 * The rule is copied from the payouts report deliberately, including the
 * `length > 0` test: a template with no active items is NOT complete, or every
 * deal would read complete the moment a template was emptied. Leases measure
 * against the 'payouts' template, sales against 'cda', chosen with the same
 * `isLeaseType` call the report makes so a deal can never be complete on one
 * screen and pending on another.
 *
 * NOTE: three other places compute this inline (the payouts report,
 * lib/dashboard/needsAttention.ts and the compliance tracker). They are left
 * alone here rather than migrated, because they work and this patch is not the
 * place to touch them. Worth unifying later.
 */
async function isChecklistComplete(
  transactionId: string,
  transactionType: string | null | undefined
): Promise<boolean> {
  const slug = isLeaseType(String(transactionType || '')) ? 'payouts' : 'cda'

  const { data: template } = await supabaseAdmin
    .from('checklist_templates')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!template?.id) return false

  const { data: items } = await supabaseAdmin
    .from('checklist_items')
    .select('id')
    .eq('checklist_template_id', template.id)
    .eq('is_active', true)
  const required = (items || []).map((i: any) => i.id)
  if (required.length === 0) return false

  const { data: done } = await supabaseAdmin
    .from('checklist_completions')
    .select('checklist_item_id')
    .eq('transaction_id', transactionId)
  const ticked = new Set((done || []).map((d: any) => d.checklist_item_id))

  return required.every((id: string) => ticked.has(id))
}

/**
 * Does the deal have ANY compliance side already signed off?
 *
 * A different question from getSideLock, which asks about ONE side. This one
 * decides whether a new filing may stamp the deal's compliance_status: once any
 * side is complete, the status belongs to the derivation and the set-status
 * route, not to a fresh submission. Without it, the second side filing on an
 * intermediary deal knocks the first side's sign-off back to 'submitted'.
 */
export async function hasAnyCompleteSide(transactionId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('agent_form_submissions')
    .select('id')
    .eq('transaction_id', transactionId)
    .eq('status', 'complete')
    .filter('data->>submission_mode', 'eq', 'compliance')
    .limit(1)
  return (data || []).length > 0
}

/**
 * Whether the given side of the deal is locked, and why.
 *
 * `reason` is null when unlocked. It is carried onto the recorded submission as
 * `locked_reason` and into the office email, so whoever reads the alert can tell
 * a signed-off side from a checklist-armed one without opening the deal.
 *
 * A side with no `representing` answer at all cannot be identified, so it never
 * locks - same as the behaviour this replaces.
 */
export async function getSideLock(opts: {
  transactionId: string
  transactionType: string | null | undefined
  representing: string | null | undefined
}): Promise<{ locked: boolean; reason: SideLockReason | null }> {
  const side = canonicalSide(opts.representing)
  if (!side) return { locked: false, reason: null }

  // Every compliance submission on the deal, not just the complete ones: the
  // second condition needs to know the side was filed at all.
  const { data: rows } = await supabaseAdmin
    .from('agent_form_submissions')
    .select('status, data')
    .eq('transaction_id', opts.transactionId)
    .filter('data->>submission_mode', 'eq', 'compliance')

  const thisSideRows = (rows || []).filter(
    (r: any) => canonicalSide(r?.data?.representing) === side
  )
  if (thisSideRows.length === 0) return { locked: false, reason: null }

  // Condition 1: signed off. Not releasable by the checklist.
  if (thisSideRows.some((r: any) => String(r.status || '') === 'complete')) {
    return { locked: true, reason: 'side_complete' }
  }

  // Condition 2: filed, and the office has finished the checklist. Releasable
  // by un-ticking any item.
  if (await isChecklistComplete(opts.transactionId, opts.transactionType)) {
    return { locked: true, reason: 'checklist_complete' }
  }

  return { locked: false, reason: null }
}
