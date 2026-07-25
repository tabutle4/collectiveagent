import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/admin/compliance/set-funding-status
// Body: { submission_id, funding_status }  (funding_status is one of the
// FUNDING_STATUSES below, or null to clear)
// The Needs CDA tab mirrors the Brokermint CDA report, where funding status
// is workflow state the office advances by hand (wire form sent -> wired /
// check received -> funded). Nothing else in the app writes this column, so
// this is its one writer. Same permission as the rest of the tracker.
const FUNDING_STATUSES = ['wire_form_sent', 'wire', 'check', 'funded']

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { submission_id } = body
    const fundingStatus: string | null =
      body.funding_status === '' || body.funding_status === undefined ? null : body.funding_status

    if (!submission_id) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
    }
    if (fundingStatus !== null && !FUNDING_STATUSES.includes(fundingStatus)) {
      return NextResponse.json({ error: 'Invalid funding status' }, { status: 400 })
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
      return NextResponse.json({ error: 'Link a transaction before setting the funding status' }, { status: 400 })
    }

    const { error: txnErr } = await supabaseAdmin
      .from('transactions')
      .update({ funding_status: fundingStatus, updated_at: new Date().toISOString() })
      .eq('id', sub.transaction_id)
    if (txnErr) throw txnErr

    return NextResponse.json({ success: true, funding_status: fundingStatus })
  } catch (err: any) {
    console.error('set-funding-status error:', err)
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 })
  }
}
