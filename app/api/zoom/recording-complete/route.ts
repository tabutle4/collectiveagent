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
  // Convert to CT before formatting to avoid UTC "next day" issue
  const d = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
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

async function fetchChat(downloadUrl: string, zoomToken: string): Promise<string> {
  try {
    const res = await fetch(`${downloadUrl}?access_token=${zoomToken}`)
    if (!res.ok) return ''
    const text = await res.text()
    if (!text.trim()) return ''
    // Chat format is already readable: "HH:MM:SS From Name: message"
    return text.trim().slice(0, 3000)
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

async function fetchZoomParticipants(meetingUuid: string): Promise<any[]> {
  try {
    if (!meetingUuid) return []
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

    // UUID must be double-encoded if it starts with '/' or contains '//'
    const encoded = encodeURIComponent(meetingUuid)
    const doubleEncoded = (meetingUuid.startsWith('/') || meetingUuid.includes('//'))
      ? encodeURIComponent(encoded)
      : encoded

    const partRes = await fetch(
      `https://api.zoom.us/v2/report/meetings/${doubleEncoded}/participants?page_size=300`,
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

async function sendErrorNotification(notifyEmail: string, meetingTitle: string, confirmUrl: string, errorMsg: string): Promise<void> {
  try {
    const html = getEmailLayout(
      `<p class="email-greeting">A Zoom recording could not be saved to OneDrive.</p>
      <div class="email-section">
        <h3>Recording Details</h3>
        <p><strong>Meeting:</strong> ${meetingTitle}${segmentLabel ? ` (${segmentLabel.trim()})` : ''}</p>
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
  const meetingId: string = String(recording.id || '')   // PMI - used for Zoom delete
  const meetingUuid: string = recording.uuid || ''         // Unique per session - used for participant report
  const startTime: string = recording.start_time
  const zoomToken: string = payload.download_token || ''
  const zoomShareUrl: string = recording.share_url || ''

  // Fetch full recording file list from Zoom API — webhook payload may only include
  // the first segment when recording was stopped/started mid-meeting (known Zoom issue)
  let allFiles = recording.recording_files || []
  try {
    const encoded = encodeURIComponent(meetingUuid)
    const doubleEncoded = (meetingUuid.startsWith('/') || meetingUuid.includes('//'))
      ? encodeURIComponent(encoded) : encoded
    const filesRes = await fetch(
      `https://api.zoom.us/v2/meetings/${doubleEncoded}/recordings`,
      { headers: { Authorization: `Bearer ${zoomToken}` } }
    )
    if (filesRes.ok) {
      const filesData = await filesRes.json()
      if (filesData.recording_files?.length > 0) {
        allFiles = filesData.recording_files
        console.log(`Fetched ${allFiles.length} files from Zoom API (webhook had ${recording.recording_files?.length || 0})`)
      }
    }
  } catch (e) {
    console.error('Failed to fetch full recording list from Zoom, using webhook payload:', e)
  }

  // Get all MP4 segments — each stop/start creates a separate segment
  const preferredMp4s = allFiles.filter(
    (f: any) => f.file_type === 'MP4' && f.recording_type === 'shared_screen_with_speaker_view'
  )
  const mp4Segments = preferredMp4s.length > 0
    ? preferredMp4s
    : allFiles.filter((f: any) => f.file_type === 'MP4')

  // Non-MP4 files are shared across all segments
  const vttFile = allFiles.find((f: any) => f.file_type === 'TRANSCRIPT')
  const chatFile = allFiles.find((f: any) => f.file_type === 'CHAT')
  const summaryFile = allFiles.find((f: any) => f.file_type === 'SUMMARY')

  if (mp4Segments.length === 0) {
    return NextResponse.json({ error: 'No MP4 found' }, { status: 400 })
  }

  // Process each segment separately — creates one job per segment
  const results: any[] = []



  // Fetch transcript and chat (non-blocking - empty string if unavailable)
  let transcript = ''
  if (vttFile?.download_url) {
    transcript = await fetchTranscript(vttFile.download_url, zoomToken)
  }

  let chatText = ''
  if (chatFile?.download_url) {
    chatText = await fetchChat(chatFile.download_url, zoomToken)
  }

  // Fetch summary if available in webhook payload
  let summaryText = ''
  if (summaryFile?.download_url) {
    try {
      const sumRes = await fetch(`${summaryFile.download_url}?access_token=${zoomToken}`)
      if (sumRes.ok) {
        try {
          const sumData = await sumRes.json()
          summaryText = sumData.summary_overview || sumData.summary || ''
        } catch {
          summaryText = (await sumRes.text()).slice(0, 2000)
        }
      }
    } catch { }
  }

  // Transcript/chat/summary are shared across all segments (fetched once)
  let transcript = ''
  if (vttFile?.download_url) {
    transcript = await fetchTranscript(vttFile.download_url, zoomToken)
  }
  let chatText = ''
  if (chatFile?.download_url) {
    chatText = await fetchChat(chatFile.download_url, zoomToken)
  }
  let summaryText = ''
  if (summaryFile?.download_url) {
    try {
      const sumRes = await fetch(`${summaryFile.download_url}?access_token=${zoomToken}`)
      if (sumRes.ok) {
        try {
          const sumData = await sumRes.json()
          summaryText = sumData.summary_overview || sumData.summary || ''
        } catch {
          summaryText = (await sumRes.text()).slice(0, 2000)
        }
      }
    } catch { }
  }
  const fullTranscript = transcript || null
  const fullChat = chatText || null
  const fullSummary = summaryText || null

  // Participants fetched once for the whole meeting
  const participants = meetingUuid ? await fetchZoomParticipants(meetingUuid) : []

  // Topic suggestions based on transcript (shared across segments)
  const suggestedTopics = await suggestTopics(transcript, meetingTitle)
  const dateStr = formatDate(startTime)
  const suggestedFolder = guessFolderFromTitle(meetingTitle)
  const topicStr = suggestedTopics.length > 0 ? ' - ' + suggestedTopics.join(' - ') : ''

  // Per-segment: dedup, insert, upload
  for (const mp4File of mp4Segments) {
    const segmentStartTime: string = mp4File.recording_start || startTime
    const segmentLabel = mp4Segments.length > 1
      ? ` Part ${mp4Segments.indexOf(mp4File) + 1}`
      : ''
    const segmentTitle = `${meetingTitle}${segmentLabel} - ${dateStr}${topicStr}`
    const fileSize = mp4File.file_size || 0

    // Dedup per segment using its own start_time
    const { data: existing } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('id, status')
      .eq('start_time', segmentStartTime)
      .eq('meeting_title', meetingTitle)
      .maybeSingle()

    if (existing) {
      console.log(`Segment already exists: job ${existing.id} for ${segmentTitle}`)
      results.push({ duplicate: true, jobId: existing.id })
      continue
    }

    // Save job record for this segment
    const { data: job, error } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .insert({
        meeting_title: meetingTitle,
        meeting_id: meetingUuid || null,
        start_time: segmentStartTime,
        mp4_download_url: mp4File.download_url,
        mp4_file_size: fileSize,
        zoom_token: zoomToken,
        suggested_title: segmentTitle,
        suggested_folder: suggestedFolder,
        zoom_share_url: zoomShareUrl || null,
        transcript_text: fullTranscript,
        chat_text: fullChat,
        zoom_summary: fullSummary,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase insert error for segment:', error)
      results.push({ error: true })
      continue
    }

    // Store participants on first segment only (participants are per-meeting, not per-segment)
    if (participants.length > 0 && results.length === 0) {
      const humanParticipants = participants.filter((p: any) =>
        !p.name?.toLowerCase().includes('fathom') &&
        !p.name?.toLowerCase().includes('notetaker') &&
        !p.name?.toLowerCase().includes('otter') &&
        !p.name?.toLowerCase().includes('fireflies')
      )
      const rows = humanParticipants.map((p: any) => ({
        zoom_recording_job_id: job.id,
        meeting_id: meetingUuid,
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
      const { itemId, webUrl: oneDriveUrl } = await uploadToOneDrive(graphToken, `${segmentTitle}.mp4`, fileSize, zoomRes.body)
      const verified = await verifyOneDriveFile(graphToken, itemId)
      if (!verified) throw new Error('OneDrive file verification failed after upload')
      // Zoom recording is kept until confirm time so we can fetch transcript + summary
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
      await sendErrorNotification(notifyEmail, meetingTitle, confirmUrl, err.message)
    }

    // Send standard notification email per segment
    const oneDriveNote = oneDriveSuccess
    ? `<p style="font-size:13px;color:#4a7c59;">Video saved to OneDrive. Zoom recording will be deleted after you confirm upload to SharePoint.</p>`
    : `<p style="font-size:13px;color:#c0392b;">OneDrive upload failed. Zoom recording still available for ~24 hours.</p>`

    const notifyHtml = getEmailLayout(
    `<p class="email-greeting">New Zoom recording ready for review.</p>
    <div class="email-section">
      <h3>Recording Details</h3>
      <p><strong>Meeting:</strong> ${meetingTitle}${segmentLabel ? ` (${segmentLabel.trim()})` : ''}</p>
      <p><strong>Date:</strong> ${dateStr}</p>
      <p><strong>Suggested Title:</strong> ${segmentTitle}</p>
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
      subject: `New Recording Ready: ${meetingTitle}${segmentLabel ? ` (${segmentLabel.trim()})` : ''}`,
      html: notifyHtml,
    })

    results.push({ ok: true, jobId: job.id })
  } // end segment loop

  return NextResponse.json({ ok: true, segments: results.length, results })
}




