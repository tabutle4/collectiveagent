import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { user } = auth as import('@/lib/api-auth').AuthResult

  // Set once the claim below succeeds, so the catch only releases a claim this
  // request actually took. Releasing unconditionally would wipe a timestamp set
  // by an earlier, successful notification.
  let claimedHere = false

  try {
    // Confirm server-side that the checklist really is finished before burning
    // the one-per-agent claim. The client fires this the moment its own count
    // reaches the total, and a double click or a retry must not consume the
    // claim for a checklist that is not actually done.
    const [itemsRes, doneRes] = await Promise.all([
      supabaseAdmin.from('onboarding_checklist_items').select('id').eq('is_active', true),
      supabaseAdmin
        .from('onboarding_checklist_completions')
        .select('checklist_item_id')
        .eq('user_id', user.id),
    ])
    if (itemsRes.error) throw itemsRes.error
    if (doneRes.error) throw doneRes.error

    const activeItemIds = new Set((itemsRes.data || []).map((i: any) => i.id))
    const completedActive = (doneRes.data || []).filter((c: any) =>
      activeItemIds.has(c.checklist_item_id)
    ).length

    if (activeItemIds.size === 0 || completedActive < activeItemIds.size) {
      return NextResponse.json({ success: true, not_complete: true })
    }

    // Claim before sending, so unticking and re-ticking the last item cannot
    // mail office@ a second time. The UPDATE matches only while the column is
    // still null, so two concurrent clicks produce one claim and one email.
    // The error is checked rather than discarded: if it were swallowed, a
    // missing column would look identical to "already notified" and would
    // silently stop the office ever being told again.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from('users')
      .update({ checklist_completion_notified_at: new Date().toISOString() })
      .eq('id', user.id)
      .is('checklist_completion_notified_at', null)
      .select('id')

    if (claimError) throw claimError
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ success: true, already_notified: true })
    }
    claimedHere = true

    // Use the authenticated user's own data - don't trust body for identity
    const agentName = `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`
    const agentEmail = user.email

    const completionDate = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // The Resend SDK reports failures by returning an error rather than
    // throwing, so an unchecked send would leave the claim set and the office
    // never told, with no way to retry.
    const { error: sendError } = await resend.emails.send({
      from: 'Collective Agent <notifications@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: `Onboarding Checklist Complete for ${agentName}`,
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

    if (sendError) throw sendError

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error sending completion notification:', error)
    // Release only a claim this request took, so the office can still be told
    // on a retry.
    if (claimedHere) {
      await supabaseAdmin
        .from('users')
        .update({ checklist_completion_notified_at: null })
        .eq('id', user.id)
    }
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}