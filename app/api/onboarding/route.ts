import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'
import { Resend } from 'resend'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()

    const [agentsRes, itemsRes, completionsRes, adminTasksRes, adminCompletionsRes] =
      await Promise.all([
        supabase
          .from('users')
          .select(
            'id, first_name, last_name, preferred_first_name, preferred_last_name, email, status, full_nav_access, onboarding_fee_paid, accepted_trec, independent_contractor_agreement_signed, w9_completed'
          )
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
      users: agentsRes.data || [],
      checklistItems: itemsRes.data || [],
      checklistCompletions: completionsRes.data || [],
      adminTasks: adminTasksRes.data || [],
      adminTaskCompletions: adminCompletionsRes.data || [],
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()
    const adminId = session.user.id
    const body = await request.json()
    const { action } = body

    // Page sends: toggle_checklist, { user_id, checklist_item_id, completing }
    if (action === 'toggle_checklist') {
      const { user_id, checklist_item_id, completing } = body
      if (completing) {
        await supabase
          .from('onboarding_checklist_completions')
          .insert({ user_id, checklist_item_id, completed_by: adminId })
      } else {
        await supabase
          .from('onboarding_checklist_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('checklist_item_id', checklist_item_id)
      }
      return NextResponse.json({ success: true })
    }

    // Page sends: toggle_admin_task, { user_id, task_id, completing }
    if (action === 'toggle_admin_task') {
      const { user_id, task_id, completing } = body
      if (completing) {
        await supabase
          .from('onboarding_admin_task_completions')
          .insert({ user_id, task_id, completed_by: adminId })
      } else {
        await supabase
          .from('onboarding_admin_task_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('task_id', task_id)
      }
      return NextResponse.json({ success: true })
    }

    // Page sends: update_task_notes, { user_id, task_id, notes }
    if (action === 'update_task_notes') {
      const { user_id, task_id, notes } = body
      await supabase
        .from('onboarding_admin_task_completions')
        .update({ notes })
        .eq('user_id', user_id)
        .eq('task_id', task_id)
      return NextResponse.json({ success: true })
    }

    // Page sends: update_user, { user_id, updates } — used for pre-access step toggles
    if (action === 'update_user') {
      const { user_id, updates } = body
      await supabase.from('users').update(updates).eq('id', user_id)
      return NextResponse.json({ success: true })
    }

    // Page sends: toggle_nav_access, { user_id, current }
    if (action === 'toggle_nav_access') {
      const { user_id, current } = body
      await supabase.from('users').update({ full_nav_access: !current }).eq('id', user_id)

      // When granting access (not revoking), all setup is confirmed done — send the task reminder
      if (!current) {
        const { data: agent } = await supabase
          .from('users')
          .select('first_name, last_name, preferred_first_name, preferred_last_name, email')
          .eq('id', user_id)
          .single()

        if (agent) {
          const agentName = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
          await resend.emails.send({
            from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
            to: 'office@collectiverealtyco.com',
            subject: `Action Required: Send Welcome Emails for ${agentName}`,
            html: getEmailLayout(
              `<p style="margin:0 0 14px;font-size:14px;color:${EMAIL_COLORS.bodyText};">Full app access has been granted to <strong style="color:${EMAIL_COLORS.headingText};">${agentName}</strong>. All accounts and documents are in place.</p>
              <p style="margin:0 0 12px;font-size:14px;color:${EMAIL_COLORS.bodyText};">The final step is to send their welcome and onboarding emails:</p>
              <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};padding-left:16px;border-left:3px solid ${EMAIL_COLORS.accent};">Complete the <strong>New Agent Automated Onboarding Emails</strong> form in Power Automate</p>
              <p style="margin:0;font-size:12px;color:${EMAIL_COLORS.lightText};">Agent email: ${agent.email}</p>`,
              { title: 'Send Welcome Emails', preheader: `Final step for ${agentName}` }
            ),
          }).catch((e: unknown) => console.error('Failed to send welcome email reminder:', e))
        }
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
