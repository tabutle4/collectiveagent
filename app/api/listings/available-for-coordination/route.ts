import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const { data: listings, error: listingsError } = await supabase
      .from('listings')
      .select('*')
      .in('status', ['pre-listing', 'active'])
      .order('created_at', { ascending: false })
    
    if (listingsError) {
      throw listingsError
    }
    
    const { data: activeCoordinations } = await supabase
      .from('listing_coordination')
      .select('listing_id')
      .eq('is_active', true)
    
    const activeListingIds = new Set(
      activeCoordinations?.map(c => c.listing_id) || []
    )
    
    const availableListings = listings?.filter(
      listing => !activeListingIds.has(listing.id)
    ) || []
    
    return NextResponse.json({
      success: true,
      listings: availableListings,
    })
    
  } catch (error: any) {
    console.error('Error fetching available listings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch listings' },
      { status: 500 }
    )
  }
}

