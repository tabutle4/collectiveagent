'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Users, Crown, ChevronRight, X, UserPlus } from 'lucide-react'
import Link from 'next/link'

interface TeamLead {
  id: string
  agent_id: string
  agent: {
    id: string
    preferred_first_name: string | null
    preferred_last_name: string | null
    first_name: string
    last_name: string
  }
}

interface Team {
  id: string
  team_name: string
  status: 'active' | 'inactive'
  created_at: string
  leads: TeamLead[]
  active_member_count: number
  total_member_count: number
}

interface Agent {
  id: string
  name: string
  displayName: string
}

interface Split {
  plan_type: string
  lead_source: string
  agent_pct: number
  team_lead_pct: number
  firm_pct: number
}

const PLAN_TYPES = [
  { value: 'sales_70_30', label: 'Sales (70/30 New Agent or Cap Plan)' },
  { value: 'sales_85_15', label: 'Sales (85/15 No Cap Plan)' },
  { value: 'leases', label: 'Leases' },
]

const LEAD_SOURCES = [
  { value: 'team_lead', label: 'Lead from Team Lead' },
  { value: 'own', label: "Agent's Own Lead" },
  { value: 'firm', label: 'Lead from Firm' },
]

// Default splits matching template
const DEFAULT_SPLITS: Split[] = [
  // Sales 70/30
  { plan_type: 'sales_70_30', lead_source: 'team_lead', agent_pct: 50, team_lead_pct: 30, firm_pct: 20 },
  { plan_type: 'sales_70_30', lead_source: 'own', agent_pct: 70, team_lead_pct: 10, firm_pct: 20 },
  { plan_type: 'sales_70_30', lead_source: 'firm', agent_pct: 50, team_lead_pct: 5, firm_pct: 45 },
  // Sales 85/15
  { plan_type: 'sales_85_15', lead_source: 'team_lead', agent_pct: 50, team_lead_pct: 35, firm_pct: 15 },
  { plan_type: 'sales_85_15', lead_source: 'own', agent_pct: 80, team_lead_pct: 5, firm_pct: 15 },
  { plan_type: 'sales_85_15', lead_source: 'firm', agent_pct: 50, team_lead_pct: 5, firm_pct: 45 },
  // Leases
  { plan_type: 'leases', lead_source: 'team_lead', agent_pct: 50, team_lead_pct: 35, firm_pct: 15 },
  { plan_type: 'leases', lead_source: 'own', agent_pct: 80, team_lead_pct: 5, firm_pct: 15 },
  { plan_type: 'leases', lead_source: 'firm', agent_pct: 70, team_lead_pct: 5, firm_pct: 25 },
]

export default function TeamsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [searchQuery, setSearchQuery] = useState('')

  // Add Member Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [saving, setSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    agent_id: '',
    team_id: '',
    effective_date: new Date().toISOString().split('T')[0],
    agreement_document_url: '',
    notes: '',
    firm_min_override: false,
  })
  const [splits, setSplits] = useState<Split[]>(JSON.parse(JSON.stringify(DEFAULT_SPLITS)))

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

  useEffect(() => {
    if (!user) return
    loadTeams()
  }, [user, statusFilter])

  const loadTeams = async () => {
    setLoading(true)
    try {
      const url = statusFilter === 'all' ? '/api/teams' : `/api/teams?status=${statusFilter}`
      const response = await fetch(url)
      const data = await response.json()
      if (response.ok) {
        setTeams(data.teams || [])
      } else {
        console.error('Error loading teams:', data.error)
      }
    } catch (error) {
      console.error('Error loading teams:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAgents = async () => {
    setLoadingAgents(true)
    try {
      const response = await fetch('/api/agents/list')
      const data = await response.json()
      if (response.ok) {
        setAgents(data.agents || [])
      }
    } catch (error) {
      console.error('Error loading agents:', error)
    } finally {
      setLoadingAgents(false)
    }
  }

  const openAddModal = () => {
    setAddForm({
      agent_id: '',
      team_id: '',
      effective_date: new Date().toISOString().split('T')[0],
      agreement_document_url: '',
      notes: '',
      firm_min_override: false,
    })
    setSplits(JSON.parse(JSON.stringify(DEFAULT_SPLITS)))
    loadAgents()
    setShowAddModal(true)
  }

  const updateSplit = (planType: string, leadSource: string, field: 'agent_pct' | 'team_lead_pct' | 'firm_pct', value: number) => {
    setSplits(prev => prev.map(s => 
      s.plan_type === planType && s.lead_source === leadSource
        ? { ...s, [field]: value }
        : s
    ))
  }

  const getSplit = (planType: string, leadSource: string) => {
    return splits.find(s => s.plan_type === planType && s.lead_source === leadSource) || {
      plan_type: planType,
      lead_source: leadSource,
      agent_pct: 0,
      team_lead_pct: 0,
      firm_pct: 0,
    }
  }

  const validateSplits = () => {
    for (const split of splits) {
      const total = split.agent_pct + split.team_lead_pct + split.firm_pct
      if (total !== 100) {
        const planLabel = PLAN_TYPES.find(p => p.value === split.plan_type)?.label || split.plan_type
        const sourceLabel = LEAD_SOURCES.find(s => s.value === split.lead_source)?.label || split.lead_source
        alert(`${planLabel} - ${sourceLabel}: Splits must total 100% (currently ${total}%)`)
        return false
      }
    }
    return true
  }

  const handleAddMember = async () => {
    if (!addForm.agent_id) {
      alert('Please select an agent')
      return
    }
    if (!addForm.team_id) {
      alert('Please select a team')
      return
    }
    if (!addForm.effective_date) {
      alert('Please enter an effective date')
      return
    }
    if (!validateSplits()) return

    setSaving(true)
    try {
      const response = await fetch(`/api/teams/${addForm.team_id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: addForm.agent_id,
          effective_date: addForm.effective_date,
          agreement_document_url: addForm.agreement_document_url || null,
          notes: addForm.notes || null,
          firm_min_override: addForm.firm_min_override,
          splits,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to add member')
      }

      setShowAddModal(false)
      loadTeams()
      
      // Navigate to the team detail page with the new member highlighted
      router.push(`/admin/teams/${addForm.team_id}?member=${data.agreement?.id}`)
    } catch (error: any) {
      alert(error.message || 'Failed to add member')
    } finally {
      setSaving(false)
    }
  }

  const getLeadName = (lead: TeamLead) => {
    const agent = lead.agent
    return agent.preferred_first_name && agent.preferred_last_name
      ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
      : `${agent.first_name} ${agent.last_name}`
  }

  const getLeadsDisplay = (team: Team) => {
    if (!team.leads || team.leads.length === 0) return 'No leads assigned'
    return team.leads.map(l => getLeadName(l)).join(', ')
  }

  const filteredTeams = teams.filter(team => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      team.team_name.toLowerCase().includes(query) ||
      team.leads.some(l => getLeadName(l).toLowerCase().includes(query))
    )
  })

  // Get only active teams for the modal dropdown
  const activeTeams = teams.filter(t => t.status === 'active')

  if (!user) return null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">TEAMS</h1>
          <p className="text-xs text-luxury-gray-3 mt-1">
            Manage teams, team leads, and member agreements
          </p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary flex items-center gap-2">
          <UserPlus size={16} />
          Add Member
        </button>
      </div>

      <div className="container-card">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-5">
          <div className="flex gap-2">
            {(['active', 'all', 'inactive'] as const).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`btn text-sm capitalize ${statusFilter === status ? 'btn-primary' : 'btn-secondary'}`}
              >
                {status}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3"
              size={18}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by team name or lead..."
              className="input-luxury pl-10"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading...</p>
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">
              {searchQuery ? 'No teams match your search' : 'No teams found'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTeams.map(team => (
              <Link
                key={team.id}
                href={`/admin/teams/${team.id}`}
                className="inner-card block hover:bg-luxury-gray-6/50 transition-colors cursor-pointer"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-sm font-semibold text-luxury-gray-1">{team.team_name}</h3>
                      <span
                        className={`text-xs capitalize font-medium ${
                          team.status === 'active' ? 'text-green-600' : 'text-luxury-gray-3'
                        }`}
                      >
                        {team.status}
                      </span>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs text-luxury-gray-3">
                      <div className="flex items-center gap-2">
                        <Crown size={13} className="text-luxury-accent" />
                        <span>{getLeadsDisplay(team)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users size={13} />
                        <span>
                          {team.active_member_count} active member{team.active_member_count !== 1 ? 's' : ''}
                          {team.total_member_count > team.active_member_count && (
                            <span className="text-luxury-gray-3/60"> ({team.total_member_count} total)</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-luxury-gray-4 hidden md:block" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Add Team Member</h2>
              <button onClick={() => setShowAddModal(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 max-h-[70vh] overflow-y-auto">
              {/* Agent & Team Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="field-label">Agent *</label>
                  <select
                    value={addForm.agent_id}
                    onChange={e => setAddForm(f => ({ ...f, agent_id: e.target.value }))}
                    className="select-luxury w-full"
                    disabled={loadingAgents}
                  >
                    <option value="">Select agent...</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.displayName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Team *</label>
                  <select
                    value={addForm.team_id}
                    onChange={e => setAddForm(f => ({ ...f, team_id: e.target.value }))}
                    className="select-luxury w-full"
                  >
                    <option value="">Select team...</option>
                    {activeTeams.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.team_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date & URL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="field-label">Effective Date *</label>
                  <input
                    type="date"
                    value={addForm.effective_date}
                    onChange={e => setAddForm(f => ({ ...f, effective_date: e.target.value }))}
                    className="input-luxury w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Agreement Document URL</label>
                  <input
                    type="url"
                    value={addForm.agreement_document_url}
                    onChange={e => setAddForm(f => ({ ...f, agreement_document_url: e.target.value }))}
                    placeholder="https://..."
                    className="input-luxury w-full"
                  />
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="field-label">Notes</label>
                <textarea
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="input-luxury w-full"
                  placeholder="Optional notes about this agreement..."
                />
              </div>

              {/* Firm Min Override */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.firm_min_override}
                    onChange={e => setAddForm(f => ({ ...f, firm_min_override: e.target.checked }))}
                    className="w-4 h-4 rounded border-luxury-gray-4"
                  />
                  <span className="text-sm text-luxury-gray-2">Firm minimum override (bypass minimum firm split check)</span>
                </label>
              </div>

              {/* Commission Splits */}
              <div className="border-t border-luxury-gray-5 pt-4">
                <h3 className="text-sm font-semibold text-luxury-gray-1 mb-4">Commission Splits</h3>
                
                {PLAN_TYPES.map(planType => (
                  <div key={planType.value} className="mb-6">
                    <h4 className="text-xs font-semibold text-luxury-gray-2 uppercase tracking-wide mb-3">
                      {planType.label}
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-luxury-gray-5">
                            <th className="text-left py-2 px-2 text-xs text-luxury-gray-3 font-medium">Lead Source</th>
                            <th className="text-center py-2 px-2 text-xs text-luxury-gray-3 font-medium w-20">Agent %</th>
                            <th className="text-center py-2 px-2 text-xs text-luxury-gray-3 font-medium w-20">Team Lead %</th>
                            <th className="text-center py-2 px-2 text-xs text-luxury-gray-3 font-medium w-20">Firm %</th>
                            <th className="text-center py-2 px-2 text-xs text-luxury-gray-3 font-medium w-16">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {LEAD_SOURCES.map(leadSource => {
                            const split = getSplit(planType.value, leadSource.value)
                            const total = split.agent_pct + split.team_lead_pct + split.firm_pct
                            const isValid = total === 100
                            return (
                              <tr key={leadSource.value} className="border-b border-luxury-gray-6">
                                <td className="py-2 px-2 text-luxury-gray-2">{leadSource.label}</td>
                                <td className="py-2 px-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={split.agent_pct}
                                    onChange={e => updateSplit(planType.value, leadSource.value, 'agent_pct', Number(e.target.value))}
                                    className="input-luxury w-full text-center text-sm py-1"
                                  />
                                </td>
                                <td className="py-2 px-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={split.team_lead_pct}
                                    onChange={e => updateSplit(planType.value, leadSource.value, 'team_lead_pct', Number(e.target.value))}
                                    className="input-luxury w-full text-center text-sm py-1"
                                  />
                                </td>
                                <td className="py-2 px-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={split.firm_pct}
                                    onChange={e => updateSplit(planType.value, leadSource.value, 'firm_pct', Number(e.target.value))}
                                    className="input-luxury w-full text-center text-sm py-1"
                                  />
                                </td>
                                <td className={`py-2 px-2 text-center font-medium ${isValid ? 'text-green-600' : 'text-red-500'}`}>
                                  {total}%
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t border-luxury-gray-5">
              <button
                onClick={() => setShowAddModal(false)}
                className="btn btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}