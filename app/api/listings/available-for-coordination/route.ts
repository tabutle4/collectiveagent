import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_listings')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    const { data: transactions, error: transactionsError } = await supabase
      .from('listings')
      .select('*')
      .in('status', ['pre-listing', 'active'])
      .order('created_at', { ascending: false })

    if (transactionsError) {
      throw transactionsError
    }

    const { data: activeCoordinations } = await supabase
      .from('listing_coordination')
      .select('listing_id')
      .eq('is_active', true)

    const activeListingIds = new Set(activeCoordinations?.map(c => c.listing_id) || [])

    const availableTransactions = transactions?.filter(t => !activeListingIds.has(t.id)) || []

    // listings table has client info directly on the row — no joins needed
    const listingsWithDetails = availableTransactions.map(t => ({
      ...t,
      client_names: t.client_names || null,
      client_email: t.client_email || null,
      client_phone: t.client_phone || null,
      agent_id: t.agent_id || null,
    }))

    return NextResponse.json({
      success: true,
      listings: listingsWithDetails,
    })
  } catch (error: any) {
    console.error('Error fetching available listings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch listings' },
      { status: 500 }
    )
  }
}
