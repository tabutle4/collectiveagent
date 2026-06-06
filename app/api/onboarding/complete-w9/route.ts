import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

// Public route -- authenticated by campaign_token
// Called by the client after Track1099 W-9 widget callback fires
// Stores w9_completed, w9_tin_status, w9_signed_at, advances session step
// Sends TREC notification to office (replaces acknowledge-step for W-9 step)
export async function POST(request: NextRequest) {
  try {
    const { token, tin_status, signed_at } = await request.json()

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 })
    }

    // Authenticate by campaign_token
    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, mls_choice, license_number')
      .eq('campaign_token', token)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid or expired onboarding link' }, { status: 404 })
    }

    const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'
    const agentName = `${prospect.first_name} ${prospect.last_name}`
    const agentType = isReferralAgent ? 'Referral' : 'Standard'
    // W-9 is step 5 for referral, step 6 for standard
    const w9Step = isReferralAgent ? 5 : 6
    const nextStep = w9Step + 1
    const completedAtField = `step_${w9Step}_completed_at`

    // Mark W-9 complete on user record
    await supabaseAdmin
      .from('users')
      .update({
        w9_completed: true,
        w9_tin_status: tin_status || null,
        w9_signed_at: signed_at || new Date().toISOString(),
      })
      .eq('id', prospect.id)

    // Advance onboarding session
    await supabaseAdmin.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: nextStep,
        [completedAtField]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    // Notify office to submit TREC sponsorship
    const tinNote = tin_status === 'matched'
      ? '<p style="margin:0 0 6px;font-size:13px;color:#2D6A2D;">TIN verified -- matched.</p>'
      : tin_status === 'rejected'
      ? '<p style="margin:0 0 6px;font-size:13px;color:#A32D2D;">TIN match rejected -- follow up with agent before 1099 filing.</p>'
      : '<p style="margin:0 0 6px;font-size:13px;color:#8B4500;">TIN match pending -- Track1099 will re-run within 24 hours.</p>'

    await resend.emails.send({
      from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: `Action Required: Submit TREC Sponsorship for ${agentName}`,
      html: getEmailLayout(
        `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong> (${agentType} Agent) has completed their W-9 and is ready for TREC sponsorship.</p>
        <div style="margin:0 0 12px;padding:12px 16px;background:#f9f9f9;border-left:3px solid #C5A278;">
          <p style="margin:0 0 6px;font-size:14px;color:#555;">Name: <strong style="color:#1a1a1a;">${agentName}</strong></p>
          <p style="margin:0 0 6px;font-size:14px;color:#555;">Email: <strong style="color:#1a1a1a;">${prospect.email}</strong></p>
          <p style="margin:0 0 6px;font-size:14px;color:#555;">License: <strong style="color:#1a1a1a;">${(prospect as any).license_number || 'not on file'}</strong></p>
          ${tinNote}
        </div>
        <p style="margin:0;font-size:14px;color:#555;">Please submit their TREC sponsorship invitation now.</p>`,
        { title: 'TREC Sponsorship Needed', preheader: `Submit TREC invite for ${agentName}` }
      ),
    }).catch((e: unknown) => console.error('Failed to send TREC notification:', e))

    return NextResponse.json({ success: true, next_step: nextStep })
  } catch (error: any) {
    console.error('complete-w9 error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
