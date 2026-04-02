import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { createAgentFolder } from '@/lib/microsoft-graph'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min timeout for bulk operation

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agents')
  if (auth.error) return auth.error

  try {
    const { data: agents, error } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, onedrive_folder_url')
      .eq('status', 'active')
      .is('onedrive_folder_url', null)

    if (error) throw error
    if (!agents?.length) {
      return NextResponse.json({ success: true, message: 'All agents already have folders', created: 0 })
    }

    const results: { name: string; success: boolean; error?: string }[] = []

    for (const agent of agents) {
      try {
        const { sharingUrl } = await createAgentFolder(agent.first_name, agent.last_name, agent.id)

        await supabaseAdmin
          .from('users')
          .update({ onedrive_folder_url: sharingUrl })
          .eq('id', agent.id)

        results.push({ name: `${agent.first_name} ${agent.last_name}`, success: true })
      } catch (err: any) {
        results.push({ name: `${agent.first_name} ${agent.last_name}`, success: false, error: err.message })
      }
    }

    const created = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success)

    return NextResponse.json({
      success: true,
      created,
      failed: failed.length,
      results,
    })
  } catch (error: any) {
    console.error('Create all folders error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}