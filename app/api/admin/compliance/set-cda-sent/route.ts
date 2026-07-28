import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/admin/compliance/set-cda-sent
// Body: { submission_id, sent: boolean }
//
// Manual override for a CDA that went to title OUTSIDE the app -- emailed from
// a mailbox, handed over at closing, whatever. It does NOT touch cda_status,
// so the in-app detection (cda_status = 'sent', set when the app sends the CDA
// itself) keeps working independently. The Needs CDA tab treats a deal as sent
// when EITHER signal is present, so marking by hand can only ever add the
// flag, never erase a real in-app send.
//
// Clearing the override (sent: false) only clears the manual mark. If the app
// actually sent the CDA, the deal stays flagged as sent on the strength of
// cda_status alone -- which is correct, because it really was sent.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { submission_id } = body
    const sent = body.sent === true

    if (!submission_id) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
    }

    // SELECT before UPDATE: confirm the submission exists and is linked.
    const { data: sub } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, transaction_id, data')
      .eq('id', submission_id)
      .maybeSingle()

    if (!sub || (sub.data?.submission_mode || '') !== 'compliance') {
      return NextResponse.json({ error: 'Compliance submission not found' }, { status: 404 })
    }
    if (!sub.transaction_id) {
      return NextResponse.json({ error: 'Link a transaction before marking the CDA sent' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const { error: txnErr } = await supabaseAdmin
      .from('transactions')
      .update({
        cda_sent_manual_at: sent ? now : null,
        cda_sent_manual_by: sent ? auth.user.id : null,
        updated_at: now,
      })
      .eq('id', sub.transaction_id)
    if (txnErr) throw txnErr

    return NextResponse.json({ success: true, cda_sent_manual_at: sent ? now : null })
  } catch (err: any) {
    console.error('set-cda-sent error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
