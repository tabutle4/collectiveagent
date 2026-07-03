import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/agent/referral-eligibility
// Returns { eligible: boolean } for the logged-in user. A referral (momentum)
// link should NOT be shown when any of these are true:
//   1. The user is Tara or Courtney (operators, not recruiting agents).
//      Detected by role: only 'agent' role is a recruiting agent here.
//   2. The user has no active license (is_licensed_agent is false or inactive).
//   3. The user is a Referral Collective agent (role 'referral' or the RC
//      mls_choice), since the momentum link is for recruiting into the brokerage.
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { data: me } = await supabaseAdmin
      .from('users')
      .select('id, role, is_licensed_agent, is_active, mls_choice')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (!me) {
      return NextResponse.json({ eligible: false })
    }

    const role = String(me.role || '').toLowerCase()

    // Exclusion 1: operators / non-agent roles (Tara = operations, Courtney = broker, etc.)
    const isRecruitingAgentRole = role === 'agent'

    // Exclusion 2: must be an active, licensed agent
    const hasActiveLicense = me.is_licensed_agent === true && me.is_active === true

    // Exclusion 3: Referral Collective agents are excluded
    const isReferralCollective =
      role === 'referral' || me.mls_choice === 'Referral Collective (No MLS)'

    const eligible = isRecruitingAgentRole && hasActiveLicense && !isReferralCollective

    return NextResponse.json({ eligible })
  } catch (err: any) {
    console.error('referral-eligibility error:', err)
    return NextResponse.json({ eligible: false })
  }
}
