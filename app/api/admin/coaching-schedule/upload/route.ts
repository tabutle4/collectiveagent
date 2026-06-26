import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, or WebP images are allowed' },
        { status: 400 }
      )
    }

    const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const slug = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9-]/g, '-')
      .toLowerCase()
      .slice(0, 40)
    const timestamp  = Date.now()
    const filePath   = `${slug}-${timestamp}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('schedule-photos')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadErr) {
      console.error('schedule upload - Supabase Storage error:', uploadErr)
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('schedule-photos')
      .getPublicUrl(filePath)

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (err: any) {
    console.error('schedule upload - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
