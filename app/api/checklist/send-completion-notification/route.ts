import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailSection } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { user_id, user_name, user_email } = await request.json()

    if (!user_id || !user_name || !user_email) {
      return NextResponse.json({ error: 'user_id, user_name, and user_email are required' }, { status: 400 })
    }

    const completionDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    const content = `
      <p class="email-greeting">Onboarding Complete</p>
      <p><strong>${user_name}</strong> has completed their onboarding checklist!</p>
      
      ${emailSection('Agent Details', `
        <p><strong>Name:</strong> ${user_name}</p>
        <p><strong>Email:</strong> ${user_email}</p>
        <p><strong>Completed:</strong> ${completionDate}</p>
      `)}
      
      <div class="email-section" style="border-left: 3px solid #4caf50;">
        <p style="margin: 0; color: #2e7d32; font-weight: 600;">All checklist items completed</p>
        <p style="margin: 5px 0 0 0; font-size: 12px;">The agent is now fully onboarded and ready to go.</p>
      </div>
    `

    await resend.emails.send({
      from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: `Onboarding Complete: ${user_name}`,
      html: getEmailLayout(content, { title: 'Onboarding Checklist Completed' }),
    })

    return NextResponse.json({ success: true, message: 'Completion notification sent' })
  } catch (error: any) {
    console.error('Error sending completion notification:', error)
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}