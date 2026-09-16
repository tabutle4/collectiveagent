import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { normalizeRoomName } from '@/lib/zoom/room-filter'

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { data } = await supabaseAdmin
    .from('company_settings')
    .select('zoom_recording_notification_email, zoom_allowed_rooms')
    .single()

  const allowedRooms: string[] = data?.zoom_allowed_rooms || []

  // Room names Zoom has actually sent recently, so a room can be added by clicking
  // it instead of retyping a name that has to match exactly.
  const { data: recentJobs } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('meeting_title')
    .order('created_at', { ascending: false })
    .limit(200)

  const allowedKeys = new Set(allowedRooms.map(normalizeRoomName))
  const seen = new Set<string>()
  const knownRooms: string[] = []
  for (const row of recentJobs || []) {
    const title = row.meeting_title || ''
    const key = normalizeRoomName(title)
    if (!key || seen.has(key) || allowedKeys.has(key)) continue
    seen.add(key)
    knownRooms.push(title)
  }

  return NextResponse.json({
    notifyEmail: data?.zoom_recording_notification_email || '',
    allowedRooms,
    knownRooms,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const body = await req.json()
  const update: Record<string, any> = {}

  if (body.notifyEmail !== undefined) {
    if (!body.notifyEmail?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    update.zoom_recording_notification_email = body.notifyEmail.trim()
  }

  if (body.allowedRooms !== undefined) {
    if (!Array.isArray(body.allowedRooms)) {
      return NextResponse.json({ error: 'allowedRooms must be a list' }, { status: 400 })
    }
    const cleaned: string[] = []
    const seen = new Set<string>()
    for (const room of body.allowedRooms) {
      const name = String(room || '').trim()
      const key = normalizeRoomName(name)
      if (!key || seen.has(key)) continue
      seen.add(key)
      cleaned.push(name)
    }
    update.zoom_allowed_rooms = cleaned
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('company_settings')
    .update(update)
    .not('id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
