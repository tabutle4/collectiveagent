'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ServiceConfiguration } from '@/types/listing-coordination'

export default function PreListingForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [coordinationConfig, setCoordinationConfig] = useState<ServiceConfiguration | null>(null)
  const [agents, setAgents] = useState<Array<{id: string, name: string}>>([])
  const [submissionType, setSubmissionType] = useState<'new' | 'update'>('new')
  const [agentSearch, setAgentSearch] = useState('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<{id: string, name: string} | null>(null)
  const agentDropdownRef = useRef<HTMLDivElement>(null)
  
  const [formData, setFormData] = useState({
    agent_id: '',
    agent_name: '',
    property_address: '',
    transaction_type: 'sale' as 'sale' | 'lease',
    client_names: '',
    client_phone: '',
    client_email: '',
    estimated_launch_date: '',
    lead_source: '',
    dotloop_file_created: false,
    listing_input_requested: false,
    listing_input_payment_method: '' as 'zelle' | 'invoice' | '',
    coordination_requested: false,
    coordination_payment_method: '' as 'client_direct' | 'agent_pays' | '',
    coordination_payment_type: '' as 'zelle' | 'invoice' | '',
    photography_requested: false,
    is_broker_listing: false,
  })
  
  useEffect(() => {
    fetch('/api/service-config/get?type=listing_coordination')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setCoordinationConfig(data.config)
        }
      })
      .catch(err => console.error('Error fetching service config:', err))
    
    // Load agents for dropdown
    fetch('/api/agents/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.agents) {
          setAgents(data.agents)
          // Auto-select logged-in user if they're an agent
          const userStr = localStorage.getItem('user')
          if (userStr) {
            try {
              const user = JSON.parse(userStr)
              const agentName = `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`.trim()
              const matchingAgent = data.agents.find((a: any) => a.id === user.id)
              if (matchingAgent) {
                setSelectedAgent(matchingAgent)
                setAgentSearch(matchingAgent.name)
                setFormData(prev => ({ ...prev, agent_id: matchingAgent.id, agent_name: matchingAgent.name }))
              }
            } catch (error) {
              console.error('Error parsing user data:', error)
            }
          }
        }
      })
      .catch(err => console.error('Error fetching agents:', err))
  }, [])
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setAgentDropdownOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const handleAgentSelect = (agent: {id: string, name: string}) => {
    setSelectedAgent(agent)
    setAgentSearch(agent.name)
    setAgentDropdownOpen(false)
    setFormData({
      ...formData,
      agent_id: agent.id,
      agent_name: agent.name,
    })
  }
  
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(agentSearch.toLowerCase())
  )
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedAgent) {
      alert('Please select an agent from the dropdown')
      return
    }
    
    setLoading(true) // Set loading immediately
    
    try {
      // Get user from localStorage
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        setLoading(false)
        alert('Please log in to submit this form')
        router.push('/auth/login')
        return
      }
      
      const user = JSON.parse(userStr)
      
      const response = await fetch('/api/listings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          submission_type: submissionType,
          user_id: user.id,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Pre-listing form submitted successfully!')
        // Redirect to user's dashboard based on role (simple string, not array)
        if (user.role === 'Admin') {
          router.push('/admin/dashboard')
        } else {
          router.push('/forms/success')
        }
      } else {
        alert(`Error: ${data.error || 'Failed to submit form'}`)
        setLoading(false)
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      alert('Failed to submit form. Please try again.')
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="card-section">
          <h1 className="text-2xl font-light mb-2 tracking-luxury">Pre-Listing Form</h1>
          <p className="text-sm text-luxury-gray-2 mb-6">
            Submit this form when you have executed a new listing agreement
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Is this a new submission or an update to an existing transaction? <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="submission_type"
                    value="new"
                    checked={submissionType === 'new'}
                    onChange={(e) => setSubmissionType('new')}
                    className="mt-0.5"
                    required
                  />
                  <span className="text-sm">New Submission</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="submission_type"
                    value="update"
                    checked={submissionType === 'update'}
                    onChange={(e) => setSubmissionType('update')}
                    className="mt-0.5"
                    required
                  />
                  <span className="text-sm">Update Existing Transaction</span>
                </label>
              </div>
              {submissionType === 'update' && (
                <p className="text-xs text-luxury-gray-2 mt-2">
                  The system will find the existing transaction by matching the property address and agent you select below.
                </p>
              )}
            </div>
            
            <div className="relative" ref={agentDropdownRef}>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Agent <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={agentSearch}
                onChange={(e) => {
                  setAgentSearch(e.target.value)
                  setAgentDropdownOpen(true)
                  if (!e.target.value) {
                    setSelectedAgent(null)
                    setFormData({...formData, agent_id: '', agent_name: ''})
                  }
                }}
                onFocus={() => {
                  if (agentSearch) {
                    setAgentDropdownOpen(true)
                  }
                }}
                className="input-luxury"
                placeholder="Type to search for an agent..."
                required
                autoComplete="off"
              />
              {agentDropdownOpen && agentSearch && filteredAgents.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-auto">
                  {filteredAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => handleAgentSelect(agent)}
                      className="w-full text-left px-4 py-2 hover:bg-luxury-light transition-colors text-sm"
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              )}
              {agentDropdownOpen && agentSearch && filteredAgents.length === 0 && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg px-4 py-2 text-sm text-luxury-gray-2">
                  No agents found
                </div>
              )}
              {selectedAgent && (
                <input type="hidden" name="agent_id" value={selectedAgent.id} />
              )}
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Property Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.property_address}
                onChange={(e) => setFormData({...formData, property_address: e.target.value})}
                className="input-luxury"
                placeholder="123 Main St, Houston, TX 77001"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Transaction Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.transaction_type}
                onChange={(e) => setFormData({...formData, transaction_type: e.target.value as 'sale' | 'lease'})}
                className="select-luxury"
                required
              >
                <option value="sale">Sale</option>
                <option value="lease">Lease</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Client Name or LLC <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.client_names}
                onChange={(e) => setFormData({...formData, client_names: e.target.value})}
                className="input-luxury"
                placeholder="John and Jane Doe or ABC LLC"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Client Phone Number(s) <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.client_phone}
                onChange={(e) => setFormData({...formData, client_phone: e.target.value})}
                className="input-luxury"
                placeholder="(555) 123-4567"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Client Email Address(es) <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={formData.client_email}
                onChange={(e) => setFormData({...formData, client_email: e.target.value})}
                className="input-luxury"
                placeholder="client@example.com"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                What is the source of this lead? <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.lead_source}
                onChange={(e) => setFormData({...formData, lead_source: e.target.value})}
                className="select-luxury"
                required
              >
                <option value="">Select a source</option>
                <option value="brokerage_referral">Brokerage Referral</option>
                <option value="client_referral">Client Referral</option>
                <option value="other_referral">Other Referral</option>
                <option value="kvcore_lead">kvCORE Lead</option>
                <option value="mls_lead">MLS Lead</option>
                <option value="ig_lead">IG Lead</option>
                <option value="repeat_client">Repeat Client</option>
                <option value="print_advertising">Print Advertising</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm mb-2 text-luxury-gray-1">
                Estimated Listing Launch Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.estimated_launch_date}
                onChange={(e) => setFormData({...formData, estimated_launch_date: e.target.value})}
                className="input-luxury"
                required
              />
            </div>
            
            <div className="border-t border-luxury-gray-5 pt-6 mt-8">
              <h3 className="text-lg font-medium mb-4">Optional Services</h3>
              
              <div className="bg-luxury-light p-4 rounded mb-4">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.listing_input_requested}
                    onChange={(e) => setFormData({...formData, listing_input_requested: e.target.checked})}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-base mb-1">Request Initial Listing Input - $50 <span className="text-xs font-normal text-luxury-gray-2">(one time)</span></p>
                    <p className="text-xs text-luxury-gray-2 mb-2">
                      Includes listing the property in the MLS, as well as up to 2 additional edits.
                    </p>
                    <div className="bg-white p-3 rounded border border-luxury-gray-5 mb-2">
                      <p className="text-sm font-medium mb-1">Agent Pays (Due in 60 Days or at Closing)</p>
                      <p className="text-xs text-luxury-gray-2">
                        You pay $50 to brokerage within 60 days or at closing, whichever happens first. If not paid within 60 days, fee will be deducted from any commission.
                      </p>
                    </div>
                    {formData.listing_input_requested && (
                      <div className="mt-3 ml-7 pl-4 border-l-2 border-luxury-gray-5">
                        <p className="text-xs font-medium text-luxury-gray-1 mb-2">
                          Payment Method <span className="text-red-500">*</span>
                        </p>
                        <div className="space-y-2">
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name="listing_input_payment_method"
                              value="zelle"
                              checked={formData.listing_input_payment_method === 'zelle'}
                              onChange={(e) => setFormData({...formData, listing_input_payment_method: e.target.value as 'zelle'})}
                              className="mt-0.5"
                              required={formData.listing_input_requested}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Zelle</p>
                              <p className="text-xs text-luxury-gray-2">
                                Send payment to info@collectiverealtyco.com
                              </p>
                            </div>
                          </label>
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name="listing_input_payment_method"
                              value="invoice"
                              checked={formData.listing_input_payment_method === 'invoice'}
                              onChange={(e) => setFormData({...formData, listing_input_payment_method: e.target.value as 'invoice'})}
                              className="mt-0.5"
                              required={formData.listing_input_requested}
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Invoice</p>
                              <p className="text-xs text-luxury-gray-2">
                                The office will send an invoice to you (agent).
                              </p>
                            </div>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              
              {coordinationConfig && (
                <div className="bg-luxury-light p-4 rounded mb-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.coordination_requested}
                      onChange={(e) => setFormData({...formData, coordination_requested: e.target.checked})}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-base mb-1">
                        {coordinationConfig.service_name} - ${coordinationConfig.price} <span className="text-xs font-normal text-luxury-gray-2">(one time)</span>
                      </p>
                      {coordinationConfig.inclusions && coordinationConfig.inclusions.length > 0 && (
                        <ul className="list-disc list-inside space-y-1 text-xs text-luxury-gray-1 ml-4 mb-3">
                          {coordinationConfig.inclusions.map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </label>
                  
                  {formData.coordination_requested && (
                    <div className="mt-4 ml-7 pl-4 border-l-2 border-luxury-gray-5">
                      <p className="text-xs font-medium text-luxury-gray-1 mb-2">
                        Who Pays? <span className="text-red-500">*</span>
                      </p>
                      <div className="space-y-2 mb-4">
                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="radio"
                            name="coordination_payment_method"
                            value="client_direct"
                            checked={formData.coordination_payment_method === 'client_direct'}
                            onChange={(e) => setFormData({...formData, coordination_payment_method: e.target.value as 'client_direct', coordination_payment_type: ''})}
                            className="mt-0.5"
                            required={formData.coordination_requested}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Client Pays Directly (Before Service Starts)</p>
                            <p className="text-xs text-luxury-gray-2">
                              $250 fee included in listing agreement. Client pays brokerage before coordination begins.
                            </p>
                          </div>
                        </label>
                        
                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="radio"
                            name="coordination_payment_method"
                            value="agent_pays"
                            checked={formData.coordination_payment_method === 'agent_pays'}
                            onChange={(e) => setFormData({...formData, coordination_payment_method: e.target.value as 'agent_pays', coordination_payment_type: ''})}
                            className="mt-0.5"
                            required={formData.coordination_requested}
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Agent Pays (Before Service Starts)</p>
                            <p className="text-xs text-luxury-gray-2">
                              You pay brokerage before coordination begins.
                            </p>
                          </div>
                        </label>
                      </div>
                      
                      {formData.coordination_payment_method && (
                        <div className="mt-3">
                          <p className="text-xs font-medium text-luxury-gray-1 mb-2">
                            Payment Method <span className="text-red-500">*</span>
                          </p>
                          <div className="space-y-2">
                            <label className="flex items-start space-x-3 cursor-pointer">
                              <input
                                type="radio"
                                name="coordination_payment_type"
                                value="zelle"
                                checked={formData.coordination_payment_type === 'zelle'}
                                onChange={(e) => setFormData({...formData, coordination_payment_type: e.target.value as 'zelle'})}
                                className="mt-0.5"
                                required={formData.coordination_requested}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">Zelle</p>
                                <p className="text-xs text-luxury-gray-2">
                                  Send payment to info@collectiverealtyco.com
                                </p>
                              </div>
                            </label>
                            <label className="flex items-start space-x-3 cursor-pointer">
                              <input
                                type="radio"
                                name="coordination_payment_type"
                                value="invoice"
                                checked={formData.coordination_payment_type === 'invoice'}
                                onChange={(e) => setFormData({...formData, coordination_payment_type: e.target.value as 'invoice'})}
                                className="mt-0.5"
                                required={formData.coordination_requested}
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium">Invoice</p>
                                <p className="text-xs text-luxury-gray-2">
                                  {formData.coordination_payment_method === 'client_direct'
                                    ? 'The office will send an invoice to the client.'
                                    : 'The office will send an invoice to you (agent).'}
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="border-t border-luxury-gray-5 pt-6 mt-8">
              <h3 className="text-lg font-medium mb-4">Before Submitting</h3>
              <div className="bg-luxury-light p-4 rounded">
                <p className="text-sm mb-3">Please complete the following:</p>
                <ol className="list-decimal list-inside space-y-2 text-sm text-luxury-gray-1 mb-4">
                  <li>Create a Dotloop file</li>
                  <li>Add the listing and/or seller disclosure</li>
                  <li>Change the loop name to the complete property address</li>
                </ol>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.dotloop_file_created}
                    onChange={(e) => setFormData({...formData, dotloop_file_created: e.target.checked})}
                    required
                  />
                  <span className="text-sm">
                    I confirm the above steps have been completed <span className="text-red-500">*</span>
                  </span>
                </label>
              </div>
            </div>
            
            <div className="flex justify-center gap-4 pt-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2.5 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-2.5 text-sm rounded transition-colors ${
                  loading 
                    ? 'bg-luxury-gray-3 text-luxury-gray-2 cursor-not-allowed' 
                    : 'bg-luxury-black text-white hover:opacity-90'
                }`}
              >
                {loading ? (
                  <span className="flex items-center space-x-2">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting...</span>
                  </span>
                ) : (
                  'Submit Form'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

