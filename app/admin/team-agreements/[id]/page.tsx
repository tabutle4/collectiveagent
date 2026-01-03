'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, X, AlertCircle, CheckCircle } from 'lucide-react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  displayName: string
}

interface TeamMember {
  id?: string
  agent_id: string
  agent_name?: string
  is_team_lead: boolean
  joined_date: string
  left_date: string | null
  split_from_team_lead: {
    agent_percent: number
    team_lead_percent: number
    firm_percent: number
  } | null
  split_from_own_lead: {
    agent_percent: number
    team_lead_percent: number
    firm_percent: number
  } | null
  split_from_firm_lead: {
    agent_percent: number
    team_lead_percent: number
    firm_percent: number
  } | null
}

interface TeamAgreement {
  id: string
  team_name: string
  team_lead_id: string
  effective_date: string
  expiration_date: string | null
  status: 'active' | 'expired' | 'terminated'
  agreement_document_url: string | null
  notes: string | null
  team_members: TeamMember[]
}

export default function TeamAgreementFormPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isEdit = params.id !== 'new' && searchParams.get('edit') === 'true'
  const isNew = params.id === 'new'
  const isView = params.id !== 'new' && !isEdit
  
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [formData, setFormData] = useState({
    team_name: '',
    team_lead_id: '',
    effective_date: '',
    expiration_date: '',
    status: 'active' as 'active' | 'expired' | 'terminated',
    agreement_document_url: '',
    notes: '',
  })
  
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (!userStr) {
      router.push('/auth/login')
      return
    }

    try {
      const userData = JSON.parse(userStr)
      if (!userData.roles || !userData.roles.includes('admin')) {
        router.push('/auth/login')
        return
      }
      setUser(userData)
      loadAgents()
      if (!isNew) {
        loadAgreement()
      } else {
        setLoading(false)
      }
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router, params.id])

  const loadAgents = async () => {
    try {
      const response = await fetch('/api/agents/list')
      const data = await response.json()
      if (data.success) {
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    }
  }

  const loadAgreement = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/team-agreements/${params.id}`)
      const data = await response.json()
      
      if (response.ok && data.agreement) {
        const agreement = data.agreement
        setFormData({
          team_name: agreement.team_name || '',
          team_lead_id: agreement.team_lead_id || '',
          effective_date: agreement.effective_date ? agreement.effective_date.split('T')[0] : '',
          expiration_date: agreement.expiration_date ? agreement.expiration_date.split('T')[0] : '',
          status: agreement.status || 'active',
          agreement_document_url: agreement.agreement_document_url || '',
          notes: agreement.notes || '',
        })
        
        // Format team members
        const members = (agreement.team_members || []).map((m: any) => ({
          id: m.id,
          agent_id: m.agent_id,
          agent_name: m.agent?.preferred_first_name && m.agent?.preferred_last_name
            ? `${m.agent.preferred_first_name} ${m.agent.preferred_last_name}`
            : `${m.agent?.first_name} ${m.agent?.last_name}`,
          is_team_lead: m.is_team_lead || false,
          joined_date: m.joined_date ? m.joined_date.split('T')[0] : '',
          left_date: m.left_date ? m.left_date.split('T')[0] : null,
          split_from_team_lead: m.split_from_team_lead || null,
          split_from_own_lead: m.split_from_own_lead || null,
          split_from_firm_lead: m.split_from_firm_lead || null,
        }))
        setTeamMembers(members)
      } else {
        setError(data.error || 'Failed to load agreement')
      }
    } catch (error: any) {
      console.error('Error loading agreement:', error)
      setError(error.message || 'Failed to load agreement')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  const addTeamMember = () => {
    setTeamMembers(prev => [...prev, {
      agent_id: '',
      is_team_lead: false,
      joined_date: formData.effective_date || new Date().toISOString().split('T')[0],
      left_date: null,
      split_from_team_lead: null,
      split_from_own_lead: null,
      split_from_firm_lead: null,
    }])
  }

  const removeTeamMember = (index: number) => {
    setTeamMembers(prev => prev.filter((_, i) => i !== index))
  }

  const updateTeamMember = (index: number, field: string, value: any) => {
    setTeamMembers(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    setError(null)
  }

  const updateSplit = (
    index: number,
    source: 'split_from_team_lead' | 'split_from_own_lead' | 'split_from_firm_lead',
    field: 'agent_percent' | 'team_lead_percent' | 'firm_percent',
    value: number
  ) => {
    setTeamMembers(prev => {
      const updated = [...prev]
      if (!updated[index][source]) {
        updated[index][source] = { agent_percent: 0, team_lead_percent: 0, firm_percent: 0 }
      }
      updated[index][source] = {
        ...updated[index][source]!,
        [field]: value,
      }
      return updated
    })
    setError(null)
  }

  const validateSplits = (member: TeamMember): string | null => {
    const splits = [
      { name: 'Lead from Team Lead', split: member.split_from_team_lead },
      { name: "Agent's Own Lead", split: member.split_from_own_lead },
      { name: 'Lead from Firm', split: member.split_from_firm_lead },
    ]
    
    for (const { name, split } of splits) {
      if (split) {
        const total = (split.agent_percent || 0) + (split.team_lead_percent || 0) + (split.firm_percent || 0)
        if (Math.abs(total - 100) > 0.01) {
          return `${name} splits must total 100% (currently ${total.toFixed(1)}%)`
        }
      }
    }
    return null
  }

  const validateForm = (): string | null => {
    if (!formData.team_name.trim()) {
      return 'Team name is required'
    }
    if (!formData.team_lead_id) {
      return 'Team lead is required'
    }
    if (!formData.effective_date) {
      return 'Effective date is required'
    }
    if (formData.expiration_date && formData.expiration_date < formData.effective_date) {
      return 'Expiration date must be after effective date'
    }
    if (teamMembers.length === 0) {
      return 'At least one team member is required'
    }
    
    // Check if team lead is in members
    const teamLeadInMembers = teamMembers.some(m => m.agent_id === formData.team_lead_id)
    if (!teamLeadInMembers) {
      return 'Team lead must be one of the team members'
    }
    
    // Check for duplicate agents
    const agentIds = teamMembers.map(m => m.agent_id).filter(id => id)
    const uniqueIds = new Set(agentIds)
    if (agentIds.length !== uniqueIds.size) {
      return 'Cannot have duplicate agents on the same team'
    }
    
    // Validate all members have agent selected
    for (let i = 0; i < teamMembers.length; i++) {
      if (!teamMembers[i].agent_id) {
        return `Team member ${i + 1} must have an agent selected`
      }
      
      const splitError = validateSplits(teamMembers[i])
      if (splitError) {
        return splitError
      }
    }
    
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    
    setSaving(true)
    
    try {
      const payload = {
        ...formData,
        expiration_date: formData.expiration_date || null,
        agreement_document_url: formData.agreement_document_url || null,
        notes: formData.notes || null,
        team_members: teamMembers.map(m => ({
          agent_id: m.agent_id,
          is_team_lead: m.is_team_lead,
          joined_date: m.joined_date || formData.effective_date,
          left_date: m.left_date || null,
          split_from_team_lead: m.split_from_team_lead,
          split_from_own_lead: m.split_from_own_lead,
          split_from_firm_lead: m.split_from_firm_lead,
        })),
      }
      
      const url = isNew ? '/api/team-agreements' : `/api/team-agreements/${params.id}`
      const method = isNew ? 'POST' : 'PUT'
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      
      const data = await response.json()
      
      if (response.ok) {
        setSuccess(true)
        setTimeout(() => {
          router.push('/admin/team-agreements')
        }, 1500)
      } else {
        setError(data.error || 'Failed to save team agreement')
      }
    } catch (error: any) {
      console.error('Error saving agreement:', error)
      setError(error.message || 'Failed to save team agreement')
    } finally {
      setSaving(false)
    }
  }

  const getSplitTotal = (split: { agent_percent: number; team_lead_percent: number; firm_percent: number } | null): number => {
    if (!split) return 0
    return (split.agent_percent || 0) + (split.team_lead_percent || 0) + (split.firm_percent || 0)
  }

  const getSplitStatus = (total: number) => {
    if (Math.abs(total - 100) < 0.01) {
      return { valid: true, className: 'text-green-600' }
    }
    return { valid: false, className: 'text-red-600' }
  }

  if (!user || loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading...</p>
        </div>
      </div>
    )
  }

  // View-only mode
  if (isView) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/team-agreements"
            className="inline-flex items-center gap-2 text-sm text-luxury-gray-2 hover:text-luxury-black mb-4"
          >
            <ArrowLeft size={16} />
            Back to Team Agreements
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
              {formData.team_name || 'Team Agreement Details'}
            </h1>
            <Link
              href={`/admin/team-agreements/${params.id}?edit=true`}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-block"
            >
              Edit Agreement
            </Link>
          </div>
        </div>

        {/* Basic Info */}
        <div className="card-section mb-6">
          <h2 className="text-lg font-medium text-luxury-black mb-4">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-luxury-gray-2">Team Name</label>
              <p className="text-luxury-black">{formData.team_name}</p>
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Status</label>
              <p className="text-luxury-black capitalize">{formData.status}</p>
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Team Lead</label>
              <p className="text-luxury-black">
                {agents.find(a => a.id === formData.team_lead_id)?.displayName || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Effective Date</label>
              <p className="text-luxury-black">
                {formData.effective_date ? new Date(formData.effective_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm text-luxury-gray-2">Expiration Date</label>
              <p className="text-luxury-black">
                {formData.expiration_date ? new Date(formData.expiration_date).toLocaleDateString() : 'N/A'}
              </p>
            </div>
            {formData.agreement_document_url && (
              <div className="md:col-span-2">
                <label className="text-sm text-luxury-gray-2">Agreement Document</label>
                <p>
                  <a
                    href={formData.agreement_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-luxury-black underline"
                  >
                    View Document
                  </a>
                </p>
              </div>
            )}
            {formData.notes && (
              <div className="md:col-span-2">
                <label className="text-sm text-luxury-gray-2">Notes</label>
                <p className="text-luxury-black whitespace-pre-wrap">{formData.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Team Members */}
        <div className="card-section">
          <h2 className="text-lg font-medium text-luxury-black mb-4">Team Members</h2>
          {teamMembers.length === 0 ? (
            <p className="text-sm text-luxury-gray-2">No team members</p>
          ) : (
            <div className="space-y-6">
              {teamMembers.map((member, index) => {
                const agent = agents.find(a => a.id === member.agent_id)
                return (
                  <div key={index} className="border border-luxury-gray-5 rounded-lg p-4">
                    <h3 className="text-base font-medium text-luxury-black mb-4">
                      {agent?.displayName || 'Unknown Agent'}
                      {member.is_team_lead && (
                        <span className="ml-2 text-xs bg-luxury-black text-white px-2 py-1 rounded">
                          Team Lead
                        </span>
                      )}
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                      <div>
                        <label className="text-luxury-gray-2">Joined Date</label>
                        <p className="text-luxury-black">
                          {member.joined_date ? new Date(member.joined_date).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                      {member.left_date && (
                        <div>
                          <label className="text-luxury-gray-2">Left Date</label>
                          <p className="text-luxury-black">
                            {new Date(member.left_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                    {/* Splits */}
                    <div className="space-y-3 border-t border-luxury-gray-5 pt-4">
                      {member.split_from_team_lead && (
                        <div>
                          <h4 className="text-sm font-medium text-luxury-black mb-2">Lead from Team Lead</h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-luxury-gray-2">Agent:</span> {member.split_from_team_lead.agent_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Team Lead:</span> {member.split_from_team_lead.team_lead_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Firm:</span> {member.split_from_team_lead.firm_percent}%
                            </div>
                          </div>
                        </div>
                      )}
                      {member.split_from_own_lead && (
                        <div>
                          <h4 className="text-sm font-medium text-luxury-black mb-2">Agent's Own Lead</h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-luxury-gray-2">Agent:</span> {member.split_from_own_lead.agent_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Team Lead:</span> {member.split_from_own_lead.team_lead_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Firm:</span> {member.split_from_own_lead.firm_percent}%
                            </div>
                          </div>
                        </div>
                      )}
                      {member.split_from_firm_lead && (
                        <div>
                          <h4 className="text-sm font-medium text-luxury-black mb-2">Lead from Firm</h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <span className="text-luxury-gray-2">Agent:</span> {member.split_from_firm_lead.agent_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Team Lead:</span> {member.split_from_firm_lead.team_lead_percent}%
                            </div>
                            <div>
                              <span className="text-luxury-gray-2">Firm:</span> {member.split_from_firm_lead.firm_percent}%
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/team-agreements"
          className="inline-flex items-center gap-2 text-sm text-luxury-gray-2 hover:text-luxury-black mb-4"
        >
          <ArrowLeft size={16} />
          Back to Team Agreements
        </Link>
        <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
          {isNew ? 'Create New Team Agreement' : 'Edit Team Agreement'}
        </h1>
      </div>

      {error && (
        <div className="card-section mb-6 bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle size={18} />
            <p>{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="card-section mb-6 bg-green-50 border border-green-200">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle size={18} />
            <p>Team agreement saved successfully! Redirecting...</p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SECTION 1: Basic Info */}
        <div className="card-section">
          <h2 className="text-lg font-medium text-luxury-black mb-4">Basic Information</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Team Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.team_name}
                onChange={(e) => handleInputChange('team_name', e.target.value)}
                className="input-luxury"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Team Lead <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.team_lead_id}
                onChange={(e) => handleInputChange('team_lead_id', e.target.value)}
                className="select-luxury"
                required
              >
                <option value="">Select team lead...</option>
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Status
              </label>
              <select
                value={formData.status}
                onChange={(e) => handleInputChange('status', e.target.value)}
                className="select-luxury"
              >
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="terminated">Terminated</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Effective Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.effective_date}
                onChange={(e) => handleInputChange('effective_date', e.target.value)}
                className="input-luxury"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Expiration Date
              </label>
              <input
                type="date"
                value={formData.expiration_date}
                onChange={(e) => handleInputChange('expiration_date', e.target.value)}
                className="input-luxury"
                min={formData.effective_date}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Agreement Document URL
              </label>
              <input
                type="url"
                value={formData.agreement_document_url}
                onChange={(e) => handleInputChange('agreement_document_url', e.target.value)}
                className="input-luxury"
                placeholder="https://..."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-luxury-gray-2 mb-1">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="textarea-luxury"
                rows={4}
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: Team Members */}
        <div className="card-section">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-luxury-black">Team Members</h2>
            <button
              type="button"
              onClick={addTeamMember}
              className="px-3 py-2 text-xs md:text-sm rounded transition-colors bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Add Team Member
            </button>
          </div>

          {teamMembers.length === 0 ? (
            <p className="text-sm text-luxury-gray-2 text-center py-8">
              No team members added yet. Click "Add Team Member" to get started.
            </p>
          ) : (
            <div className="space-y-6">
              {teamMembers.map((member, index) => {
                const agent = agents.find(a => a.id === member.agent_id)
                const teamLeadSplit = getSplitTotal(member.split_from_team_lead)
                const ownLeadSplit = getSplitTotal(member.split_from_own_lead)
                const firmLeadSplit = getSplitTotal(member.split_from_firm_lead)
                
                return (
                  <div key={index} className="border border-luxury-gray-5 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-medium text-luxury-black">
                        Team Member {index + 1}
                      </h3>
                      <button
                        type="button"
                        onClick={() => removeTeamMember(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm text-luxury-gray-2 mb-1">
                          Agent <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={member.agent_id}
                          onChange={(e) => updateTeamMember(index, 'agent_id', e.target.value)}
                          className="select-luxury"
                          required
                        >
                          <option value="">Select agent...</option>
                          {agents.map(agent => (
                            <option key={agent.id} value={agent.id}>
                              {agent.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2 pt-6">
                        <input
                          type="checkbox"
                          id={`is_team_lead_${index}`}
                          checked={member.is_team_lead}
                          onChange={(e) => updateTeamMember(index, 'is_team_lead', e.target.checked)}
                          className="w-4 h-4"
                        />
                        <label htmlFor={`is_team_lead_${index}`} className="text-sm text-luxury-gray-2">
                          Is Team Lead
                        </label>
                      </div>

                      <div>
                        <label className="block text-sm text-luxury-gray-2 mb-1">
                          Joined Date
                        </label>
                        <input
                          type="date"
                          value={member.joined_date}
                          onChange={(e) => updateTeamMember(index, 'joined_date', e.target.value)}
                          className="input-luxury"
                          max={formData.expiration_date || undefined}
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-luxury-gray-2 mb-1">
                          Left Date
                        </label>
                        <input
                          type="date"
                          value={member.left_date || ''}
                          onChange={(e) => updateTeamMember(index, 'left_date', e.target.value || null)}
                          className="input-luxury"
                          min={member.joined_date}
                          max={formData.expiration_date || undefined}
                        />
                      </div>
                    </div>

                    {/* Splits */}
                    <div className="space-y-4 border-t border-luxury-gray-5 pt-4">
                      {/* Lead from Team Lead */}
                      <div className="bg-luxury-light p-4 rounded">
                        <h4 className="text-sm font-medium text-luxury-black mb-3">
                          Lead from Team Lead
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Agent %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_team_lead?.agent_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_team_lead', 'agent_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Team Lead %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_team_lead?.team_lead_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_team_lead', 'team_lead_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Firm %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_team_lead?.firm_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_team_lead', 'firm_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                        </div>
                        <div className={`text-xs mt-2 ${getSplitStatus(teamLeadSplit).className}`}>
                          Total: {teamLeadSplit.toFixed(1)}% {!getSplitStatus(teamLeadSplit).valid && '(Must equal 100%)'}
                        </div>
                      </div>

                      {/* Agent's Own Lead */}
                      <div className="bg-luxury-light p-4 rounded">
                        <h4 className="text-sm font-medium text-luxury-black mb-3">
                          Agent's Own Lead
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Agent %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_own_lead?.agent_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_own_lead', 'agent_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Team Lead %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_own_lead?.team_lead_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_own_lead', 'team_lead_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Firm %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_own_lead?.firm_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_own_lead', 'firm_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                        </div>
                        <div className={`text-xs mt-2 ${getSplitStatus(ownLeadSplit).className}`}>
                          Total: {ownLeadSplit.toFixed(1)}% {!getSplitStatus(ownLeadSplit).valid && '(Must equal 100%)'}
                        </div>
                      </div>

                      {/* Lead from Firm */}
                      <div className="bg-luxury-light p-4 rounded">
                        <h4 className="text-sm font-medium text-luxury-black mb-3">
                          Lead from Firm
                        </h4>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Agent %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_firm_lead?.agent_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_firm_lead', 'agent_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Team Lead %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_firm_lead?.team_lead_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_firm_lead', 'team_lead_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-luxury-gray-2 mb-1">Firm %</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={member.split_from_firm_lead?.firm_percent || 0}
                              onChange={(e) => updateSplit(index, 'split_from_firm_lead', 'firm_percent', parseFloat(e.target.value) || 0)}
                              className="input-luxury text-sm"
                            />
                          </div>
                        </div>
                        <div className={`text-xs mt-2 ${getSplitStatus(firmLeadSplit).className}`}>
                          Total: {firmLeadSplit.toFixed(1)}% {!getSplitStatus(firmLeadSplit).valid && '(Must equal 100%)'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Submit Buttons */}
        <div className="flex gap-4 justify-end">
          <Link
            href="/admin/team-agreements"
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black inline-block"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : isNew ? 'Create Agreement' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}

