import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { insertSystemNote } from '@/lib/agent-email'
import { requireCronSecret } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET - Cron endpoint that scans for stale assignments and reverts them.
//
// A thread is "stale" when:
//   - It has an assignee (assigned_to_user_id NOT NULL), and
//   - Status is 'new' or 'in_progress' (not closed, not waiting), and
//   - The thread's updated_at is older than 48 hours.
//
// updated_at is bumped by any assignee action: reply, note, tag, status
// change, reassign, escalate, close, reopen. It is also bumped by an
// inbound agent reply (the webhook updates it). So if either side is
// still moving, the clock never runs out. Only true silence for 48h
// triggers the revert.
//
// On revert:
//   - assigned_to_user_id -> null
//   - status -> 'new'
//   - system note explaining why
//   - updated_at bumped to now (so the same thread isn't re-processed
//     until a new assignment lapses)
//
// Runs hourly (see vercel.json). Authenticated with CRON_SECRET only.
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const cutoffIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    const nowIso = new Date().toISOString()

    // Fetch every assigned, non-closed thread with updated_at older than
    // the cutoff. Uses fetchAllRows to bypass the 1000-row default cap
    // even though we expect small counts in practice.
    const stale = await fetchAllRows<{
      id: string
      assigned_to_user_id: string
      status: string
      updated_at: string
    }>('email_threads', 'id, assigned_to_user_id, status, updated_at', {
      filters: [
        { type: 'in', column: 'status', value: ['new', 'in_progress'] },
        { type: 'not', column: 'assigned_to_user_id', value: null },
        { type: 'lte', column: 'updated_at', value: cutoffIso },
      ],
    })

    let reverted = 0
    const errors: Array<{ threadId: string; message: string }> = []

    for (const thread of stale) {
      try {
        const { error } = await supabaseAdmin
          .from('email_threads')
          .update({
            assigned_to_user_id: null,
            waiting_on_user_id: null,
            status: 'new',
            updated_at: nowIso,
          })
          .eq('id', thread.id)
        if (error) throw error

        await insertSystemNote(
          thread.id,
          'This thread went back to the New bucket after 48 hours with no activity from the assignee. Anyone can pick it up.'
        )
        reverted += 1
      } catch (err: any) {
        errors.push({ threadId: thread.id, message: err?.message || String(err) })
      }
    }

    return NextResponse.json({
      success: true,
      report: {
        ranAt: nowIso,
        cutoffIso,
        candidateCount: stale.length,
        reverted,
        errors,
      },
    })
  } catch (err: any) {
    console.error('agent-email-stale-assignments cron error:', err)
    return NextResponse.json(
      { error: err?.message || 'Stale assignment sweep failed' },
      { status: 500 }
    )
  }
}
