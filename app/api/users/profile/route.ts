import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth, canAccessAgent, canManageAgent } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  // If no id provided, use the current session user
  const id = searchParams.get('id') || auth.user.id

  // Check if user can access this profile
  if (!canAccessAgent(auth, id)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('users').select('*').eq('id', id).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Strip sensitive fields
    const { password_hash, reset_token, reset_token_expires, ...safeData } = data
    return NextResponse.json({ user: safeData })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id, updates } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    // Check if user can manage this profile
    if (!canManageAgent(auth, id)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // If user is updating their own profile, restrict what they can update
    if (id === auth.user.id && !auth.permissions.has('can_manage_agents')) {
      // Only allow these fields for self-update
      const allowedSelfUpdateFields = [
        'preferred_first_name',
        'preferred_last_name',
        'phone',
        'instagram_handle',
        'facebook_url',
        'linkedin_url',
        'twitter_url',
        'youtube_url',
        'tiktok_url',
        'website_url',
        'bio',
        'headshot_url',
        'headshot_crop',
      ]
      const filteredUpdates: Record<string, any> = {}
      for (const key of Object.keys(updates)) {
        if (allowedSelfUpdateFields.includes(key)) {
          filteredUpdates[key] = updates[key]
        }
      }
      const { error } = await supabase.from('users').update(filteredUpdates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      // Admin can update anything
      const { error } = await supabase.from('users').update(updates).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
