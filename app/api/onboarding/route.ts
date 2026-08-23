import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { getEmailLayout, EMAIL_COLORS } from '@/lib/email/layout'
import { getW9FormStatus } from '@/lib/avalara/w9'
import { advanceProspectPastW9, sendW9RequestForUser } from '@/lib/onboarding/w9'

const resend = new Resend(process.env.RESEND_API_KEY)

export const dynamic = 'force-dynamic'

// GET /api/onboarding - the ops-facing onboarding tracker.
//
// Rebuilt on OPEN onboarding_sessions (fully_completed_at IS NULL) joined to
// users of ANY status. The old version listed status='active' users, which
// dropped every mid-onboarding agent the moment co-sign flipped their status
// to 'active'... and never showed prospects at all. Open sessions are the
// real population: 18 active + 10 prospect open at the time of the rebuild.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_onboarding')
  if (auth.error) return auth.error

  try {
    const sessions = await fetchAllRows(
      'onboarding_sessions',
      'user_id, current_step, created_at, fully_completed_at, step_1_completed_at, step_2_completed_at, step_3_completed_at, step_4_completed_at, step_5_completed_at, step_6_completed_at, step_7_completed_at',
      { filters: [{ type: 'is', column: 'fully_completed_at', value: null }] }
    )
    const userIds = (sessions as any[]).map(s => s.user_id).filter(Boolean)

    const [
      { data: users },
      { data: adminTasks },
      { data: checklistItems },
      adminTaskCompletions,
      checklistCompletions,
    ] =
      await Promise.all([
        userIds.length
          ? supabaseAdmin
              .from('users')
              .select(
                'id, first_name, last_name, preferred_first_name, preferred_last_name, email, status, mls_choice, w9_completed, w9_signed_at, w9_form_id, ica_signed_at, broker_signed_at, full_nav_access, created_at'
              )
              .in('id', userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabaseAdmin
          .from('onboarding_admin_tasks')
          .select('id, label, display_order, agent_variant')
          .eq('is_active', true)
          .order('display_order'),
        // The agent's own 32-item checklist. The office needs the items to
        // tick one on an agent's behalf - the completions alone are not
        // enough to render the list.
        supabaseAdmin
          .from('onboarding_checklist_items')
          .select('id, section, section_title, item_key, label, priority, display_order')
          .eq('is_active', true)
          .order('display_order'),
        // Both completion tables go through fetchAllRows -
        // onboarding_checklist_completions is at 809 rows and climbing, and a
        // bare select silently truncates at 1,000.
        userIds.length
          ? fetchAllRows(
              'onboarding_admin_task_completions',
              'user_id, task_id, completed_at, completed_by, notes',
              { filters: [{ type: 'in', column: 'user_id', value: userIds }] }
            )
          : Promise.resolve([] as any[]),
        userIds.length
          ? fetchAllRows(
              'onboarding_checklist_completions',
              'user_id, checklist_item_id, completed_at, completed_by',
              { filters: [{ type: 'in', column: 'user_id', value: userIds }] }
            )
          : Promise.resolve([] as any[]),
      ])

    const sessionByUser: Record<string, any> = {}
    for (const s of sessions as any[]) sessionByUser[s.user_id] = s

    const agents = (users || []).map((u: any) => ({
      ...u,
      session: sessionByUser[u.id] || null,
      is_referral: u.mls_choice === 'Referral Collective (No MLS)',
    }))

    return NextResponse.json({
      agents,
      adminTasks: adminTasks || [],
      checklistItems: checklistItems || [],
      adminTaskCompletions,
      checklistCompletions,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_onboarding')
  if (auth.error) return auth.error

  try {
    const supabase = supabaseAdmin
    const adminId = auth.user.id
    const body = await request.json()
    const { action } = body

    // ── W-9 status check ─────────────────────────────────────────────────
    // Reads the live Avalara form state for one agent and, when Avalara
    // reports the form SIGNED, advances them by calling the shared
    // advanceProspectPastW9 - the same helper the office's manual Advance
    // past W-9 button uses. Nothing about the advance is duplicated here.
    //
    // A real signature is a real onboarding event, so the helper's two
    // emails (office TREC alert + the agent's "You're Almost There") are
    // correct on this path.
    //
    // Deliberately reads only signed state, signed date and IRS match status
    // off the Avalara response. The response also carries `tin` and
    // `tinType`; those are never read, never logged, never stored. Tax ids
    // live on Avalara's side only.
    //
    // Always answers 200 with a `w9` object once the request itself is
    // valid - including when Avalara is unreachable - because the caller
    // renders this inline beside the agent's row and treats a non-2xx as a
    // hard failure of the whole action.
    if (action === 'check_w9_status') {
      const { user_id } = body
      if (!user_id) {
        return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
      }

      const { data: agent } = await supabase
        .from('users')
        .select(
          'id, first_name, last_name, preferred_first_name, email, mls_choice, status, w9_completed, w9_signed_at, w9_form_id, license_number'
        )
        .eq('id', user_id)
        .single()
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      // No stored form id means no id to pass to GET /w9/forms/{id}. There is
      // nothing to check - the agent needs a fresh request first.
      if (!agent.w9_form_id) {
        return NextResponse.json({ success: true, w9: { has_form: false } })
      }

      const status = await getW9FormStatus(agent.w9_form_id)
      if (!status.ok) {
        return NextResponse.json({
          success: true,
          w9: {
            has_form: true,
            ok: false,
            error: status.error || 'Could not read the W-9 status from Avalara',
          },
        })
      }

      // Advance only from the W-9 step itself. A signed form on someone
      // already past that step is old news, and re-running the advance would
      // email an agent who has moved on.
      let advanced = false
      if (status.signed && !agent.w9_completed && agent.email) {
        const w9Step = agent.mls_choice === 'Referral Collective (No MLS)' ? 5 : 6
        const { data: session } = await supabase
          .from('onboarding_sessions')
          .select('user_id, current_step')
          .eq('user_id', agent.id)
          .maybeSingle()
        if (session && session.current_step === w9Step) {
          // Claim the advance before doing it. This check runs automatically
          // when the tracker loads, so two admins opening the page at the
          // same moment would otherwise both pass the reads above and both
          // fire the helper's two emails at one agent. The conditional
          // update on w9_completed is the guard: exactly one caller gets a
          // row back. The helper sets the same flag again, which is a no-op.
          const { data: claimed } = await supabase
            .from('users')
            .update({
              w9_completed: true,
              w9_signed_at:
                agent.w9_signed_at || status.signedDate || new Date().toISOString(),
            })
            .eq('id', agent.id)
            .not('w9_completed', 'is', true)
            .select('id')
          if (!claimed || claimed.length === 0) {
            return NextResponse.json({
              success: true,
              w9: {
                has_form: true,
                ok: true,
                signed: status.signed,
                status: status.status ?? null,
                signed_date: status.signedDate ?? null,
                tin_match_status: status.tinMatchStatus ?? null,
                advanced: false,
              },
            })
          }
          // If the advance fails, RELEASE the claim. Otherwise the agent is
          // left flagged W-9 complete with the session still on the W-9 step
          // and no retry possible, because the next check sees the flag and
          // skips. The helper aborts before sending either email, so a
          // released claim means nobody was emailed and the next page load
          // simply tries again.
          try {
            await advanceProspectPastW9(
              {
                id: agent.id,
                first_name: agent.first_name,
                last_name: agent.last_name,
                preferred_first_name: agent.preferred_first_name,
                email: agent.email,
                mls_choice: agent.mls_choice,
                w9_signed_at: agent.w9_signed_at || status.signedDate || null,
                license_number: agent.license_number,
              },
              {
                source: 'avalara_signed',
                signedDate: status.signedDate ?? null,
                tinMatchStatus: status.tinMatchStatus ?? null,
              }
            )
            advanced = true
          } catch (advanceError: any) {
            await supabase
              .from('users')
              .update({
                w9_completed: false,
                w9_signed_at: agent.w9_signed_at ?? null,
              })
              .eq('id', agent.id)
            return NextResponse.json({
              success: true,
              w9: {
                has_form: true,
                ok: true,
                signed: status.signed,
                status: status.status ?? null,
                signed_date: status.signedDate ?? null,
                tin_match_status: status.tinMatchStatus ?? null,
                advanced: false,
                error:
                  advanceError?.message ||
                  'Avalara reports this W-9 signed, but the advance failed. Nobody was emailed; it will retry.',
              },
            })
          }
        }
      }

      return NextResponse.json({
        success: true,
        w9: {
          has_form: true,
          ok: true,
          signed: status.signed,
          status: status.status ?? null,
          signed_date: status.signedDate ?? null,
          tin_match_status: status.tinMatchStatus ?? null,
          advanced,
        },
      })
    }

    // ── Send a fresh W-9 request ─────────────────────────────────────────
    // Every agent on the tracker today has no users.w9_form_id, so no status
    // check is possible for any of them. This is how one gets created: the
    // shared sendW9RequestForUser calls the same Avalara create path the
    // prospect-facing onboarding step uses and stores the returned form id.
    //
    // Avalara emails the request itself, so this puts a real message in a
    // real agent's inbox. Both UI entry points confirm in a dialog first.
    if (action === 'send_w9_request') {
      const { user_id } = body
      if (!user_id) {
        return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
      }

      const { data: agent } = await supabase
        .from('users')
        .select(
          'id, first_name, last_name, preferred_first_name, preferred_last_name, email, mls_choice'
        )
        .eq('id', user_id)
        .single()
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      const sent = await sendW9RequestForUser(agent)
      if (!sent.ok) {
        return NextResponse.json(
          { error: sent.error || 'Failed to send the W-9 request' },
          { status: sent.notConfigured ? 503 : 500 }
        )
      }

      return NextResponse.json({ success: true, form_id: sent.formId })
    }

    // Page sends: toggle_checklist, { user_id, checklist_item_id, completing }
    // Used by the tracker's per-agent checklist section so the office can
    // tick an item on an agent's behalf (the agent ticks their own at
    // /agent/checklist).
    if (action === 'toggle_checklist') {
      const { user_id, checklist_item_id, completing } = body
      if (completing) {
        await supabase
          .from('onboarding_checklist_completions')
          .insert({ user_id, checklist_item_id, completed_by: adminId })
      } else {
        await supabase
          .from('onboarding_checklist_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('checklist_item_id', checklist_item_id)
      }
      return NextResponse.json({ success: true })
    }

    // Page sends: toggle_admin_task, { user_id, task_id, completing }
    if (action === 'toggle_admin_task') {
      const { user_id, task_id, completing } = body
      if (completing) {
        await supabase
          .from('onboarding_admin_task_completions')
          .insert({ user_id, task_id, completed_by: adminId })
      } else {
        await supabase
          .from('onboarding_admin_task_completions')
          .delete()
          .eq('user_id', user_id)
          .eq('task_id', task_id)
      }
      return NextResponse.json({ success: true })
    }

    // Page sends: update_task_notes, { user_id, task_id, notes }
    if (action === 'update_task_notes') {
      const { user_id, task_id, notes } = body
      await supabase
        .from('onboarding_admin_task_completions')
        .update({ notes })
        .eq('user_id', user_id)
        .eq('task_id', task_id)
      return NextResponse.json({ success: true })
    }

    // The update_user action was removed. It wrote an arbitrary column set
    // straight onto users from the request body, and its only caller (the
    // tracker's pre-access toggles) is gone - those fields are edited on the
    // agent's profile screen, which filters what may be written.

    // Page sends: toggle_nav_access, { user_id, current }
    if (action === 'toggle_nav_access') {
      const { user_id, current } = body
      await supabase.from('users').update({ full_nav_access: !current }).eq('id', user_id)

      // When granting access (not revoking), all setup is confirmed done - send the task reminder
      if (!current) {
        const { data: agent } = await supabase
          .from('users')
          .select('first_name, last_name, preferred_first_name, preferred_last_name, email')
          .eq('id', user_id)
          .single()

        if (agent) {
          const agentName = `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`
          await resend.emails.send({
            from: 'Collective Agent <onboarding@coachingbrokeragetools.com>',
            to: 'office@collectiverealtyco.com',
            subject: `Action Required: Send Welcome Emails for ${agentName}`,
            html: getEmailLayout(
              `<p style="margin:0 0 14px;font-size:14px;color:${EMAIL_COLORS.bodyText};">Full app access has been granted to <strong style="color:${EMAIL_COLORS.headingText};">${agentName}</strong>. All accounts and documents are in place.</p>
              <p style="margin:0 0 12px;font-size:14px;color:${EMAIL_COLORS.bodyText};">The final step is to send their welcome and onboarding emails:</p>
              <p style="margin:0 0 16px;font-size:14px;color:${EMAIL_COLORS.bodyText};padding-left:16px;border-left:3px solid ${EMAIL_COLORS.accent};">Complete the <strong>New Agent Automated Onboarding Emails</strong> form in Power Automate</p>
              <p style="margin:0;font-size:12px;color:${EMAIL_COLORS.lightText};">Agent email: ${agent.email}</p>`,
              { title: 'Send Welcome Emails', preheader: `Final step for ${agentName}` }
            ),
          }).catch((e: unknown) => console.error('Failed to send welcome email reminder:', e))
        }
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
