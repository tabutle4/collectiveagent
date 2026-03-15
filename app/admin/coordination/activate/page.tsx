'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Listing } from '@/types/listing-coordination'
import { supabase } from '@/lib/supabase'

export default function ActivateCoordinationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null)
  
  const [formData, setFormData] = useState({
    listing_id: '',
    seller_name: '',
    seller_email: '',
    listing_website_url: '',
    payment_method: '' as 'client_direct' | 'agent_pays' | 'broker_listing' | '',
    custom_fee: '',
  })
  
  useEffect(() => {
    loadListings()
  }, [])
  
  const loadListings = async () => {
    try {
      const response = await fetch('/api/listings/available-for-coordination')
      const data = await response.json()
      if (data.success) {
        setListings(data.listings)
      }
    } catch (error) {
      console.error('Error loading listings:', error)
    }
  }
  
  const handleListingSelect = async (listingId: string) => {
    const listing = listings.find(l => l.id === listingId)
    setSelectedListing(listing || null)
    
    if (listing) {
      // Check if agent is Courtney Okanlomo
      let isCourtneyOkanlomo = false
      if (listing.agent_name) {
        const agentNameLower = listing.agent_name.toLowerCase()
        isCourtneyOkanlomo = agentNameLower.includes('courtney okanlomo') || agentNameLower.includes('okanlomo')
      } else if (listing.agent_id) {
        // Fetch agent data to check name
        try {
          const { data: agentData } = await supabase
            .from('users')
            .select('preferred_first_name, preferred_last_name, first_name, last_name')
            .eq('id', listing.agent_id)
            .single()
          
          if (agentData) {
            const agentName = `${agentData.preferred_first_name || agentData.first_name} ${agentData.preferred_last_name || agentData.last_name}`.toLowerCase()
            isCourtneyOkanlomo = agentName.includes('courtney okanlomo') || agentName.includes('okanlomo')
          }
        } catch (error) {
          console.error('Error fetching agent data:', error)
        }
      }
      
      setFormData({
        listing_id: listingId,
        seller_name: listing.client_names,
        seller_email: listing.client_email || '',
        listing_website_url: listing.listing_website_url || '',
        payment_method: isCourtneyOkanlomo ? 'broker_listing' : '',
        custom_fee: isCourtneyOkanlomo ? '0' : '',
      })
    }
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    try {
      const response = await fetch('/api/coordination/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          agent_id: selectedListing?.agent_id,
          custom_service_fee: formData.custom_fee ? parseFloat(formData.custom_fee) : undefined,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Coordination activated successfully! Welcome email has been sent.')
        router.push('/admin/coordination')
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error activating coordination:', error)
      alert('Failed to activate coordination')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="card-section">
          <div className="mb-6">
            <button
              onClick={() => router.push('/admin/coordination')}
              className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-4"
            >
              ← Back to Dashboard
            </button>
            <h1 className="text-xl font-semibold text-luxury-gray-1">
              Activate Listing Coordination
            </h1>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Select Listing <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.listing_id}
                onChange={(e) => handleListingSelect(e.target.value)}
                className="select-luxury"
                required
              >
                <option value="">Choose a listing...</option>
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.property_address} - {listing.client_names}
                  </option>
                ))}
              </select>
              {listings.length === 0 && (
                <p className="text-xs text-luxury-gray-2 mt-1">
                  No listings available for coordination. Create a listing first.
                </p>
              )}
            </div>
            
            {selectedListing && (
              <>
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Seller Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.seller_name}
                    onChange={(e) => setFormData({...formData, seller_name: e.target.value})}
                    className="input-luxury"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Seller Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={formData.seller_email}
                    onChange={(e) => setFormData({...formData, seller_email: e.target.value})}
                    className="input-luxury"
                    required
                  />
                  <p className="text-xs text-luxury-gray-2 mt-1">
                    Weekly reports will be sent to this email
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Listing Website URL
                  </label>
                  <input
                    type="url"
                    value={formData.listing_website_url}
                    onChange={(e) => setFormData({...formData, listing_website_url: e.target.value})}
                    className="input-luxury"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-luxury-gray-2 mt-1">
                    Optional: Link to the listing on your website (will appear in seller dashboard)
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Payment Method <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-3">
                    <label className="flex items-start space-x-3 cursor-pointer p-3 border border-luxury-gray-5 rounded hover:border-luxury-black transition-colors">
                      <input
                        type="radio"
                        name="payment_method"
                        value="client_direct"
                        checked={formData.payment_method === 'client_direct'}
                        onChange={(e) => setFormData({...formData, payment_method: e.target.value as 'client_direct'})}
                        className="mt-0.5"
                        required
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Client Pays Directly</p>
                        <p className="text-xs text-luxury-gray-2">
                          Client pays $250 before service starts. Must be in listing agreement.
                        </p>
                      </div>
                    </label>
                    
                    <label className="flex items-start space-x-3 cursor-pointer p-3 border border-luxury-gray-5 rounded hover:border-luxury-black transition-colors">
                      <input
                        type="radio"
                        name="payment_method"
                        value="agent_pays"
                        checked={formData.payment_method === 'agent_pays'}
                        onChange={(e) => setFormData({...formData, payment_method: e.target.value as 'agent_pays'})}
                        className="mt-0.5"
                        required
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Agent Pays</p>
                        <p className="text-xs text-luxury-gray-2">
                          You pay $250 to brokerage within 60 days or at closing, whichever happens first. If not paid within 60 days, fee will be deducted from any commission.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Service Fee Override (Optional)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.custom_fee}
                    onChange={(e) => setFormData({...formData, custom_fee: e.target.value})}
                    className="input-luxury"
                    placeholder="Leave blank for default $250"
                  />
                  <p className="text-xs text-luxury-gray-2 mt-1">
                    Enter $0 for broker/owner listings. Leave blank to use default $250 fee.
                  </p>
                </div>
                
                <div className="bg-luxury-light p-4 rounded">
                  <h3 className="text-sm font-medium mb-2">What happens next:</h3>
                  <ul className="list-disc list-inside space-y-1 text-xs text-luxury-gray-1">
                    <li>OneDrive folder will be created automatically</li>
                    <li>Seller will receive a welcome email with dashboard access link</li>
                    <li>Weekly reports will be sent every Monday at 6:00 PM</li>
                    <li>Magic link for seller dashboard will be generated</li>
                  </ul>
                </div>
              </>
            )}
            
            <div className="flex justify-center gap-4 pt-6">
              <button
                type="button"
                onClick={() => router.push('/admin/coordination')}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !selectedListing}
                className="px-6 py-2.5 text-sm rounded transition-colors btn-primary disabled:opacity-50"
              >
                {loading ? 'Activating...' : 'Activate Coordination'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

