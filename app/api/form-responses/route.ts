import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') // 'prospects', 'listings', 'listing', 'coordination'
    const id = searchParams.get('id')
    const agentId = searchParams.get('agent_id')

    const supabase = createClient()

    if (type === 'prospects') {
      // Admin only
      if (!auth.permissions.has('can_manage_prospects')) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }

      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return NextResponse.json({ prospects: data || [] })
    }

    // The caller's own form submissions (compliance, recheck, retainer, under
    // contract) for the My Submissions tab. Always scoped to the logged-in
    // user; the agent_id query param is intentionally ignored here. Listing
    // submissions are excluded because the tab already shows them from the
    // listings table.
    if (type === 'my_submissions') {
      const { data, error } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('id, submitted_at, status, data')
        .eq('agent_id', auth.user!.id)
        .order('submitted_at', { ascending: false })
        .limit(200)

      if (error) throw error

      const MODE_LABEL: Record<string, string> = {
        compliance: 'Compliance & CDA',
        subsequent: 'Recheck',
        retainer: 'Retainer',
        under_contract: 'Under Contract',
      }
      const rows = (data || [])
        .filter((r: any) => MODE_LABEL[r.data?.submission_mode || ''])
        .map((r: any) => ({
          id: r.id,
          created_at: r.submitted_at,
          property_address: r.data?.property_address || r.data?.client_name || '-',
          client_names: r.data?.client_name || '-',
          transaction_type: MODE_LABEL[r.data?.submission_mode],
          status: r.status || 'submitted',
          kind: 'form',
        }))
      return NextResponse.json({ submissions: rows })
    }

    if (type === 'listings') {
      let query = supabase
        .from('listings')
        .select(`
          *,
          users!listings_agent_id_fkey(
            id,
            preferred_first_name,
            preferred_last_name,
            first_name,
            last_name
          )
        `)
        .order('created_at', { ascending: false })

      // If agent_id provided and user is that agent (or is admin), filter by agent
      if (agentId) {
        if (agentId !== auth.user.id && !auth.permissions.has('can_view_all_transactions')) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        query = query.eq('agent_id', agentId)
      } else if (!auth.permissions.has('can_view_all_transactions')) {
        // Non-admin users can only see their own
        query = query.eq('agent_id', auth.user.id)
      }

      const { data, error } = await query

      if (error) throw error
      return NextResponse.json({ listings: data || [] })
    }

    if (type === 'listing' && id) {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return NextResponse.json({ listing: data })
    }

    if (type === 'coordination' && id) {
      const { data, error } = await supabase
        .from('listing_coordination')
        .select('*')
        .eq('listing_id', id)
        .single()

      if (error) throw error
      return NextResponse.json({ coordination: data })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (error: any) {
    console.error('Error fetching form responses:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}