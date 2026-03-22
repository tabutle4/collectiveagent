import { NextRequest, NextResponse } from 'next/server'
import { getAllActiveCoordinations } from '@/lib/db/coordination'
import { getListingById } from '@/lib/db/listings'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  // Coordination is admin-only
  const auth = await requirePermission(request, 'can_manage_coordination')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    // Get all coordinations (active and inactive)
    const { data: allCoordinations, error } = await supabase
      .from('listing_coordination')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching coordinations:', error)
      throw error
    }

    // Fetch listings for each coordination
    const coordinationsWithListings = await Promise.all(
      (allCoordinations || []).map(async coordination => {
        const listing = await getListingById(coordination.listing_id)
        return {
          ...coordination,
          listing,
        }
      })
    )

    return NextResponse.json({
      success: true,
      coordinations: coordinationsWithListings,
    })
  } catch (error: any) {
    console.error('Error in coordination API:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch coordinations' },
      { status: 500 }
    )
  }
}
