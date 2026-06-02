import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { data } = await supabaseAdmin
    .from('company_settings')
    .select('zoom_recording_notification_email')
    .single()

  return NextResponse.json({
    notifyEmail: data?.zoom_recording_notification_email || '',
  })
}

export async function POST(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { notifyEmail } = await req.json()
  if (!notifyEmail?.trim()) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('company_settings')
    .update({ zoom_recording_notification_email: notifyEmail.trim() })
    .not('id', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
