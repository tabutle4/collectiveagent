import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { listingId, userId } = body

    if (!listingId || !userId) {
      return NextResponse.json(
        { error: 'Listing ID and User ID are required' },
        { status: 400 }
      )
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    // Check role (simple string, not array)
    if (userError || userData?.role !== 'Admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Check if listing has an active coordination
    const { data: coordination } = await supabase
      .from('listing_coordination')
      .select('id')
      .eq('listing_id', listingId)
      .single()

    if (coordination) {
      return NextResponse.json(
        { 
          error: 'Cannot delete listing with active coordination. Delete the coordination first.',
          hasCoordination: true,
          coordinationId: coordination.id
        },
        { status: 400 }
      )
    }

    // Delete the listing
    const { error: deleteError } = await supabase
      .from('listings')
      .delete()
      .eq('id', listingId)

    if (deleteError) {
      console.error('Error deleting listing:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete listing' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Listing deleted successfully'
    })

  } catch (error: any) {
    console.error('Error in delete listing API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete listing' },
      { status: 500 }
    )
  }
}

