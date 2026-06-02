import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_company_settings')
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
    return NextResponse.json({ job })
  }

  const { data: jobs, error } = await supabaseAdmin
    .from('zoom_recording_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ jobs })
}
