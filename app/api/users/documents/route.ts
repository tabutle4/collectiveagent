import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  const user_id = request.nextUrl.searchParams.get('user_id')
  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('user_documents')
    .select('*')
    .eq('user_id', user_id)
    .order('upload_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ documents: data || [] })
}