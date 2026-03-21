import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')
    const campaignId = searchParams.get('campaign_id')

    if (!token || !campaignId) {
      return NextResponse.json({ error: 'Token and campaign_id are required' }, { status: 400 })
    }

    // Verify token and get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('campaign_token', token)
      .eq('is_active', true)
      .eq('is_licensed_agent', true)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired campaign link' }, { status: 404 })
    }

    // Get campaign responses
    const { data: response } = await supabase
      .from('campaign_responses')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single()

    // Get completion status
    const { data: recipient } = await supabase
      .from('campaign_recipients')
      .select('fully_completed_at, current_step')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .single()

    return NextResponse.json({
      response: response || null,
      isComplete: !!recipient?.fully_completed_at,
      currentStep: recipient?.current_step || 0,
    })
  } catch (error) {
    console.error('Get responses error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
