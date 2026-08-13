import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { getActiveAdmins, preferredDisplayName } from '@/lib/agent-email'
import { writeInAppNotification, sendNotificationEmail } from '@/lib/agent-email-notifications'
import { escapeHtml } from '@/lib/agent-email-send'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// GET - Hourly reminders sweep for the agent email dashboard.
//
// ESCALATIONS (is_escalation = true, thread still waiting on the target):
//   > 4h   first stage: in-app notification to the escalatee
//   > 12h  second stage: email to the escalatee (from the escalator)
//   > 24h  alarm stage: email + in-app to every broker ("fire alarm")
//
// Escalations are the only thing this sweep chases. The automated 24h
// assignment nudge that used to live here was removed: it emailed people
// about their own queue on a timer, which is noise rather than signal. An
// admin who wants to chase a specific thread uses the Nudge button in
// oversight, which is a deliberate act by a person who has read the thread.
//
// The 48h revert to the New bucket still runs, in the stale-assignments
// cron. Nothing warns the assignee before it happens now.
//
// Stages fire once per assignment row (reminder_*_sent_at columns), and the
// clock runs from the escalation itself.
//
// Authenticated with CRON_SECRET only.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = Date.now()
    const nowIso = new Date(now).toISOString()
    const admins = await getActiveAdmins()
    const adminById = new Map(admins.map(a => [a.id, a]))
    const brokers = admins.filter(a => (a.role || '').toLowerCase() === 'broker')

    const report = {
      ranAt: nowIso,
      escalationFirst: 0,
      escalationSecond: 0,
      escalationAlarm: 0,
      errors: [] as string[],
    }

    // ── Escalations ──────────────────────────────────────────────────────
    const escalations = await fetchAllRows<{
      id: string
      thread_id: string
      assigned_to_user_id: string
      created_by_user_id: string | null
      reason_note: string
      created_at: string
      reminder_first_sent_at: string | null
      reminder_second_sent_at: string | null
      reminder_alarm_sent_at: string | null
    }>(
      'email_thread_assignments',
      'id, thread_id, assigned_to_user_id, created_by_user_id, reason_note, created_at, reminder_first_sent_at, reminder_second_sent_at, reminder_alarm_sent_at',
      {
        filters: [{ type: 'eq', column: 'is_escalation', value: true }],
        orderBy: { column: 'created_at', ascending: false },
      }
    )

    // Latest escalation per thread only
    const latestEscByThread = new Map<string, (typeof escalations)[number]>()
    for (const e of escalations) {
      if (!latestEscByThread.has(e.thread_id)) latestEscByThread.set(e.thread_id, e)
    }

    for (const esc of latestEscByThread.values()) {
      try {
        const ageMs = now - new Date(esc.created_at).getTime()
        const needsFirst = ageMs > 4 * 3600_000 && !esc.reminder_first_sent_at
        const needsSecond = ageMs > 12 * 3600_000 && !esc.reminder_second_sent_at
        const needsAlarm = ageMs > 24 * 3600_000 && !esc.reminder_alarm_sent_at
        if (!needsFirst && !needsSecond && !needsAlarm) continue

        // Only remind while the thread is still waiting on this person.
        const { data: thread } = await supabaseAdmin
          .from('email_threads')
          .select('id, subject, status, waiting_on_user_id, agent_user_id')
          .eq('id', esc.thread_id)
          .maybeSingle()
        if (
          !thread ||
          thread.status !== 'waiting_on_admin' ||
          thread.waiting_on_user_id !== esc.assigned_to_user_id
        ) {
          continue
        }

        const target = adminById.get(esc.assigned_to_user_id)
        if (!target) continue
        const actor = esc.created_by_user_id ? adminById.get(esc.created_by_user_id) : null
        const actorName = actor ? preferredDisplayName(actor) : 'A teammate'
        const hours = Math.floor(ageMs / 3600_000)
        const patch: Record<string, unknown> = {}

        if (needsFirst) {
          await writeInAppNotification({
            userId: target.id,
            threadId: esc.thread_id,
            kind: 'escalated',
            actorUserId: esc.created_by_user_id,
            body: `Still waiting on you: the escalation from ${actorName} has been open ${hours} hours. "${esc.reason_note}"`,
          })
          patch.reminder_first_sent_at = nowIso
          report.escalationFirst += 1
        }

        if (needsSecond) {
          const fromUpn = actor?.email || target.email
          await sendNotificationEmail({
            fromUpn,
            to: target.email,
            subject: `Still waiting on your decision (${hours}h): ${thread.subject || 'agent email'}`,
            html: reminderHtml({
              headline: `This escalation has been waiting ${hours} hours.`,
              note: esc.reason_note,
              noteLabel: `${actorName}'s original note`,
              threadId: esc.thread_id,
            }),
          })
          patch.reminder_second_sent_at = nowIso
          report.escalationSecond += 1
        }

        if (needsAlarm && brokers.length > 0) {
          const targetName = preferredDisplayName(target)
          for (const broker of brokers) {
            if (broker.id === target.id) continue
            await writeInAppNotification({
              userId: broker.id,
              threadId: esc.thread_id,
              kind: 'escalated',
              actorUserId: esc.created_by_user_id,
              body: `Escalation to ${targetName} has sat unanswered for ${hours} hours. May need your intervention.`,
            })
            await sendNotificationEmail({
              fromUpn: actor?.email || broker.email,
              to: broker.email,
              subject: `Unanswered escalation (${hours}h): ${thread.subject || 'agent email'}`,
              html: reminderHtml({
                headline: `An escalation to ${escapeHtml(targetName)} has been unanswered for ${hours} hours.`,
                note: esc.reason_note,
                noteLabel: 'Original escalation note',
                threadId: esc.thread_id,
              }),
            })
          }
          patch.reminder_alarm_sent_at = nowIso
          report.escalationAlarm += 1
        } else if (needsAlarm) {
          // No broker found; mark so we don't retry forever.
          patch.reminder_alarm_sent_at = nowIso
        }

        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from('email_thread_assignments').update(patch).eq('id', esc.id)
        }
      } catch (err: any) {
        report.errors.push(`escalation ${esc.id}: ${err?.message || String(err)}`)
      }
    }

    return NextResponse.json({ success: true, report })
  } catch (err: any) {
    console.error('agent-email-reminders cron error:', err)
    return NextResponse.json({ error: err?.message || 'Reminders sweep failed' }, { status: 500 })
  }
}

function reminderHtml(input: {
  headline: string
  note: string
  noteLabel: string
  threadId: string
}): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    'https://agent.collectiverealtyco.com'
  const url = `${base}/admin/agent-email?thread=${input.threadId}`
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.55;max-width:640px;">
  <p>${escapeHtml(input.headline)}</p>
  <div style="background:#f1efe8;padding:12px 14px;border-radius:8px;margin:16px 0;">
    <div style="font-size:11px;color:#5f5e5a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:500;">
      ${escapeHtml(input.noteLabel)}
    </div>
    <div style="font-size:13px;color:#1a1a1a;">${escapeHtml(input.note)}</div>
  </div>
  <div style="text-align:center;margin:24px 0 12px;">
    <a href="${url}" style="display:inline-block;background:#1a1a1a;color:white;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:14px;">Open thread</a>
  </div>
</div>`
}
