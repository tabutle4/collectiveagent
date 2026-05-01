import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

const VALID_LAYOUTS = ['classic', 'stacked', 'noLogo', 'mobile']

// GET — return saved signature for the user + layout, or null if none
export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const layout = searchParams.get('layout') || 'classic'

  if (!VALID_LAYOUTS.includes(layout)) {
    return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('email_signatures')
      .select('*')
      .eq('user_id', auth.user.id)
      .eq('layout', layout)
      .maybeSingle()

    if (error) {
      console.error('email_signatures GET error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, signature: data })
  } catch (err: any) {
    console.error('email_signatures GET exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}

// POST — upsert signature for user + layout
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const {
      layout,
      form_data,
      photo_url,
      photo_url_square,
      logo_url,
      logo_url_square,
      cta_image_url,
      cta_link,
      border_color,
      show_border,
      signature_type,
    } = body

    if (!layout || !VALID_LAYOUTS.includes(layout)) {
      return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
    }

    const upsertRow = {
      user_id: auth.user.id,
      layout,
      form_data: form_data || {},
      photo_url: photo_url || null,
      photo_url_square: photo_url_square || null,
      logo_url: logo_url || null,
      logo_url_square: logo_url_square || null,
      cta_image_url: cta_image_url || null,
      cta_link: cta_link || null,
      border_color: border_color || '#000000',
      show_border: show_border !== false,
      signature_type: signature_type || 'with-photo',
    }

    const { data, error } = await supabaseAdmin
      .from('email_signatures')
      .upsert(upsertRow, { onConflict: 'user_id,layout' })
      .select()
      .single()

    if (error) {
      console.error('email_signatures POST error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, signature: data })
  } catch (err: any) {
    console.error('email_signatures POST exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}

// DELETE — reset for the user + layout (delete the row)
export async function DELETE(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const layout = searchParams.get('layout')

  if (!layout || !VALID_LAYOUTS.includes(layout)) {
    return NextResponse.json({ success: false, error: 'Invalid layout' }, { status: 400 })
  }

  try {
    const { error } = await supabaseAdmin
      .from('email_signatures')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('layout', layout)

    if (error) {
      console.error('email_signatures DELETE error:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('email_signatures DELETE exception:', err)
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 })
  }
}
