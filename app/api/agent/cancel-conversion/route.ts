import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Require authenticated user
    const authResult = await requireAuth(request)
    if ('error' in authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = authResult.user.id

    // Get current user data
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, status, mls_choice')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if they're in the middle of a referral conversion
    if (user.status !== 'prospect' || user.mls_choice !== 'Referral Collective (No MLS)') {
      return NextResponse.json({ error: 'No active conversion to cancel' }, { status: 400 })
    }

    // Get the onboarding session to find their original MLS choice
    const { data: session } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('previous_mls_choice')
      .eq('user_id', userId)
      .single()

    const originalMlsChoice = session?.previous_mls_choice || 'HAR' // Default to HAR if not stored

    // Revert the user back to active agent
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        status: 'active',
        mls_choice: originalMlsChoice,
        campaign_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (updateError) {
      console.error('Failed to revert user:', updateError)
      return NextResponse.json({ error: 'Failed to cancel conversion' }, { status: 500 })
    }

    // Delete the onboarding session
    await supabaseAdmin
      .from('onboarding_sessions')
      .delete()
      .eq('user_id', userId)

    return NextResponse.json({ 
      success: true, 
      message: 'Conversion cancelled. You are back to your original agent status.',
      restoredMlsChoice: originalMlsChoice,
    })
  } catch (error: any) {
    console.error('Cancel conversion error:', error)
    return NextResponse.json({ error: error.message || 'Failed to cancel conversion' }, { status: 500 })
  }
}
