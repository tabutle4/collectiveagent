import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

/**
 * GET  /api/tc/homestead-counties  List all counties
 * POST /api/tc/homestead-counties  Create a new county
 */

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('homestead_links')
      .select('*')
      .order('state', { ascending: true })
      .order('county_name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ counties: data || [] })
  } catch (error) {
    console.error('Get homestead counties error:', error)
    return NextResponse.json({ error: 'Failed to fetch homestead counties' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const county_name = typeof body.county_name === 'string' ? body.county_name.trim() : ''
    const state = typeof body.state === 'string' && body.state.trim() ? body.state.trim().toUpperCase() : 'TX'
    const link_url = typeof body.link_url === 'string' && body.link_url.trim() ? body.link_url.trim() : null
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

    if (!county_name) {
      return NextResponse.json({ error: 'County name is required' }, { status: 400 })
    }

    // Basic URL shape check (not exhaustive, just catches obvious typos).
    if (link_url && !/^https?:\/\//i.test(link_url)) {
      return NextResponse.json(
        { error: 'Link URL must start with http:// or https://' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('homestead_links')
      .insert({ county_name, state, link_url, notes, is_active: true })
      .select()
      .single()

    if (error) {
      // Unique constraint violation returns code 23505.
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(
          { error: `${county_name} already exists for state ${state}` },
          { status: 409 }
        )
      }
      throw error
    }

    return NextResponse.json({ county: data })
  } catch (error) {
    console.error('Create homestead county error:', error)
    return NextResponse.json({ error: 'Failed to create homestead county' }, { status: 500 })
  }
}
