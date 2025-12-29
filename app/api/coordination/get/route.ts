import { NextRequest, NextResponse } from 'next/server'
import { getCoordinationById } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')
    
    if (!id) {
      return NextResponse.json(
        { error: 'Coordination ID is required' },
        { status: 400 }
      )
    }
    
    const coordination = await getCoordinationById(id)
    
    if (!coordination) {
      return NextResponse.json(
        { error: 'Coordination not found' },
        { status: 404 }
      )
    }
    
    const listing = await getListingById(coordination.listing_id)
    
    return NextResponse.json({
      success: true,
      coordination,
      listing,
    })
    
  } catch (error: any) {
    console.error('Error fetching coordination:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch coordination' },
      { status: 500 }
    )
  }
}

