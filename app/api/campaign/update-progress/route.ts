import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const { campaign_id, user_id, token, step } = await request.json()

    // Verify token matches user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('id', user_id)
      .eq('campaign_token', token)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    // Update or create campaign recipient record
    const stepField = `step_${step}_completed_at`
    const updateData: any = {
      [stepField]: new Date().toISOString(),
      current_step: step,
    }

    // Check if record exists
    const { data: existing } = await supabase
      .from('campaign_recipients')
      .select('id')
      .eq('campaign_id', campaign_id)
      .eq('user_id', user_id)
      .single()

    if (existing) {
      // Update existing
      await supabase.from('campaign_recipients').update(updateData).eq('id', existing.id)
    } else {
      // Create new
      await supabase.from('campaign_recipients').insert({
        campaign_id,
        user_id,
        ...updateData,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update progress error:', error)
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }
}
