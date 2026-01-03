import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { agent_id, item_name } = await request.json()

    if (!agent_id || !item_name) {
      return NextResponse.json({ error: 'agent_id and item_name are required' }, { status: 400 })
    }

    // Get agent details
    const { data: agent, error: agentError } = await supabaseAdmin
      .from('users')
      .select('id, preferred_first_name, preferred_last_name, first_name, last_name, email')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get all admin users
    const { data: allUsers } = await supabaseAdmin.from('users').select('id, email, roles')

    // Filter for admin users
    // Check for 'Admin' (capital A) to match database schema
    const adminUsers = (allUsers || []).filter((u: any) => u.roles?.includes('Admin'))

    if (adminUsers.length === 0) {
      return NextResponse.json({ message: 'No admin users found' })
    }

    // Calculate agent's progress
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('onboarding_checklist')
      .eq('id', agent_id)
      .single()

    const progress = calculateProgress(userData?.onboarding_checklist || {})

    const agentName = agent.preferred_first_name && agent.preferred_last_name
      ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
      : `${agent.first_name} ${agent.last_name}`

    // Send emails to all admins
    const emailPromises = adminUsers.map((admin: any) =>
      resend.emails.send({
        from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
        to: admin.email,
        subject: `Checklist Item Completed: ${item_name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">Checklist Item Completed</h1>
            </div>
            
            <div style="padding: 30px; background: #f9f9f9;">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                <strong>${agentName}</strong> has completed: <strong>${item_name}</strong>
              </p>
              
              <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Agent Name:</td>
                    <td style="padding: 8px 0; color: #333;">${agentName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                    <td style="padding: 8px 0; color: #333;">${agent.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Item Completed:</td>
                    <td style="padding: 8px 0; color: #333;">${item_name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Completion Date:</td>
                    <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666; font-weight: bold;">Overall Progress:</td>
                    <td style="padding: 8px 0; color: #333;">${progress}%</td>
                  </tr>
                </table>
              </div>
            </div>
            
            <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px;">
              <p style="margin: 0;">This is an automated notification from the Collective Realty Co. Agent Portal</p>
            </div>
          </div>
        `,
      })
    )

    await Promise.all(emailPromises)

    return NextResponse.json({
      success: true,
      message: `Notification sent to ${adminUsers.length} admin(s)`,
    })
  } catch (error: any) {
    console.error('Error sending notification:', error)
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}

function calculateProgress(checklist: any) {
  if (!checklist) return 0

  let total = 0
  let completed = 0

  Object.keys(checklist).forEach((key) => {
    if (key === 'mls_setup') {
      // Handle MLS setup separately
      if (checklist[key]?.completed) {
        completed++
      }
      total++
    } else if (typeof checklist[key] === 'object' && checklist[key] !== null) {
      const subItems = Object.keys(checklist[key])
      total += subItems.length
      completed += subItems.filter((subKey) => checklist[key][subKey]).length
    } else {
      total += 1
      if (checklist[key]) completed += 1
    }
  })

  return total > 0 ? Math.round((completed / total) * 100) : 0
}




