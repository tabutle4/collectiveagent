'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { X, Download, Plus, Trash2, Copy, Check, Search, ArrowUpDown, Edit2, Power } from 'lucide-react'

interface ProspectResponse {
  id: string
  created_at: string
  first_name: string
  last_name: string
  preferred_first_name: string
  preferred_last_name: string
  email: string
  phone: string
  location: string
  instagram_handle: string | null
  mls_choice: string
  association_status_on_join: string
  previous_brokerage: string | null
  expectations: string
  accountability: string
  lead_generation: string
  additional_info: string
  how_heard: string
  how_heard_other: string | null
  referring_agent: string | null
  joining_team: string | null
  prospect_status: string
}

interface ListingResponse {
  id: string
  created_at: string
  agent_name: string
  property_address: string
  transaction_type: 'sale' | 'lease'
  mls_type: 'HAR' | 'NTREIS' | null
  client_names: string
  client_phone: string | null
  client_email: string | null
  mls_link: string | null
  estimated_launch_date: string | null
  actual_launch_date: string | null
  lead_source: string | null
  status: string
  pre_listing_form_completed: boolean
  just_listed_form_completed: boolean
  pre_listing_token: string | null
  just_listed_token: string | null
  dotloop_file_created: boolean
  photography_requested: boolean
  listing_input_requested: boolean
  listing_input_paid: boolean
  coordination_requested?: boolean
  coordination_payment_method?: string
  is_broker_listing?: boolean
  co_listing_agent?: string | null
  co_listing_agent_id?: string | null
  co_listing_agent_name?: string | null
}

// Internal/system fields that should never appear in Additional Fields section
// These are metadata, IDs, tokens, or system flags that aren't user-facing form data
const INTERNAL_FIELD_KEYS = [
  'id',
  'created_at',
  'updated_at',
  'formType',
  'form_type',
  'listing_id',
  'user_id',
  'agent_id',
  'pre_listing_token',
  'just_listed_token',
  'pre_listing_form_completed',
  'just_listed_form_completed',
  'notes',
  'metadata',
  'raw_data',
  'source',
  'version',
]

// Known fields for Prospective Agent form responses
// These fields are already displayed in dedicated sections above
// When adding new fields to the Prospective Agent form, add them here to prevent duplicates in Additional Fields
const PROSPECT_KNOWN_KEYS = [
  'first_name',
  'last_name',
  'preferred_first_name',
  'preferred_last_name',
  'email',
  'phone',
  'location',
  'instagram_handle',
  'mls_choice',
  'association_status_on_join',
  'previous_brokerage',
  'expectations',
  'accountability',
  'lead_generation',
  'additional_info',
  'how_heard',
  'how_heard_other',
  'referring_agent',
  'joining_team',
  'prospect_status',
]

// Known fields for Pre-Listing form responses
// These fields are already displayed in dedicated sections above
// When adding new fields to the Pre-Listing form, add them here to prevent duplicates in Additional Fields
const PRE_LISTING_KNOWN_KEYS = [
  'agent_name',
  'property_address',
  'transaction_type',
  'mls_type',
  'status',
  'estimated_launch_date',
  'actual_launch_date',
  'lead_source',
  'mls_link',
  'client_names',
  'client_phone',
  'client_email',
  'dotloop_file_created',
  'listing_input_requested',
  'listing_input_paid',
  'photography_requested',
  'coordination_requested',
  'coordination_payment_method',
  'is_broker_listing',
  'co_listing_agent',
  'co_listing_agent_id',
  'co_listing_agent_name',
]

// Known fields for Just Listed form responses
// These fields are already displayed in dedicated sections above
// When adding new fields to the Just Listed form, add them here to prevent duplicates in Additional Fields
const JUST_LISTED_KNOWN_KEYS = [
  'agent_name',
  'property_address',
  'transaction_type',
  'mls_type',
  'status',
  'actual_launch_date',
  'lead_source',
  'mls_link',
  'client_names',
  'client_phone',
  'client_email',
  'dotloop_file_created',
  'co_listing_agent',
  'co_listing_agent_id',
  'co_listing_agent_name',
]

// Common acronyms that should remain uppercase in field labels
const ACRONYMS = new Set(['MLS', 'LLC', 'ID', 'URL', 'HAR', 'IABS', 'NTREIS'])

function formatFieldLabel(key: string): string {
  const withSpaces = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')

  return withSpaces
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const upperWord = word.toUpperCase()
      // If the word matches a known acronym, keep it uppercase
      if (ACRONYMS.has(upperWord)) {
        return upperWord
      }
      // Otherwise, capitalize first letter only
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function renderFieldValue(value: any): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  const str = String(value)

  if (/^https?:\/\//i.test(str)) {
    return (
      <a href={str} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        {str}
      </a>
    )
  }

  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(str)) {
    return (
      <a href={`mailto:${str}`} className="text-blue-600 hover:underline">
        {str}
      </a>
    )
  }

  return str
}

function getAdditionalFields(selected: any, formType: string): Array<[string, any]> {
  if (!selected) return []

  const baseSkip = new Set(INTERNAL_FIELD_KEYS)
  let typeSkip: string[] = []

  if (formType === 'prospective-agent') {
    typeSkip = PROSPECT_KNOWN_KEYS
  } else if (formType === 'pre-listing') {
    typeSkip = PRE_LISTING_KNOWN_KEYS
  } else if (formType === 'just-listed') {
    typeSkip = JUST_LISTED_KNOWN_KEYS
  }

  const skip = new Set<string>([...baseSkip, ...typeSkip])

  return Object.entries(selected).filter(([key]) => {
    // Skip if in known lists
    if (skip.has(key)) return false
    
    // Skip fields ending in _token (system tokens)
    if (key.endsWith('_token')) return false
    
    // Skip fields ending in _id (foreign key references)
    if (key.endsWith('_id')) return false
    
    // Skip fields starting with is_ (boolean flags, usually already handled)
    if (key.startsWith('is_')) return false
    
    return true
  })
}

export default function FormResponsesPage() {
  const router = useRouter()
  const [prospects, setProspects] = useState<ProspectResponse[]>([])
  const [listings, setListings] = useState<ListingResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedResponse, setSelectedResponse] = useState<any>(null)
  const [editData, setEditData] = useState<any>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState<'prospects' | 'pre-listing' | 'just-listed' | 'forms'>('prospects')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<string>('created_at')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [forms, setForms] = useState<any[]>([])
  const [editingForm, setEditingForm] = useState<any>(null)
  const [formCopiedLink, setFormCopiedLink] = useState<string | null>(null)
  const [newFormData, setNewFormData] = useState<any>({
    agent_name: '',
    property_address: '',
    transaction_type: 'sale' as 'sale' | 'lease',
    mls_type: 'HAR' as 'HAR' | 'NTREIS',
    client_names: '',
    client_phone: '',
    client_email: '',
    mls_link: '',
    estimated_launch_date: '',
    actual_launch_date: '',
    lead_source: '',
    dotloop_file_created: false,
    listing_input_requested: false,
    coordination_requested: false,
    coordination_payment_method: '' as 'client_direct' | 'agent_pays' | '',
    photography_requested: false,
    is_broker_listing: false,
    co_listing_agent: '',
    co_listing_agent_id: '',
    co_listing_agent_name: '',
    status: 'pre-listing' as 'pre-listing' | 'active' | 'pending' | 'sold' | 'expired' | 'cancelled',
  })
  const [coordinationConfig, setCoordinationConfig] = useState<any>(null)
  const [agents, setAgents] = useState<Array<{id: string, name: string}>>([])
  const [agentSearch, setAgentSearch] = useState<{[key: string]: string}>({})
  const [agentDropdownOpen, setAgentDropdownOpen] = useState<{[key: string]: boolean}>({})
  const [createFormModalOpen, setCreateFormModalOpen] = useState(false)
  const [newFormDefinition, setNewFormDefinition] = useState({
    name: '',
    description: '',
    form_type: 'pre-listing' as string,
  })
  const [creatingForm, setCreatingForm] = useState(false)

  useEffect(() => {
    loadData()
    loadForms() // Load forms on initial page load
    // Load coordination config for the create form
    fetch('/api/service-config/get?type=listing_coordination')
      .then(res => res.json())
      .then(data => {
        if (data.config) {
          setCoordinationConfig(data.config)
        }
      })
      .catch(err => console.error('Error fetching service config:', err))
    
    // Load all agents for selector (any status)
    supabase
      .from('users')
      .select('id, preferred_first_name, preferred_last_name, first_name, last_name')
      .or('roles.cs.{agent},roles.cs.{Agent}')
      .then(({ data, error }) => {
        if (!error && data) {
          const agentsList = data.map(user => ({
            id: user.id,
            name: `${user.preferred_first_name || user.first_name} ${user.preferred_last_name || user.last_name}`.trim()
          })).sort((a, b) => a.name.localeCompare(b.name))
          setAgents(agentsList)
        }
      })
    
    // Close dropdowns when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.agent-selector')) {
        setAgentDropdownOpen({})
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    // Reset form when switching tabs
    if (createModalOpen) {
      setNewFormData({
        agent_name: '',
        property_address: '',
        transaction_type: 'sale' as 'sale' | 'lease',
        mls_type: 'HAR' as 'HAR' | 'NTREIS',
        client_names: '',
        client_phone: '',
        client_email: '',
        mls_link: '',
        estimated_launch_date: '',
        actual_launch_date: '',
        lead_source: '',
        dotloop_file_created: false,
        listing_input_requested: false,
        coordination_requested: false,
        coordination_payment_method: '' as 'client_direct' | 'agent_pays' | '',
        photography_requested: false,
        is_broker_listing: false,
        co_listing_agent: '',
        co_listing_agent_id: '',
        co_listing_agent_name: '',
        status: activeTab === 'pre-listing' ? 'pre-listing' : 'active',
      })
    }
  }, [activeTab, createModalOpen])

  const loadData = async () => {
    setLoading(true)
    try {
      // Load prospects
      const { data: prospectsData, error: prospectsError } = await supabase
        .from('users')
        .select('*')
        .not('prospect_status', 'is', null)
        .order('created_at', { ascending: false })

      if (prospectsError) {
        console.error('Error loading prospects:', prospectsError)
      } else {
        setProspects(prospectsData || [])
      }

      // Load listings
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

  const handleRowClick = async (response: any, formType: string) => {
    // Always fetch fresh data from database to ensure sync with coordination detail page
    let freshResponse = response
    if (formType === 'pre-listing' || formType === 'just-listed') {
      const { data: freshListing } = await supabase
        .from('listings')
        .select('*')
        .eq('id', response.id)
        .single()
      
      if (freshListing) {
        freshResponse = freshListing
      }
    }
    
    setSelectedResponse({ ...freshResponse, formType })
    
    // Load coordination data if it exists
    let coordinationData: any = null
    if (formType === 'pre-listing' || formType === 'just-listed') {
      const { data: coordination } = await supabase
        .from('listing_coordination')
        .select('*')
        .eq('listing_id', freshResponse.id)
        .single()
      
      if (coordination) {
        coordinationData = {
          coordination_id: coordination.id,
          coordination_requested: true,
          coordination_payment_method: coordination.payment_method,
          is_broker_listing: coordination.payment_method === 'broker_listing',
          service_fee: coordination.service_fee,
        }
      }
    }
    
    setEditData({ 
      ...freshResponse, 
      formType,
      ...coordinationData,
      coordination_requested: coordinationData ? true : false,
    })
    setIsEditing(false)
    setModalOpen(true)
  }

  const handleCreateNew = () => {
    setCreateModalOpen(true)
  }

  const handleDeleteListing = async (listingId: string, formType: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    
    const listingType = formType === 'pre-listing' ? 'pre-listing' : formType === 'just-listed' ? 'just-listed' : 'prospective-agent'
    const confirmMessage = `Are you sure you want to delete this ${listingType} form response? This action cannot be undone.`
    
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        alert('You must be logged in to delete')
        return
      }

      const user = JSON.parse(userStr)
      
      // For prospective agents, use the users/delete endpoint
      if (formType === 'prospective-agent') {
        const response = await fetch('/api/users/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: listingId, // For prospects, listingId is actually the user ID
            requestingUserId: user.id, // Requesting user ID
          }),
        })

        const data = await response.json()

        if (data.success) {
          loadData()
          if (modalOpen && selectedResponse?.id === listingId) {
            setModalOpen(false)
            setSelectedResponse(null)
          }
        } else {
          alert(`Error: ${data.error}`)
        }
      } else {
        // For listings, use the listings/delete endpoint
        const response = await fetch('/api/listings/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listingId,
            userId: user.id,
          }),
        })

        const data = await response.json()

        if (data.success) {
          loadData()
          if (modalOpen && selectedResponse?.id === listingId) {
            setModalOpen(false)
            setSelectedResponse(null)
          }
        } else {
          if (data.hasCoordination) {
            alert(`Cannot delete: ${data.error}\n\nWould you like to delete the coordination first?`)
          } else {
            alert(`Error: ${data.error}`)
          }
        }
      }
    } catch (error: any) {
      console.error('Error deleting form response:', error)
      alert('Failed to delete form response')
    }
  }

  const filteredAgents = (searchKey: string) => {
    const search = agentSearch[searchKey]?.toLowerCase() || ''
    return agents.filter(agent => agent.name.toLowerCase().includes(search))
  }

  const selectAgent = (agentName: string, fieldKey: string) => {
    if (fieldKey === 'edit') {
      setEditData({...editData, agent_name: agentName})
    } else {
      setNewFormData({...newFormData, agent_name: agentName})
    }
    setAgentSearch({...agentSearch, [fieldKey]: ''})
    setAgentDropdownOpen({...agentDropdownOpen, [fieldKey]: false})
  }

  const selectCoListingAgent = (agent: {id: string, name: string}, fieldKey: string) => {
    if (fieldKey === 'edit') {
      setEditData({
        ...editData,
        co_listing_agent: agent.name,
        co_listing_agent_id: agent.id,
        co_listing_agent_name: agent.name
      })
    } else {
      setNewFormData({
        ...newFormData,
        co_listing_agent: agent.name,
        co_listing_agent_id: agent.id,
        co_listing_agent_name: agent.name
      })
    }
    setAgentSearch({...agentSearch, [`co_${fieldKey}`]: ''})
    setAgentDropdownOpen({...agentDropdownOpen, [`co_${fieldKey}`]: false})
  }

  const handleCreateSubmit = async () => {
    if (!newFormData.agent_name || !newFormData.property_address || !newFormData.client_names) {
      alert('Please fill in all required fields (Agent Name, Property Address, Client Name)')
      return
    }

    setCreating(true)
    try {
      // Get admin user from localStorage
      const userStr = localStorage.getItem('user')
      if (!userStr) {
        alert('Please log in to create a form response')
        return
      }
      
      const user = JSON.parse(userStr)
      
      const response = await fetch('/api/listings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newFormData,
          user_id: user.id,
          // Set form completion flags based on active tab
          pre_listing_form_completed: activeTab === 'pre-listing',
          just_listed_form_completed: activeTab === 'just-listed',
          // Set status based on whether MLS link exists
          status: newFormData.mls_link ? 'active' : (activeTab === 'pre-listing' ? 'pre-listing' : 'active'),
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Form response created successfully!')
        setCreateModalOpen(false)
        loadData() // Reload to show new entry
      } else {
        alert(`Error: ${data.error || 'Failed to create form response'}`)
      }
    } catch (error) {
      console.error('Error creating form response:', error)
      alert('Failed to create form response. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!editData || !selectedResponse) return
    
    setSaving(true)
    try {
      if (selectedResponse.formType === 'pre-listing' || selectedResponse.formType === 'just-listed') {
        // Update listing via API
        const response = await fetch('/api/listings/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            listing_id: editData.id,
            updates: {
              agent_name: editData.agent_name,
              property_address: editData.property_address,
              transaction_type: editData.transaction_type,
              mls_type: editData.mls_type || 'HAR',
              client_names: editData.client_names,
              client_phone: editData.client_phone,
              client_email: editData.client_email,
              mls_link: editData.mls_link,
              estimated_launch_date: editData.estimated_launch_date || null,
              actual_launch_date: editData.actual_launch_date || null,
              lead_source: editData.lead_source,
              status: editData.status,
              listing_website_url: editData.listing_website_url || null,
              dotloop_file_created: editData.dotloop_file_created,
              photography_requested: editData.photography_requested,
              listing_input_requested: editData.listing_input_requested,
              co_listing_agent: editData.co_listing_agent_name || editData.co_listing_agent || null,
              is_broker_listing: editData.is_broker_listing || false,
            },
          }),
        })
        
        const data = await response.json()
        if (data.success) {
          // If coordination data was edited, update it
          if (editData.coordination_id && editData.coordination_requested) {
            const coordinationResponse = await fetch('/api/coordination/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                coordination_id: editData.coordination_id,
                updates: {
                  payment_method: editData.is_broker_listing ? 'broker_listing' : editData.coordination_payment_method,
                  service_fee: editData.is_broker_listing ? 0 : (editData.service_fee || 250),
                },
              }),
            })
            const coordinationData = await coordinationResponse.json()
            if (!coordinationData.success) {
              console.error('Error updating coordination:', coordinationData.error)
            }
          }
          
          alert('Updated successfully!')
          setIsEditing(false)
          setSelectedResponse(editData)
          loadData() // Reload to get fresh data
        } else {
          alert(`Error: ${data.error}`)
        }
      } else {
        // Update prospect/user
        const response = await fetch('/api/users/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: editData.id,
            updates: editData,
          }),
        })
        
        const data = await response.json()
        if (data.success) {
          alert('Updated successfully!')
          setIsEditing(false)
          setSelectedResponse(editData)
          loadData()
        } else {
          alert(`Error: ${data.error}`)
        }
      }
    } catch (error) {
      console.error('Error saving:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
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

  const preListingForms = listings.filter(l => l.pre_listing_form_completed)
  const justListedForms = listings.filter(l => l.just_listed_form_completed)

  const handleCopyFormLink = (link: string, formId: string) => {
    navigator.clipboard.writeText(link)
    setFormCopiedLink(formId)
    setTimeout(() => setFormCopiedLink(null), 2000)
  }
  
  const loadForms = async () => {
    try {
      const response = await fetch('/api/forms/list')
      const data = await response.json()
      const dbForms = data.success && data.forms ? data.forms : []
      
      // Default forms configuration
      const defaultFormsConfig = [
        {
          id: 'prospective-agent',
          name: 'Prospective Agent Form',
          description: 'Public form for prospective agents to join the firm',
          form_type: 'prospective-agent',
          is_active: true,
          shareable_link_url: 'https://agent.collectiverealtyco.com/prospective-agent-form',
          shareable_token: null,
        },
        {
          id: 'pre-listing',
          name: 'Pre-Listing Form',
          description: 'Submit when you have executed a new listing agreement but the property is not yet active on the MLS',
          form_type: 'pre-listing',
          is_active: true,
        },
        {
          id: 'just-listed',
          name: 'Just Listed Form',
          description: 'Submit when you have a new active listing that is already on the MLS',
          form_type: 'just-listed',
          is_active: true,
        },
      ]
      
      // Merge: use database forms if they exist, otherwise use defaults
      const allForms = [...dbForms]
      
      // Process default forms
      for (const defaultFormConfig of defaultFormsConfig) {
        const existingForm = dbForms.find((f: any) => f.form_type === defaultFormConfig.form_type)
        
        if (!existingForm) {
          // Form doesn't exist in database, generate token and link
          if (defaultFormConfig.form_type === 'prospective-agent') {
            // Prospective agent uses a static link
            allForms.push({
              ...defaultFormConfig,
              shareable_link_url: 'https://agent.collectiverealtyco.com/prospective-agent-form',
              created_at: new Date().toISOString(),
            })
          } else {
            // Generate token and link for pre-listing and just-listed
            try {
              const tokenResponse = await fetch('/api/forms/generate-generic-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ form_type: defaultFormConfig.form_type }),
              })
              
              if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json()
                
                // Create form in database with co-listing agent field in form_config
                const formConfig = {
                  fields: [
                    {
                      id: `co-listing-agent-${Date.now()}`,
                      name: 'co_listing_agent',
                      label: 'Co-Listing Agent',
                      type: 'co-listing-agent',
                      required: false,
                      placeholder: 'Type to search for a co-listing agent...',
                    },
                  ],
                }
                
                // Create the form in the database
                const createResponse = await fetch('/api/forms/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: defaultFormConfig.name,
                    description: defaultFormConfig.description,
                    form_type: defaultFormConfig.form_type,
                    form_config: formConfig,
                    shareable_token: tokenData.token,
                    shareable_link_url: tokenData.link_url,
                  }),
                })
                
                if (createResponse.ok) {
                  const createdForm = await createResponse.json()
                  allForms.push(createdForm.form)
                } else {
                  // If creation fails, still add form without database entry
                  allForms.push({
                    ...defaultFormConfig,
                    shareable_link_url: tokenData.link_url,
                    shareable_token: tokenData.token,
                    form_config: formConfig,
                    created_at: new Date().toISOString(),
                  })
                }
              } else {
                // If token generation fails, still add form without link
                allForms.push({
                  ...defaultFormConfig,
                  shareable_link_url: null,
                  shareable_token: null,
                  form_config: {
                    fields: [
                      {
                        id: `co-listing-agent-${Date.now()}`,
                        name: 'co_listing_agent',
                        label: 'Co-Listing Agent',
                        type: 'co-listing-agent',
                        required: false,
                        placeholder: 'Type to search for a co-listing agent...',
                      },
                    ],
                  },
                  created_at: new Date().toISOString(),
                })
              }
            } catch (error) {
              console.error(`Error generating token for ${defaultFormConfig.form_type}:`, error)
              allForms.push({
                ...defaultFormConfig,
                shareable_link_url: null,
                shareable_token: null,
                form_config: {
                  fields: [
                    {
                      id: `co-listing-agent-${Date.now()}`,
                      name: 'co_listing_agent',
                      label: 'Co-Listing Agent',
                      type: 'co-listing-agent',
                      required: false,
                      placeholder: 'Type to search for a co-listing agent...',
                    },
                  ],
                },
                created_at: new Date().toISOString(),
              })
            }
          }
        } else {
          // Form exists in database, but ensure it has a shareable link
          if (!existingForm.shareable_link_url && existingForm.form_type !== 'prospective-agent') {
            // Generate token and link for forms missing them
            try {
              const tokenResponse = await fetch('/api/forms/generate-generic-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ form_type: existingForm.form_type }),
              })
              
              if (tokenResponse.ok) {
                const tokenData = await tokenResponse.json()
                // Update the form in the database
                await fetch('/api/forms/update', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: existingForm.id,
                    shareable_token: tokenData.token,
                    shareable_link_url: tokenData.link_url,
                  }),
                })
                existingForm.shareable_link_url = tokenData.link_url
                existingForm.shareable_token = tokenData.token
              }
            } catch (error) {
              console.error(`Error generating token for existing form ${existingForm.id}:`, error)
            }
          } else if (existingForm.form_type === 'prospective-agent' && !existingForm.shareable_link_url) {
            existingForm.shareable_link_url = '/prospective-agent-form'
          }
          
          // Ensure pre-listing and just-listed forms have co-listing agent field in form_config
          if ((existingForm.form_type === 'pre-listing' || existingForm.form_type === 'just-listed')) {
            const formConfig = existingForm.form_config || {}
            const fields = formConfig.fields || []
            
            // Check if co-listing agent field exists
            const hasCoListingAgent = fields.some((f: any) => 
              f.type === 'co-listing-agent' || f.name === 'co_listing_agent'
            )
            
            if (!hasCoListingAgent) {
              // Add co-listing agent field to form_config
              const coListingAgentField = {
                id: `co-listing-agent-${Date.now()}`,
                name: 'co_listing_agent',
                label: 'Co-Listing Agent',
                type: 'co-listing-agent',
                required: false,
                placeholder: 'Type to search for a co-listing agent...',
              }
              
              fields.push(coListingAgentField)
              
              // Update form in database
              try {
                await fetch('/api/forms/update', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: existingForm.id,
                    form_config: {
                      ...formConfig,
                      fields: fields,
                    },
                  }),
                })
                existingForm.form_config = {
                  ...formConfig,
                  fields: fields,
                }
              } catch (error) {
                console.error(`Error updating form_config for ${existingForm.form_type}:`, error)
              }
            }
          }
        }
      }
      
      setForms(allForms)
    } catch (error) {
      console.error('Error loading forms:', error)
    }
  }
  
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }
  
  const getFilteredAndSortedData = (data: any[]) => {
    let filtered = [...data]
    
    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(item => {
        if (activeTab === 'prospects') {
          return (
            (item.preferred_first_name || '').toLowerCase().includes(query) ||
            (item.preferred_last_name || '').toLowerCase().includes(query) ||
            (item.email || '').toLowerCase().includes(query) ||
            (item.phone || '').toLowerCase().includes(query)
          )
        } else {
          return (
            (item.agent_name || '').toLowerCase().includes(query) ||
            (item.property_address || '').toLowerCase().includes(query) ||
            (item.client_names || '').toLowerCase().includes(query) ||
            (item.client_email || '').toLowerCase().includes(query)
          )
        }
      })
    }
    
    // Apply status filter
    if (filterStatus !== 'all') {
      if (activeTab === 'prospects') {
        filtered = filtered.filter(item => (item.prospect_status || 'new') === filterStatus)
      } else {
        filtered = filtered.filter(item => (item.status || 'pre-listing') === filterStatus)
      }
    }
    
    // Apply sort
    filtered.sort((a, b) => {
      let aVal = a[sortField]
      let bVal = b[sortField]
      
      if (sortField === 'created_at') {
        aVal = new Date(aVal).getTime()
        bVal = new Date(bVal).getTime()
      } else {
        aVal = (aVal || '').toString().toLowerCase()
        bVal = (bVal || '').toString().toLowerCase()
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1
      } else {
        return aVal < bVal ? 1 : -1
      }
    })
    
    return filtered
  }
  
  const handleDeactivateForm = async (formId: string) => {
    if (!confirm('Are you sure you want to deactivate this form? It will no longer be visible to agents.')) {
      return
    }
    
    try {
      const response = await fetch('/api/forms/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: formId, is_active: false }),
      })
      
      const data = await response.json()
      if (data.success) {
        alert('Form deactivated successfully')
        loadForms()
      } else {
        alert(`Error: ${data.error || 'Failed to deactivate form'}`)
      }
    } catch (error) {
      console.error('Error deactivating form:', error)
      alert('Failed to deactivate form. Please try again.')
    }
  }
  
  const handleActivateForm = async (formId: string) => {
    try {
      const response = await fetch('/api/forms/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: formId, is_active: true }),
      })
      
      const data = await response.json()
      if (data.success) {
        alert('Form activated successfully')
        loadForms()
      } else {
        alert(`Error: ${data.error || 'Failed to activate form'}`)
      }
    } catch (error) {
      console.error('Error activating form:', error)
      alert('Failed to activate form. Please try again.')
    }
  }
  
  const handleDeleteForm = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form? This action cannot be undone.')) {
      return
    }
    
    try {
      const response = await fetch(`/api/forms/delete?id=${formId}`, {
        method: 'DELETE',
      })
      
      const data = await response.json()
      if (data.success) {
        alert('Form deleted successfully')
        loadForms()
      } else {
        alert(`Error: ${data.error || 'Failed to delete form'}`)
      }
    } catch (error) {
      console.error('Error deleting form:', error)
      alert('Failed to delete form. Please try again.')
    }
  }
  
  const handleEditForm = (formId: string) => {
    // Navigate to form builder instead of opening modal
    router.push(`/admin/form-builder?id=${formId}`)
  }
  
  const handleUpdateForm = async () => {
    if (!editingForm || !newFormDefinition.name || !newFormDefinition.form_type) {
      alert('Please fill in all required fields')
      return
    }
    
    setCreatingForm(true)
    
    try {
      const response = await fetch('/api/forms/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingForm.id,
          ...newFormDefinition,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert('Form updated successfully!')
        setCreateFormModalOpen(false)
        setEditingForm(null)
        setNewFormDefinition({ name: '', description: '', form_type: 'pre-listing' })
        loadForms()
      } else {
        alert(`Error: ${data.error || 'Failed to update form'}`)
      }
    } catch (error) {
      console.error('Error updating form:', error)
      alert('Failed to update form. Please try again.')
    } finally {
      setCreatingForm(false)
    }
  }
  
  const handleCreateForm = async () => {
    if (!newFormDefinition.name || !newFormDefinition.form_type) {
      alert('Please fill in all required fields')
      return
    }
    
    setCreatingForm(true)
    
    try {
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null
      
      const response = await fetch('/api/forms/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newFormDefinition,
          created_by: user?.id || null,
        }),
      })
      
      const data = await response.json()
      
      if (data.success) {
        alert(`Form "${newFormDefinition.name}" created successfully! Shareable link: ${data.form.shareable_link_url}`)
        setCreateFormModalOpen(false)
        setEditingForm(null)
        setNewFormDefinition({ name: '', description: '', form_type: 'pre-listing' })
        loadForms()
      } else {
        alert(`Error: ${data.error || 'Failed to create form'}`)
      }
    } catch (error) {
      console.error('Error creating form:', error)
      alert('Failed to create form. Please try again.')
    } finally {
      setCreatingForm(false)
    }
  }

  const exportToCSV = (data: any[], filename: string, headers: string[], getRow: (item: any) => string[]) => {
    const csvContent = [
      headers.join(','),
      ...data.map(item => {
        const row = getRow(item)
        return row.map(cell => {
          // Escape commas and quotes in CSV
          const cellStr = cell?.toString() || ''
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`
          }
          return cellStr
        }).join(',')
      })
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportProspects = () => {
    const headers = [
      'Date',
      'First Name',
      'Last Name',
      'Preferred First Name',
      'Preferred Last Name',
      'Email',
      'Phone',
      'Location',
      'Instagram Handle',
      'MLS Choice',
      'Association Status',
      'Previous Brokerage',
      'Expectations',
      'Accountability',
      'Lead Generation',
      'Additional Info',
      'How Heard',
      'How Heard Other',
      'Referring Agent',
      'Joining Team',
      'Status'
    ]

    exportToCSV(prospects, `prospective-agent-forms-${new Date().toISOString().split('T')[0]}.csv`, headers, (prospect) => [
      formatDate(prospect.created_at),
      prospect.first_name || '',
      prospect.last_name || '',
      prospect.preferred_first_name || '',
      prospect.preferred_last_name || '',
      prospect.email || '',
      prospect.phone || '',
      prospect.location || '',
      prospect.instagram_handle || '',
      prospect.mls_choice || '',
      prospect.association_status_on_join || '',
      prospect.previous_brokerage || '',
      prospect.expectations || '',
      prospect.accountability || '',
      prospect.lead_generation || '',
      prospect.additional_info || '',
      prospect.how_heard || '',
      prospect.how_heard_other || '',
      prospect.referring_agent || '',
      prospect.joining_team || '',
      prospect.prospect_status || ''
    ])
  }

  const handleExportPreListing = () => {
    const headers = [
      'Date',
      'Agent Name',
      'Property Address',
      'Transaction Type',
      'MLS',
      'Client Names',
      'Client Phone',
      'Client Email',
      'Estimated Launch Date',
      'Lead Source',
      'Status',
      'Dotloop File Created',
      'Listing Input Requested',
      'Photography Requested',
      'Coordination Requested',
      'Coordination Payment Method',
      'Co-Listing Agent',
      'Is Broker Listing'
    ]

    exportToCSV(preListingForms, `pre-listing-forms-${new Date().toISOString().split('T')[0]}.csv`, headers, (listing) => [
      formatDate(listing.created_at),
      listing.agent_name || '',
      listing.property_address || '',
      listing.transaction_type || '',
      listing.mls_type || 'HAR',
      listing.client_names || '',
      listing.client_phone || '',
      listing.client_email || '',
      listing.estimated_launch_date ? formatDate(listing.estimated_launch_date) : '',
      listing.lead_source || '',
      listing.status || '',
      listing.dotloop_file_created ? 'Yes' : 'No',
      listing.listing_input_requested ? 'Yes' : 'No',
      listing.photography_requested ? 'Yes' : 'No',
      listing.coordination_requested ? 'Yes' : 'No',
      listing.coordination_payment_method || '',
      listing.co_listing_agent || '',
      listing.is_broker_listing ? 'Yes' : 'No'
    ])
  }

  const handleExportJustListed = () => {
    const headers = [
      'Date',
      'Agent Name',
      'Property Address',
      'Transaction Type',
      'MLS',
      'Client Names',
      'Client Phone',
      'Client Email',
      'MLS Link',
      'Actual Launch Date',
      'Lead Source',
      'Status',
      'Dotloop File Created',
      'Coordination Requested',
      'Coordination Payment Method',
      'Co-Listing Agent',
      'Is Broker Listing'
    ]

    exportToCSV(justListedForms, `just-listed-forms-${new Date().toISOString().split('T')[0]}.csv`, headers, (listing) => [
      formatDate(listing.created_at),
      listing.agent_name || '',
      listing.property_address || '',
      listing.transaction_type || '',
      listing.mls_type || 'HAR',
      listing.client_names || '',
      listing.client_phone || '',
      listing.client_email || '',
      listing.mls_link || '',
      listing.actual_launch_date ? formatDate(listing.actual_launch_date) : '',
      listing.lead_source || '',
      listing.status || '',
      listing.dotloop_file_created ? 'Yes' : 'No',
      listing.coordination_requested ? 'Yes' : 'No',
      listing.coordination_payment_method || '',
      listing.co_listing_agent || '',
      listing.is_broker_listing ? 'Yes' : 'No'
    ])
  }

  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="card-section mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <h1 className="text-2xl font-light tracking-luxury mb-4 md:mb-0">
              Form Responses
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCreateFormModalOpen(true)}
                className="px-4 py-2 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create New Form
              </button>
              {(activeTab === 'pre-listing' || activeTab === 'just-listed') && (
                <button
                  onClick={handleCreateNew}
                  className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create New Response
                </button>
              )}
              {activeTab === 'prospects' && (
                <button
                  onClick={handleExportProspects}
                  className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              {activeTab === 'pre-listing' && (
                <button
                  onClick={handleExportPreListing}
                  className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
              {activeTab === 'just-listed' && (
                <button
                  onClick={handleExportJustListed}
                  className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex space-x-2 border-b border-luxury-gray-5">
            <button
              onClick={() => setActiveTab('prospects')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'prospects'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              Prospective Agent ({prospects.length})
            </button>
            <button
              onClick={() => setActiveTab('pre-listing')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'pre-listing'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              Pre-Listing ({preListingForms.length})
            </button>
            <button
              onClick={() => setActiveTab('just-listed')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'just-listed'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              Just Listed ({justListedForms.length})
            </button>
            <button
              onClick={() => setActiveTab('forms')}
              className={`px-4 py-2 text-sm transition-colors ${
                activeTab === 'forms'
                  ? 'border-b-2 border-luxury-black text-luxury-black font-medium'
                  : 'text-luxury-gray-2 hover:text-luxury-black'
              }`}
            >
              Forms ({forms.length})
            </button>
          </div>
        </div>
        
        {/* Search and Filter Bar */}
        <div className="card-section mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-2 w-5 h-5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'forms' 
                    ? 'Search by name, description, type...' 
                    : 'Search by name, email, address...'
                }
                className="input-luxury pl-12 py-3 text-base"
              />
            </div>
            {activeTab !== 'forms' && (
              <>
                {activeTab === 'prospects' && (
                  <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="select-luxury"
                >
                  <option value="all">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="joined">Joined</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              )}
              {(activeTab === 'pre-listing' || activeTab === 'just-listed') && (
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="select-luxury"
                >
                  <option value="all">All Statuses</option>
                  <option value="pre-listing">Pre-Listing</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="sold">Sold</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              )}
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading...</p>
          </div>
        ) : (
          <div className="card-section">
            {/* Prospective Agent Form Table */}
            {activeTab === 'prospects' && (
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
                          onClick={() => handleSort('preferred_first_name')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Name
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('email')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Email
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Phone</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('prospect_status')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(prospects).map((prospect) => (
                      <tr
                        key={prospect.id}
                        onClick={() => handleRowClick(prospect, 'prospective-agent')}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(prospect.created_at)}</td>
                        <td className="py-3 px-4 text-sm">
                          {prospect.preferred_first_name} {prospect.preferred_last_name}
                        </td>
                        <td className="py-3 px-4 text-sm">{prospect.email}</td>
                        <td className="py-3 px-4 text-sm">{prospect.phone}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 text-xs rounded ${
                            prospect.prospect_status === 'new' ? 'bg-blue-100 text-blue-800' :
                            prospect.prospect_status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                            prospect.prospect_status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                            prospect.prospect_status === 'joined' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {prospect.prospect_status || 'new'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <button
                            onClick={(e) => handleDeleteListing(prospect.id, 'prospective-agent', e)}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {prospects.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No prospective agent form responses</p>
                  </div>
                )}
              </div>
            )}

            {/* Pre-Listing Form Table */}
            {activeTab === 'pre-listing' && (
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('status')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(preListingForms).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing, 'pre-listing')}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 text-xs rounded capitalize ${
                            listing.status === 'active' ? 'bg-green-100 text-green-800' :
                            listing.status === 'pre-listing' ? 'bg-yellow-100 text-yellow-800' :
                            listing.status === 'sold' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDeleteListing(listing.id, 'pre-listing', e)}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preListingForms.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No pre-listing form responses</p>
                  </div>
                )}
              </div>
            )}

            {/* Just Listed Form Table */}
            {activeTab === 'just-listed' && (
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('status')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Status
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getFilteredAndSortedData(justListedForms).map((listing) => (
                      <tr
                        key={listing.id}
                        onClick={() => handleRowClick(listing, 'just-listed')}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 text-sm">{formatDate(listing.created_at)}</td>
                        <td className="py-3 px-4 text-sm">{listing.agent_name}</td>
                        <td className="py-3 px-4 text-sm">{listing.property_address}</td>
                        <td className="py-3 px-4 text-sm">{listing.client_names}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 text-xs rounded capitalize ${
                            listing.status === 'active' ? 'bg-green-100 text-green-800' :
                            listing.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            listing.status === 'sold' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {listing.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDeleteListing(listing.id, 'just-listed', e)}
                            className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {justListedForms.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No just listed form responses</p>
                  </div>
                )}
              </div>
            )}

            {/* Forms Management Table */}
            {activeTab === 'forms' && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-luxury-gray-5">
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('name')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Name
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Description</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">
                        <button
                          onClick={() => handleSort('form_type')}
                          className="flex items-center gap-1 hover:text-luxury-black transition-colors"
                        >
                          Type
                          <ArrowUpDown className="w-3 h-3" />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Shareable Link</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forms.filter(form => {
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase()
                        return (
                          (form.name || '').toLowerCase().includes(query) ||
                          (form.description || '').toLowerCase().includes(query) ||
                          (form.form_type || '').toLowerCase().includes(query)
                        )
                      }
                      return true
                    }).sort((a, b) => {
                      let aVal = a[sortField] || ''
                      let bVal = b[sortField] || ''
                      if (sortField === 'name' || sortField === 'form_type') {
                        aVal = aVal.toString().toLowerCase()
                        bVal = bVal.toString().toLowerCase()
                      }
                      if (sortDirection === 'asc') {
                        return aVal > bVal ? 1 : -1
                      } else {
                        return aVal < bVal ? 1 : -1
                      }
                    }).map((form) => (
                      <tr
                        key={form.id}
                        className="border-b border-luxury-gray-5 hover:bg-luxury-light transition-colors"
                      >
                        <td className="py-3 px-4 text-sm font-medium">{form.name}</td>
                        <td className="py-3 px-4 text-sm text-luxury-gray-2">{form.description || '—'}</td>
                        <td className="py-3 px-4 text-sm">{form.form_type}</td>
                        <td className="py-3 px-4 text-sm">
                          <span className={`px-2 py-1 text-xs rounded ${
                            form.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {form.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          {form.shareable_link_url ? (
                            <button
                              onClick={() => {
                                handleCopyFormLink(form.shareable_link_url, form.id)
                              }}
                              className="flex items-center gap-1 text-xs text-luxury-black hover:text-luxury-gray-1 transition-colors"
                              title="Copy shareable link"
                            >
                              {formCopiedLink === form.id ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy Link
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-luxury-gray-2">No link</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            {/* Show edit/delete for all forms, including default forms */}
                            {form.id && (
                              <>
                                {/* Only show edit for database forms (have UUID) */}
                                {form.id.length > 20 && (
                                  <button
                                    onClick={() => handleEditForm(form.id)}
                                    className="p-1.5 text-luxury-black hover:text-luxury-gray-1 hover:bg-luxury-light rounded transition-colors"
                                    title="Edit"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                )}
                                {/* Only show activate/deactivate for database forms */}
                                {form.id.length > 20 && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        const response = await fetch('/api/forms/update', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({ id: form.id, is_active: !form.is_active }),
                                        })
                                        const data = await response.json()
                                        if (data.success) {
                                          loadForms()
                                        }
                                      } catch (error) {
                                        console.error('Error toggling form status:', error)
                                      }
                                    }}
                                    className={`p-1.5 rounded transition-colors ${
                                      form.is_active
                                        ? 'text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50'
                                        : 'text-green-600 hover:text-green-800 hover:bg-green-50'
                                    }`}
                                    title={form.is_active ? 'Deactivate' : 'Activate'}
                                  >
                                    <Power className="w-4 h-4" />
                                  </button>
                                )}
                                {/* Only show delete for database forms */}
                                {form.id.length > 20 && (
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete "${form.name}"?`)) {
                                        try {
                                          const response = await fetch('/api/forms/delete', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ id: form.id }),
                                          })
                                          const data = await response.json()
                                          if (data.success) {
                                            loadForms()
                                          }
                                        } catch (error) {
                                          console.error('Error deleting form:', error)
                                        }
                                      }
                                    }}
                                    className="p-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {forms.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-luxury-gray-2">No forms created yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Side Modal */}
      {modalOpen && selectedResponse && (
        <div className="fixed inset-0 z-40 flex" style={{ top: '80px' }}>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setModalOpen(false)}
            style={{ top: '80px' }}
          />
          
          {/* Modal */}
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto z-40" style={{ top: '80px' }}>
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-medium">
                {selectedResponse.formType === 'prospective-agent' && 'Prospective Agent Form'}
                {selectedResponse.formType === 'pre-listing' && 'Pre-Listing Form'}
                {selectedResponse.formType === 'just-listed' && 'Just Listed Form'}
              </h2>
              <div className="flex items-center gap-3">
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90"
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setIsEditing(false)
                        setEditData({ ...selectedResponse })
                      }}
                      className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setModalOpen(false)
                    setIsEditing(false)
                  }}
                  className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <p className="text-xs text-luxury-gray-2 mb-1">Submitted</p>
                <p className="text-sm">{formatDate(selectedResponse.created_at)}</p>
              </div>

              {/* Prospective Agent Form Details */}
              {selectedResponse.formType === 'prospective-agent' && editData && (
                <div className="space-y-4">
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Contact Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">First Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.first_name || ''}
                            onChange={(e) => setEditData({...editData, first_name: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.first_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Last Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.last_name || ''}
                            onChange={(e) => setEditData({...editData, last_name: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.last_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Preferred First Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.preferred_first_name || ''}
                            onChange={(e) => setEditData({...editData, preferred_first_name: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.preferred_first_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Preferred Last Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.preferred_last_name || ''}
                            onChange={(e) => setEditData({...editData, preferred_last_name: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.preferred_last_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Email</label>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editData.email || ''}
                            onChange={(e) => setEditData({...editData, email: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.email}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Phone</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editData.phone || ''}
                            onChange={(e) => setEditData({...editData, phone: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.phone}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Location</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.location || ''}
                            onChange={(e) => setEditData({...editData, location: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.location}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Instagram Handle</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.instagram_handle || ''}
                            onChange={(e) => setEditData({...editData, instagram_handle: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.instagram_handle || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">MLS Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">MLS Choice</label>
                        {isEditing ? (
                          <select
                            value={editData.mls_choice || ''}
                            onChange={(e) => setEditData({...editData, mls_choice: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="HAR">HAR</option>
                            <option value="MetroTex | NTREIS">MetroTex | NTREIS</option>
                            <option value="Both">Both</option>
                          </select>
                        ) : (
                          <p className="text-sm">{selectedResponse.mls_choice}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Association Status</label>
                        {isEditing ? (
                          <select
                            value={editData.association_status_on_join || ''}
                            onChange={(e) => setEditData({...editData, association_status_on_join: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="new_agent">New Agent</option>
                            <option value="previous_member">Previous Member</option>
                          </select>
                        ) : (
                          <p className="text-sm">{selectedResponse.association_status_on_join}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Previous Brokerage</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.previous_brokerage || ''}
                            onChange={(e) => setEditData({...editData, previous_brokerage: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.previous_brokerage || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Expectations & Goals</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Expectations</label>
                        {isEditing ? (
                          <textarea
                            value={editData.expectations || ''}
                            onChange={(e) => setEditData({...editData, expectations: e.target.value})}
                            className="textarea-luxury"
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.expectations}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Accountability</label>
                        {isEditing ? (
                          <textarea
                            value={editData.accountability || ''}
                            onChange={(e) => setEditData({...editData, accountability: e.target.value})}
                            className="textarea-luxury"
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.accountability}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Lead Generation</label>
                        {isEditing ? (
                          <textarea
                            value={editData.lead_generation || ''}
                            onChange={(e) => setEditData({...editData, lead_generation: e.target.value})}
                            className="textarea-luxury"
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.lead_generation}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Additional Info</label>
                        {isEditing ? (
                          <textarea
                            value={editData.additional_info || ''}
                            onChange={(e) => setEditData({...editData, additional_info: e.target.value})}
                            className="textarea-luxury"
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.additional_info || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Referral & Team</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">How Heard</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.how_heard || ''}
                            onChange={(e) => setEditData({...editData, how_heard: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.how_heard}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">How Heard (Other)</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.how_heard_other || ''}
                            onChange={(e) => setEditData({...editData, how_heard_other: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.how_heard_other || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Referring Agent</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.referring_agent || ''}
                            onChange={(e) => setEditData({...editData, referring_agent: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.referring_agent || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Joining Team</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.joining_team || ''}
                            onChange={(e) => setEditData({...editData, joining_team: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.joining_team || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Additional Fields - dynamic, shows any extra responses not already mapped above */}
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Fields</h3>
                    <div className="space-y-2">
                      {getAdditionalFields(selectedResponse, 'prospective-agent').length === 0 ? (
                        <p className="text-sm text-luxury-gray-2">No additional fields</p>
                      ) : (
                        getAdditionalFields(selectedResponse, 'prospective-agent').map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-4">
                            <p className="text-xs text-luxury-gray-2">{formatFieldLabel(key)}</p>
                            <div className="text-sm text-right break-words">{renderFieldValue(value)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Pre-Listing Form Details */}
              {selectedResponse.formType === 'pre-listing' && editData && (
                <div className="space-y-4">
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Listing Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Agent Name</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.agent_name || ''}
                            onChange={(e) => setEditData({...editData, agent_name: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.agent_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Property Address</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.property_address || ''}
                            onChange={(e) => setEditData({...editData, property_address: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.property_address}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Transaction Type</label>
                        {isEditing ? (
                          <select
                            value={editData.transaction_type || 'sale'}
                            onChange={(e) => setEditData({...editData, transaction_type: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="sale">Sale</option>
                            <option value="lease">Lease</option>
                          </select>
                        ) : (
                          <p className="text-sm capitalize">{selectedResponse.transaction_type}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">MLS</label>
                        {isEditing ? (
                          <select
                            value={editData.mls_type || 'HAR'}
                            onChange={(e) => setEditData({...editData, mls_type: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="HAR">HAR</option>
                            <option value="NTREIS">NTREIS</option>
                          </select>
                        ) : (
                          <p className="text-sm">{selectedResponse.mls_type || 'HAR'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Status</label>
                        {isEditing ? (
                          <select
                            value={editData.status || 'pre-listing'}
                            onChange={(e) => setEditData({...editData, status: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="pre-listing">Pre-Listing</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="sold">Sold</option>
                            <option value="expired">Expired</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        ) : (
                          <p className="text-sm capitalize">{selectedResponse.status}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Estimated Launch Date</label>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editData.estimated_launch_date ? editData.estimated_launch_date.split('T')[0] : ''}
                            onChange={(e) => setEditData({...editData, estimated_launch_date: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.estimated_launch_date ? formatDate(selectedResponse.estimated_launch_date) : 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Lead Source</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.lead_source || ''}
                            onChange={(e) => setEditData({...editData, lead_source: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.lead_source || 'N/A'}</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Co-Listing Agent</label>
                        {isEditing ? (
                          <div className="relative agent-selector">
                            <input
                              type="text"
                              value={agentSearch['co_edit'] || editData.co_listing_agent_name || editData.co_listing_agent || ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setAgentSearch({...agentSearch, co_edit: value})
                                setEditData({
                                  ...editData,
                                  co_listing_agent: value,
                                  co_listing_agent_name: value,
                                  co_listing_agent_id: ''
                                })
                                setAgentDropdownOpen({...agentDropdownOpen, co_edit: true})
                              }}
                              onFocus={() => setAgentDropdownOpen({...agentDropdownOpen, co_edit: true})}
                              className="input-luxury"
                              placeholder="Search agents..."
                            />
                            {agentDropdownOpen['co_edit'] && filteredAgents('co_edit').length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                                {filteredAgents('co_edit').map(agent => (
                                  <div
                                    key={agent.id}
                                    onClick={() => selectCoListingAgent(agent, 'edit')}
                                    className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm"
                                  >
                                    {agent.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm">{selectedResponse.co_listing_agent || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Client Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Name or LLC</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.client_names || ''}
                            onChange={(e) => setEditData({...editData, client_names: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_names}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Phone</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editData.client_phone || ''}
                            onChange={(e) => setEditData({...editData, client_phone: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_phone || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Email</label>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editData.client_email || ''}
                            onChange={(e) => setEditData({...editData, client_email: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_email || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Details</h3>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <>
                            <input
                              type="checkbox"
                              checked={editData.dotloop_file_created || false}
                              onChange={(e) => setEditData({...editData, dotloop_file_created: e.target.checked})}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Dotloop file created</span>
                          </>
                        ) : (
                          <>
                            <input type="checkbox" checked={selectedResponse.dotloop_file_created} readOnly className="w-4 h-4" />
                            <span className="text-sm">Dotloop file created</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <>
                            <input
                              type="checkbox"
                              checked={editData.listing_input_requested || false}
                              onChange={(e) => setEditData({...editData, listing_input_requested: e.target.checked})}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Listing input requested</span>
                          </>
                        ) : (
                          <>
                            <input type="checkbox" checked={selectedResponse.listing_input_requested} readOnly className="w-4 h-4" />
                            <span className="text-sm">Listing input requested</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <>
                            <input
                              type="checkbox"
                              checked={editData.photography_requested || false}
                              onChange={(e) => setEditData({...editData, photography_requested: e.target.checked})}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Photography requested</span>
                          </>
                        ) : (
                          <>
                            <input type="checkbox" checked={selectedResponse.photography_requested || false} readOnly className="w-4 h-4" />
                            <span className="text-sm">Photography requested</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Additional Fields - dynamic, shows any extra responses not already mapped above */}
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Fields</h3>
                    <div className="space-y-2">
                      {getAdditionalFields(selectedResponse, 'pre-listing').length === 0 ? (
                        <p className="text-sm text-luxury-gray-2">No additional fields</p>
                      ) : (
                        getAdditionalFields(selectedResponse, 'pre-listing').map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-4">
                            <p className="text-xs text-luxury-gray-2">{formatFieldLabel(key)}</p>
                            <div className="text-sm text-right break-words">{renderFieldValue(value)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Just Listed Form Details */}
              {selectedResponse.formType === 'just-listed' && editData && (
                <div className="space-y-4">
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Listing Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Agent Name</label>
                        {isEditing ? (
                          <div className="relative agent-selector">
                            <input
                              type="text"
                              value={agentSearch['edit'] || editData.agent_name || ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setAgentSearch({...agentSearch, edit: value})
                                setEditData({...editData, agent_name: value})
                                setAgentDropdownOpen({...agentDropdownOpen, edit: true})
                              }}
                              onFocus={() => setAgentDropdownOpen({...agentDropdownOpen, edit: true})}
                              className="input-luxury"
                              placeholder="Search agents..."
                            />
                            {agentDropdownOpen['edit'] && filteredAgents('edit').length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                                {filteredAgents('edit').map(agent => (
                                  <div
                                    key={agent.id}
                                    onClick={() => selectAgent(agent.name, 'edit')}
                                    className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm"
                                  >
                                    {agent.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm">{selectedResponse.agent_name}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Property Address</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.property_address || ''}
                            onChange={(e) => setEditData({...editData, property_address: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.property_address}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Transaction Type</label>
                        {isEditing ? (
                          <select
                            value={editData.transaction_type || 'sale'}
                            onChange={(e) => setEditData({...editData, transaction_type: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="sale">Sale</option>
                            <option value="lease">Lease</option>
                          </select>
                        ) : (
                          <p className="text-sm capitalize">{selectedResponse.transaction_type}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">MLS</label>
                        {isEditing ? (
                          <select
                            value={editData.mls_type || 'HAR'}
                            onChange={(e) => setEditData({...editData, mls_type: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="HAR">HAR</option>
                            <option value="NTREIS">NTREIS</option>
                          </select>
                        ) : (
                          <p className="text-sm">{selectedResponse.mls_type || 'HAR'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Status</label>
                        {isEditing ? (
                          <select
                            value={editData.status || 'active'}
                            onChange={(e) => setEditData({...editData, status: e.target.value})}
                            className="select-luxury"
                          >
                            <option value="pre-listing">Pre-Listing</option>
                            <option value="active">Active</option>
                            <option value="pending">Pending</option>
                            <option value="sold">Sold</option>
                            <option value="expired">Expired</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        ) : (
                          <p className="text-sm capitalize">{selectedResponse.status}</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-luxury-gray-2 mb-1 block">MLS Link</label>
                        {isEditing ? (
                          <input
                            type="url"
                            value={editData.mls_link || ''}
                            onChange={(e) => setEditData({...editData, mls_link: e.target.value})}
                            className="input-luxury"
                            placeholder="https://..."
                          />
                        ) : (
                          selectedResponse.mls_link ? (
                            <a href={selectedResponse.mls_link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
                              {selectedResponse.mls_link}
                            </a>
                          ) : (
                            <p className="text-sm">N/A</p>
                          )
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Actual Launch Date</label>
                        {isEditing ? (
                          <input
                            type="date"
                            value={editData.actual_launch_date ? editData.actual_launch_date.split('T')[0] : ''}
                            onChange={(e) => setEditData({...editData, actual_launch_date: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.actual_launch_date ? formatDate(selectedResponse.actual_launch_date) : 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Lead Source</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.lead_source || ''}
                            onChange={(e) => setEditData({...editData, lead_source: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.lead_source || 'N/A'}</p>
                        )}
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Co-Listing Agent</label>
                        {isEditing ? (
                          <div className="relative agent-selector">
                            <input
                              type="text"
                              value={agentSearch['co_edit'] || editData.co_listing_agent_name || editData.co_listing_agent || ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setAgentSearch({...agentSearch, co_edit: value})
                                setEditData({
                                  ...editData,
                                  co_listing_agent: value,
                                  co_listing_agent_name: value,
                                  co_listing_agent_id: ''
                                })
                                setAgentDropdownOpen({...agentDropdownOpen, co_edit: true})
                              }}
                              onFocus={() => setAgentDropdownOpen({...agentDropdownOpen, co_edit: true})}
                              className="input-luxury"
                              placeholder="Search agents..."
                            />
                            {agentDropdownOpen['co_edit'] && filteredAgents('co_edit').length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                                {filteredAgents('co_edit').map(agent => (
                                  <div
                                    key={agent.id}
                                    onClick={() => selectCoListingAgent(agent, 'edit')}
                                    className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm"
                                  >
                                    {agent.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm">{selectedResponse.co_listing_agent || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Client Information</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Name or LLC</label>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editData.client_names || ''}
                            onChange={(e) => setEditData({...editData, client_names: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_names}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Phone</label>
                        {isEditing ? (
                          <input
                            type="tel"
                            value={editData.client_phone || ''}
                            onChange={(e) => setEditData({...editData, client_phone: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_phone || 'N/A'}</p>
                        )}
                      </div>
                      <div>
                        <label className="text-xs text-luxury-gray-2 mb-1 block">Client Email</label>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editData.client_email || ''}
                            onChange={(e) => setEditData({...editData, client_email: e.target.value})}
                            className="input-luxury"
                          />
                        ) : (
                          <p className="text-sm">{selectedResponse.client_email || 'N/A'}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Details</h3>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        {isEditing ? (
                          <>
                            <input
                              type="checkbox"
                              checked={editData.dotloop_file_created || false}
                              onChange={(e) => setEditData({...editData, dotloop_file_created: e.target.checked})}
                              className="w-4 h-4"
                            />
                            <span className="text-sm">Dotloop file created</span>
                          </>
                        ) : (
                          <>
                            <input type="checkbox" checked={selectedResponse.dotloop_file_created} readOnly className="w-4 h-4" />
                            <span className="text-sm">Dotloop file created</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coordination Details Section */}
                  {(editData?.coordination_requested || selectedResponse?.coordination_requested) && (
                    <div className="border-t border-luxury-gray-5 pt-4">
                      <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Coordination Service</h3>
                      <div className="space-y-4">
                        {isEditing ? (
                          <>
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={editData.coordination_requested || false}
                                onChange={(e) => setEditData({...editData, coordination_requested: e.target.checked})}
                                className="w-4 h-4"
                              />
                              <span className="text-sm">Coordination requested</span>
                            </div>
                            
                            {editData.coordination_requested && (
                              <div className="ml-6 space-y-3">
                                <div>
                                  <label className="flex items-start space-x-3 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={editData.is_broker_listing || false}
                                      onChange={(e) => {
                                        const isBroker = e.target.checked
                                        setEditData({
                                          ...editData,
                                          is_broker_listing: isBroker,
                                          coordination_payment_method: isBroker ? 'broker_listing' : (editData.coordination_payment_method || 'client_direct'),
                                        })
                                      }}
                                      className="mt-1"
                                    />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">Broker/Owner Listing</p>
                                      <p className="text-xs text-luxury-gray-2">
                                        Check this if this is a broker or owner listing. Fee will be set to $0.
                                      </p>
                                    </div>
                                  </label>
                                </div>
                                
                                {!editData.is_broker_listing && (
                                  <div>
                                    <label className="text-xs font-medium text-luxury-gray-1 mb-2 block">
                                      Payment Method <span className="text-red-500">*</span>
                                    </label>
                                    <div className="space-y-2">
                                      <label className="flex items-start space-x-3 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="coordination_payment_method_edit_jl"
                                          value="client_direct"
                                          checked={editData.coordination_payment_method === 'client_direct'}
                                          onChange={(e) => setEditData({...editData, coordination_payment_method: e.target.value})}
                                          className="mt-0.5"
                                        />
                                        <div className="flex-1">
                                          <p className="text-sm font-medium">Client Pays Directly</p>
                                          <p className="text-xs text-luxury-gray-2">
                                            Client pays $250 before service starts. Must be in listing agreement.
                                          </p>
                                        </div>
                                      </label>
                                      <label className="flex items-start space-x-3 cursor-pointer">
                                        <input
                                          type="radio"
                                          name="coordination_payment_method_edit_jl"
                                          value="agent_pays"
                                          checked={editData.coordination_payment_method === 'agent_pays'}
                                          onChange={(e) => setEditData({...editData, coordination_payment_method: e.target.value})}
                                          className="mt-0.5"
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
                                )}
                                
                                {editData.service_fee !== undefined && (
                                  <div>
                                    <label className="text-xs text-luxury-gray-2 mb-1 block">Service Fee</label>
                                    <p className="text-sm font-medium">
                                      ${editData.is_broker_listing ? '0.00' : (editData.service_fee?.toFixed(2) || '250.00')}
                                      {editData.is_broker_listing ? ' (Broker Listing)' : ' (one time)'}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <input type="checkbox" checked={selectedResponse.coordination_requested || false} readOnly className="w-4 h-4" />
                              <span className="text-sm">Coordination requested</span>
                            </div>
                            {selectedResponse.coordination_payment_method && (
                              <div className="ml-6">
                                <p className="text-xs text-luxury-gray-2 mb-1">Payment Method</p>
                                <p className="text-sm capitalize">
                                  {selectedResponse.coordination_payment_method === 'broker_listing' 
                                    ? 'Broker Listing ($0)' 
                                    : selectedResponse.coordination_payment_method === 'client_direct'
                                    ? 'Client Pays Directly'
                                    : 'Agent Pays'}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
                  
                  {/* Additional Fields - dynamic, shows any extra responses not already mapped above */}
                  <div className="border-t border-luxury-gray-5 pt-4">
                    <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Fields</h3>
                    <div className="space-y-2">
                      {getAdditionalFields(selectedResponse, 'just-listed').length === 0 ? (
                        <p className="text-sm text-luxury-gray-2">No additional fields</p>
                      ) : (
                        getAdditionalFields(selectedResponse, 'just-listed').map(([key, value]) => (
                          <div key={key} className="flex justify-between gap-4">
                            <p className="text-xs text-luxury-gray-2">{formatFieldLabel(key)}</p>
                            <div className="text-sm text-right break-words">{renderFieldValue(value)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
      )}

      {/* Create New Form Modal */}
      {createModalOpen && (activeTab === 'pre-listing' || activeTab === 'just-listed') && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setCreateModalOpen(false)}
          />
          
          {/* Modal */}
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl overflow-y-auto z-50">
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-medium">
                Create New {activeTab === 'pre-listing' ? 'Pre-Listing' : 'Just Listed'} Form Response
              </h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Agent Name <span className="text-red-500">*</span>
                </label>
                <div className="relative agent-selector">
                  <input
                    type="text"
                    value={agentSearch['create'] || newFormData.agent_name}
                    onChange={(e) => {
                      const value = e.target.value
                      setAgentSearch({...agentSearch, create: value})
                      setNewFormData({...newFormData, agent_name: value})
                      setAgentDropdownOpen({...agentDropdownOpen, create: true})
                    }}
                    onFocus={() => setAgentDropdownOpen({...agentDropdownOpen, create: true})}
                    className="input-luxury"
                    placeholder="Search agents..."
                    required
                  />
                  {agentDropdownOpen['create'] && filteredAgents('create').length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-60 overflow-y-auto">
                      {filteredAgents('create').map(agent => (
                        <div
                          key={agent.id}
                          onClick={() => selectAgent(agent.name, 'create')}
                          className="px-4 py-2 hover:bg-luxury-light cursor-pointer text-sm"
                        >
                          {agent.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Property Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFormData.property_address}
                  onChange={(e) => setNewFormData({...newFormData, property_address: e.target.value})}
                  className="input-luxury"
                  placeholder="123 Main St, Houston, TX 77001"
                  required
                />
              </div>

              {activeTab === 'just-listed' && (
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    MLS Link <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={newFormData.mls_link}
                    onChange={(e) => setNewFormData({...newFormData, mls_link: e.target.value})}
                    className="input-luxury"
                    placeholder="https://..."
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Transaction Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newFormData.transaction_type}
                  onChange={(e) => setNewFormData({...newFormData, transaction_type: e.target.value})}
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
                  value={newFormData.client_names}
                  onChange={(e) => setNewFormData({...newFormData, client_names: e.target.value})}
                  className="input-luxury"
                  placeholder="John and Jane Doe or ABC LLC"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Client Phone <span className="text-red-500">*</span>
                </label>
                <input
                  type="tel"
                  value={newFormData.client_phone}
                  onChange={(e) => setNewFormData({...newFormData, client_phone: e.target.value})}
                  className="input-luxury"
                  required
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Client Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newFormData.client_email}
                  onChange={(e) => setNewFormData({...newFormData, client_email: e.target.value})}
                  className="input-luxury"
                  required
                />
              </div>

              {activeTab === 'pre-listing' && (
                <>

                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Estimated Launch Date
                    </label>
                    <input
                      type="date"
                      value={newFormData.estimated_launch_date}
                      onChange={(e) => setNewFormData({...newFormData, estimated_launch_date: e.target.value})}
                      className="input-luxury"
                    />
                  </div>
                </>
              )}

              {activeTab === 'just-listed' && (
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Actual Launch Date
                  </label>
                  <input
                    type="date"
                    value={newFormData.actual_launch_date}
                    onChange={(e) => setNewFormData({...newFormData, actual_launch_date: e.target.value})}
                    className="input-luxury"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Lead Source
                </label>
                <input
                  type="text"
                  value={newFormData.lead_source}
                  onChange={(e) => setNewFormData({...newFormData, lead_source: e.target.value})}
                  className="input-luxury"
                />
              </div>

              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Status
                </label>
                <select
                  value={newFormData.status}
                  onChange={(e) => setNewFormData({...newFormData, status: e.target.value})}
                  className="select-luxury"
                >
                  <option value="pre-listing">Pre-Listing</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="sold">Sold</option>
                  <option value="expired">Expired</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div className="border-t border-luxury-gray-5 pt-4">
                <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Additional Details</h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.dotloop_file_created}
                      onChange={(e) => setNewFormData({...newFormData, dotloop_file_created: e.target.checked})}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Dotloop file created</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.listing_input_requested}
                      onChange={(e) => setNewFormData({...newFormData, listing_input_requested: e.target.checked})}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Listing input requested</span>
                  </label>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newFormData.photography_requested}
                      onChange={(e) => setNewFormData({...newFormData, photography_requested: e.target.checked})}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">Photography requested</span>
                  </label>
                </div>
              </div>

              {coordinationConfig && (
                <div className="border-t border-luxury-gray-5 pt-4">
                  <h3 className="text-sm font-medium text-luxury-gray-1 mb-3">Optional Services</h3>
                  <div className="bg-luxury-light p-4 rounded mb-4">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newFormData.coordination_requested}
                        onChange={(e) => setNewFormData({...newFormData, coordination_requested: e.target.checked})}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-base mb-1">
                          {coordinationConfig.service_name} - ${coordinationConfig.price} <span className="text-xs font-normal text-luxury-gray-2">(one time)</span>
                        </p>
                        {coordinationConfig.inclusions && coordinationConfig.inclusions.length > 0 && (
                          <ul className="list-disc list-inside space-y-1 text-xs text-luxury-gray-1 ml-4 mb-3">
                            {coordinationConfig.inclusions.map((item: string, idx: number) => (
                              <li key={idx}>{item}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </label>
                    
                    {newFormData.coordination_requested && (
                      <div className="mt-4 ml-7 pl-4 border-l-2 border-luxury-gray-5">
                        <div className="mb-4">
                          <label className="flex items-start space-x-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={newFormData.is_broker_listing}
                              onChange={(e) => setNewFormData({...newFormData, is_broker_listing: e.target.checked})}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Broker/Owner Listing</p>
                              <p className="text-xs text-luxury-gray-2">
                                Check this if this is a broker or owner listing. Fee will be set to $0.
                              </p>
                            </div>
                          </label>
                        </div>
                        
                        {!newFormData.is_broker_listing && (
                          <>
                            <p className="text-xs font-medium text-luxury-gray-1 mb-2">
                              Payment Method <span className="text-red-500">*</span>
                            </p>
                            <div className="space-y-2">
                              <label className="flex items-start space-x-3 cursor-pointer">
                                <input
                                  type="radio"
                                  name="coordination_payment_method"
                                  value="client_direct"
                                  checked={newFormData.coordination_payment_method === 'client_direct'}
                                  onChange={(e) => setNewFormData({...newFormData, coordination_payment_method: e.target.value as 'client_direct'})}
                                  className="mt-0.5"
                                  required={newFormData.coordination_requested}
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
                                  checked={newFormData.coordination_payment_method === 'agent_pays'}
                                  onChange={(e) => setNewFormData({...newFormData, coordination_payment_method: e.target.value as 'agent_pays'})}
                                  className="mt-0.5"
                                  required={newFormData.coordination_requested}
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">Agent Pays (Due in 60 Days or at Closing)</p>
                                  <p className="text-xs text-luxury-gray-2">
                                    You pay $250 to brokerage within 60 days or at closing, whichever happens first. If not paid within 60 days, fee will be deducted from any commission.
                                  </p>
                                </div>
                              </label>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-6 border-t border-luxury-gray-5">
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="px-6 py-2.5 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSubmit}
                  disabled={creating}
                  className="px-6 py-2.5 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Form Response'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Form Modal */}
      {createFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-medium">{editingForm ? 'Edit Form' : 'Create New Form'}</h2>
              <button
                onClick={() => {
                  setCreateFormModalOpen(false)
                  setEditingForm(null)
                  setNewFormDefinition({ name: '', description: '', form_type: 'pre-listing' })
                }}
                className="text-luxury-gray-2 hover:text-luxury-black transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Form Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newFormDefinition.name}
                  onChange={(e) => setNewFormDefinition({...newFormDefinition, name: e.target.value})}
                  className="input-luxury"
                  placeholder="e.g., Compliance Request, Under Contract, etc."
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Form Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newFormDefinition.form_type}
                  onChange={(e) => setNewFormDefinition({...newFormDefinition, form_type: e.target.value})}
                  className="select-luxury"
                  required
                >
                  <option value="pre-listing">Pre-Listing</option>
                  <option value="just-listed">Just Listed</option>
                  <option value="compliance-request">Compliance Request</option>
                  <option value="under-contract">Under Contract</option>
                  <option value="transaction-update">Transaction Update</option>
                  <option value="other">Other</option>
                </select>
                <p className="text-xs text-luxury-gray-2 mt-1">
                  Select the form type. This determines which form template is used.
                </p>
              </div>
              
              <div>
                <label className="block text-sm mb-2 text-luxury-gray-1">
                  Description
                </label>
                <textarea
                  value={newFormDefinition.description}
                  onChange={(e) => setNewFormDefinition({...newFormDefinition, description: e.target.value})}
                  className="textarea-luxury"
                  placeholder="Describe when this form should be used..."
                  rows={3}
                />
              </div>
              
              <div className="bg-luxury-light p-4 rounded">
                <p className="text-xs text-luxury-gray-2 mb-2">
                  <strong>Note:</strong> A shareable link will be automatically generated for this form. 
                  The link does not expire and can be shared with anyone.
                </p>
              </div>
              
              <div className="flex justify-end gap-3 pt-4 border-t border-luxury-gray-5">
                <button
                  onClick={() => {
                    setCreateFormModalOpen(false)
                    setNewFormDefinition({ name: '', description: '', form_type: 'pre-listing' })
                  }}
                  className="px-4 py-2 text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black"
                  disabled={creatingForm}
                >
                  Cancel
                </button>
                <button
                  onClick={editingForm ? handleUpdateForm : handleCreateForm}
                  disabled={creatingForm || !newFormDefinition.name || !newFormDefinition.form_type}
                  className="px-4 py-2 text-sm rounded transition-colors bg-luxury-black text-white hover:opacity-90 disabled:opacity-50"
                >
                  {creatingForm 
                    ? (editingForm ? 'Updating...' : 'Creating...') 
                    : (editingForm ? 'Update Form' : 'Create Form')
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

