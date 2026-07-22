import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

export const dynamic = 'force-dynamic'

// POST /api/admin/compliance/set-closing-date
// Body: { submission_id, closing_date }  (closing_date is 'YYYY-MM-DD' or null)
// Two-way sync of the closing date between the compliance tracker and the deal.
// The transaction is the source of truth, so we write the date there:
//   - lease: move_in_date is the real date; we set it plus closing_date in
//     lockstep, matching what the transaction editor does (some agent-side
//     queries fall back to closing_date when move_in_date is null).
//   - sale:  closing_date only.
// We also mirror the value onto the submission's own closing_or_movein_date so
// the two never drift. Uses can_review_compliance, the same permission the
// tracker itself uses, so a reviewer can correct the date from the tracker.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { submission_id } = body
    // Normalise: an empty string clears the date.
    const closingDate: string | null =
      body.closing_date === '' || body.closing_date === undefined ? null : body.closing_date

    if (!submission_id) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
    }

    // SELECT before UPDATE: confirm the submission exists and is a compliance one.
    const { data: sub } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, transaction_id, data')
      .eq('id', submission_id)
      .maybeSingle()

    if (!sub || (sub.data?.submission_mode || '') !== 'compliance') {
      return NextResponse.json({ error: 'Compliance submission not found' }, { status: 404 })
    }
    if (!sub.transaction_id) {
      return NextResponse.json({ error: 'Link a transaction before setting the closing date' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    // Determine lease vs sale from the transaction's type.
    const { data: txn } = await supabaseAdmin
      .from('transactions')
      .select('id, transaction_type')
      .eq('id', sub.transaction_id)
      .maybeSingle()
    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }
    const isLease = isLeaseTransactionType(txn.transaction_type)

    const txnPatch: Record<string, any> = { closing_date: closingDate, updated_at: nowIso }
    if (isLease) txnPatch.move_in_date = closingDate

    const { error: txnErr } = await supabaseAdmin
      .from('transactions')
      .update(txnPatch)
      .eq('id', sub.transaction_id)
    if (txnErr) throw txnErr

    // Mirror onto the submission so the tracker's form data stays consistent.
    const newData = { ...(sub.data || {}), closing_or_movein_date: closingDate }
    const { error: subErr } = await supabaseAdmin
      .from('agent_form_submissions')
      .update({ data: newData, updated_at: nowIso })
      .eq('id', submission_id)
    if (subErr) throw subErr

    return NextResponse.json({ success: true, closing_date: closingDate })
  } catch (err: any) {
    console.error('set-closing-date error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
