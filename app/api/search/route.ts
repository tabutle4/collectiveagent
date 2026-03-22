import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ADMIN_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Get current user
    const { data: session } = await supabase.auth.getSession()
    if (!session?.session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user role
    const { data: currentUser } = await supabase
      .from('users')
      .select('id, role')
      .eq('auth_id', session.session.user.id)
      .single()

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const userRole = (currentUser.role || '').toLowerCase()
    const isStaff = ADMIN_ROLES.includes(userRole)

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim()

    if (!query || query.length < 2) {
      return NextResponse.json({ users: [], transactions: [], contacts: [] })
    }

    const searchPattern = `%${query}%`

    // Search users (staff sees all active, agents see none)
    let users: any[] = []
    if (isStaff) {
      const { data: userResults } = await supabase
        .from('users')
        .select('id, preferred_first_name, preferred_last_name, email, role, status, office')
        .or(`preferred_first_name.ilike.${searchPattern},preferred_last_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
        .eq('status', 'active')
        .limit(10)

      users = (userResults || []).map((u: any) => ({
        id: u.id,
        name: `${u.preferred_first_name || ''} ${u.preferred_last_name || ''}`.trim(),
        email: u.email,
        role: u.role,
        office: u.office,
        type: 'user',
      }))
    }

    // Search transactions (staff sees all, agents see their own)
    let transactionQuery = supabase
      .from('transactions')
      .select(`
        id,
        property_address,
        area,
        client_name,
        status,
        submitted_by
      `)
      .or(`property_address.ilike.${searchPattern},client_name.ilike.${searchPattern}`)
      .neq('status', 'cancelled')
      .limit(10)

    if (!isStaff) {
      transactionQuery = transactionQuery.eq('submitted_by', currentUser.id)
    }

    const { data: transactionResults } = await transactionQuery

    // Get agent names for transactions
    const agentIds = [...new Set((transactionResults || []).map((t: any) => t.submitted_by).filter(Boolean))]
    let agentMap: Record<string, string> = {}
    
    if (agentIds.length > 0) {
      const { data: agents } = await supabase
        .from('users')
        .select('id, preferred_first_name, preferred_last_name')
        .in('id', agentIds)
      
      agents?.forEach((a: any) => {
        agentMap[a.id] = `${a.preferred_first_name || ''} ${a.preferred_last_name || ''}`.trim()
      })
    }

    const transactions = (transactionResults || []).map((t: any) => ({
      id: t.id,
      address: t.property_address || 'No address',
      city: t.area,
      client: t.client_name,
      status: t.status,
      agent: agentMap[t.submitted_by] || null,
      type: 'transaction',
    }))

    // Search transaction_contacts (staff sees all, agents see contacts on their own transactions)
    let contacts: any[] = []
    
    // First get matching contacts
    const { data: contactResults } = await supabase
      .from('transaction_contacts')
      .select(`
        id,
        name,
        email,
        phone,
        company,
        contact_type,
        transaction_id
      `)
      .or(`name.ilike.${searchPattern},company.ilike.${searchPattern}`)
      .limit(20)

    if (contactResults && contactResults.length > 0) {
      // Get transaction info for these contacts
      const txnIds = [...new Set(contactResults.map((c: any) => c.transaction_id))]
      const { data: txnData } = await supabase
        .from('transactions')
        .select('id, property_address, submitted_by')
        .in('id', txnIds)

      const txnMap: Record<string, { address: string; submittedBy: string }> = {}
      txnData?.forEach((t: any) => {
        txnMap[t.id] = { address: t.property_address, submittedBy: t.submitted_by }
      })

      // Filter by access and map results
      contacts = contactResults
        .filter((c: any) => {
          const txn = txnMap[c.transaction_id]
          if (!txn) return false
          // If not staff, only show contacts on their own transactions
          if (!isStaff && txn.submittedBy !== currentUser.id) return false
          return true
        })
        .slice(0, 10)
        .map((c: any) => ({
          id: c.id,
          name: c.name || 'Unknown',
          email: extractFromJsonb(c.email),
          phone: extractFromJsonb(c.phone),
          company: c.company,
          contactType: c.contact_type,
          transactionId: c.transaction_id,
          transactionAddress: txnMap[c.transaction_id]?.address || null,
          type: 'contact',
        }))
    }

    return NextResponse.json({ users, transactions, contacts })
  } catch (error: any) {
    console.error('Search API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Helper to extract first value from jsonb field (could be object or array)
function extractFromJsonb(value: any): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0] || null
  if (typeof value === 'object') {
    // Try common keys
    return value.primary || value.main || value.value || Object.values(value)[0] || null
  }
  return null
}