import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, type, error_detail, prospect_id } = body

    if (!name || !email || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Link straight to this prospect's page, where the office can send the
    // Track1099 request and use "Advance Past W-9" once the W-9 is complete.
    // Same base URL convention as sendNewProspectNotification in lib/email.ts.
    const prospectLink = prospect_id
      ? `https://agent.collectiverealtyco.com/admin/prospects/${prospect_id}`
      : null

    const timestamp = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    await resend.emails.send({
      from: 'Collective Agent <notifications@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: 'W-9 Form Error - Action Required',
      html: getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};">A W-9 form failed to load and needs to be sent manually via Track1099.</p>
        <div style="background-color:${EMAIL_COLORS.lightBg};padding:16px 20px;border-left:3px solid ${EMAIL_COLORS.accent};margin:0 0 16px;">
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Name:</strong> ${name}</p>
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Email:</strong> ${email}</p>
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Type:</strong> ${type}</p>
          <p style="margin:0 0 6px;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Error:</strong> ${error_detail || 'Form failed to load'}</p>
          <p style="margin:0;font-size:13px;color:${EMAIL_COLORS.bodyText};"><strong style="color:${EMAIL_COLORS.headingText};">Time:</strong> ${timestamp}</p>
        </div>
        <p style="margin:0 0 16px;font-size:13px;color:${EMAIL_COLORS.lightText};">Please send a W-9 request directly to this person via Track1099. Once their W-9 is complete, open their prospect page and use "Advance Past W-9" to move them to the final step and email them next steps.</p>
        ${prospectLink ? `<div style="text-align:center;margin:8px 0 0;">
          <a href="${prospectLink}" style="display:inline-block;padding:12px 24px;background:${EMAIL_COLORS.headingText};color:#ffffff;text-decoration:none;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Open Prospect Page</a>
        </div>` : ''}`,
        { title: 'W-9 Form Error', preheader: `W-9 error for ${name} -- manual send required` }
      ),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error sending W-9 error notification:', error)
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}
