import { supabaseAdmin } from '@/lib/supabase'
import { SIDE_MODES_FILTER, pickSideSubmissions } from '@/lib/compliance/derive'

/**
 * Keep checks_received.compliance_complete_date in step with the compliance
 * submissions for a deal.
 *
 * That date is what the payouts report and the transaction detail page use to
 * compute the agent pay-by deadline, so it has to follow the compliance
 * sign-off no matter which screen the sign-off happened on. There are three
 * ways compliance gets marked: the compliance tracker's status dropdown, the
 * compliance review email, and approving or rejecting documents. All three
 * call this, so they can never drift apart.
 *
 * A deal counts as complete only when every side is complete, and the date is
 * the latest side's completion date. Anything less than fully complete clears
 * the date, so a pay-by deadline can never outlive its sign-off.
 *
 * Pass clearWhenNoSides when the caller has just removed the deal's last side,
 * so a deal that drops to zero submissions has its dates cleared rather than
 * left standing.
 */
export async function syncCheckComplianceDate(
  transactionId: string,
  options: { clearWhenNoSides?: boolean } = {}
): Promise<string | null> {
  if (!transactionId) return null

  const { data: sideRows } = await supabaseAdmin
    .from('agent_form_submissions')
    .select('id, status, reviewed_at, data')
    .eq('transaction_id', transactionId)
    .filter('data->>submission_mode', 'in', SIDE_MODES_FILTER)

  // A retainer deal has no compliance submission, so its retainer is the side.
  // Once converted, pickSideSubmissions drops it and only compliance counts.
  const sides = pickSideSubmissions(sideRows || [])

  // No sides at all: legacy or non-compliance deal. Leave whatever is on the
  // checks alone rather than clearing a hand-entered date.
  //
  // clearWhenNoSides inverts that for the one caller that has just taken the
  // deal's last side away. There the empty result is not "we know nothing about
  // this deal", it is "this deal no longer has a sign-off", and a pay-by date
  // must not outlive it. Only the unlink path passes it; every other caller
  // keeps the protective default.
  if (sides.length === 0) {
    if (!options.clearWhenNoSides) return null
    await supabaseAdmin
      .from('checks_received')
      .update({ compliance_complete_date: null, updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)
    return null
  }

  const allComplete = sides.every((s: any) => s.status === 'complete')
  const completeDate = allComplete
    ? (sides
        .map((s: any) => s.reviewed_at)
        .filter(Boolean)
        .map((d: string) => String(d).slice(0, 10))
        .sort()
        .pop() || null)
    : null

  await supabaseAdmin
    .from('checks_received')
    .update({ compliance_complete_date: completeDate, updated_at: new Date().toISOString() })
    .eq('transaction_id', transactionId)

  return completeDate
}