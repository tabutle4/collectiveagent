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
    
    // First get transaction IDs for this agent
    const { data: agentTransactions, error: agentError } = await supabase
      .from('transaction_internal_agents')
      .select('transaction_id')
      .eq('agent_id', agentId)
    
    if (agentError) {
      console.error('Error fetching agent transactions:', agentError)
      return NextResponse.json(
        { error: 'Failed to search listings' },
        { status: 500 }
      )
    }
    
    if (!agentTransactions?.length) {
      return NextResponse.json({
        success: true,
        listings: [],
      })
    }
    
    const transactionIds = agentTransactions.map(t => t.transaction_id)
    
    // Search for transactions by property address
    let query = supabase
      .from('transactions')
      .select('id, property_address, transaction_type, mls_link, listing_date, lead_source, status, dotloop_file_created, listing_input_requested, photography_requested')
      .in('id', transactionIds)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (addressQuery.trim()) {
      query = query.ilike('property_address', `%${addressQuery.trim()}%`)
    }
    
    const { data: transactions, error } = await query
    
    if (error) {
      console.error('Error searching transactions:', error)
      return NextResponse.json(
        { error: 'Failed to search listings' },
        { status: 500 }
      )
    }
    
    // Filter out closed and cancelled listings
    const filteredTransactions = (transactions || []).filter(
      (t: any) => t.status !== 'closed' && t.status !== 'cancelled'
    ).slice(0, 20)
    
    // Get contact info for each transaction
    const transactionIdsFiltered = filteredTransactions.map(t => t.id)
    
    const { data: contacts } = await supabase
      .from('transaction_contacts')
      .select('transaction_id, name, email, phone, contact_type')
      .in('transaction_id', transactionIdsFiltered)
      .in('contact_type', ['seller', 'landlord'])
    
    // Merge contact info into transactions
    const listingsWithContacts = filteredTransactions.map(t => {
      const contact = contacts?.find(c => c.transaction_id === t.id)
      return {
        ...t,
        client_names: contact?.name || null,
        client_email: contact?.email || null,
        client_phone: contact?.phone || null,
        estimated_launch_date: t.listing_date,
      }
    })
    
    return NextResponse.json({
      success: true,
      listings: listingsWithContacts,
    })
    
  } catch (error: any) {
    console.error('Error searching listings:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search listings' },
      { status: 500 }
    )
  }
}