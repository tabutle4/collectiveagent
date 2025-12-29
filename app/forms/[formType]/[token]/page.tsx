'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ServiceConfiguration } from '@/types/listing-coordination'

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
  
  const [formData, setFormData] = useState({
    agent_id: '',
    agent_name: '',
    property_address: '',
    transaction_type: 'sale' as 'sale' | 'lease',
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
            
            {/* For now, show basic fields. Custom form types can be extended later */}
            {(formType === 'pre-listing' || formType === 'just-listed') ? (
              <p className="text-sm text-luxury-gray-2 italic">
                This form type uses a dedicated form page. Please use the specific form link.
              </p>
            ) : (
              <div className="bg-luxury-light p-4 rounded">
                <p className="text-sm text-luxury-gray-2">
                  This is a custom form. Additional fields can be configured by an admin.
                </p>
              </div>
            )}
            
            <div className="flex justify-center gap-4 pt-6">
              <button
                type="submit"
                disabled={loading || !selectedAgent}
                className={`px-6 py-2.5 text-sm rounded transition-colors ${
                  loading || !selectedAgent
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

