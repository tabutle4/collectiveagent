import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { verifyFollowUpToken } from '@/lib/prospects/followUpToken'

export const dynamic = 'force-dynamic'

/**
 * Public by way of the '/api/prospects' prefix in middleware PUBLIC_PATHS, and
 * validates its own token, same as the other public token routes.
 *
 * Appends the optional questions that used to sit on the prospective agent
 * form itself. The prospect record already exists and is already complete
 * before this route is ever called, so a failure here costs nothing except
 * the extra answers.
 */

const ANSWER_FIELDS = [
  'expectations',
  'accountability',
  'lead_generation',
  'additional_info',
] as const

// Generous, but bounded. These render on the prospect profile and in the CSV
// export, and nothing downstream expects an essay.
const MAX_ANSWER_LENGTH = 5000

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token : ''

    const prospectId = await verifyFollowUpToken(token)
    if (!prospectId) {
      return NextResponse.json({ error: 'This link is no longer valid' }, { status: 403 })
    }

    const { data: prospect } = await supabase
      .from('users')
      .select('id, status')
      .eq('id', prospectId)
      .maybeSingle()

    if (!prospect) {
      return NextResponse.json({ error: 'This link is no longer valid' }, { status: 403 })
    }

    // Only write while they are still a prospect. Once onboarding converts
    // them the answers are historical and an old emailed link should not be
    // able to overwrite an active agent's record.
    if (prospect.status !== 'prospect') {
      return NextResponse.json({ success: true, applied: false, reason: 'closed' })
    }

    const updates: Record<string, string> = {}
    for (const field of ANSWER_FIELDS) {
      const value = body[field]
      if (typeof value !== 'string') continue
      const trimmed = value.trim()
      if (!trimmed) continue
      updates[field] = trimmed.slice(0, MAX_ANSWER_LENGTH)
    }

    // Every question is optional, so an empty submission is a valid outcome
    // rather than an error. Nothing to write, nothing to report.
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: true, applied: false, reason: 'empty' })
    }

    const { error: updateError } = await supabase
      .from('users')
      .update(updates)
      .eq('id', prospectId)

    if (updateError) throw updateError

    return NextResponse.json({ success: true, applied: true })
  } catch (error) {
    console.error('Prospect follow-up error:', error)
    return NextResponse.json(
      { error: 'An error occurred while saving your answers' },
      { status: 500 }
    )
  }
}
