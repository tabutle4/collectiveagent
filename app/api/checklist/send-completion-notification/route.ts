import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { Resend } from 'resend'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    // Use the authenticated user's own data — don't trust body for identity
    const agentName = `${auth.user.preferred_first_name || auth.user.first_name} ${auth.user.preferred_last_name || auth.user.last_name}`
    const agentEmail = auth.user.email

    const completionDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    await resend.emails.send({
      from: 'Collective Agent <notifications@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: `Onboarding Checklist Complete — ${agentName}`,
      html: getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">${agentName}</strong> has completed all items on their onboarding checklist.</p>
        <div style="background-color:${EMAIL_COLORS.lightBg};padding:16px 20px;border-left:3px solid ${EMAIL_COLORS.accent};margin:0 0 16px;">
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Agent:</strong> ${agentName}</p>
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Email:</strong> ${agentEmail}</p>
          <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Completed:</strong> ${completionDate}</p>
        </div>
        <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.lightText};">The agent is now fully onboarded and ready to go.</p>`,
        { title: 'Onboarding Checklist Complete', preheader: `${agentName} finished their onboarding checklist` }
      ),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error sending completion notification:', error)
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}