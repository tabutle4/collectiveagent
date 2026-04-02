import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { createAgentFolder } from '@/lib/microsoft-graph'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const { user_id } = await request.json()
    if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, onedrive_folder_url')
      .eq('id', user_id)
      .single()

    if (error || !user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    if (user.onedrive_folder_url) {
      return NextResponse.json({ success: true, url: user.onedrive_folder_url, already_existed: true })
    }

    const { sharingUrl } = await createAgentFolder(user.first_name, user.last_name, user.id)

    await supabaseAdmin
      .from('users')
      .update({ onedrive_folder_url: sharingUrl })
      .eq('id', user.id)

    return NextResponse.json({ success: true, url: sharingUrl })
  } catch (error: any) {
    console.error('OneDrive folder creation error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create folder' }, { status: 500 })
  }
}