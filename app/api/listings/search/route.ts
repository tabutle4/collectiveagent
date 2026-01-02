import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const searchParams = request.nextUrl.searchParams
    const agentId = searchParams.get('agent_id')
    const addressQuery = searchParams.get('address') || ''
    
    if (!agentId) {
      return NextResponse.json(
        { error: 'agent_id is required' },
        { status: 400 }
      )
    }
    
    // Search for listings by agent and property address (case-insensitive partial match)
    // Exclude closed or cancelled listings
    let query = supabase
      .from('listings')
      .select('id, property_address, client_names, client_email, client_phone, transaction_type, mls_link, estimated_launch_date, actual_launch_date, lead_source, status, dotloop_file_created, listing_input_requested, photography_requested, is_broker_listing, agent_id, agent_name')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })
      .limit(50) // Get more results to filter
    
    if (addressQuery.trim()) {
      query = query.ilike('property_address', `%${addressQuery.trim()}%`)
    }
    
    const { data: listings, error } = await query
    
    // Filter out closed and cancelled listings
    const filteredListings = (listings || []).filter(
      (listing: any) => listing.status !== 'closed' && listing.status !== 'cancelled'
    ).slice(0, 20) // Limit to 20 after filtering
    
    if (error) {
      console.error('Error searching listings:', error)
      return NextResponse.json(
        { error: 'Failed to search listings' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      listings: filteredListings,
    })
    
  } catch (error: any) {
    console.error('Error searching listings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search listings' },
      { status: 500 }
    )
  }
}

