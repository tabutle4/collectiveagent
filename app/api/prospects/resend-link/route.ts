import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { sendProspectWelcomeEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_all_agents')
  if (auth.error) return auth.error

  try {
    const { prospect_id } = await request.json()
    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 })
    }

    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('preferred_first_name, email, campaign_token, status')
      .eq('id', prospect_id)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    if (prospect.status !== 'prospect') {
      return NextResponse.json({ error: 'User is no longer a prospect' }, { status: 400 })
    }

    if (!prospect.campaign_token) {
      return NextResponse.json({ error: 'No onboarding token found for this prospect' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const joinLink = `${appUrl}/onboard/${prospect.campaign_token}`

    await sendProspectWelcomeEmail({
      preferred_first_name: prospect.preferred_first_name,
      email: prospect.email,
      join_link: joinLink,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Resend link error:', error)
    return NextResponse.json({ error: error.message || 'Failed to resend link' }, { status: 500 })
  }
}