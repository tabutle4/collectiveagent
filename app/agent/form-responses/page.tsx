'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { X, MessageSquare } from 'lucide-react'

interface ListingResponse {
  id: string
  created_at: string
  agent_name: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  client_names: string
  client_phone: string | null
  client_email: string | null
  mls_link: string | null
  mls_login_info: string | null
  estimated_launch_date: string | null
  actual_launch_date: string | null
  lead_source: string | null
  status: 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled'
  pre_listing_form_completed: boolean
  just_listed_form_completed: boolean
  dotloop_file_created: boolean
  photography_requested: boolean
  listing_input_requested: boolean
  closed_date: string | null
  updated_at?: string | null
}

export default function AgentFormResponsesPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
        const data = await response.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    if (!user) fetchUser()
  }, [router, user])
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'closed' | 'cancelled'>('active')
  const [requestingUpdate, setRequestingUpdate] = useState(false)
  const [updateMessage, setUpdateMessage] = useState('')

  useEffect(() => {

    try {
      setUser(user)
      loadData(user?.id)
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router])

  const loadData = async (userId: string) => {
    setLoading(true)
    try {
      // Load listings where agent_id matches the logged-in user
      const { data: listingsData, error: listingsError } = await supabase
        .from('transactions')
        .select('*')
        .eq('agent_id', userId)
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
    setUpdateMessage('')
  }

  const handleRequestUpdate = async () => {
    if (!updateMessage.trim() || !selectedResponse || !user) return

    setRequestingUpdate(true)
    try {
      const response = await fetch('/api/listings/request-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: selectedResponse.id,
          agent_id: user?.id,
          agent_name: user.preferred_first_name && user.preferred_last_name
            ? `${user.preferred_first_name} ${user.preferred_last_name}`
            : `${user.first_name} ${user.last_name}`,
          agent_email: user.email,
          message: updateMessage,
          property_address: selectedResponse.property_address,
        }),
      })

      const data = await response.json()
      if (data.success) {
        alert('Update request sent successfully! An admin will review your request.')
        setUpdateMessage('')
        setModalOpen(false)
      } else {
        alert(`Error: ${data.error || 'Failed to send update request'}`)
      }
    } catch (error) {
      console.error('Error requesting update:', error)
      alert('Failed to send update request. Please try again.')
    } finally {
      setRequestingUpdate(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // Group listings into transaction buckets
  const activeListings = listings.filter(l => l.status === 'active')
  const pendingTransactions = listings.filter(l => l.status === 'pending')
  const closedTransactions = listings.filter(l => l.status === 'sold')
  const cancelledTransactions = listings.filter(l => l.status === 'cancelled')

  if (!user) {
    return null
  }

  return (
    <>
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
          My Transactions
        </h1>
        <p className="text-sm text-luxury-gray-2">
          View your active listings and transactions. Use the update request section if something needs to be changed.
        </p>
      </div>

        <div className="card-section mb-6">
          {/* Tabs */}
          <div className="flex space-x-2 border-b border-luxury-gray-5">
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Property Address</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Client Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeListings.map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
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
                {activeListings.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No active listings</p>
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Property Address</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Client Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Type</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingTransactions.map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
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
                {pendingTransactions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No pending transactions</p>
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Closed Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Property Address</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Client Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedTransactions.map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.closed_date || listing.updated_at || listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {closedTransactions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No closed transactions</p>
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Property Address</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Client Name</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancelledTransactions.map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing)}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.updated_at || listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm capitalize">{listing.transaction_type}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cancelledTransactions.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No cancelled transactions</p>
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
          onClick={() => {
            setModalOpen(false)
            setUpdateMessage('')
          }}
        />
        
        {/* Modal */}
        <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto z-50">
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-medium">
                Transaction Details
              </h2>
              <button
                onClick={() => {
                  setModalOpen(false)
                  setUpdateMessage('')
                }}
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

              {/* Listing Details - same layout for all statuses */}
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

                <div className="border-t border-luxury-gray-5 pt-4">
                  <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Details</h3>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={selectedResponse.dotloop_file_created} readOnly className="w-4 h-4" />
                      <span className="text-sm">Dotloop file created</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={selectedResponse.listing_input_requested} readOnly className="w-4 h-4" />
                      <span className="text-sm">Listing input requested</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" checked={selectedResponse.photography_requested || false} readOnly className="w-4 h-4" />
                      <span className="text-sm">Photography requested</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Request Update Section */}
              <div className="border-t border-luxury-gray-5 pt-6 mt-6">
                <h3 className="text-sm font-medium text-luxury-gray-1 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Request Update
                </h3>
                <p className="text-xs text-luxury-gray-2 mb-3">
                  Need to update information on this form? Send a request to admin with details about what needs to be changed.
                </p>
                <textarea
                  value={updateMessage}
                  onChange={(e) => setUpdateMessage(e.target.value)}
                  placeholder="Describe what information needs to be updated..."
                  className="textarea-luxury w-full mb-3"
                  rows={4}
                />
                <button
                  onClick={handleRequestUpdate}
                  disabled={requestingUpdate || !updateMessage.trim()}
                  className="px-4 py-2 text-sm rounded transition-colors btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {requestingUpdate ? 'Sending...' : 'Send Update Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

