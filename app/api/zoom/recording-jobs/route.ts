import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

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

    // Fetch participants for this job
    const { data: participants } = await supabaseAdmin
      .from('zoom_meeting_participants')
      .select('participant_name, participant_email, duration_minutes, join_time, leave_time')
      .eq('zoom_recording_job_id', id)
      .order('join_time', { ascending: true })

    return NextResponse.json({ job: { ...job, participants: participants || [] } })
  }

  const { data: jobs, error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs })
}

export async function DELETE(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
