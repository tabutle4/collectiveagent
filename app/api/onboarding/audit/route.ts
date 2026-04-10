import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// GET - Get signing audit trail for a user (admin only)
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Get user info
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, mls_choice')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get signing events from document_signing_events
    const { data: signingEvents, error: eventsError } = await supabaseAdmin
      .from('document_signing_events')
      .select('id, signer_type, signer_name, document_type, document_subtype, pdf_url, ip_address, user_agent, is_final_version, signed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (eventsError) {
      console.error('Failed to fetch signing events:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch signing events' }, { status: 500 })
    }

    const isReferralAgent = user.mls_choice === 'Referral Collective (No MLS)'

    return NextResponse.json({
      success: true,
      user: {
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        isReferralAgent,
      },
      signingEvents: signingEvents || [],
    })
  } catch (error: any) {
    console.error('Audit trail error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch audit trail' }, { status: 500 })
  }
}