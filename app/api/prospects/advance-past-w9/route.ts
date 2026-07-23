import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { sendAlmostThereEmail } from '@/lib/email'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

// Office action: advance a prospect past the W-9 step when their W-9 has been
// completed outside the embedded widget (the widget request is unreliable, so
// the office sends the Track1099 request and completes the W-9 manually). This
// mirrors the server side of /api/onboarding/complete-w9 -- it marks the W-9
// complete and advances the onboarding session -- but is triggered by the
// office, not the agent, and emails the agent the "You're Almost There"
// message because by now they have usually left the onboarding page.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const { prospect_id } = await request.json()

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id is required' }, { status: 400 })
    }

    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, email, mls_choice, status, w9_signed_at, license_number')
      .eq('id', prospect_id)
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }
    if (prospect.status !== 'prospect') {
      return NextResponse.json({ error: 'User is no longer a prospect' }, { status: 400 })
    }

    const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'
    // W-9 is step 5 for referral, step 6 for standard (matches complete-w9)
    const w9Step = isReferralAgent ? 5 : 6
    const nextStep = w9Step + 1
    const completedAtField = `step_${w9Step}_completed_at`

    // Mark W-9 complete on the user record (preserve an existing signed_at)
    await supabaseAdmin
      .from('users')
      .update({
        w9_completed: true,
        w9_signed_at: prospect.w9_signed_at || new Date().toISOString(),
      })
      .eq('id', prospect.id)

    // Advance the onboarding session past the W-9 step
    await supabaseAdmin.from('onboarding_sessions').upsert(
      {
        user_id: prospect.id,
        current_step: nextStep,
        [completedAtField]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

    const agentName = `${prospect.first_name} ${prospect.last_name || ''}`.trim()
    const agentType = isReferralAgent ? 'Referral' : 'Standard'

    // Notify the office to submit TREC sponsorship, the same alert the agent
    // flow sends from /api/onboarding/complete-w9. Because this is a manual
    // advance, the W-9 was completed outside the widget, so the TIN status is
    // not known here and should be confirmed in Track1099.
    let officeEmailSent = true
    try {
      await resend.emails.send({
        from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
        to: 'office@collectiverealtyco.com',
        subject: `Action Required: Submit TREC Sponsorship for ${agentName}`,
        html: getEmailLayout(
          `<p style="margin:0 0 12px;font-size:14px;color:#555;"><strong style="color:#1a1a1a;">${agentName}</strong> (${agentType} Agent) has completed their W-9 and is ready for TREC sponsorship.</p>
          <div style="margin:0 0 12px;padding:12px 16px;background:#f9f9f9;border-left:3px solid #C5A278;">
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Name: <strong style="color:#1a1a1a;">${agentName}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">Email: <strong style="color:#1a1a1a;">${prospect.email}</strong></p>
            <p style="margin:0 0 6px;font-size:14px;color:#555;">License: <strong style="color:#1a1a1a;">${prospect.license_number || 'not on file'}</strong></p>
            <p style="margin:0;font-size:13px;color:#8B4500;">Advanced manually by the office. Confirm the TIN match in Track1099.</p>
          </div>
          <p style="margin:0;font-size:14px;color:#555;">Please submit their TREC sponsorship invitation now.</p>`,
          { title: 'TREC Sponsorship Needed', preheader: `Submit TREC invite for ${agentName}` }
        ),
      })
    } catch (e) {
      officeEmailSent = false
      console.error('TREC sponsorship notification failed:', e)
    }

    // Email the agent the "You're Almost There" message they would have seen
    // on screen. Never let an email failure fail the advance.
    let emailSent = true
    try {
      await sendAlmostThereEmail({
        preferred_first_name: prospect.preferred_first_name || '',
        first_name: prospect.first_name || '',
        email: prospect.email,
      })
    } catch (e) {
      emailSent = false
      console.error('sendAlmostThereEmail failed:', e)
    }

    return NextResponse.json({ success: true, next_step: nextStep, email_sent: emailSent, office_email_sent: officeEmailSent })
  } catch (error: any) {
    console.error('advance-past-w9 error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
