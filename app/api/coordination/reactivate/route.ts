import { NextRequest, NextResponse } from 'next/server'
import { reactivateCoordination, getCoordinationById } from '@/lib/db/coordination'
import { unarchiveListingFolder } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { coordination_id } = body
    
    const success = await reactivateCoordination(coordination_id)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to reactivate coordination' },
        { status: 500 }
      )
    }
    
    // Move OneDrive folder back from Archive to Active
    try {
      const coordination = await getCoordinationById(coordination_id)
      if (coordination) {
        const listing = await getListingById(coordination.listing_id)
        if (listing) {
          await unarchiveListingFolder(listing.property_address, listing.id)
        }
      }
    } catch (error) {
      console.error('Error unarchiving OneDrive folder:', error)
      // Continue even if folder unarchiving fails (folder might not exist in Archive)
    }
    
    return NextResponse.json({
      success: true,
      message: 'Coordination reactivated successfully'
    })
    
  } catch (error: any) {
    console.error('Error reactivating coordination:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to reactivate coordination' },
      { status: 500 }
    )
  }
}

