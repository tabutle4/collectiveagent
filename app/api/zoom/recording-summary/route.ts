import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

async function getZoomToken(): Promise<string | null> {
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

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('jobId')
  if (!jobId) return NextResponse.json({ error: 'jobId required' }, { status: 400 })

  const { data: job } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('meeting_id, zoom_token, transcript_text, chat_text, zoom_summary')
    .eq('id', jobId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Check which fields are already stored separately
  const hasTranscript = !!job.transcript_text
  const hasChat = !!job.chat_text
  const hasSummary = !!job.zoom_summary

  // If all three already stored, return from DB without hitting Zoom
  if (hasTranscript && hasChat && hasSummary) {
    return NextResponse.json({ alreadyStored: true, summary: job.zoom_summary, transcript: job.transcript_text, chat: job.chat_text })
  }

  if (!job.meeting_id) return NextResponse.json({ summary: '', transcript: '', chat: '' })

  const token = await getZoomToken()
  if (!token) return NextResponse.json({ summary: '', transcript: '', chat: '' })

  const encoded = encodeURIComponent(job.meeting_id)
  const doubleEncoded = (job.meeting_id.startsWith('/') || job.meeting_id.includes('//'))
    ? encodeURIComponent(encoded) : encoded

  // Fetch recording files for transcript + chat
  let transcript = ''
  let chat = ''
  let summary = ''

  try {
    const filesRes = await fetch(
      `https://api.zoom.us/v2/meetings/${doubleEncoded}/recordings`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (filesRes.ok) {
      const filesData = await filesRes.json()
      const files = filesData.recording_files || []

      // VTT transcript (file_type: 'TRANSCRIPT')
      const vttFile = files.find((f: any) => f.file_type === 'TRANSCRIPT')
      if (vttFile?.download_url) {
        const vttRes = await fetch(`${vttFile.download_url}?access_token=${token}`)
        if (vttRes.ok) {
          const vtt = await vttRes.text()
          const lines = vtt.split('\n').filter((l: string) => {
            const t = l.trim()
            return t && !t.startsWith('WEBVTT') && !t.match(/^\d+$/) && !t.match(/^\d{2}:/) && !t.startsWith('NOTE')
          })
          transcript = lines.join(' ').slice(0, 15000)
        }
      }

      // Chat file (file_type: 'CHAT')
      const chatFile = files.find((f: any) => f.file_type === 'CHAT')
      if (chatFile?.download_url) {
        const chatRes = await fetch(`${chatFile.download_url}?access_token=${token}`)
        if (chatRes.ok) {
          chat = (await chatRes.text()).trim().slice(0, 3000)
        }
      }

      // AI Summary file (file_type: 'SUMMARY') — downloadable JSON file in recordings list
      const summaryFile = files.find((f: any) => f.file_type === 'SUMMARY')
      if (summaryFile?.download_url) {
        const sumRes = await fetch(`${summaryFile.download_url}?access_token=${token}`)
        if (sumRes.ok) {
          try {
            const sumData = await sumRes.json()
            summary = sumData.summary_overview || sumData.summary || ''
          } catch {
            summary = (await sumRes.text()).slice(0, 2000)
          }
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch Zoom recording files:', e)
  }

  // Fallback: try meeting_summary endpoint if SUMMARY file not available yet
  if (!summary) {
    try {
      const summaryRes = await fetch(
        `https://api.zoom.us/v2/meetings/${doubleEncoded}/meeting_summary`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json()
        summary = summaryData.summary_overview || summaryData.meeting_summary || ''
      }
    } catch (e) {
      console.error('Failed to fetch Zoom meeting summary:', e)
    }
  }

  // Store each section independently — never overwrite existing with empty
  const updates: Record<string, string> = {}
  if (transcript && !hasTranscript) updates.transcript_text = transcript.slice(0, 15000)
  if (chat && !hasChat) updates.chat_text = chat.slice(0, 3000)
  if (summary && !hasSummary) updates.zoom_summary = summary.slice(0, 3000)

  if (Object.keys(updates).length > 0) {
    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update(updates)
      .eq('id', jobId)
  }

  return NextResponse.json({ summary, transcript, chat })
}
