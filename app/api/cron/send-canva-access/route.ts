import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { buildCanvaAccessEmail } from '@/lib/email/canvaAccessEmail'
import { requireCronSecret } from '@/lib/api-auth'

const resend = new Resend(process.env.RESEND_API_KEY)

// Sends the shared Canva Pro credentials to each agent ~24h after their first
// login. Runs daily; the canva_access_email_sent_at flag makes it send once and
// self-heal if a run is missed. Credentials are pulled from company_settings.
export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('canva_username, canva_password, canva_url')
      .single()

    const canvaUser = companySettings?.canva_username
    const canvaPassword = companySettings?.canva_password
    const canvaUrl = companySettings?.canva_url

    if (!canvaUser || !canvaPassword || !canvaUrl) {
      return NextResponse.json({ success: true, message: 'Canva credentials not configured in settings', sent: 0 })
    }

    // Agents who first logged in more than 24h ago and have not been sent yet.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: agents, error } = await supabaseAdmin
      .from('users')
      .select('id, preferred_first_name, first_name, office_email, email')
      .eq('role', 'agent')
      .eq('status', 'active')
      .eq('is_active', true)
      .not('first_login_at', 'is', null)
      .lte('first_login_at', cutoff)
      .is('canva_access_email_sent_at', null)

    if (error) throw error
    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'No eligible agents', sent: 0 })
    }

    let sent = 0
    const errors: string[] = []

    for (const agent of agents) {
      const toEmail = agent.office_email || agent.email
      if (!toEmail) continue
      const firstName = agent.preferred_first_name || agent.first_name || 'there'
      try {
        const { subject, html } = buildCanvaAccessEmail({
          greetingName: firstName,
          canvaUser,
          canvaPassword,
          canvaUrl,
        })
        await resend.emails.send({
          from: 'Collective Realty Co. <onboarding@coachingbrokeragetools.com>',
          to: toEmail,
          subject,
          html,
        })
        await supabaseAdmin
          .from('users')
          .update({ canva_access_email_sent_at: new Date().toISOString() })
          .eq('id', agent.id)
        sent++
      } catch (err: any) {
        errors.push(`${firstName}: ${err.message}`)
      }
    }

    console.log(`Canva access: ${sent} sent, ${errors.length} errors`)
    return NextResponse.json({ success: true, sent, errors: errors.length ? errors : undefined })
  } catch (error: any) {
    console.error('Canva access cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
