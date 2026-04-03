import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendCourtneyFollowUpEmail } from '@/lib/email'

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const windowEnd = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const windowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000)

    const { data: prospects, error } = await supabaseAdmin
      .from('users')
      .select('id, preferred_first_name, first_name, email, campaign_token, created_at')
      .eq('status', 'prospect')
      .not('campaign_token', 'is', null)
      .gte('created_at', windowStart.toISOString())
      .lte('created_at', windowEnd.toISOString())

    if (error) throw error
    if (!prospects?.length) {
      return NextResponse.json({ success: true, message: 'No eligible prospects', sent: 0 })
    }

    const prospectIds = prospects.map(p => p.id)
    const { data: sessions } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('user_id, current_step')
      .in('user_id', prospectIds)

    const stepByUserId = new Map<string, number>()
    if (sessions) {
      for (const s of sessions) {
        stepByUserId.set(s.user_id, s.current_step)
      }
    }

    let sent = 0
    let skipped = 0
    const errors: string[] = []

    for (const prospect of prospects) {
      const currentStep = stepByUserId.get(prospect.id) ?? null

      if (currentStep !== null && currentStep >= 7) {
        skipped++
        continue
      }

      if (!prospect.email || !prospect.campaign_token) {
        skipped++
        continue
      }

      try {
        await sendCourtneyFollowUpEmail({
          preferred_first_name: prospect.preferred_first_name || '',
          first_name: prospect.first_name || '',
          email: prospect.email,
          campaign_token: prospect.campaign_token,
          current_step: currentStep,
        })
        sent++
      } catch (err: any) {
        errors.push(`${prospect.preferred_first_name || prospect.first_name}: ${err.message}`)
      }
    }

    console.log(`Onboarding follow-up: ${sent} sent, ${skipped} skipped, ${errors.length} errors`)
    return NextResponse.json({ success: true, sent, skipped, errors: errors.length ? errors : undefined })
  } catch (error: any) {
    console.error('Onboarding follow-up cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
