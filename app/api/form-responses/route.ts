import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
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