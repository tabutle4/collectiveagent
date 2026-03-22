import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const { campaign_id } = await request.json()

    // Get all active licensed agents without campaign tokens
    const { data: agents, error } = await supabase
      .from('users')
      .select('id, email, first_name, last_name')
      .eq('is_active', true)
      .eq('is_licensed_agent', true)
      .is('campaign_token', null)

    if (error) throw error

    if (!agents || agents.length === 0) {
      return NextResponse.json({ message: 'All agents already have tokens' })
    }

    // Generate tokens for each agent
    const updates = agents.map(agent => ({
      id: agent.id,
      campaign_token: crypto.randomBytes(16).toString('hex'),
    }))

    // Update all agents with tokens
    for (const update of updates) {
      await supabase
        .from('users')
        .update({ campaign_token: update.campaign_token })
        .eq('id', update.id)
    }

    // Create campaign_recipients records for each agent
    const recipients = updates.map(update => ({
      campaign_id,
      user_id: update.id,
      current_step: 0,
    }))

    await supabase
      .from('campaign_recipients')
      .upsert(recipients, { onConflict: 'campaign_id,user_id' })

    return NextResponse.json({
      success: true,
      count: updates.length,
      message: `Generated tokens for ${updates.length} agents`,
    })
  } catch (error) {
    console.error('Generate tokens error:', error)
    return NextResponse.json({ error: 'Failed to generate tokens' }, { status: 500 })
  }
}
