import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailButton, emailSignature } from '@/lib/email/layout'
import { requireCronSecret } from '@/lib/api-auth'

const resend = new Resend(process.env.RESEND_API_KEY)

// Two hours in ms — after this long holding, send the email even without a transcript
const HOLD_TIMEOUT_MS = 2 * 60 * 60 * 1000

async function getZoomAccessToken(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    if (!res.ok) return null
    const { access_token } = await res.json()
    return access_token || null
  } catch { return null }
}

// Fetch a VTT transcript for a meeting if Zoom has generated one yet.
// Returns the transcript text, or '' if not available.
async function fetchTranscriptIfReady(meetingId: string, zoomToken: string): Promise<string> {
  try {
    const encoded = encodeURIComponent(meetingId)
    const encodedMeetingId = (meetingId.startsWith('/') || meetingId.includes('//'))
      ? encodeURIComponent(encoded) : encoded
    const res = await fetch(
      `https://api.zoom.us/v2/meetings/${encodedMeetingId}/recordings`,
      { headers: { Authorization: `Bearer ${zoomToken}` } }
    )
    if (!res.ok) return ''
    const data = await res.json()
    const files = data.recording_files || []
    const vttFile = files.find((f: any) => f.file_type === 'TRANSCRIPT')
    if (!vttFile?.download_url) return ''
    const vttRes = await fetch(`${vttFile.download_url}?access_token=${zoomToken}`)
    if (!vttRes.ok) return ''
    const vtt = await vttRes.text()
    const spoken: string[] = []
    for (const line of vtt.split('\n')) {
      const trimmed = line.trim()
      if (
        trimmed &&
        !trimmed.startsWith('WEBVTT') &&
        !trimmed.match(/^\d+$/) &&
        !trimmed.includes('-->')
      ) {
        spoken.push(trimmed)
      }
    }
    return spoken.join(' ').slice(0, 15000)
  } catch {
    return ''
  }
}

export async function GET(request: NextRequest) {
  const denied = requireCronSecret(request)
  if (denied) return denied

  try {
    // Find jobs still awaiting their notification: held, not yet sent, still pending upload.
    const { data: heldJobs, error } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('id, meeting_id, meeting_title, suggested_title, suggested_folder, onedrive_url, transcript_text, notification_hold_since, start_time')
      .eq('notification_sent', false)
      .eq('status', 'pending')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!heldJobs || heldJobs.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, sent: 0 })
    }

    // Notification recipient
    const { data: settingsRow } = await supabaseAdmin
      .from('company_settings')
      .select('zoom_recording_notification_email')
      .single()
    const notifyEmail = settingsRow?.zoom_recording_notification_email || 'info@collectiverealtyco.com'

    const zoomToken = await getZoomAccessToken()
    const now = Date.now()
    let sent = 0

    for (const job of heldJobs) {
      // Determine if we should send now: transcript present, OR 2-hour timeout elapsed.
      let transcript = job.transcript_text || ''

      if (!transcript && job.meeting_id && zoomToken) {
        // Try to fetch the transcript fresh from Zoom
        transcript = await fetchTranscriptIfReady(job.meeting_id, zoomToken)
        if (transcript) {
          // Save it so the confirm page and AI have it
          await supabaseAdmin
            .from('zoom_recording_jobs')
            .update({ transcript_text: transcript })
            .eq('id', job.id)
        }
      }

      const heldSince = job.notification_hold_since ? new Date(job.notification_hold_since).getTime() : now
      const timedOut = (now - heldSince) >= HOLD_TIMEOUT_MS

      if (!transcript && !timedOut) {
        // Keep waiting
        continue
      }

      // Build and send the email (same content as the webhook's immediate send)
      const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/recordings/${job.id}`
      const dateStr = job.start_time
        ? new Date(new Date(job.start_time).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
            .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
        : ''

      const transcriptNote = transcript
        ? `<p style="font-size:13px;color:#4a7c59;">Transcript ready.</p>`
        : `<p style="font-size:13px;color:#8a6d3b;">Transcript not yet available — it may appear when you open the recording.</p>`

      const notifyHtml = getEmailLayout(
        `<p class="email-greeting">New Zoom recording ready for review.</p>
        <div class="email-section">
          <h3>Recording Details</h3>
          <p><strong>Meeting:</strong> ${job.meeting_title}</p>
          <p><strong>Date:</strong> ${dateStr}</p>
          <p><strong>Suggested Title:</strong> ${job.suggested_title || ''}</p>
          <p><strong>Suggested Folder:</strong> ${job.suggested_folder || ''}</p>
          ${transcriptNote}
        </div>
        ${emailButton('Review & Upload to SharePoint', confirmUrl)}
        ${emailSignature('Collective Agent', 'Automated Recording System')}`,
        { title: 'New Recording Ready', preheader: `New recording: ${job.meeting_title}` }
      )

      await resend.emails.send({
        from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
        to: notifyEmail,
        subject: `New Recording Ready: ${job.meeting_title}`,
        html: notifyHtml,
      })

      await supabaseAdmin
        .from('zoom_recording_jobs')
        .update({ notification_sent: true })
        .eq('id', job.id)

      sent++
    }

    return NextResponse.json({ ok: true, checked: heldJobs.length, sent })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Cron failed' }, { status: 500 })
  }
}