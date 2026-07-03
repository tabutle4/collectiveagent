import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/public/referring-agent?ref=<agent_id>
// Public endpoint used by the prospective agent form's affiliate link. Given a
// referring agent's id, returns only their display name so the form can show
// "Referred by <name>" and lock the field. Returns nothing sensitive.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const ref = searchParams.get('ref')
    if (!ref) {
      return NextResponse.json({ found: false })
    }

    // Only resolve real, active licensed agents. Never leak anything but a name.
    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, preferred_first_name, preferred_last_name, is_licensed_agent, is_active')
      .eq('id', ref)
      .eq('is_licensed_agent', true)
      .maybeSingle()

    if (!agent) {
      return NextResponse.json({ found: false })
    }

    const name =
      `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()

    return NextResponse.json({ found: true, id: agent.id, name })
  } catch (err: any) {
    console.error('referring-agent lookup error:', err)
    return NextResponse.json({ found: false })
  }
}
