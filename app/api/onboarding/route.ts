import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()

    const [usersRes, itemsRes, completionsRes, tasksRes, taskCompletionsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, status, full_nav_access, onboarding_fee_paid, accepted_trec, independent_contractor_agreement_signed, w9_completed')
        .eq('status', 'active')
        .order('first_name'),
      supabase
        .from('onboarding_checklist_items')
        .select('id, section, section_title, item_key, label, priority, display_order')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('onboarding_checklist_completions')
        .select('user_id, checklist_item_id, completed_at, completed_by'),
      supabase
        .from('onboarding_admin_tasks')
        .select('id, label, display_order')
        .eq('is_active', true)
        .order('display_order'),
      supabase
        .from('onboarding_admin_task_completions')
        .select('user_id, task_id, completed_at, completed_by, notes'),
    ])

    return NextResponse.json({
      users: usersRes.data || [],
      checklistItems: itemsRes.data || [],
      checklistCompletions: completionsRes.data || [],
      adminTasks: tasksRes.data || [],
      adminTaskCompletions: taskCompletionsRes.data || [],
    })
  } catch (err: any) {
    console.error('Onboarding GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const body = await request.json()
    const { action } = body
    const supabase = createClient()

    if (action === 'toggle_checklist') {
      const { user_id, checklist_item_id, completing } = body
      if (completing) {
        const { error } = await supabase
          .from('onboarding_checklist_completions')
          .insert({ user_id, checklist_item_id, completed_by: session.user.id })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('onboarding_checklist_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('checklist_item_id', checklist_item_id)
        if (error) throw error
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'toggle_admin_task') {
      const { user_id, task_id, completing } = body
      if (completing) {
        const { error } = await supabase
          .from('onboarding_admin_task_completions')
          .insert({ user_id, task_id, completed_by: session.user.id })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('onboarding_admin_task_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('task_id', task_id)
        if (error) throw error
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'update_task_notes') {
      const { user_id, task_id, notes } = body
      const { error } = await supabase
        .from('onboarding_admin_task_completions')
        .update({ notes })
        .eq('user_id', user_id)
        .eq('task_id', task_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'update_user') {
      const { user_id, updates } = body
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', user_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'toggle_nav_access') {
      const { user_id, current } = body
      const { error } = await supabase
        .from('users')
        .update({ full_nav_access: !current })
        .eq('id', user_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Onboarding POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}