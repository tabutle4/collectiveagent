import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    // Fetch campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', resolvedParams.id)
      .single()

    if (campaignError) throw campaignError

    // Fetch stats via RPC
    const { data: statsData } = await supabase.rpc('get_campaign_completion_stats', {
      campaign_uuid: resolvedParams.id,
    })

    const stats = statsData && statsData.length > 0 ? statsData[0] : null

    // Fetch all active agents with their campaign data
    const { data: agentsData } = await supabase
      .from('users')
      .select(`
        id,
        first_name,
        last_name,
        preferred_first_name,
        preferred_last_name,
        email,
        campaign_token,
        commission_plan,
        commission_plan_other,
        campaign_recipients(
          current_step,
          step_1_completed_at,
          step_2_completed_at,
          step_3_completed_at,
          step_4_completed_at,
          fully_completed_at,
          campaign_id
        ),
        campaign_responses(
          commission_plan_2026,
          commission_plan_2026_other,
          attending_luncheon,
          luncheon_comments,
          support_rating,
          support_improvements,
          work_preference,
          profile_updates,
          campaign_id
        )
      `)
      .eq('is_active', true)
      .eq('is_licensed_agent', true)

    // Filter to only this campaign's data
    const agents = (agentsData || []).map(agent => ({
      ...agent,
      campaign_recipients: agent.campaign_recipients?.filter(
        (cr: any) => cr.campaign_id === resolvedParams.id
      ) || [],
      campaign_responses: agent.campaign_responses?.filter(
        (cr: any) => cr.campaign_id === resolvedParams.id
      ) || [],
    }))

    // Fetch RSVPs
    const { data: rsvps } = await supabase
      .from('campaign_responses')
      .select(`
        *,
        users!inner(
          first_name,
          last_name,
          preferred_first_name,
          preferred_last_name,
          email
        )
      `)
      .eq('campaign_id', resolvedParams.id)
      .not('attending_luncheon', 'is', null)

    // Fetch survey responses
    const { data: surveys } = await supabase
      .from('campaign_responses')
      .select(`
        *,
        users!inner(
          first_name,
          last_name,
          preferred_first_name,
          preferred_last_name,
          email
        )
      `)
      .eq('campaign_id', resolvedParams.id)
      .not('support_rating', 'is', null)

    return NextResponse.json({
      campaign,
      stats,
      agents,
      rsvps: rsvps || [],
      surveys: surveys || [],
    })
  } catch (error: any) {
    console.error('Error fetching campaign detail:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()
    const updates = await request.json()

    const { error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating campaign:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } | Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const resolvedParams = params instanceof Promise ? await params : params
    const supabase = createClient()

    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true, message: 'Campaign deleted successfully' })
  } catch (error: any) {
    console.error('Delete campaign error:', error)
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }
}