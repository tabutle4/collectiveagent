import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { userId, crop } = await request.json()

    if (!userId || !crop || typeof crop !== 'object') {
      return NextResponse.json(
        { error: 'User ID and crop settings are required' },
        { status: 400 }
      )
    }

    const { offsetX, offsetY, scale } = crop as {
      offsetX: number
      offsetY: number
      scale: number
    }

    if (
      typeof offsetX !== 'number' ||
      typeof offsetY !== 'number' ||
      typeof scale !== 'number'
    ) {
      return NextResponse.json(
        { error: 'Invalid crop settings' },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        headshot_crop: {
          offsetX,
          offsetY,
          scale,
        },
      })
      .eq('id', userId)
      .select('id, headshot_crop')
      .single()

    if (error) {
      console.error('Error updating headshot crop:', error)
      throw error
    }

    return NextResponse.json({
      success: true,
      crop: data.headshot_crop,
    })
  } catch (error: any) {
    console.error('Headshot crop update error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update headshot crop' },
      { status: 500 }
    )
  }
}


