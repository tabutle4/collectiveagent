import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_listings')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    const { data: transactions, error: transactionsError } = await supabase
      .from('transactions')
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

    // Get contacts for these transactions
    const transactionIds = availableTransactions.map(t => t.id)

    const { data: contacts } = await supabase
      .from('transaction_contacts')
      .select('transaction_id, name, email, phone, contact_type')
      .in('transaction_id', transactionIds)
      .in('contact_type', ['seller', 'landlord'])

    // Get agents for these transactions
    const { data: agents } = await supabase
      .from('transaction_internal_agents')
      .select('transaction_id, agent_id')
      .in('transaction_id', transactionIds)
      .eq('agent_role', 'listing_agent')

    // Merge contact and agent info into transactions
    const listingsWithDetails = availableTransactions.map(t => {
      const contact = contacts?.find(c => c.transaction_id === t.id)
      const agent = agents?.find(a => a.transaction_id === t.id)
      return {
        ...t,
        client_names: contact?.name || null,
        client_email: contact?.email || null,
        client_phone: contact?.phone || null,
        agent_id: agent?.agent_id || null,
      }
    })

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
