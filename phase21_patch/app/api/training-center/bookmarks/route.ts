import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

// GET - List user's bookmarks
// POST - Add a bookmark
// DELETE - Remove a bookmark
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { data, error } = await supabase
      .from('training_center_bookmarks')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ bookmarks: data })
  } catch (error: any) {
    console.error('Failed to fetch bookmarks:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { resource_url, resource_name, resource_type, category } = body

    if (!resource_url || !resource_name) {
      return NextResponse.json(
        { error: 'resource_url and resource_name are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('training_center_bookmarks')
      .insert({
        user_id: auth.user.id,
        resource_url,
        resource_name,
        resource_type: resource_type || 'document',
        category: category || null,
      })
      .select()
      .single()

    if (error) {
      // Handle duplicate bookmark
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Already bookmarked' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json({ bookmark: data })
  } catch (error: any) {
    console.error('Failed to add bookmark:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const resourceUrl = searchParams.get('url')

    if (!resourceUrl) {
      return NextResponse.json({ error: 'url parameter is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('training_center_bookmarks')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('resource_url', resourceUrl)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Failed to remove bookmark:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}