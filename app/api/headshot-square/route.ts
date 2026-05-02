import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
// In-memory cache keyed by user_id + headshot_url + crop hash
// (process-local; resets on cold start. Good enough for headshot serving.)
const CACHE = new Map<string, { buffer: Buffer; etag: string; mtime: number }>()
const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour

const EDIT_CANVAS_SIZE = 128 // matches HeadshotUpload's "large" preview size
const OUTPUT_SIZE = 300 // square output for email signature

// Public route (no auth) so the URL can be embedded in email signatures and used cross-client.
// Risk: anyone with a user_id can fetch their public headshot. This is no different from
// directly accessing users.headshot_url which is already public storage.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get('user_id')

  if (!userId) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  try {
    // Look up user's headshot_url + headshot_crop
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('headshot_url, headshot_crop')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('headshot-square user fetch error:', error)
      return NextResponse.json({ error: 'User lookup failed' }, { status: 500 })
    }

    if (!user || !user.headshot_url) {
      return NextResponse.json({ error: 'No headshot for user' }, { status: 404 })
    }

    const headshotUrl: string = user.headshot_url
    const crop = (user.headshot_crop || { offsetX: 0, offsetY: 0, scale: 1 }) as {
      offsetX: number
      offsetY: number
      scale: number
    }

    // Cache key based on URL + crop values
    const cacheKey = `${userId}:${headshotUrl}:${crop.offsetX}:${crop.offsetY}:${crop.scale}`
    const cached = CACHE.get(cacheKey)
    if (cached && Date.now() - cached.mtime < CACHE_TTL_MS) {
      return new NextResponse(new Uint8Array(cached.buffer), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600',
          'ETag': cached.etag,
        },
      })
    }

    // Download the source image
    const imgRes = await fetch(headshotUrl, { cache: 'no-store' })
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Source image fetch failed' }, { status: 502 })
    }
    const sourceBuffer = Buffer.from(await imgRes.arrayBuffer())

    // Apply the same transform the browser preview uses:
    //   1. Image fills the 128×128 edit canvas with object-fit:cover (resize so smaller dim = 128, crop center on the larger).
    //   2. The image is then translated by (offsetX, offsetY) and scaled by `scale` from center.
    //   3. Visible area is the 128×128 frame.
    //
    // Replicated in sharp:
    //   - Step 1: resize+cover to 128×128 (this is the "base" - the image as it sits before transform)
    //   - Step 2: scale up by `scale` factor → larger image
    //   - Step 3: extract a 128×128 region. The "center" of the original (64,64) maps to
    //             the center of the scaled image (64*scale, 64*scale), then offset by (offsetX, offsetY).
    //             Region top-left = (centerX - 64 - offsetX, centerY - 64 - offsetY)
    //             where centerX = scaledWidth/2, centerY = scaledHeight/2.

    const safeScale = Math.max(0.1, Math.min(10, Number(crop.scale) || 1))
    const safeOffsetX = Number.isFinite(crop.offsetX) ? Number(crop.offsetX) : 0
    const safeOffsetY = Number.isFinite(crop.offsetY) ? Number(crop.offsetY) : 0

    // Step 1: resize/crop source to 128×128 with object-fit:cover behavior
    const baseImage = await sharp(sourceBuffer)
      .rotate() // honor EXIF orientation
      .resize(EDIT_CANVAS_SIZE, EDIT_CANVAS_SIZE, {
        fit: 'cover',
        position: 'centre',
      })
      .toBuffer()

    // Step 2: scale up
    const scaledSize = Math.round(EDIT_CANVAS_SIZE * safeScale)
    const scaledBuffer = await sharp(baseImage)
      .resize(scaledSize, scaledSize, { fit: 'fill' })
      .toBuffer()

    // Step 3: extract 128×128 with offsets
    const centerX = scaledSize / 2
    const centerY = scaledSize / 2
    let extractLeft = Math.round(centerX - EDIT_CANVAS_SIZE / 2 - safeOffsetX)
    let extractTop = Math.round(centerY - EDIT_CANVAS_SIZE / 2 - safeOffsetY)

    // Clamp so we never extract outside the scaled image
    extractLeft = Math.max(0, Math.min(scaledSize - EDIT_CANVAS_SIZE, extractLeft))
    extractTop = Math.max(0, Math.min(scaledSize - EDIT_CANVAS_SIZE, extractTop))

    const cropped = await sharp(scaledBuffer)
      .extract({
        left: extractLeft,
        top: extractTop,
        width: EDIT_CANVAS_SIZE,
        height: EDIT_CANVAS_SIZE,
      })
      // Upscale to output size for retina-quality email rendering
      .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: 'fill' })
      .png({ compressionLevel: 9 })
      .toBuffer()

    const etag = `"${userId}-${Date.now()}"`
    CACHE.set(cacheKey, { buffer: cropped, etag, mtime: Date.now() })

    return new NextResponse(new Uint8Array(cropped), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
        'ETag': etag,
      },
    })
  } catch (err: any) {
    console.error('headshot-square exception:', err)
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
