/**
 * Shared W-9 helpers for the onboarding flow.
 *
 * advanceProspectPastW9 - the single implementation of "this person's W-9
 * is done, move them forward": marks the user's W-9 complete, advances the
 * onboarding session past the W-9 step, emails the office to submit TREC
 * sponsorship, and emails the agent the "You're Almost There" message.
 * Makes no vendor calls of its own - the caller decides that the W-9 is
 * done and passes in why. Two paths reach it today:
 *
 *   'manual'         the office clicks Advance past W-9 after confirming
 *                    the signature outside the app (the original path, and
 *                    still the only one for an agent with no form id).
 *   'avalara_signed' the onboarding tracker read GET /w9/forms/{id} and
 *                    Avalara reported the form signed. A real signature is
 *                    a real onboarding event, so the same two emails are
 *                    correct here.
 *
 * sendW9RequestForUser - asks Avalara to email a fresh W-9 request and
 * stores the returned form id on the user, which is what makes a later
 * status check possible at all. An agent with no users.w9_form_id cannot be
 * checked, only re-requested.
 *
 * Neither helper reads, logs, or stores a TIN. getW9FormStatus deliberately
 * returns only signed state, signed date, and IRS match status; the tax id
 * stays on Avalara's side.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { sendAlmostThereEmail } from '@/lib/email'
import { Resend } from 'resend'
import { getEmailLayout } from '@/lib/email/layout'
import { avalaraConfigured, companyIdFor, createAndSendW9 } from '@/lib/avalara/w9'

const resend = new Resend(process.env.RESEND_API_KEY)

export interface AdvanceProspect {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_first_name: string | null
  email: string
  mls_choice: string | null
  w9_signed_at: string | null
  license_number: string | null
}

export interface AdvanceResult {
  nextStep: number
  emailSent: boolean
  officeEmailSent: boolean
}

/**
 * Why this advance is happening. Only shapes the note on the office email -
 * the advance itself is identical either way. Defaults to 'manual' so the
 * office's Advance past W-9 button behaves exactly as it always has.
 */
export interface AdvanceContext {
  source?: 'manual' | 'avalara_signed'
  signedDate?: string | null
  /** Avalara's IRS name/TIN match status, passed through as returned. Never
   *  the TIN itself. */
  tinMatchStatus?: string | null
}

export async function advanceProspectPastW9(
  prospect: AdvanceProspect,
  context: AdvanceContext = {}
): Promise<AdvanceResult> {
  const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'
  // W-9 is step 5 for referral, step 6 for standard (matches complete-w9)
  const w9Step = isReferralAgent ? 5 : 6
  const nextStep = w9Step + 1
  const completedAtField = `step_${w9Step}_completed_at`

  // Advance the onboarding session past the W-9 step FIRST, and check the
  // result. supabase-js returns errors rather than throwing, so an unchecked
  // upsert here used to fail silently and still send both emails - leaving
  // the agent flagged W-9 complete, the session still parked on the W-9 step,
  // and no way to retry because the next check sees the flag and skips. The
  // step that can fail therefore runs before anything irreversible, and a
  // failure aborts the whole advance so the caller can release its claim.
  const { error: sessionError } = await supabaseAdmin.from('onboarding_sessions').upsert(
    {
      user_id: prospect.id,
      current_step: nextStep,
      [completedAtField]: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (sessionError) {
    throw new Error(
      `Could not advance the onboarding session past the W-9 step: ${sessionError.message}`
    )
  }

  // Mark W-9 complete on the user record (preserve an existing signed_at)
  await supabaseAdmin
    .from('users')
    .update({
      w9_completed: true,
      w9_signed_at: prospect.w9_signed_at || new Date().toISOString(),
    })
    .eq('id', prospect.id)

  const agentName = `${prospect.first_name} ${prospect.last_name || ''}`.trim()
  const agentType = isReferralAgent ? 'Referral' : 'Standard'
  // Say which path got them here, so whoever reads the office email knows
  // whether a signature was actually observed or someone vouched for it.
  const sourceNote =
    context.source === 'avalara_signed'
      ? `Avalara reports this W-9 signed${context.signedDate ? ` on ${context.signedDate}` : ''}. IRS name/TIN match: ${context.tinMatchStatus || 'not reported yet'}.`
      : 'Advanced manually by the office. Confirm the TIN match in Avalara.'

  // Notify the office to submit TREC sponsorship, the same alert the agent
  // flow sends from /api/onboarding/complete-w9.
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
          <p style="margin:0;font-size:13px;color:#8B4500;">${sourceNote}</p>
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

  return { nextStep, emailSent, officeEmailSent }
}

// ─────────────────────────────────────────────────────────────────────────
// Sending a fresh W-9 request
// ─────────────────────────────────────────────────────────────────────────

export interface SendW9RequestUser {
  id: string
  first_name: string | null
  last_name: string | null
  preferred_first_name: string | null
  preferred_last_name: string | null
  email: string | null
  mls_choice: string | null
}

export interface SendW9RequestResult {
  ok: boolean
  formId?: string
  error?: string
  /** Avalara credentials or a company id are missing - a configuration
   *  problem, not a bad request, so callers can answer 503 rather than 500. */
  notConfigured?: boolean
}

/**
 * Asks Avalara to create a W-9 and email the request to this person, then
 * stores the form id on users.w9_form_id.
 *
 * Uses the same create path as the prospect-facing onboarding step
 * (createAndSendW9 + companyIdFor from lib/avalara/w9.ts) - no second way of
 * talking to Avalara. Avalara owns the email and the hosted signing page, so
 * there is nothing to render here.
 *
 * The form id is the whole point: without it there is no id to pass to
 * GET /w9/forms/{id}, which is why an agent with no w9_form_id can only be
 * re-requested, never checked.
 */
export async function sendW9RequestForUser(
  user: SendW9RequestUser
): Promise<SendW9RequestResult> {
  if (!user.email) {
    return { ok: false, error: 'No email address on file for this agent' }
  }

  const isReferral = user.mls_choice === 'Referral Collective (No MLS)'
  const companyId = companyIdFor(isReferral)
  if (!avalaraConfigured() || !companyId) {
    return { ok: false, notConfigured: true, error: 'W-9 service not configured' }
  }

  const name = [
    user.preferred_first_name || user.first_name,
    user.preferred_last_name || user.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .trim()

  const result = await createAndSendW9({
    email: user.email,
    name: name || user.email,
    companyId,
    referenceId: user.id,
  })

  if (!result.ok || !result.formId) {
    return { ok: false, error: result.error || 'Avalara did not return a form id' }
  }

  await supabaseAdmin
    .from('users')
    .update({ w9_form_id: result.formId, updated_at: new Date().toISOString() })
    .eq('id', user.id)

  return { ok: true, formId: result.formId }
}
