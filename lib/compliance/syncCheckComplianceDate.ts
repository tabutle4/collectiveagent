import { supabaseAdmin } from '@/lib/supabase'

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
 */
export async function syncCheckComplianceDate(transactionId: string): Promise<string | null> {
  if (!transactionId) return null

  const { data: sides } = await supabaseAdmin
    .from('agent_form_submissions')
    .select('id, status, reviewed_at')
    .eq('transaction_id', transactionId)
    .filter('data->>submission_mode', 'eq', 'compliance')

  // No compliance submissions: this is a legacy or non-compliance deal. Leave
  // whatever is on the checks alone rather than clearing a hand-entered date.
  if (!sides || sides.length === 0) return null

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