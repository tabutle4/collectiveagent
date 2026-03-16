'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ServiceConfiguration } from '@/types/listing-coordination'

// Reusable Agent Dropdown Component
function AgentDropdown({ 
  fieldName, 
  fieldType, 
  agents, 
  formData, 
  setFormData, 
  required, 
  placeholder 
}: {
  fieldName: string
  fieldType: string
  agents: Array<{id: string, name: string}>
  formData: any
  setFormData: (data: any) => void
  required?: boolean
  placeholder?: string
}) {
  const [search, setSearch] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  
  const fieldIdKey = `${fieldName}_id`
  const fieldNameKey = `${fieldName}_name`
  const selectedAgent = agents.find(a => a.id === formData[fieldIdKey])
  
  useEffect(() => {
    if (selectedAgent) {
      setSearch(selectedAgent.name)
    }
  }, [selectedAgent])
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  const filteredAgents = agents.filter(agent =>
    agent.name.toLowerCase().includes(search.toLowerCase())
  )
  
  const handleSelect = (agent: {id: string, name: string}) => {
    setSearch(agent.name)
    setDropdownOpen(false)
    setFormData({
      ...formData,
      [fieldIdKey]: agent.id,
      [fieldNameKey]: agent.name,
    })
  }
  
  return (
    <div className="relative" ref={dropdownRef}>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setDropdownOpen(true)
          if (!e.target.value) {
            setFormData({
              ...formData,
              [fieldIdKey]: '',
              [fieldNameKey]: '',
            })
          }
        }}
        onFocus={() => {
          if (search) {
            setDropdownOpen(true)
          }
        }}
        className="input-luxury"
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      {dropdownOpen && search && filteredAgents.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-auto">
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => handleSelect(agent)}
              className="w-full text-left px-4 py-2 hover:bg-luxury-light transition-colors text-sm"
            >
              {agent.name}
            </button>
          ))}
        </div>
      )}
      {dropdownOpen && search && filteredAgents.length === 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg px-4 py-2 text-sm text-luxury-gray-2">
          No agents found
        </div>
      )}
    </div>
  )
}

// This is a dynamic form page that handles any form type
// For pre-listing and just-listed, it uses the existing form logic
// For other form types, it shows a generic form structure
export default function DynamicFormPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const formType = params.formType as string
  
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(true)
  const [valid, setValid] = useState(false)
  const [formDefinition, setFormDefinition] = useState<any>(null)
  const [coordinationConfig, setCoordinationConfig] = useState<ServiceConfiguration | null>(null)
  const [agents, setAgents] = useState<Array<{id: string, name: string}>>([])
  const [submissionType, setSubmissionType] = useState<'new' | 'update'>('new')
  const [agentSearch, setAgentSearch] = useState('')
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<{id: string, name: string} | null>(null)
  const agentDropdownRef = useRef<HTMLDivElement>(null)
  
  // Property address selector for update mode
  const [propertyAddressSearch, setPropertyAddressSearch] = useState('')
  const [propertyAddressDropdownOpen, setPropertyAddressDropdownOpen] = useState(false)
  const [availableListings, setAvailableListings] = useState<any[]>([])
  const [selectedListing, setSelectedListing] = useState<any | null>(null)
  const [loadingListings, setLoadingListings] = useState(false)
  const propertyAddressDropdownRef = useRef<HTMLDivElement>(null)
  
  // Additional agent fields (co-listing, intermediary, referral)
  const [coListingAgentSearch, setCoListingAgentSearch] = useState('')
  const [coListingAgentDropdownOpen, setCoListingAgentDropdownOpen] = useState(false)
  const [selectedCoListingAgent, setSelectedCoListingAgent] = useState<{id: string, name: string} | null>(null)
  const coListingAgentDropdownRef = useRef<HTMLDivElement>(null)
  
  // Track all agent field states dynamically
  const [agentFieldStates, setAgentFieldStates] = useState<{[key: string]: {
    search: string
    dropdownOpen: boolean
    selected: {id: string, name: string} | null
    ref: React.RefObject<HTMLDivElement>
  }}>({})
  
  const [formData, setFormData] = useState({
    agent_id: '',
    agent_name: '',
    co_listing_agent_id: '',
    co_listing_agent_name: '',
    intermediary_agent_id: '',
    intermediary_agent_name: '',
    referral_agent_id: '',
    referral_agent_name: '',
    property_address: '',
    transaction_type: 'sale' as 'sale' | 'lease',
    mls_type: 'HAR' as 'HAR' | 'NTREIS',
    client_names: '',
    client_phone: '',
    client_email: '',
    estimated_launch_date: '',
    mls_link: '',
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
    // Validate token
    fetch(`/api/forms/validate-token?token=${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setValid(true)
          setFormDefinition(data.form_definition)
        } else {
          setValid(false)
        }
      })
      .catch(err => {
        console.error('Error validating token:', err)
        setValid(false)
      })
      .finally(() => {
        setValidating(false)
      })
    
    // Load coordination config (for pre-listing/just-listed forms)
    if (formType === 'pre-listing' || formType === 'just-listed') {
      fetch('/api/service-config/get?type=listing_coordination')
        .then(res => res.json())
        .then(data => {
          if (data.config) {
            setCoordinationConfig(data.config)
          }
        })
        .catch(err => console.error('Error fetching service config:', err))
    }
    
    // Load agents for dropdown
    fetch('/api/agents/list')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.agents) {
          setAgents(data.agents)
        }
      })
      .catch(err => console.error('Error fetching agents:', err))
  }, [token, formType])
  
  // Clear property address selector when switching to new mode
  useEffect(() => {
    if (submissionType === 'new') {
      setPropertyAddressSearch('')
      setSelectedListing(null)
      setAvailableListings([])
      setPropertyAddressDropdownOpen(false)
    }
  }, [submissionType])
  
  // Search for listings when agent is selected and address is typed (update mode only)
  useEffect(() => {
    if (submissionType === 'update' && selectedAgent && propertyAddressSearch.trim().length >= 2) {
      const searchTimeout = setTimeout(() => {
        setLoadingListings(true)
        fetch(`/api/listings/search?agent_id=${selectedAgent.id}&address=${encodeURIComponent(propertyAddressSearch)}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setAvailableListings(data.listings || [])
              setPropertyAddressDropdownOpen(true)
            }
          })
          .catch(err => {
            console.error('Error searching listings:', err)
            setAvailableListings([])
          })
          .finally(() => {
            setLoadingListings(false)
          })
      }, 300) // Debounce search
      
      return () => clearTimeout(searchTimeout)
    } else {
      setAvailableListings([])
      setPropertyAddressDropdownOpen(false)
    }
  }, [submissionType, selectedAgent, propertyAddressSearch])
  
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setAgentDropdownOpen(false)
      }
      if (coListingAgentDropdownRef.current && !coListingAgentDropdownRef.current.contains(event.target as Node)) {
        setCoListingAgentDropdownOpen(false)
      }
      if (propertyAddressDropdownRef.current && !propertyAddressDropdownRef.current.contains(event.target as Node)) {
        setPropertyAddressDropdownOpen(false)
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
    // Clear property address when agent changes
    if (submissionType === 'update') {
      setPropertyAddressSearch('')
      setSelectedListing(null)
      setAvailableListings([])
    }
  }
  
  const handleListingSelect = (listing: any) => {
    setSelectedListing(listing)
    setPropertyAddressSearch(listing.property_address)
    setPropertyAddressDropdownOpen(false)
    
    // Populate form with existing listing data
    setFormData({
      ...formData,
      property_address: listing.property_address,
      transaction_type: listing.transaction_type || 'sale',
      mls_type: listing.mls_type || 'HAR',
      client_names: listing.client_names || '',
      client_phone: listing.client_phone || '',
      client_email: listing.client_email || '',
      estimated_launch_date: listing.estimated_launch_date ? listing.estimated_launch_date.split('T')[0] : '',
      mls_link: listing.mls_link || '',
      lead_source: listing.lead_source || '',
      dotloop_file_created: listing.dotloop_file_created || false,
      listing_input_requested: listing.listing_input_requested || false,
      photography_requested: listing.photography_requested || false,
      is_broker_listing: listing.is_broker_listing || false,
      // Handle co-listing agent if it exists in the listing
      co_listing_agent_id: listing.co_listing_agent_id || '',
      co_listing_agent_name: listing.co_listing_agent_name || '',
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
    
    setLoading(true)
    
    try {
      const response = await fetch('/api/listings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          submission_type: submissionType,
          form_token: token,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Form submitted successfully!')
        router.push('/forms/success')
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
  
  if (validating) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Validating access...</p>
          </div>
        </div>
      </div>
    )
  }
  
  if (!valid) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-section text-center py-12">
            <h2 className="text-xl font-medium mb-4 text-luxury-gray-1">Access Denied</h2>
            <p className="text-luxury-gray-2 mb-6">
              This form link is invalid or has expired.
            </p>
            <p className="text-sm text-luxury-gray-2">
              Please contact the office for a new form link.
            </p>
          </div>
        </div>
      </div>
    )
  }
  
  // For now, redirect pre-listing and just-listed to their specific pages
  // Other form types will use this generic page (can be customized later)
  if (formType === 'pre-listing' || formType === 'just-listed') {
    // These have dedicated pages, so we'll let those handle it
    // But we can also handle them here if needed
  }
  
  const formTitle = formDefinition?.name || 
    (formType === 'pre-listing' ? 'Pre-Listing Form' : 
     formType === 'just-listed' ? 'Just Listed Form' : 
     formType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') + ' Form')
  
  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="card-section">
          <h1 className="text-2xl font-light mb-2 tracking-luxury">{formTitle}</h1>
          {formDefinition?.description && (
            <p className="text-sm text-luxury-gray-2 mb-6">
              {formDefinition.description}
            </p>
          )}
          
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
                  Select the agent and property address below to load the existing transaction data.
                </p>
              )}
              {submissionType === 'new' && (
                <p className="text-xs text-luxury-gray-2 mt-2">
                  This will create a new transaction.
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
            
            {/* Property Address Selector (only for update mode) */}
            {submissionType === 'update' && selectedAgent && (
              <div className="relative" ref={propertyAddressDropdownRef}>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Property Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={propertyAddressSearch}
                  onChange={(e) => {
                    setPropertyAddressSearch(e.target.value)
                    if (e.target.value.trim().length >= 2) {
                      setPropertyAddressDropdownOpen(true)
                    } else {
                      setPropertyAddressDropdownOpen(false)
                      setSelectedListing(null)
                      // Clear form data if address is cleared
                      setFormData({
                        ...formData,
                        property_address: '',
                      })
                    }
                  }}
                  onFocus={() => {
                    if (propertyAddressSearch.trim().length >= 2 && availableListings.length > 0) {
                      setPropertyAddressDropdownOpen(true)
                    }
                  }}
                  className="input-luxury"
                  placeholder="Type to search for property address..."
                  required={submissionType === 'update'}
                  autoComplete="off"
                />
                {propertyAddressDropdownOpen && propertyAddressSearch.trim().length >= 2 && (
                  <>
                    {loadingListings ? (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg px-4 py-2 text-sm text-luxury-gray-2">
                        Searching...
                      </div>
                    ) : availableListings.length > 0 ? (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-auto">
                        {availableListings.map((listing) => (
                          <button
                            key={listing.id}
                            type="button"
                            onClick={() => handleListingSelect(listing)}
                            className="w-full text-left px-4 py-2 hover:bg-luxury-light transition-colors text-sm"
                          >
                            <div className="font-medium">{listing.property_address}</div>
                            <div className="text-xs text-luxury-gray-2">
                              {listing.transaction_type === 'lease' ? 'Lease' : 'Sale'}
                              {listing.client_names && ` • ${listing.client_names}`}
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg px-4 py-2 text-sm text-luxury-gray-2">
                        No transactions found
                      </div>
                    )}
                  </>
                )}
                {selectedListing && (
                  <input type="hidden" name="existing_listing_id" value={selectedListing.id} />
                )}
              </div>
            )}
            
            {/* Co-Listing Agent Field - Show for pre-listing and just-listed forms */}
            {(formType === 'pre-listing' || formType === 'just-listed' || formDefinition?.form_type === 'pre-listing' || formDefinition?.form_type === 'just-listed') && (
              <div className="relative" ref={coListingAgentDropdownRef}>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Co-Listing Agent
                </label>
                <input
                  type="text"
                  value={coListingAgentSearch}
                  onChange={(e) => {
                    setCoListingAgentSearch(e.target.value)
                    setCoListingAgentDropdownOpen(true)
                    if (!e.target.value) {
                      setSelectedCoListingAgent(null)
                      setFormData({...formData, co_listing_agent_id: '', co_listing_agent_name: ''})
                    }
                  }}
                  onFocus={() => {
                    if (coListingAgentSearch) {
                      setCoListingAgentDropdownOpen(true)
                    }
                  }}
                  className="input-luxury"
                  placeholder="Type to search for a co-listing agent..."
                  autoComplete="off"
                />
                {coListingAgentDropdownOpen && coListingAgentSearch && filteredAgents.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-auto">
                    {filteredAgents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          setSelectedCoListingAgent(agent)
                          setCoListingAgentSearch(agent.name)
                          setCoListingAgentDropdownOpen(false)
                          setFormData({
                            ...formData,
                            co_listing_agent_id: agent.id,
                            co_listing_agent_name: agent.name,
                          })
                        }}
                        className="w-full text-left px-4 py-2 hover:bg-luxury-light transition-colors text-sm"
                      >
                        {agent.name}
                      </button>
                    ))}
                  </div>
                )}
                {coListingAgentDropdownOpen && coListingAgentSearch && filteredAgents.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg px-4 py-2 text-sm text-luxury-gray-2">
                    No agents found
                  </div>
                )}
              </div>
            )}
            
            {/* Property Address Field (only for new submissions) */}
            {submissionType === 'new' && (
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
            )}
            
            {/* Render dynamic form fields from form_config */}
            {formDefinition?.form_config?.fields && formDefinition.form_config.fields.length > 0 && (
              <div className="space-y-6">
                {formDefinition.form_config.fields.map((field: any) => (
                  <div key={field.id || field.name}>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </label>
                    {field.type === 'text' && (
                      <input
                        type="text"
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="input-luxury"
                        placeholder={field.placeholder || ''}
                        required={field.required}
                      />
                    )}
                    {field.type === 'textarea' && (
                      <textarea
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="textarea-luxury"
                        placeholder={field.placeholder || ''}
                        required={field.required}
                        rows={field.rows || 3}
                      />
                    )}
                    {field.type === 'select' && field.options && (
                      <select
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="select-luxury"
                        required={field.required}
                      >
                        <option value="">Select...</option>
                        {field.options.map((option: string) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    )}
                    {field.type === 'radio' && field.options && (
                      <div className="space-y-2">
                        {field.options.map((option: string) => (
                          <label key={option} className="flex items-center space-x-3 cursor-pointer">
                            <input
                              type="radio"
                              name={field.name}
                              value={option}
                              checked={String(formData[field.name as keyof typeof formData] || '') === option}
                              onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                              className="mt-0.5"
                              required={field.required}
                            />
                            <span className="text-sm">{option}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    {field.type === 'checkbox' && (
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="checkbox"
                          name={field.name}
                          checked={!!formData[field.name as keyof typeof formData]}
                          onChange={(e) => setFormData({...formData, [field.name]: e.target.checked})}
                          className="mt-0.5"
                        />
                        <span className="text-sm">{field.label}</span>
                      </label>
                    )}
                    {field.type === 'date' && (
                      <input
                        type="date"
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="input-luxury"
                        required={field.required}
                      />
                    )}
                    {field.type === 'email' && (
                      <input
                        type="email"
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="input-luxury"
                        placeholder={field.placeholder || ''}
                        required={field.required}
                      />
                    )}
                    {field.type === 'phone' && (
                      <input
                        type="tel"
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="input-luxury"
                        placeholder={field.placeholder || ''}
                        required={field.required}
                      />
                    )}
                    {field.type === 'number' && (
                      <input
                        type="number"
                        name={field.name}
                        value={String(formData[field.name as keyof typeof formData] || '')}
                        onChange={(e) => setFormData({...formData, [field.name]: e.target.value})}
                        className="input-luxury"
                        placeholder={field.placeholder || ''}
                        min={field.validation?.min}
                        max={field.validation?.max}
                        required={field.required}
                      />
                    )}
                    {/* Agent field types: co-listing, intermediary, referral */}
                    {(field.type === 'co-listing-agent' || field.type === 'intermediary-agent' || field.type === 'referral-agent') && (
                      <AgentDropdown
                        fieldName={field.name}
                        fieldType={field.type}
                        agents={agents}
                        formData={formData}
                        setFormData={setFormData}
                        required={field.required}
                        placeholder={field.placeholder || `Type to search for ${field.type.replace('-agent', '')} agent...`}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            
            <div className="flex justify-center gap-4 pt-6">
              <button
                type="submit"
                disabled={loading || !selectedAgent}
                className={`px-6 py-2.5 text-sm rounded transition-colors ${
                  loading || !selectedAgent
                    ? 'bg-luxury-gray-3 text-luxury-gray-2 cursor-not-allowed' 
                    : 'btn-primary'
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

