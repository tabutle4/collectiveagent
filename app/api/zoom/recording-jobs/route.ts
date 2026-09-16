import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'

const ONEDRIVE_USER = process.env.MICROSOFT_ONEDRIVE_USER!

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

async function deleteZoomRecording(meetingId: string, zoomToken: string): Promise<void> {
  try {
    const encoded = encodeURIComponent(meetingId)
    const encodedMeetingId = (meetingId.startsWith('/') || meetingId.includes('//'))
      ? encodeURIComponent(encoded) : encoded
    await fetch(`https://api.zoom.us/v2/meetings/${encodedMeetingId}/recordings`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${zoomToken}` },
    })
  } catch (e) {
    console.error('Failed to delete Zoom recording:', e)
  }
}

async function deleteFromOneDrive(itemId: string): Promise<void> {
  try {
    const token = await getGraphToken()
    await fetch(
      `https://graph.microsoft.com/v1.0/users/${ONEDRIVE_USER}/drive/items/${itemId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
  } catch (e) {
    console.error('Failed to delete OneDrive file:', e)
  }
}

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    const { data: job, error } = await supabaseAdmin
      .from('zoom_recording_jobs')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: participants } = await supabaseAdmin
      .from('zoom_meeting_participants')
      .select('participant_name, participant_email, duration_minutes, join_time, leave_time')
      .eq('zoom_recording_job_id', id)
      .order('join_time', { ascending: true })

    return NextResponse.json({ job: { ...job, participants: participants || [] } })
  }

  // Recordings from Zoom rooms that are not on the allow list are filed as
  // 'ignored'. They stay out of the list unless they are asked for explicitly.
  const showIgnored = searchParams.get('ignored') === '1'

  const baseQuery = supabaseAdmin
    .from('zoom_recording_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const { data: jobs, error } = showIgnored
    ? await baseQuery.eq('status', 'ignored')
    : await baseQuery.neq('status', 'ignored')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count: ignoredCount } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ignored')

  return NextResponse.json({ jobs, ignoredCount: ignoredCount || 0 })
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch job to get Zoom and OneDrive references before deleting
  const { data: job } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('meeting_id, onedrive_item_id, status, zoom_recording_id')
    .eq('id', id)
    .single()

  if (job) {
    // Delete from Zoom (only if not already uploaded — confirm route deletes after upload).
    // An 'ignored' job belongs to a Zoom room this app does not manage, so its Zoom
    // recording is left alone; only our own row goes away.
    if (job.status !== 'uploaded' && job.status !== 'ignored' && job.meeting_id) {
      const zoomToken = await getZoomAccessToken()
      if (zoomToken) await deleteZoomRecording(job.meeting_id, zoomToken)
    }

    // Delete OneDrive temp file if it exists (pending/processing jobs that were staged)
    if (job.onedrive_item_id) {
      await deleteFromOneDrive(job.onedrive_item_id)
    }
  }

  // Delete DB row (participants cascade via FK)
  const { error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
