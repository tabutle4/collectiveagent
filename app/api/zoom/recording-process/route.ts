import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import { getZoomAccessToken, fetchMeetingRecordings, pickMp4Segments } from '@/lib/zoom/zoom-api'
import { uploadToOneDrive, verifyOneDriveFile } from '@/lib/zoom/onedrive'

// Staging a recording to OneDrive streams the whole file, the same as the webhook
// does, so this needs the same long ceiling rather than the 300s default.
export const maxDuration = 800

function formatDate(dateStr: string): string {
  // Convert to CT before formatting to avoid UTC "next day" issue
  const d = new Date(new Date(dateStr).toLocaleString('en-US', { timeZone: 'America/Chicago' }))
  return `${d.getMonth() + 1}-${d.getDate()}-${String(d.getFullYear()).slice(2)}`
}

// Takes a recording that the allowed rooms filter turned away and puts it back
// into the normal pipeline: fetch it from Zoom with an account level token, stage
// it to OneDrive, then mark it pending so the notification cron names it and
// emails it like any other recording.
export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  try {
    const { jobId } = await req.json()
    if (!jobId) return NextResponse.json({ error: 'jobId is required' }, { status: 400 })

    const { data: job, error: fetchError } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('id, meeting_id, meeting_title, start_time, status')
      .eq('id', jobId)
      .single()

    if (fetchError || !job) return NextResponse.json({ error: 'Recording not found' }, { status: 404 })

    if (job.status !== 'ignored') {
      return NextResponse.json(
        { error: 'Only a hidden recording can be processed this way' },
        { status: 400 }
      )
    }

    if (!job.meeting_id) {
      return NextResponse.json(
        { error: 'This recording has no Zoom meeting reference, so it cannot be fetched' },
        { status: 400 }
      )
    }

    const accessToken = await getZoomAccessToken()
    if (!accessToken) {
      return NextResponse.json({ error: 'Could not reach Zoom. Try again shortly.' }, { status: 502 })
    }

    const recordings = await fetchMeetingRecordings(job.meeting_id, accessToken)
    if (!recordings) {
      return NextResponse.json(
        { error: 'Zoom no longer has this recording, or it is still processing.' },
        { status: 404 }
      )
    }

    const mp4Segments = pickMp4Segments(recordings.files)
    if (mp4Segments.length === 0) {
      return NextResponse.json({ error: 'Zoom has no video file for this meeting' }, { status: 404 })
    }

    // One row exists per meeting here, so the first segment is the one to restore.
    const mp4File = mp4Segments[0]
    const segmentStartTime: string = mp4File.recording_start || job.start_time
    const fileSize = mp4File.file_size || 0
    const dateStr = formatDate(segmentStartTime)
    const suggestedTitle = `${job.meeting_title} - ${dateStr}`

    await supabaseAdmin
      .from('zoom_recording_jobs')
      .update({
        mp4_download_url: mp4File.download_url || '',
        mp4_file_size: fileSize,
        zoom_recording_id: mp4File.id || null,
        zoom_share_url: recordings.shareUrl || null,
        start_time: segmentStartTime,
        suggested_title: suggestedTitle,
        status: 'pending',
        error_message: null,
        notification_sent: false,
        notification_hold_since: new Date().toISOString(),
      })
      .eq('id', jobId)

    // Stage to OneDrive so the confirm step can move the file to SharePoint without
    // needing a Zoom token later. A failure here is recorded but does not undo the
    // restore: the confirm step can still stream from Zoom directly.
    let oneDriveSuccess = false
    try {
      const graphToken = await getGraphToken()
      const zoomRes = await fetch(mp4File.download_url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!zoomRes.ok) throw new Error(`Failed to download from Zoom: ${zoomRes.status}`)
      if (!zoomRes.body) throw new Error('No response body from Zoom')
      const { itemId, webUrl } = await uploadToOneDrive(
        graphToken,
        `${suggestedTitle}.mp4`,
        fileSize,
        zoomRes.body
      )
      const verified = await verifyOneDriveFile(graphToken, itemId)
      if (!verified) throw new Error('OneDrive file verification failed after upload')
      await supabaseAdmin
        .from('zoom_recording_jobs')
        .update({ onedrive_url: webUrl, onedrive_item_id: itemId })
        .eq('id', jobId)
      oneDriveSuccess = true
    } catch (err: any) {
      console.error('OneDrive staging failed during recording restore:', err.message)
      await supabaseAdmin
        .from('zoom_recording_jobs')
        .update({ error_message: `OneDrive upload failed: ${err.message}` })
        .eq('id', jobId)
    }

    return NextResponse.json({ ok: true, oneDrive: oneDriveSuccess })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not process this recording' }, { status: 500 })
  }
}
