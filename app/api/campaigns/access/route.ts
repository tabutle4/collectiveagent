import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This route is PUBLIC - agents access it via their campaign token link
// No auth required - the token itself is the authentication
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get('slug')
    const token = searchParams.get('token')

    if (!slug || !token) {
      return NextResponse.json(
        { error: 'Invalid campaign link. Please use the link from your email.' },
        { status: 400 }
      )
    }

    const supabase = createClient()

    // Fetch campaign by slug
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found or is no longer active.' },
        { status: 404 }
      )
    }

    // Verify token and get user data
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('campaign_token', token)
      .eq('is_active', true)
      .eq('is_licensed_agent', true)
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Invalid or expired campaign link.' },
        { status: 401 }
      )
    }

    // Strip sensitive fields from user
    const { password_hash, reset_token, reset_token_expires, ...safeUser } = user

    return NextResponse.json({ campaign, user: safeUser })
  } catch (error: any) {
    console.error('Campaign access error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}