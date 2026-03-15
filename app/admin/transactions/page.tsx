'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Search, ArrowUpDown } from 'lucide-react'

interface TransactionResponse {
  id: string
  created_at: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  mls_link: string | null
  listing_date: string | null
  lead_source: string | null
  status: 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled'
  closed_date: string | null
  updated_at?: string | null
  // Joined from other tables
  agent_name?: string
  agent_id?: string
  client_names?: string
  client_phone?: string | null
  client_email?: string | null
}

export default function AdminTransactionsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [listings, setListings] = useState<TransactionResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'closed' | 'cancelled'>('active')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      if (userData.role !== 'Admin') {
        router.push('/auth/login')
        return
      }
      setUser(userData)
      loadData()
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load ALL transactions
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })

      if (transactionsError) {
        console.error('Error loading transactions:', transactionsError)
        setListings([])
        return
      }

      if (!transactionsData || transactionsData.length === 0) {
        setListings([])
        return
      }

      const transactionIds = transactionsData.map(t => t.id)

      // Get agents for these transactions
      const { data: agents } = await supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_id')
        .in('transaction_id', transactionIds)
        .eq('agent_role', 'listing_agent')

      // Get agent names
      const agentIds = Array.from(new Set(agents?.map(a => a.agent_id) || []))
      const { data: agentUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
        .in('id', agentIds)

      // Get contacts for these transactions
      const { data: contacts } = await supabase
        .from('transaction_contacts')
        .select('transaction_id, name, phone, email, contact_type')
        .in('transaction_id', transactionIds)
        .in('contact_type', ['seller', 'landlord'])

      // Merge data
      const mergedListings = transactionsData.map(t => {
        const agent = agents?.find(a => a.transaction_id === t.id)
        const agentUser = agentUsers?.find(u => u.id === agent?.agent_id)
        const contact = contacts?.find(c => c.transaction_id === t.id)

        const agentName = agentUser
          ? (agentUser.preferred_first_name && agentUser.preferred_last_name
              ? `${agentUser.preferred_first_name} ${agentUser.preferred_last_name}`
              : `${agentUser.first_name} ${agentUser.last_name}`)
          : ''

        return {
          ...t,
          agent_id: agent?.agent_id || null,
          agent_name: agentName,
          client_names: contact?.name || null,
          client_phone: contact?.phone || null,
          client_email: contact?.email || null,
          estimated_launch_date: t.listing_date,
        }
      })

      setListings(mergedListings)
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRowClick = (transactionId: string) => {
    router.push(`/admin/transactions/${transactionId}`)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  // Group listings into transaction buckets
  const activeListings = listings.filter(l => l.status === 'active')
  const pendingTransactions = listings.filter(l => l.status === 'pending')
  const closedTransactions = listings.filter(l => l.status === 'sold')
  const cancelledTransactions = listings.filter(l => l.status === 'cancelled')

  // Filter and sort function
  const getFilteredAndSortedData = (data: TransactionResponse[]) => {
    let filtered = [...data]
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item =>
        (item.agent_name || '').toLowerCase().includes(query) ||
        (item.property_address || '').toLowerCase().includes(query) ||
        (item.client_names || '').toLowerCase().includes(query) ||
        (item.client_email || '').toLowerCase().includes(query) ||
        (item.client_phone || '').toLowerCase().includes(query)
      )
    }
    
    // Apply sort
    filtered.sort((a, b) => {
      let aVal: any = a[sortField as keyof TransactionResponse]
      let bVal: any = b[sortField as keyof TransactionResponse]
      
      if (aVal == null) aVal = ''
      if (bVal == null) bVal = ''
      
      if (typeof aVal !== 'string') aVal = String(aVal)
      if (typeof bVal !== 'string') bVal = String(bVal)
      
      if (sortField === 'agent_name' || sortField === 'property_address' || sortField === 'client_names') {
        aVal = aVal.toLowerCase()
        bVal = bVal.toLowerCase()
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
    
    return filtered
  }

  const renderTable = (data: TransactionResponse[], showClosedDate = false) => (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-luxury-gray-5">
            <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
              <button
                onClick={() => handleSort(showClosedDate ? 'closed_date' : 'created_at')}
                className="flex items-center gap-1 hover:text-luxury-black transition-colors"
              >
                {showClosedDate ? 'Closed Date' : 'Date'}
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
              <button
                onClick={() => handleSort('agent_name')}
                className="flex items-center gap-1 hover:text-luxury-black transition-colors"
              >
                Agent
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
              <button
                onClick={() => handleSort('property_address')}
                className="flex items-center gap-1 hover:text-luxury-black transition-colors"
              >
                Property Address
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
              <button
                onClick={() => handleSort('client_names')}
                className="flex items-center gap-1 hover:text-luxury-black transition-colors"
              >
                Client Name
                <ArrowUpDown className="w-3 h-3" />
              </button>
            </th>
            <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Type</th>
            {!showClosedDate && (
              <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
            )}
          </tr>
        </thead>
        <tbody>
          {getFilteredAndSortedData(data).map((listing) => (
            <tr
              key={listing.id}
              onClick={() => handleRowClick(listing.id)}
              className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
            >
              <td className="py-3 px-4 text-sm">
                {formatDate(showClosedDate ? (listing.closed_date || listing.updated_at || listing.created_at) : listing.created_at)}
              </td>
              <td className="py-3 px-4 text-sm">{listing.agent_name || '--'}</td>
              <td className="py-3 px-4 text-sm">{listing.property_address}</td>
              <td className="py-3 px-4 text-sm">{listing.client_names || '--'}</td>
              <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
              {!showClosedDate && (
                <td className="py-3 px-4 text-sm">
                  <span className={`px-2 py-1 text-xs rounded capitalize ${
                    listing.status === 'active' ? 'bg-green-100 text-green-800' :
                    listing.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    listing.status === 'sold' ? 'bg-blue-100 text-blue-800' :
                    listing.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {listing.status}
                  </span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {getFilteredAndSortedData(data).length === 0 && (
        <div className="text-center py-12">
          <p className="text-luxury-gray-2">
            {searchQuery ? 'No transactions match your search' : 'No transactions'}
          </p>
        </div>
      )}
    </div>
  )

  if (!user) {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">
          All Transactions
        </h1>
        <p className="text-sm text-luxury-gray-2">
          View all transactions for all agents. Search, filter, and sort to find what you need.
        </p>
      </div>

      <div className="card-section mb-6">
        {/* Tabs */}
        <div className="flex space-x-2 border-b border-luxury-gray-5 mb-4">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'active'
                ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                : 'text-luxury-gray-2 hover:text-luxury-black'
            }`}
          >
            Active Listings ({activeListings.length})
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'pending'
                ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                : 'text-luxury-gray-2 hover:text-luxury-black'
            }`}
          >
            Pending ({pendingTransactions.length})
          </button>
          <button
            onClick={() => setActiveTab('closed')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'closed'
                ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                : 'text-luxury-gray-2 hover:text-luxury-black'
            }`}
          >
            Closed ({closedTransactions.length})
          </button>
          <button
            onClick={() => setActiveTab('cancelled')}
            className={`px-4 py-2 text-sm transition-colors ${
              activeTab === 'cancelled'
                ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                : 'text-luxury-gray-2 hover:text-luxury-black'
            }`}
          >
            Cancelled ({cancelledTransactions.length})
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-2 w-5 h-5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by agent, property address, client name, email, or phone..."
            className="input-luxury pl-12 py-3 text-base w-full"
          />
        </div>
      </div>

      {loading ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading...</p>
        </div>
      ) : (
        <div className="card-section">
          {activeTab === 'active' && renderTable(activeListings)}
          {activeTab === 'pending' && renderTable(pendingTransactions)}
          {activeTab === 'closed' && renderTable(closedTransactions, true)}
          {activeTab === 'cancelled' && renderTable(cancelledTransactions)}
        </div>
      )}
    </div>
  )
}