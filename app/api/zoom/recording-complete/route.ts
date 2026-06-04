import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailButton, emailSignature } from '@/lib/email/layout'
import { getGraphToken } from '@/lib/microsoft-graph'

const resend = new Resend(process.env.RESEND_API_KEY)
const ONEDRIVE_USER = process.env.MICROSOFT_ONEDRIVE_USER!
const ONEDRIVE_FOLDER = 'Zoom Recordings/Pending'

const SHAREPOINT_FOLDERS = [
  'Announcement Recordings',
  'Collective Access Division Coaching - Dallas',
  'Collective Access Division Coaching - Houston',
  'Convert & Close Coaching',
  'Daily Prospecting',
  'Lender Market Updates',
  'Lending',
  'Market Update',
  'Marketing',
  'Navigating the Training Center, Compliance, & Onboarding',
  'New Agent Coaching Circle',
  'New Construction',
  'Prospecting',
  'Representing Buyers',
  'Representing Sellers and Landlords',
  'Sales Meetings',
  'Seasoned Agent Coaching Circle',
  'Title Company Guest Trainings',
]

function guessFolderFromTitle(title: string): string {
  const lower = title.toLowerCase()
  if (lower.includes('seasoned')) return 'Seasoned Agent Coaching Circle'
  if (lower.includes('new agent') || lower.includes('coaching circle')) return 'New Agent Coaching Circle'
  if (lower.includes('convert') || lower.includes('close')) return 'Convert & Close Coaching'
  if (lower.includes('collective access') && lower.includes('dallas')) return 'Collective Access Division Coaching - Dallas'
  if (lower.includes('collective access') && lower.includes('houston')) return 'Collective Access Division Coaching - Houston'
  if (lower.includes('collective access')) return 'Collective Access Division Coaching - Houston'
  if (lower.includes('lease') || lower.includes('apartment') || lower.includes('locator')) return 'Representing Sellers and Landlords'
  if (lower.includes('mortgage') || lower.includes('lender') || lower.includes('loan')) return 'Lender Market Updates'
  if (lower.includes('prospecting')) return 'Prospecting'
  if (lower.includes('buyer')) return 'Representing Buyers'
  if (lower.includes('market update') || lower.includes('market mastery') || lower.includes('industry intelligence')) return 'Market Update'
  if (lower.includes('marketing') || lower.includes('lead gen')) return 'Marketing'
  if (lower.includes('title')) return 'Title Company Guest Trainings'
  if (lower.includes('new construction')) return 'New Construction'
  if (lower.includes('training center') || lower.includes('onboarding') || lower.includes('navigating')) return 'Navigating the Training Center, Compliance, & Onboarding'
  if (lower.includes('announcement')) return 'Announcement Recordings'
  if (lower.includes('sales')) return 'Sales Meetings'
  return 'Announcement Recordings'
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}-${d.getDate()}-${String(d.getFullYear()).slice(2)}`
}

async function fetchTranscript(downloadUrl: string, zoomToken: string): Promise<string> {
  try {
    const res = await fetch(`${downloadUrl}?access_token=${zoomToken}`)
    if (!res.ok) return ''
    const vtt = await res.text()
    const lines = vtt.split('\n')
    const spoken: string[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (
        trimmed &&
        !trimmed.startsWith('WEBVTT') &&
        !trimmed.match(/^\d+$/) &&
        !trimmed.match(/^\d{2}:\d{2}/) &&
        !trimmed.startsWith('NOTE')
      ) {
        spoken.push(trimmed)
      }
    }
    return spoken.join(' ').slice(0, 15000)
  } catch {
    return ''
  }
}

async function suggestTopics(transcript: string, meetingTitle: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
          {
            role: 'user',
            content: `You are helping name a real estate training session recording for Collective Realty Co.\n\nMeeting title: "${meetingTitle}"\nTranscript excerpt: "${transcript.slice(0, 3000)}"\n\nGenerate exactly 3 to 4 short topic tags (3-6 words each, title case) that describe the main subjects covered. These will be used in the recording filename.\n\nRespond with ONLY the tags as a JSON array of strings, nothing else. Example: ["Buyer Consultation Scripts", "Objection Handling Techniques", "Follow Up Systems"]`,
          },
        ],
      }),
    })
    const data = await res.json()
    const text = data.content?.[0]?.text || '[]'
    const clean = text.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return []
  }
}

async function fetchZoomParticipants(meetingId: string): Promise<any[]> {
  try {
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    if (!tokenRes.ok) return []
    const { access_token } = await tokenRes.json()
    if (!access_token) return []

    const partRes = await fetch(
      `https://api.zoom.us/v2/report/meetings/${meetingId}/participants?page_size=300`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    if (!partRes.ok) return []
    const partData = await partRes.json()
    return partData.participants || []
  } catch {
    return []
  }
}

async function uploadToOneDrive(
  token: string,
  fileName: string,
  fileSize: number,
  fileStream: ReadableStream
): Promise<{ itemId: string; webUrl: string }> {
  if (!fileSize || fileSize <= 0) throw new Error('Cannot upload: file size is unknown or zero')
  const itemPath = `${ONEDRIVE_FOLDER}/${fileName}`

  const sessionRes = await fetch(
    `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/root:/${itemPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } }),
    }
  )
  if (!sessionRes.ok) throw new Error(`OneDrive upload session failed: ${await sessionRes.text()}`)
  const { uploadUrl } = await sessionRes.json()

  const chunkSize = 10 * 1024 * 1024
  const reader = fileStream.getReader()
  let offset = 0
  let buffer = new Uint8Array(0)
  let itemId = ''
  let webUrl = ''

  while (true) {
    while (buffer.length < chunkSize) {
      const { done, value } = await reader.read()
      if (done) break
      const merged = new Uint8Array(buffer.length + value.length)
      merged.set(buffer)
      merged.set(value, buffer.length)
      buffer = merged
    }

    if (buffer.length === 0) break

    const chunk = buffer.slice(0, Math.min(chunkSize, buffer.length))
    buffer = buffer.slice(chunk.length)
    const end = offset + chunk.length - 1

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes ${offset}-${end}/${fileSize}`,
        'Content-Length': String(chunk.length),
      },
      body: chunk,
    })

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const result = await chunkRes.json()
      itemId = result.id || ''
      webUrl = result.webUrl || ''
    } else if (chunkRes.status !== 202) {
      throw new Error(`OneDrive chunk upload failed: ${chunkRes.status} ${await chunkRes.text()}`)
    }

    offset += chunk.length
    if (offset >= fileSize) break
  }

  return { itemId, webUrl }
}

async function verifyOneDriveFile(token: string, itemId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${itemId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return res.ok
  } catch {
    return false
  }
}

async function deleteZoomRecording(meetingId: string): Promise<void> {
  try {
    const tokenRes = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    )
    if (!tokenRes.ok) return
    const { access_token } = await tokenRes.json()
    await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${access_token}` },
    })
  } catch (e) {
    console.error('Failed to delete Zoom recording:', e)
  }
}

async function sendErrorNotification(notifyEmail: string, meetingTitle: string, confirmUrl: string, errorMsg: string): Promise<void> {
  try {
    const html = getEmailLayout(
      `<p class="email-greeting">A Zoom recording could not be saved to OneDrive.</p>
      <div class="email-section">
        <h3>Recording Details</h3>
        <p><strong>Meeting:</strong> ${meetingTitle}</p>
        <p><strong>Error:</strong> ${errorMsg}</p>
        <p style="font-size:13px;color:#888;">The recording is still available in Zoom cloud for approximately 24 hours. You can attempt to upload manually from the recordings page.</p>
      </div>
      ${emailButton('View Recording', confirmUrl)}
      ${emailSignature('Collective Agent', 'Automated Recording System')}`,
      { title: 'Recording Upload Failed', preheader: `Upload failed: ${meetingTitle}` }
    )
    await resend.emails.send({
      from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
      to: notifyEmail,
      subject: `Recording Upload Failed: ${meetingTitle}`,
      html,
    })
  } catch (e) {
    console.error('Failed to send error notification:', e)
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const payload = JSON.parse(body)

  if (payload.event === 'endpoint.url_validation') {
    const token = process.env.ZOOM_SECRET_TOKEN!
    const hash = createHmac('sha256', token).update(payload.payload.plainToken).digest('hex')
    return NextResponse.json({ plainToken: payload.payload.plainToken, encryptedToken: hash })
  }

  const signature = req.headers.get('x-zm-signature') || ''
  const timestamp = req.headers.get('x-zm-request-timestamp') || ''
  const message = `v0:${timestamp}:${body}`
  const expectedSig = 'v0=' + createHmac('sha256', process.env.ZOOM_SECRET_TOKEN!).update(message).digest('hex')

  if (signature !== expectedSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  if (payload.event !== 'recording.completed') {
    return NextResponse.json({ ok: true })
  }

  const recording = payload.payload.object
  const meetingTitle: string = recording.topic || 'Untitled Meeting'
  const meetingId: string = String(recording.id || '')
  const startTime: string = recording.start_time
  const zoomToken: string = payload.download_token || ''
  const zoomShareUrl: string = recording.share_url || ''

  const mp4File = recording.recording_files?.find(
    (f: any) => f.file_type === 'MP4' && f.recording_type === 'shared_screen_with_speaker_view'
  ) || recording.recording_files?.find((f: any) => f.file_type === 'MP4')

  const vttFile = recording.recording_files?.find((f: any) => f.file_type === 'TRANSCRIPT')

  if (!mp4File) {
    return NextResponse.json({ error: 'No MP4 found' }, { status: 400 })
  }

  // Fetch transcript (non-blocking - empty string if unavailable)
  let transcript = ''
  if (vttFile?.download_url) {
    transcript = await fetchTranscript(vttFile.download_url, zoomToken)
  }

  // Fetch participants now while meeting data is fresh
  const participants = meetingId ? await fetchZoomParticipants(meetingId) : []

  // Generate topic suggestions from transcript
  const suggestedTopics = await suggestTopics(transcript, meetingTitle)
  const dateStr = formatDate(startTime)
  const suggestedFolder = guessFolderFromTitle(meetingTitle)
  const topicStr = suggestedTopics.length > 0 ? ' - ' + suggestedTopics.join(' - ') : ''
  const suggestedTitle = `${meetingTitle} - ${dateStr}${topicStr}`
  const fileName = `${suggestedTitle}.mp4`
  const fileSize = mp4File.file_size || 0

  // Save job record with all data we have
  const { data: job, error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .insert({
      meeting_title: meetingTitle,
      meeting_id: meetingId || null,
      start_time: startTime,
      mp4_download_url: mp4File.download_url,
      mp4_file_size: fileSize,
      zoom_token: zoomToken,
      suggested_title: suggestedTitle,
      suggested_folder: suggestedFolder,
      zoom_share_url: zoomShareUrl || null,
      transcript_text: transcript || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase insert error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Store participants if we got any
  if (participants.length > 0) {
    const rows = participants.map((p: any) => ({
      zoom_recording_job_id: job.id,
      meeting_id: meetingId,
      participant_name: p.name || null,
      participant_email: p.user_email || null,
      duration_minutes: p.duration ? Math.round(p.duration / 60) : null,
      join_time: p.join_time || null,
      leave_time: p.leave_time || null,
    }))
    const { error: partError } = await supabaseAdmin
      .from('zoom_meeting_participants')
      .insert(rows)
    if (partError) console.error('Failed to store participants:', partError)
  }

  // Look up notification email
  const { data: settingsRow } = await supabaseAdmin
    .from('company_settings')
    .select('zoom_recording_notification_email')
    .single()
  const notifyEmail = settingsRow?.zoom_recording_notification_email || 'info@collectiverealtyco.com'
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/recordings/${job.id}`

  // Upload to OneDrive
  let oneDriveSuccess = false
  try {
    const graphToken = await getGraphToken()

    const zoomRes = await fetch(`${mp4File.download_url}?access_token=${zoomToken}`)
    if (!zoomRes.ok) throw new Error(`Failed to download from Zoom: ${zoomRes.status}`)
    if (!zoomRes.body) throw new Error('No response body from Zoom')

    const { itemId, webUrl: oneDriveUrl } = await uploadToOneDrive(graphToken, fileName, fileSize, zoomRes.body)

    const verified = await verifyOneDriveFile(graphToken, itemId)
    if (!verified) throw new Error('OneDrive file verification failed after upload')

    // Safe to delete from Zoom now
    if (meetingId) await deleteZoomRecording(meetingId)

    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({ onedrive_url: oneDriveUrl, onedrive_item_id: itemId })
      .eq('id', job.id)

    oneDriveSuccess = true

  } catch (err: any) {
    console.error('OneDrive upload error:', err.message)
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({ error_message: `OneDrive upload failed: ${err.message}` })
      .eq('id', job.id)
    // Send error notification to admin
    await sendErrorNotification(notifyEmail, meetingTitle, confirmUrl, err.message)
  }

  // Send standard notification email
  const oneDriveNote = oneDriveSuccess
    ? `<p style="font-size:13px;color:#4a7c59;">Video saved to OneDrive. Zoom cloud recording has been deleted.</p>`
    : `<p style="font-size:13px;color:#c0392b;">OneDrive upload failed. Zoom recording still available for ~24 hours.</p>`

  const notifyHtml = getEmailLayout(
    `<p class="email-greeting">New Zoom recording ready for review.</p>
    <div class="email-section">
      <h3>Recording Details</h3>
      <p><strong>Meeting:</strong> ${meetingTitle}</p>
      <p><strong>Date:</strong> ${dateStr}</p>
      <p><strong>Suggested Title:</strong> ${suggestedTitle}</p>
      <p><strong>Suggested Folder:</strong> ${suggestedFolder}</p>
      <p><strong>Attendees captured:</strong> ${participants.length}</p>
      ${oneDriveNote}
    </div>
    ${emailButton('Review & Upload to SharePoint', confirmUrl)}
    ${emailSignature('Collective Agent', 'Automated Recording System')}`,
    { title: 'New Recording Ready', preheader: `New recording: ${meetingTitle}` }
  )

  await resend.emails.send({
    from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
    to: notifyEmail,
    subject: `New Recording Ready: ${meetingTitle}`,
    html: notifyHtml,
  })

  return NextResponse.json({ ok: true, jobId: job.id })
}
