'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { X, Search, ArrowUpDown } from 'lucide-react'

interface ListingResponse {
  id: string
  created_at: string
  agent_id: string
  agent_name: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  client_names: string
  client_phone: string | null
  client_email: string | null
  mls_link: string | null
  estimated_launch_date: string | null
  actual_launch_date: string | null
  lead_source: string | null
  status: 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled'
  closed_date: string | null
  updated_at?: string | null
}

export default function AdminTransactionsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [modalOpen, setModalOpen] = useState(false)
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
      // Check for 'Admin' (capital A) to match database schema
      if (!userData.roles || !userData.roles.includes('Admin')) {
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
      // Load ALL listings for ALL agents
      const { data: listingsData, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .order('created_at', { ascending: false })

      if (listingsError) {
        console.error('Error loading listings:', listingsError)
      } else {
        setListings(listingsData || [])
      }
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRowClick = (response: any) => {
    setSelectedResponse(response)
    setModalOpen(true)
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
  const getFilteredAndSortedData = (data: ListingResponse[]) => {
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
      let aVal: any = a[sortField as keyof ListingResponse]
      let bVal: any = b[sortField as keyof ListingResponse]
      
      // Handle null/undefined values
      if (aVal == null) aVal = ''
      if (bVal == null) bVal = ''
      
      // Convert to string for comparison if needed
      if (typeof aVal !== 'string') {
        aVal = String(aVal)
      }
      if (typeof bVal !== 'string') {
        bVal = String(bVal)
      }
      
      // Case-insensitive comparison for strings
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

  if (!user) {
    return null
  }

  return (
    <>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
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
            {/* Active Listings */}
            {activeTab === 'active' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('created_at')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Date
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(activeListings).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getFilteredAndSortedData(activeListings).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">
                      {searchQuery ? 'No active listings match your search' : 'No active listings'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Pending Transactions */}
            {activeTab === 'pending' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('created_at')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Date
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(pendingTransactions).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getFilteredAndSortedData(pendingTransactions).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">
                      {searchQuery ? 'No pending transactions match your search' : 'No pending transactions'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Closed Transactions */}
            {activeTab === 'closed' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('closed_date')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Closed Date
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
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(closedTransactions).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.closed_date || listing.updated_at || listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getFilteredAndSortedData(closedTransactions).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">
                      {searchQuery ? 'No closed transactions match your search' : 'No closed transactions'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cancelled Transactions */}
            {activeTab === 'cancelled' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('updated_at')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Date
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
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(cancelledTransactions).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.updated_at || listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {getFilteredAndSortedData(cancelledTransactions).length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">
                      {searchQuery ? 'No cancelled transactions match your search' : 'No cancelled transactions'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side Modal - Read Only View */}
      {modalOpen && selectedResponse && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto z-50">
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-medium">
                Transaction Details
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Submitted</p>
                <p className="text-sm">{formatDate(selectedResponse.created_at)}</p>
              </div>

              {/* Listing Details */}
              <div className="space-y-4">
                <div className="border-t border-luxury-gray-5 pt-4">
                  <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Listing Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-luxury-gray-2 mb-1">Agent Name</p>
                      <p className="text-sm">{selectedResponse.agent_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-luxury-gray-2 mb-1">Property Address</p>
                      <p className="text-sm">{selectedResponse.property_address}</p>
                    </div>
                    <div>
                      <p className="text-xs text-luxury-gray-2 mb-1">Transaction Type</p>
                      <p className="text-sm capitalize">{selectedResponse.transaction_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-luxury-gray-2 mb-1">Status</p>
                      <p className="text-sm capitalize">{selectedResponse.status}</p>
                    </div>
                    {selectedResponse.estimated_launch_date && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Estimated Launch Date</p>
                        <p className="text-sm">{formatDate(selectedResponse.estimated_launch_date)}</p>
                      </div>
                    )}
                    {selectedResponse.actual_launch_date && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Actual Launch Date</p>
                        <p className="text-sm">{formatDate(selectedResponse.actual_launch_date)}</p>
                      </div>
                    )}
                    {selectedResponse.closed_date && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Closed Date</p>
                        <p className="text-sm">{formatDate(selectedResponse.closed_date)}</p>
                      </div>
                    )}
                    {selectedResponse.lead_source && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Lead Source</p>
                        <p className="text-sm">{selectedResponse.lead_source}</p>
                      </div>
                    )}
                    {selectedResponse.mls_link && (
                      <div className="col-span-2">
                        <p className="text-xs text-luxury-gray-2 mb-1">MLS Link</p>
                        <a
                          href={selectedResponse.mls_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline"
                        >
                          {selectedResponse.mls_link}
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-luxury-gray-5 pt-4">
                  <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Client Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-luxury-gray-2 mb-1">Client Name or LLC</p>
                      <p className="text-sm">{selectedResponse.client_names}</p>
                    </div>
                    {selectedResponse.client_phone && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Client Phone</p>
                        <p className="text-sm">{selectedResponse.client_phone}</p>
                      </div>
                    )}
                    {selectedResponse.client_email && (
                      <div>
                        <p className="text-xs text-luxury-gray-2 mb-1">Client Email</p>
                        <p className="text-sm">{selectedResponse.client_email}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

