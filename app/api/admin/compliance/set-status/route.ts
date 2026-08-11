import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { syncCheckComplianceDate } from '@/lib/compliance/syncCheckComplianceDate'
import { SIDE_MODES_FILTER, pickSideSubmissions } from '@/lib/compliance/derive'

export const dynamic = 'force-dynamic'

const ALLOWED_STATUSES = ['submitted', 'in_review', 'complete', 'incomplete'] as const
type AllowedStatus = (typeof ALLOWED_STATUSES)[number]

// POST /api/admin/compliance/set-status
// Body: { submission_id, status, completed_at?, missing_notes? }
// Leah sets a side's compliance status from the tracker. The submission is the
// source of truth: status lives on it, missing items in admin_notes, the
// completed date in reviewed_at. The transaction's compliance_status is then
// dual-written as the worst status across the deal's sides so legacy readers
// stay correct during rollout.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { submission_id, status, completed_at, missing_notes } = body

    if (!submission_id) {
      return NextResponse.json({ error: 'submission_id is required' }, { status: 400 })
    }
    if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
      return NextResponse.json({ error: `status must be one of: ${ALLOWED_STATUSES.join(', ')}` }, { status: 400 })
    }

    // SELECT before UPDATE: confirm the submission exists and is a compliance one.
    const { data: sub } = await supabaseAdmin
      .from('agent_form_submissions')
      .select('id, transaction_id, status, data')
      .eq('id', submission_id)
      .maybeSingle()

    // Retainers are reviewable and, on a retainer-only deal, they are the side:
    // the sign-off derives the deal's compliance status and stamps the checks
    // exactly as a compliance side would. Once a real compliance submission
    // exists on the deal, pickSideSubmissions hands over and the retainer stops
    // contributing.
    const submissionMode = sub?.data?.submission_mode || ''
    if (!sub || !['compliance', 'retainer'].includes(submissionMode)) {
      return NextResponse.json({ error: 'Compliance submission not found' }, { status: 404 })
    }

    const nowIso = new Date().toISOString()
    const patch: Record<string, any> = {
      status,
      reviewed_by: auth.user!.id,
      updated_at: nowIso,
    }
    if (status === 'complete') {
      patch.reviewed_at = completed_at || nowIso
    } else {
      patch.reviewed_at = null
    }
    if (status === 'incomplete') {
      patch.admin_notes = typeof missing_notes === 'string' ? missing_notes : null
    } else if (status === 'complete') {
      patch.admin_notes = null
    }

    const { error: updErr } = await supabaseAdmin
      .from('agent_form_submissions')
      .update(patch)
      .eq('id', submission_id)

    if (updErr) throw updErr

    // Dual-write the transaction as the worst status across its sides.
    //
    // Retainers go through here too. On a retainer-only prospect the retainer
    // IS the side, so its sign-off derives transactions.compliance_status and
    // stamps the checks exactly as a compliance side would, which is what makes
    // a retainer read correctly on the payouts report and the transaction page
    // instead of sitting at not_submitted forever. pickSideSubmissions below is
    // what keeps that safe: the moment the prospect is converted and carries a
    // real compliance submission, the old retainer stops contributing, so a
    // stale submitted retainer cannot pin a fully reviewed deal at in_review.
    if (sub.transaction_id) {
      const { data: allSideRows } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, status, reviewed_at, data')
        .eq('transaction_id', sub.transaction_id)
        .filter('data->>submission_mode', 'in', SIDE_MODES_FILTER)
      // On a retainer-only deal the retainer is the side; once a real
      // compliance submission exists it takes over and the retainer stops.
      const allSides = pickSideSubmissions(allSideRows || [])
      const statuses = allSides.map((s: any) => (s.id === submission_id ? status : s.status))
      const derived = statuses.includes('incomplete')
        ? 'incomplete'
        : statuses.some((s: string) => s === 'in_review' || s === 'submitted')
          ? 'in_review'
          : statuses.length > 0 && statuses.every((s: string) => s === 'complete')
            ? 'complete'
            : null
      if (derived) {
        await supabaseAdmin
          .from('transactions')
          .update({
            compliance_status: derived,
            compliance_approved_at: derived === 'complete' ? (patch.reviewed_at || nowIso) : null,
            updated_at: nowIso,
          })
          .eq('id', sub.transaction_id)
      }

      // The pay-by deadline follows the sign-off, whichever screen it came from.
      await syncCheckComplianceDate(sub.transaction_id)
    }

    return NextResponse.json({ success: true, status, completed_at: patch.reviewed_at || null })
  } catch (err: any) {
    console.error('compliance set-status error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
