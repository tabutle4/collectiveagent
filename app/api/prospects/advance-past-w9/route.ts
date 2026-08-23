import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { advanceProspectPastW9 } from '@/lib/onboarding/w9'

export const dynamic = 'force-dynamic'

// Office action: advance a prospect past the W-9 step when their W-9 has been
// completed outside the app, or when there is no stored form id to check. The
// actual advance - user flags, session step, TREC office email, agent "almost
// there" email - lives in the SHARED helper in lib/onboarding/w9.ts.
//
// This is the MANUAL path, and it is no longer the only one: the onboarding
// tracker's check_w9_status action reads the live Avalara form state and
// calls the same helper when Avalara reports a form signed. Both paths go
// through advanceProspectPastW9; neither duplicates it.
//
// Both UI entry points here (the onboarding tracker and /admin/prospects/[id])
// confirm in a dialog before calling, because this sends two emails.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const { prospect_id } = await request.json()

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 })
    }

    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, email, mls_choice, status, w9_signed_at, license_number')
      .eq('id', prospect_id)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }
    // Allow prospect OR active: existing agents converting to Referral are
    // 'active' while mid-onboarding (verify route allows both), and the widget
    // path (complete-w9) has no status gate. Only block users who are neither.
    if (prospect.status !== 'prospect' && prospect.status !== 'active') {
      return NextResponse.json({ error: 'User is not in onboarding' }, { status: 400 })
    }

    const result = await advanceProspectPastW9(prospect)

    return NextResponse.json({
      success: true,
      next_step: result.nextStep,
      email_sent: result.emailSent,
      office_email_sent: result.officeEmailSent,
    })
  } catch (error: any) {
    console.error('advance-past-w9 error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
