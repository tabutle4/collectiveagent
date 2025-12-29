import { NextRequest, NextResponse } from 'next/server'
import { deactivateCoordination } from '@/lib/db/coordination'
import { archiveListingFolder } from '@/lib/microsoft-graph'
import { getListingById } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { coordination_id, listing_id } = body
    
    const success = await deactivateCoordination(coordination_id)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to deactivate coordination' },
        { status: 500 }
      )
    }
    
    try {
      const listing = await getListingById(listing_id)
      if (listing) {
        await archiveListingFolder(listing.property_address, listing_id)
      }
    } catch (error) {
      console.error('Error archiving folder:', error)
    }
    
    return NextResponse.json({
      success: true,
      message: 'Coordination deactivated successfully'
    })
    
  } catch (error: any) {
    console.error('Error deactivating coordination:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate coordination' },
      { status: 500 }
    )
  }
}

