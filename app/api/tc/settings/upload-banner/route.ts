import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

/**
 * POST /api/tc/settings/upload-banner
 *
 * Accepts a PNG, JPG, or WebP file under 2 MB, uploads it to the
 * tc-assets Supabase Storage bucket at banner/banner.<ext>, and
 * writes the resulting public URL to tc_settings.banner_image_url.
 *
 * The file is always named banner.<ext> (no timestamp) so a new
 * upload overwrites the old file and every existing sent email
 * pointing at the old URL continues to work after re-upload.
 *
 * Required permission: can_manage_coordination
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 })
    }

    // --- Validation ---
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Use PNG, JPG, or WebP.' },
        { status: 400 }
      )
    }

    const maxSize = 2 * 1024 * 1024 // 2 MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File is ${Math.round(file.size / 1024)} KB. Max size is 2 MB.` },
        { status: 400 }
      )
    }

    // --- Upload ---
    // Extension chosen from the MIME type rather than the filename so a
    // file mis-named "banner.txt" with PNG content still lands as .png.
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
    }
    const ext = extMap[file.type] || 'png'
    const filePath = `banner/banner.${ext}`

    // Clean up any other banner.* files so we don't leak orphans when
    // the user uploads a PNG today and a JPG tomorrow.
    const otherExts = Object.values(extMap).filter(e => e !== ext)
    const otherPaths = otherExts.map(e => `banner/banner.${e}`)
    await supabase.storage.from('tc-assets').remove(otherPaths).catch(() => {
      // Ignore. Remove() errors on files that don't exist, which is fine.
    })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('tc-assets')
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600', // 1 hour CDN cache. Email images get cached by clients anyway.
      })

    if (uploadError) {
      console.error('Banner upload error:', uploadError)
      return NextResponse.json(
        { error: 'Failed to upload banner', details: uploadError.message },
        { status: 500 }
      )
    }

    // --- Public URL ---
    const { data: urlData } = supabase.storage.from('tc-assets').getPublicUrl(filePath)
    // Append a cache-buster so the admin UI preview refreshes immediately
    // after re-upload. Stored URL does NOT include the buster so email
    // clients cache correctly.
    const storedUrl = urlData.publicUrl
    const previewUrl = `${storedUrl}?v=${Date.now()}`

    // --- Update tc_settings ---
    // tc_settings is a singleton table. There is exactly one row. Rather
    // than UPDATE by id (which would require a round-trip to fetch the
    // id first), we update the only row that exists.
    const { data: settingsRow, error: fetchError } = await supabase
      .from('tc_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      console.error('tc_settings fetch error:', fetchError)
      return NextResponse.json(
        { error: 'Failed to read settings row', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!settingsRow) {
      return NextResponse.json(
        { error: 'tc_settings row missing. Run 03_seed_settings.sql.' },
        { status: 500 }
      )
    }

    const { error: updateError } = await supabase
      .from('tc_settings')
      .update({ banner_image_url: storedUrl, updated_at: new Date().toISOString() })
      .eq('id', settingsRow.id)

    if (updateError) {
      console.error('tc_settings update error:', updateError)
      // Best-effort cleanup of the uploaded file so we don't leave an
      // orphan when the DB update fails.
      await supabase.storage.from('tc-assets').remove([filePath]).catch(() => {})
      return NextResponse.json(
        { error: 'Failed to save banner URL', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      banner_image_url: storedUrl,
      preview_url: previewUrl,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Banner upload error:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}

/**
 * DELETE /api/tc/settings/upload-banner
 *
 * Removes the banner file and clears tc_settings.banner_image_url.
 */
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    // Remove all possible banner files (covers any extension we support).
    const paths = ['banner/banner.png', 'banner/banner.jpg', 'banner/banner.webp']
    await supabase.storage.from('tc-assets').remove(paths).catch(() => {})

    const { data: settingsRow } = await supabase
      .from('tc_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (settingsRow) {
      await supabase
        .from('tc_settings')
        .update({ banner_image_url: null, updated_at: new Date().toISOString() })
        .eq('id', settingsRow.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Banner delete error:', error)
    return NextResponse.json({ error: 'Internal server error', details: message }, { status: 500 })
  }
}
