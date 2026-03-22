import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailSection } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_complete_checklist_items')
  if (auth.error) return auth.error

  try {
    const { agent_id, item_name } = await request.json()

    if (!agent_id || !item_name) {
      return NextResponse.json({ error: 'agent_id and item_name are required' }, { status: 400 })
    }

    const { data: agent, error: agentError } = await supabaseAdmin
      .from('users')
      .select('id, preferred_first_name, preferred_last_name, first_name, last_name, email')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { data: allUsers } = await supabaseAdmin.from('users').select('id, email, roles')
    const adminUsers = (allUsers || []).filter((u: any) => u.role === 'Admin')

    if (adminUsers.length === 0) {
      return NextResponse.json({ message: 'No admin users found' })
    }

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('onboarding_checklist')
      .eq('id', agent_id)
      .single()

    const progress = calculateProgress(userData?.onboarding_checklist || {})

    const agentName =
      agent.preferred_first_name && agent.preferred_last_name
        ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
        : `${agent.first_name} ${agent.last_name}`

    const completionDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    const content = `
      <p class="email-greeting">Checklist Update</p>
      <p><strong>${agentName}</strong> has completed: <strong>${item_name}</strong></p>
      
      ${emailSection(
        'Details',
        `
        <p><strong>Agent:</strong> ${agentName}</p>
        <p><strong>Email:</strong> ${agent.email}</p>
        <p><strong>Item Completed:</strong> ${item_name}</p>
        <p><strong>Completed:</strong> ${completionDate}</p>
        <p><strong>Overall Progress:</strong> ${progress}%</p>
      `
      )}
    `

    const emailPromises = adminUsers.map((admin: any) =>
      resend.emails.send({
        from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
        to: admin.email,
        subject: `Checklist Item Completed: ${item_name}`,
        html: getEmailLayout(content, { title: 'Checklist Item Completed' }),
      })
    )

    await Promise.all(emailPromises)

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${adminUsers.length} admin(s)`,
    })
  } catch (error: any) {
    console.error('Error sending notification:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to send notification' },
      { status: 500 }
    )
  }
}

function calculateProgress(checklist: any) {
  if (!checklist) return 0
  let total = 0
  let completed = 0
  Object.keys(checklist).forEach(key => {
    if (key === 'mls_setup') {
      if (checklist[key]?.completed) completed++
      total++
    } else if (typeof checklist[key] === 'object' && checklist[key] !== null) {
      const subItems = Object.keys(checklist[key])
      total += subItems.length
      completed += subItems.filter(subKey => checklist[key][subKey]).length
    } else {
      total += 1
      if (checklist[key]) completed += 1
    }
  })
  return total > 0 ? Math.round((completed / total) * 100) : 0
}
