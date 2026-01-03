import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { regenerateFolderSharingLink } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'
import { getCoordinationById, updateCoordination } from '@/lib/db/coordination'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { coordinationId, userId } = body

    if (!coordinationId || !userId) {
      return NextResponse.json(
        { error: 'Coordination ID and User ID are required' },
        { status: 400 }
      )
    }

    // Verify user is admin
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single()

    // Check for 'Admin' (capital A) to match database schema
    if (userError || !userData?.roles?.includes('Admin')) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    // Get coordination and listing
    const coordination = await getCoordinationById(coordinationId)
    if (!coordination) {
      return NextResponse.json(
        { error: 'Coordination not found' },
        { status: 404 }
      )
    }

    const listing = await getListingById(coordination.listing_id)
    if (!listing) {
      return NextResponse.json(
        { error: 'Listing not found' },
        { status: 404 }
      )
    }

    // Regenerate the sharing link with anonymous scope (will find the correct folder format)
    const newSharingUrl = await regenerateFolderSharingLink(
      listing.property_address, 
      listing.id, 
      listing.transaction_type || 'sale'
    )

    // Update the coordination with the new link
    await updateCoordination(coordinationId, {
      onedrive_folder_url: newSharingUrl,
    })

    return NextResponse.json({
      success: true,
      message: 'Folder sharing link regenerated successfully',
      sharingUrl: newSharingUrl,
    })

  } catch (error: any) {
    console.error('Error regenerating folder link:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to regenerate folder link' },
      { status: 500 }
    )
  }
}

