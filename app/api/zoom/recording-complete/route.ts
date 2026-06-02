import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'
import { getEmailLayout, emailButton, emailSignature } from '@/lib/email/layout'

const resend = new Resend(process.env.RESEND_API_KEY)

// SharePoint folder names exactly as they exist in the Training Center site
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

// Guess the best folder based on the Zoom meeting title
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

// Format date as M-D-YY
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}-${d.getDate()}-${String(d.getFullYear()).slice(2)}`
}

// Fetch .vtt transcript text from Zoom download URL
async function fetchTranscript(downloadUrl: string, zoomToken: string): Promise<string> {
  try {
    const res = await fetch(`${downloadUrl}?access_token=${zoomToken}`)
    if (!res.ok) return ''
    const vtt = await res.text()
    // Strip VTT formatting - extract just the spoken lines
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
    return spoken.join(' ').slice(0, 8000) // Cap at 8k chars for Claude
  } catch {
    return ''
  }
}

// Ask Claude to suggest topic tags
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
            content: `You are helping name a real estate training session recording for Collective Realty Co.

Meeting title: "${meetingTitle}"
Transcript excerpt: "${transcript}"

Generate exactly 3 to 4 short topic tags (3-6 words each, title case) that describe the main subjects covered. These will be used in the recording filename.

Respond with ONLY the tags as a JSON array of strings, nothing else. Example: ["Buyer Consultation Scripts", "Objection Handling Techniques", "Follow Up Systems"]`,
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

export async function POST(req: NextRequest) {
  const body = await req.text()
  const payload = JSON.parse(body)

  // Handle Zoom URL validation challenge
  if (payload.event === 'endpoint.url_validation') {
    const token = process.env.ZOOM_SECRET_TOKEN!
    const hash = createHmac('sha256', token).update(payload.payload.plainToken).digest('hex')
    return NextResponse.json({
      plainToken: payload.payload.plainToken,
      encryptedToken: hash,
    })
  }

  // Verify Zoom signature for all other events
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
  const startTime: string = recording.start_time
  const zoomToken: string = payload.download_token || ''

  // Find the MP4 and VTT files
  const mp4File = recording.recording_files?.find(
    (f: any) => f.file_type === 'MP4' && f.recording_type === 'shared_screen_with_speaker_view'
  ) || recording.recording_files?.find((f: any) => f.file_type === 'MP4')

  const vttFile = recording.recording_files?.find((f: any) => f.file_type === 'TRANSCRIPT')

  if (!mp4File) {
    return NextResponse.json({ error: 'No MP4 found' }, { status: 400 })
  }

  // Fetch transcript and get topic suggestions
  let transcript = ''
  if (vttFile?.download_url) {
    transcript = await fetchTranscript(vttFile.download_url, zoomToken)
  }

  const suggestedTopics = await suggestTopics(transcript, meetingTitle)
  const dateStr = formatDate(startTime)
  const suggestedFolder = guessFolderFromTitle(meetingTitle)

  // Build suggested title
  const topicStr = suggestedTopics.length > 0 ? ' - ' + suggestedTopics.join(' - ') : ''
  const suggestedTitle = `${meetingTitle} - ${dateStr}${topicStr}`

  // Save to Supabase
  const { data: job, error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .insert({
      meeting_title: meetingTitle,
      start_time: startTime,
      mp4_download_url: mp4File.download_url,
      mp4_file_size: mp4File.file_size,
      zoom_token: zoomToken,
      suggested_title: suggestedTitle,
      suggested_folder: suggestedFolder,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Supabase insert error:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  // Look up notification email from company_settings
  const { data: settingsRow } = await supabaseAdmin
    .from('company_settings')
    .select('zoom_recording_notification_email')
    .single()

  const notifyEmail = settingsRow?.zoom_recording_notification_email || 'info@collectiverealtyco.com'
  const confirmUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/recordings/${job.id}`

  const notifyHtml = getEmailLayout(
    `<p class="email-greeting">New Zoom recording ready for review.</p>
    <div class="email-section">
      <h3>Recording Details</h3>
      <p><strong>Meeting:</strong> ${meetingTitle}</p>
      <p><strong>Date:</strong> ${dateStr}</p>
      <p><strong>Suggested Title:</strong> ${suggestedTitle}</p>
      <p><strong>Suggested Folder:</strong> ${suggestedFolder}</p>
    </div>
    ${emailButton('Review & Upload to SharePoint', confirmUrl)}
    ${emailSignature('Collective Agent', 'Automated Recording System')}`,
    {
      title: 'New Recording Ready',
      preheader: `New recording: ${meetingTitle}`,
    }
  )

  await resend.emails.send({
    from: 'Collective Notifications <notifications@coachingbrokeragetools.com>',
    to: notifyEmail,
    subject: `New Recording Ready to Name: ${meetingTitle}`,
    html: notifyHtml,
  })

  return NextResponse.json({ ok: true, jobId: job.id })
}
