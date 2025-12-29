import { NextRequest, NextResponse } from 'next/server'
import { updateCoordination } from '@/lib/db/coordination'
import { updateListing } from '@/lib/db/listings'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      coordination_id,
      listing_id,
      updates,
      listing_updates,
    } = body
    
    if (updates && Object.keys(updates).length > 0) {
      const success = await updateCoordination(coordination_id, updates)
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update coordination' },
          { status: 500 }
        )
      }
    }
    
    if (listing_updates && Object.keys(listing_updates).length > 0) {
      const success = await updateListing(listing_id, listing_updates)
      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update listing' },
          { status: 500 }
        )
      }
    }
    
    return NextResponse.json({
      success: true,
      message: 'Updated successfully'
    })
    
  } catch (error: any) {
    console.error('Error updating coordination:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update coordination' },
      { status: 500 }
    )
  }
}

