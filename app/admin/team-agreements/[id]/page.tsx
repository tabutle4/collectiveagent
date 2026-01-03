'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, X, AlertCircle, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface Agent {
  id: string
  name: string
  displayName: string
}

interface Split {
  agent: number
  team_lead: number
  firm: number
}

interface SplitsData {
  sales: {
    new_agent: {
      team_lead: Split
      own: Split
      firm: Split
    }
    no_cap: {
      team_lead: Split
      own: Split
      firm: Split
    }
    cap: {
      team_lead: Split
      own: Split
      firm: Split
    }
    custom: {
      team_lead: Split
      own: Split
      firm: Split
    }
  }
  lease: {
    standard: {
      team_lead: Split
      own: Split
      firm: Split
    }
    custom: {
      team_lead: Split
      own: Split
      firm: Split
    }
  }
}

interface TeamMember {
  id?: string
  agent_id: string
  agent_name?: string
  is_team_lead: boolean
  joined_date: string
  left_date: string | null
  splits: SplitsData | null
  // UI state: which sections are expanded (accordion)
  expandedSections?: {
    sales_new_agent?: boolean
    sales_no_cap?: boolean
    sales_cap?: boolean
    sales_custom?: boolean
    lease_standard?: boolean
    lease_custom?: boolean
  }
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
        
        // Format team members with new splits structure
        const members = (agreement.team_members || []).map((m: any) => {
          // Use splits from database or initialize with defaults
          let splits: SplitsData = m.splits || initializeSplits()
          
          // Ensure structure is complete (handle any missing plans)
          if (!splits.sales?.custom) {
            splits = {
              ...splits,
              sales: {
                ...splits.sales,
                custom: splitTemplates.sales.custom,
              },
            }
          }
          if (!splits.lease?.custom) {
            splits = {
              ...splits,
              lease: {
                ...splits.lease,
                custom: splitTemplates.lease.custom,
              },
            }
          }
          
          return {
            id: m.id,
            agent_id: m.agent_id,
            agent_name: m.agent?.preferred_first_name && m.agent?.preferred_last_name
              ? `${m.agent.preferred_first_name} ${m.agent.preferred_last_name}`
              : `${m.agent?.first_name} ${m.agent?.last_name}`,
            is_team_lead: m.is_team_lead || false,
            joined_date: m.joined_date ? m.joined_date.split('T')[0] : '',
            left_date: m.left_date ? m.left_date.split('T')[0] : null,
            splits: splits,
            expandedSections: {
              sales_new_agent: true, // Default: expanded
              sales_no_cap: false,
              sales_cap: false,
              sales_custom: false,
              lease_standard: true, // Default: expanded
              lease_custom: false,
            },
          }
        })
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

  // Split templates with new structure
  const splitTemplates: SplitsData = {
    sales: {
      new_agent: {
        team_lead: { agent: 50, team_lead: 30, firm: 20 },
        own: { agent: 70, team_lead: 10, firm: 20 },
        firm: { agent: 50, team_lead: 5, firm: 45 },
      },
      no_cap: {
        team_lead: { agent: 50, team_lead: 35, firm: 15 },
        own: { agent: 80, team_lead: 5, firm: 15 },
        firm: { agent: 50, team_lead: 5, firm: 45 },
      },
      cap: {
        team_lead: { agent: 50, team_lead: 30, firm: 20 },
        own: { agent: 70, team_lead: 10, firm: 20 },
        firm: { agent: 50, team_lead: 5, firm: 45 },
      },
      custom: {
        team_lead: { agent: 0, team_lead: 0, firm: 0 },
        own: { agent: 0, team_lead: 0, firm: 0 },
        firm: { agent: 0, team_lead: 0, firm: 0 },
      },
    },
    lease: {
      standard: {
        team_lead: { agent: 60, team_lead: 25, firm: 15 },
        own: { agent: 80, team_lead: 5, firm: 15 },
        firm: { agent: 70, team_lead: 5, firm: 25 },
      },
      custom: {
        team_lead: { agent: 0, team_lead: 0, firm: 0 },
        own: { agent: 0, team_lead: 0, firm: 0 },
        firm: { agent: 0, team_lead: 0, firm: 0 },
      },
    },
  }

  // Minimum firm percentages for validation (custom plans have no minimums)
  const minFirmPercentages: {
    sales: {
      new_agent: { team_lead: number; own: number; firm: number }
      no_cap: { team_lead: number; own: number; firm: number }
      cap: { team_lead: number; own: number; firm: number }
      custom: { team_lead: number; own: number; firm: number }
    }
    lease: {
      standard: { team_lead: number; own: number; firm: number }
      custom: { team_lead: number; own: number; firm: number }
    }
  } = {
    sales: {
      new_agent: {
        team_lead: 20,
        own: 20,
        firm: 45,
      },
      no_cap: {
        team_lead: 15,
        own: 15,
        firm: 45,
      },
      cap: {
        team_lead: 20,
        own: 20,
        firm: 45,
      },
      custom: {
        team_lead: 0, // No minimum for custom
        own: 0,
        firm: 0,
      },
    },
    lease: {
      standard: {
        team_lead: 15,
        own: 15,
        firm: 25,
      },
      custom: {
        team_lead: 0, // No minimum for custom
        own: 0,
        firm: 0,
      },
    },
  }

  const applySalesTemplate = (index: number, plan: 'new_agent' | 'no_cap' | 'cap') => {
    setTeamMembers(prev => {
      const updated = [...prev]
      const member = { ...updated[index] }
      
      if (!member.splits) {
        member.splits = JSON.parse(JSON.stringify(splitTemplates))
      } else {
        member.splits = {
          ...member.splits,
          sales: {
            ...member.splits.sales,
            [plan]: JSON.parse(JSON.stringify(splitTemplates.sales[plan])),
          },
        }
      }
      
      updated[index] = member
      return updated
    })
  }

  const applyLeaseTemplate = (index: number, plan: 'standard' = 'standard') => {
    setTeamMembers(prev => {
      const updated = [...prev]
      const member = { ...updated[index] }
      
      if (!member.splits) {
        member.splits = JSON.parse(JSON.stringify(splitTemplates))
      } else {
        member.splits = {
          ...member.splits,
          lease: {
            ...member.splits.lease,
            [plan]: JSON.parse(JSON.stringify(splitTemplates.lease[plan])),
          },
        }
      }
      
      updated[index] = member
      return updated
    })
  }

  const initializeSplits = (): SplitsData => {
    return JSON.parse(JSON.stringify(splitTemplates))
  }

  const addTeamMember = () => {
    setTeamMembers(prev => [...prev, {
      agent_id: '',
      is_team_lead: false,
      joined_date: formData.effective_date || new Date().toISOString().split('T')[0],
      left_date: null,
      splits: initializeSplits(),
      expandedSections: {
        sales_new_agent: true, // Default: expanded
        sales_no_cap: false,
        sales_cap: false,
        sales_custom: false,
        lease_standard: true, // Default: expanded
        lease_custom: false,
      },
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

  const toggleSection = (index: number, section: string) => {
    setTeamMembers(prev => {
      const updated = [...prev]
      const member = { ...updated[index] }
      if (!member.expandedSections) {
        member.expandedSections = {
          sales_new_agent: true,
          sales_no_cap: false,
          sales_cap: false,
          sales_custom: false,
          lease_standard: true,
          lease_custom: false,
        }
      }
      member.expandedSections = {
        ...member.expandedSections,
        [section]: !member.expandedSections[section as keyof typeof member.expandedSections],
      }
      updated[index] = member
      return updated
    })
  }

  const updateSplit = (
    index: number,
    transactionType: 'sales' | 'lease',
    plan: 'new_agent' | 'no_cap' | 'cap' | 'custom' | 'standard' | null,
    source: 'team_lead' | 'own' | 'firm',
    field: 'agent' | 'team_lead' | 'firm',
    value: number
  ) => {
    setTeamMembers(prev => {
      const updated = [...prev]
      const member = { ...updated[index] }
      
      if (!member.splits) {
        member.splits = initializeSplits()
      }
      
      if (transactionType === 'sales' && plan && (plan === 'new_agent' || plan === 'no_cap' || plan === 'cap' || plan === 'custom')) {
        member.splits = {
          ...member.splits,
          sales: {
            ...member.splits.sales,
            [plan]: {
              ...member.splits.sales[plan],
              [source]: {
                ...member.splits.sales[plan][source],
                [field]: value,
              },
            },
          },
        }
      } else if (transactionType === 'lease' && plan && (plan === 'standard' || plan === 'custom')) {
        member.splits = {
          ...member.splits,
          lease: {
            ...member.splits.lease,
            [plan]: {
              ...member.splits.lease[plan],
              [source]: {
                ...member.splits.lease[plan][source],
                [field]: value,
              },
            },
          },
        }
      }
      
      updated[index] = member
      return updated
    })
    setError(null)
  }

  // Check if a plan has any non-zero data
  const planHasData = (planSplits: any): boolean => {
    if (!planSplits) return false
    return Object.values(planSplits).some((split: any) => {
      if (!split || typeof split !== 'object') return false
      return (split.agent || 0) + (split.team_lead || 0) + (split.firm || 0) > 0
    })
  }

  // Check if a plan is valid (all splits total 100%)
  const planIsValid = (planSplits: any, plan: string, transactionType: 'sales' | 'lease'): boolean => {
    if (!planSplits) return true // Empty plans are valid
    
    const sources: Array<'team_lead' | 'own' | 'firm'> = ['team_lead', 'own', 'firm']
    
    for (const source of sources) {
      const split = planSplits[source]
      if (!split) continue
      
      const total = getSplitTotal(split)
      if (Math.abs(total - 100) > 0.01) {
        return false
      }
      
      // Check minimum firm percentage (skip for custom plans)
      if (plan !== 'custom') {
        const minFirm = getMinFirmPercent(transactionType, plan as any, source)
        if (minFirm !== undefined && split.firm < minFirm) {
          return false
        }
      }
    }
    
    return true
  }

  const validateSplits = (member: TeamMember): string | null => {
    if (!member.splits) {
      return 'Splits must be initialized for all team members'
    }
    
    // Validate all sales plans (only validate custom if it has data)
    const salesPlans: Array<{ plan: 'new_agent' | 'no_cap' | 'cap' | 'custom', label: string }> = [
      { plan: 'new_agent', label: 'Sales - New Agent (70/30)' },
      { plan: 'no_cap', label: 'Sales - No Cap (85/15)' },
      { plan: 'cap', label: 'Sales - Cap (70/30)' },
      { plan: 'custom', label: 'Sales - Custom Plan' },
    ]
    
    for (const { plan, label } of salesPlans) {
      const planSplits = member.splits.sales?.[plan]
      if (!planSplits) continue
      
      // Skip validation for custom plans if they have no data
      if (plan === 'custom' && !planHasData(planSplits)) {
        continue
      }
      
      const sources: Array<{ source: 'team_lead' | 'own' | 'firm', label: string }> = [
        { source: 'team_lead', label: 'Lead from Team Lead' },
        { source: 'own', label: "Agent's Own Lead" },
        { source: 'firm', label: 'Lead from Firm' },
      ]
      
      for (const { source, label: sourceLabel } of sources) {
        const split = planSplits[source]
        const total = getSplitTotal(split)
        if (Math.abs(total - 100) > 0.01) {
          return `${label} - ${sourceLabel}: splits must total 100% (currently ${total.toFixed(1)}%)`
        }
        
        // Check minimum firm percentage (skip for custom plans)
        if (plan !== 'custom') {
          const minFirm = minFirmPercentages.sales[plan]?.[source]
          if (minFirm !== undefined && split.firm < minFirm) {
            return `${label} - ${sourceLabel}: Firm percentage cannot be less than ${minFirm}%`
          }
        }
      }
    }
    
    // Validate lease splits (only validate custom if it has data)
    const leasePlans: Array<{ plan: 'standard' | 'custom', label: string }> = [
      { plan: 'standard', label: 'Lease - Standard (85/15)' },
      { plan: 'custom', label: 'Lease - Custom Plan' },
    ]
    
    for (const { plan, label } of leasePlans) {
      const planSplits = member.splits.lease?.[plan]
      if (!planSplits) continue
      
      // Skip validation for custom plans if they have no data
      if (plan === 'custom' && !planHasData(planSplits)) {
        continue
      }
      
      const sources: Array<{ source: 'team_lead' | 'own' | 'firm', label: string }> = [
        { source: 'team_lead', label: 'Lead from Team Lead' },
        { source: 'own', label: "Agent's Own Lead" },
        { source: 'firm', label: 'Lead from Firm' },
      ]
      
      for (const { source, label: sourceLabel } of sources) {
        const split = planSplits[source]
        const total = getSplitTotal(split)
        if (Math.abs(total - 100) > 0.01) {
          return `${label} - ${sourceLabel}: splits must total 100% (currently ${total.toFixed(1)}%)`
        }
        
        // Check minimum firm percentage (skip for custom plans)
        if (plan !== 'custom') {
          const minFirm = minFirmPercentages.lease[plan]?.[source]
          if (minFirm !== undefined && split.firm < minFirm) {
            return `${label} - ${sourceLabel}: Firm percentage cannot be less than ${minFirm}%`
          }
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
    
    // Check that team lead is not in members
    const teamLeadInMembers = teamMembers.some(m => m.agent_id === formData.team_lead_id)
    if (teamLeadInMembers) {
      return 'Team lead cannot be added as a team member. The team lead is separate from team members.'
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
          is_team_lead: false, // Team lead is separate, members are never team lead
          joined_date: m.joined_date || formData.effective_date,
          left_date: m.left_date || null,
          splits: m.splits || initializeSplits(),
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

  const getSplitTotal = (split: Split | null): number => {
    if (!split) return 0
    return (split.agent || 0) + (split.team_lead || 0) + (split.firm || 0)
  }

  const getSplitStatus = (total: number) => {
    if (Math.abs(total - 100) < 0.01) {
      return { valid: true, className: 'text-green-600' }
    }
    return { valid: false, className: 'text-red-600' }
  }

  const getMinFirmPercent = (
    transactionType: 'sales' | 'lease',
    plan: 'new_agent' | 'no_cap' | 'cap' | 'custom' | 'standard' | null,
    source: 'team_lead' | 'own' | 'firm'
  ): number | undefined => {
    if (transactionType === 'lease' && plan && (plan === 'standard' || plan === 'custom')) {
      return minFirmPercentages.lease[plan]?.[source]
    }
    if (transactionType === 'sales' && plan && (plan === 'new_agent' || plan === 'no_cap' || plan === 'cap' || plan === 'custom')) {
      return minFirmPercentages.sales[plan]?.[source]
    }
    return undefined
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
                    {member.splits && (
                      <div className="space-y-4 border-t border-luxury-gray-5 pt-4">
                        {/* Sales Splits */}
                        <div>
                          <h4 className="text-sm font-medium text-luxury-black mb-3">Sales Commission Splits</h4>
                          {(['new_agent', 'no_cap', 'cap', 'custom'] as const).map(plan => {
                            const planLabel = plan === 'new_agent' ? 'New Agent (70/30)' : plan === 'no_cap' ? 'No Cap (85/15)' : plan === 'cap' ? 'Cap (70/30)' : 'Custom Plan'
                            const planSplits = member.splits?.sales?.[plan]
                            if (!planSplits) return null
                            // Only show if custom has non-zero values or if it's a standard plan
                            if (plan === 'custom') {
                              const hasValues = Object.values(planSplits).some(split => 
                                (split?.agent || 0) + (split?.team_lead || 0) + (split?.firm || 0) > 0
                              )
                              if (!hasValues) return null
                            }
                            return (
                              <div key={plan} className="mb-4">
                                <div className="text-xs font-semibold text-luxury-gray-2 mb-2">{planLabel}</div>
                                {(['team_lead', 'own', 'firm'] as const).map(source => {
                                  const split = planSplits[source]
                                  const sourceLabel = source === 'team_lead' ? 'Lead from Team Lead' : source === 'own' ? "Agent's Own Lead" : 'Lead from Firm'
                                  return (
                                    <div key={source} className="mb-2 ml-4 p-2 bg-luxury-light rounded text-xs">
                                      <div className="font-medium text-luxury-gray-2 mb-1">{sourceLabel}</div>
                                      <div className="space-y-1">
                                        <div><span className="text-luxury-gray-2">Agent:</span> {split?.agent || 0}%</div>
                                        <div><span className="text-luxury-gray-2">Team Lead:</span> {split?.team_lead || 0}%</div>
                                        <div><span className="text-luxury-gray-2">Firm:</span> {split?.firm || 0}%</div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>

                        {/* Lease Splits */}
                        {member.splits.lease && (
                          <div>
                            <h4 className="text-sm font-medium text-luxury-black mb-3">Lease Commission Splits</h4>
                            {(['standard', 'custom'] as const).map(plan => {
                              const planLabel = plan === 'standard' ? 'Standard (85/15)' : 'Custom Plan'
                              const planSplits = member.splits?.lease?.[plan]
                              if (!planSplits) return null
                              // Only show custom if it has non-zero values
                              if (plan === 'custom') {
                                const hasValues = Object.values(planSplits).some(split => 
                                  (split?.agent || 0) + (split?.team_lead || 0) + (split?.firm || 0) > 0
                                )
                                if (!hasValues) return null
                              }
                              return (
                                <div key={plan} className="mb-4">
                                  <div className="text-xs font-semibold text-luxury-gray-2 mb-2">{planLabel}</div>
                                  {(['team_lead', 'own', 'firm'] as const).map(source => {
                                    const split = planSplits[source]
                                    const sourceLabel = source === 'team_lead' ? 'Lead from Team Lead' : source === 'own' ? "Agent's Own Lead" : 'Lead from Firm'
                                    return (
                                      <div key={source} className="mb-2 ml-4 p-2 bg-luxury-light rounded text-xs">
                                        <div className="font-medium text-luxury-gray-2 mb-1">{sourceLabel}</div>
                                        <div className="space-y-1">
                                          <div><span className="text-luxury-gray-2">Agent:</span> {split?.agent || 0}%</div>
                                          <div><span className="text-luxury-gray-2">Team Lead:</span> {split?.team_lead || 0}%</div>
                                          <div><span className="text-luxury-gray-2">Firm:</span> {split?.firm || 0}%</div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
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
                          onChange={(e) => {
                            const selectedAgentId = e.target.value
                            // Check if selected agent is the team lead
                            if (selectedAgentId === formData.team_lead_id) {
                              setError('Team lead cannot be added as a team member. The team lead is separate from team members.')
                              return
                            }
                            updateTeamMember(index, 'agent_id', selectedAgentId)
                            setError(null)
                          }}
                          className="select-luxury"
                          required
                        >
                          <option value="">Select agent...</option>
                          {agents
                            .filter(agent => agent.id !== formData.team_lead_id) // Exclude team lead from dropdown
                            .map(agent => (
                              <option key={agent.id} value={agent.id}>
                                {agent.displayName}
                              </option>
                            ))}
                        </select>
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

                    {/* Commission Splits with Accordion */}
                    <div className="border-t border-luxury-gray-5 pt-6">
                      <div className="space-y-2">
                        {/* Sales Plans Accordion */}
                        {[
                          { id: 'sales_new_agent', label: 'Sales - New Agent (70/30)', plan: 'new_agent' as const, type: 'sales' as const },
                          { id: 'sales_no_cap', label: 'Sales - No Cap (85/15)', plan: 'no_cap' as const, type: 'sales' as const },
                          { id: 'sales_cap', label: 'Sales - Cap (70/30)', plan: 'cap' as const, type: 'sales' as const },
                          { id: 'sales_custom', label: 'Sales - Custom Plan', plan: 'custom' as const, type: 'sales' as const },
                        ].map(({ id, label, plan, type }) => {
                          const isExpanded = member.expandedSections?.[id as keyof typeof member.expandedSections] ?? (id === 'sales_new_agent')
                          const planSplits = member.splits?.sales?.[plan] || splitTemplates.sales[plan]
                          const isValid = planIsValid(planSplits, plan, type)
                          const hasData = planHasData(planSplits)
                          const isCustom = plan === 'custom'
                          
                          return (
                            <div key={id} className="border border-luxury-gray-5 rounded-lg overflow-hidden">
                              {/* Accordion Header */}
                              <button
                                type="button"
                                onClick={() => toggleSection(index, id)}
                                className="w-full flex items-center justify-between p-4 bg-white hover:bg-luxury-light transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown size={18} className="text-luxury-gray-2" />
                                  ) : (
                                    <ChevronRight size={18} className="text-luxury-gray-2" />
                                  )}
                                  <span className="text-sm font-medium text-luxury-black">{label}</span>
                                  {hasData && (
                                    isValid ? (
                                      <CheckCircle size={16} className="text-green-600" />
                                    ) : (
                                      <X size={16} className="text-red-600" />
                                    )
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!isCustom) {
                                      applySalesTemplate(index, plan)
                                    }
                                  }}
                                  disabled={isCustom}
                                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                                    isCustom
                                      ? 'bg-luxury-gray-5 text-luxury-gray-3 cursor-not-allowed'
                                      : 'bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black'
                                  }`}
                                >
                                  Auto-fill
                                </button>
                              </button>
                              
                              {/* Accordion Content */}
                              {isExpanded && (
                                <div className="p-4 bg-luxury-light border-t border-luxury-gray-5 space-y-4">
                                  {(['team_lead', 'own', 'firm'] as const).map(source => {
                                    const split = planSplits[source]
                                    const sourceLabel = source === 'team_lead' ? 'Lead from Team Lead' : source === 'own' ? "Agent's Own Lead" : 'Lead from Firm'
                                    const minFirm = getMinFirmPercent(type, plan, source)
                                    const splitTotal = getSplitTotal(split)
                                    const splitStatus = getSplitStatus(splitTotal)
                                    
                                    return (
                                      <div key={source} className="bg-white p-4 rounded border border-luxury-gray-5">
                                        <h4 className="text-sm font-semibold text-luxury-black mb-3">{sourceLabel}</h4>
                                        <div className="grid grid-cols-3 gap-3">
                                          <div>
                                            <label className="block text-xs text-luxury-gray-2 mb-1">Agent %</label>
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="0.1"
                                              value={split?.agent || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'agent', parseFloat(e.target.value) || 0)}
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
                                              value={split?.team_lead || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'team_lead', parseFloat(e.target.value) || 0)}
                                              className="input-luxury text-sm"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-luxury-gray-2 mb-1">
                                              Firm % {minFirm && !isCustom && <span className="text-luxury-gray-3">(min: {minFirm}%)</span>}
                                            </label>
                                            <input
                                              type="number"
                                              min={minFirm || 0}
                                              max="100"
                                              step="0.1"
                                              value={split?.firm || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'firm', parseFloat(e.target.value) || 0)}
                                              className="input-luxury text-sm"
                                            />
                                          </div>
                                        </div>
                                        <div className={`text-xs mt-2 flex items-center gap-2 ${splitStatus.className}`}>
                                          <span>Total: {splitTotal.toFixed(1)}%</span>
                                          {splitStatus.valid ? (
                                            <CheckCircle size={14} className="text-green-600" />
                                          ) : (
                                            <X size={14} className="text-red-600" />
                                          )}
                                          {!splitStatus.valid && <span>(Must equal 100%)</span>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        {/* Lease Plans Accordion */}
                        {[
                          { id: 'lease_standard', label: 'Leases - Standard (85/15)', plan: 'standard' as const, type: 'lease' as const },
                          { id: 'lease_custom', label: 'Leases - Custom Plan', plan: 'custom' as const, type: 'lease' as const },
                        ].map(({ id, label, plan, type }) => {
                          const isExpanded = member.expandedSections?.[id as keyof typeof member.expandedSections] ?? (id === 'lease_standard')
                          const planSplits = member.splits?.lease?.[plan] || splitTemplates.lease[plan]
                          const isValid = planIsValid(planSplits, plan, type)
                          const hasData = planHasData(planSplits)
                          const isCustom = plan === 'custom'
                          
                          return (
                            <div key={id} className="border border-luxury-gray-5 rounded-lg overflow-hidden">
                              {/* Accordion Header */}
                              <button
                                type="button"
                                onClick={() => toggleSection(index, id)}
                                className="w-full flex items-center justify-between p-4 bg-white hover:bg-luxury-light transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown size={18} className="text-luxury-gray-2" />
                                  ) : (
                                    <ChevronRight size={18} className="text-luxury-gray-2" />
                                  )}
                                  <span className="text-sm font-medium text-luxury-black">{label}</span>
                                  {hasData && (
                                    isValid ? (
                                      <CheckCircle size={16} className="text-green-600" />
                                    ) : (
                                      <X size={16} className="text-red-600" />
                                    )
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (!isCustom) {
                                      applyLeaseTemplate(index, plan)
                                    }
                                  }}
                                  disabled={isCustom}
                                  className={`px-3 py-1.5 text-xs rounded transition-colors ${
                                    isCustom
                                      ? 'bg-luxury-gray-5 text-luxury-gray-3 cursor-not-allowed'
                                      : 'bg-white border border-luxury-gray-5 text-luxury-gray-1 hover:border-luxury-black'
                                  }`}
                                >
                                  Auto-fill
                                </button>
                              </button>
                              
                              {/* Accordion Content */}
                              {isExpanded && (
                                <div className="p-4 bg-luxury-light border-t border-luxury-gray-5 space-y-4">
                                  {(['team_lead', 'own', 'firm'] as const).map(source => {
                                    const split = planSplits[source]
                                    const sourceLabel = source === 'team_lead' ? 'Lead from Team Lead' : source === 'own' ? "Agent's Own Lead" : 'Lead from Firm'
                                    const minFirm = getMinFirmPercent(type, plan, source)
                                    const splitTotal = getSplitTotal(split)
                                    const splitStatus = getSplitStatus(splitTotal)
                                    
                                    return (
                                      <div key={source} className="bg-white p-4 rounded border border-luxury-gray-5">
                                        <h4 className="text-sm font-semibold text-luxury-black mb-3">{sourceLabel}</h4>
                                        <div className="grid grid-cols-3 gap-3">
                                          <div>
                                            <label className="block text-xs text-luxury-gray-2 mb-1">Agent %</label>
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="0.1"
                                              value={split?.agent || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'agent', parseFloat(e.target.value) || 0)}
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
                                              value={split?.team_lead || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'team_lead', parseFloat(e.target.value) || 0)}
                                              className="input-luxury text-sm"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs text-luxury-gray-2 mb-1">
                                              Firm % {minFirm && !isCustom && <span className="text-luxury-gray-3">(min: {minFirm}%)</span>}
                                            </label>
                                            <input
                                              type="number"
                                              min={minFirm || 0}
                                              max="100"
                                              step="0.1"
                                              value={split?.firm || 0}
                                              onChange={(e) => updateSplit(index, type, plan, source, 'firm', parseFloat(e.target.value) || 0)}
                                              className="input-luxury text-sm"
                                            />
                                          </div>
                                        </div>
                                        <div className={`text-xs mt-2 flex items-center gap-2 ${splitStatus.className}`}>
                                          <span>Total: {splitTotal.toFixed(1)}%</span>
                                          {splitStatus.valid ? (
                                            <CheckCircle size={14} className="text-green-600" />
                                          ) : (
                                            <X size={14} className="text-red-600" />
                                          )}
                                          {!splitStatus.valid && <span>(Must equal 100%)</span>}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
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

