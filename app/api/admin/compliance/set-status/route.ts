import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

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

    if (!sub || (sub.data?.submission_mode || '') !== 'compliance') {
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
    if (sub.transaction_id) {
      const { data: allSides } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, status, reviewed_at')
        .eq('transaction_id', sub.transaction_id)
        .filter('data->>submission_mode', 'eq', 'compliance')
      const statuses = (allSides || []).map((s: any) => (s.id === submission_id ? status : s.status))
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
          .update({ compliance_status: derived, updated_at: nowIso })
          .eq('id', sub.transaction_id)
      }

      // This page is the source of truth for compliance, so it also owns the
      // compliance_complete_date on the deal's checks. That date is what the
      // payouts report and the transaction detail page use to compute the
      // agent pay-by deadline, so it must never disagree with what Leah set
      // here. A deal counts as complete only when every side is complete, and
      // the completion date is the latest side's date.
      const completeDate = (() => {
        if (derived !== 'complete') return null
        const dates = (allSides || [])
          .map((sd: any) => (sd.id === submission_id ? patch.reviewed_at : sd.reviewed_at))
          .filter(Boolean)
          .map((d: string) => String(d).slice(0, 10))
          .sort()
        return dates.length ? dates[dates.length - 1] : null
      })()
      await supabaseAdmin
        .from('checks_received')
        .update({ compliance_complete_date: completeDate, updated_at: nowIso })
        .eq('transaction_id', sub.transaction_id)
    }

    return NextResponse.json({ success: true, status, completed_at: patch.reviewed_at || null })
  } catch (err: any) {
    console.error('compliance set-status error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
