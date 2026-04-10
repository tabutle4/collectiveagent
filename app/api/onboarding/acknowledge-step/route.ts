import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

// Public route - authenticated by campaign_token, not session.
// Used for non-document steps (policy manual acknowledgment, W-9 notice, etc.)
export async function POST(request: NextRequest) {
  try {
    const { token, step } = await request.json()

    if (!token || !step) {
      return NextResponse.json({ error: 'token and step are required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const agentName = `${prospect.first_name} ${prospect.last_name}`
    const completedAtField = `step_${step}_completed_at`
    const nextStep = step + 1

    await supabaseAdmin.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: nextStep,
        [completedAtField]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    // Step 6 - agent acknowledged W-9 and is moving to TREC: notify office to submit TREC invite
    if (step === 6) {
      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: 'office@collectiverealtyco.com',
        subject: `Action Required: Submit TREC Sponsorship for ${agentName}`,
        html: getEmailLayout(
          `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong> has completed all onboarding steps and is ready for TREC sponsorship.</p>
          <p style="margin:0 0 12px;font-size:14px;color:#555;">Please submit their TREC sponsorship invitation now.</p>
          <p style="margin:0;font-size:12px;color:#888;">Agent email: ${prospect.email}</p>`,
          { title: 'TREC Sponsorship Needed', preheader: `Submit TREC invite for ${agentName}` }
        ),
      }).catch((e: unknown) => console.error('Failed to send TREC notification:', e))
    }

    return NextResponse.json({ success: true, next_step: nextStep })
  } catch (error: any) {
    console.error('Acknowledge step error:', error)
    return NextResponse.json({ error: error.message || 'Failed to advance step' }, { status: 500 })
  }
}