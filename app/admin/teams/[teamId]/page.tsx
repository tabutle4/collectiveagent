'use client'

import { useState, useEffect, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Crown,
  Users,
  FileText,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'

interface Agent {
  id: string
  preferred_first_name: string | null
  preferred_last_name: string | null
  first_name: string
  last_name: string
  email: string
  headshot_url: string | null
  commission_plan?: string
}

interface TeamLead {
  id: string
  agent_id: string
  start_date: string
  end_date: string | null
  agent: Agent
}

interface Split {
  id: string
  plan_type: string
  lead_source: string
  agent_pct: number
  team_lead_pct: number
  firm_pct: number
}

interface MemberAgreement {
  id: string
  agent_id: string
  effective_date: string
  end_date: string | null
  agreement_document_url: string | null
  firm_min_override: boolean
  notes: string | null
  agent: Agent
  splits: Split[]
}

interface Team {
  id: string
  team_name: string
  status: 'active' | 'inactive'
  created_at: string
}

// Plan type display names
const PLAN_TYPE_LABELS: Record<string, string> = {
  sales_70_30: 'Sales (70/30 New Agent or Cap Plan)',
  sales_85_15: 'Sales (85/15 No Cap Plan)',
  lease: 'Leases',
}

// Lead source display names
const LEAD_SOURCE_LABELS: Record<string, string> = {
  team_lead: 'Lead from Team Lead',
  own: "Agent's Own Lead",
  firm: 'Lead from Firm',
}

export default function TeamDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }> | { teamId: string }
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resolvedParams = typeof params === 'object' && 'then' in params ? use(params) : params
  const teamId = resolvedParams.teamId

  // Check if we should highlight a specific member
  const highlightMemberId = searchParams.get('member')

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<Team | null>(null)
  const [leads, setLeads] = useState<TeamLead[]>([])
  const [activeMembers, setActiveMembers] = useState<MemberAgreement[]>([])
  const [inactiveMembers, setInactiveMembers] = useState<MemberAgreement[]>([])
  const [expandedMembers, setExpandedMembers] = useState<Record<string, boolean>>({})
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!user || !teamId) return
    loadTeam()
  }, [user, teamId])

  // Auto-expand highlighted member
  useEffect(() => {
    if (highlightMemberId) {
      setExpandedMembers(prev => ({ ...prev, [highlightMemberId]: true }))
      // Scroll to the member after a short delay
      setTimeout(() => {
        const element = document.getElementById(`member-${highlightMemberId}`)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 300)
    }
  }, [highlightMemberId, activeMembers])

  const loadTeam = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/teams/${teamId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load team')
      }

      setTeam(data.team)
      setLeads(data.activeLeads || [])
      setActiveMembers(data.activeMembers || [])
      setInactiveMembers(data.inactiveMembers || [])
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading team:', err)
    } finally {
      setLoading(false)
    }
  }

  const getAgentName = (agent: Agent) => {
    return agent.preferred_first_name && agent.preferred_last_name
      ? `${agent.preferred_first_name} ${agent.preferred_last_name}`
      : `${agent.first_name} ${agent.last_name}`
  }

  const getAgentInitials = (agent: Agent) => {
    const first = (agent.preferred_first_name || agent.first_name || '?')[0]
    const last = (agent.preferred_last_name || agent.last_name || '')[0]
    return `${first}${last}`
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const toggleMember = (memberId: string) => {
    setExpandedMembers(prev => ({
      ...prev,
      [memberId]: !prev[memberId],
    }))
  }

  const groupSplitsByPlanType = (splits: Split[]) => {
    const grouped: Record<string, Split[]> = {}
    for (const split of splits) {
      if (!grouped[split.plan_type]) {
        grouped[split.plan_type] = []
      }
      grouped[split.plan_type].push(split)
    }
    return grouped
  }

  if (!user) return null

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-luxury-gray-3">Loading team...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container-card">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
        <Link href="/admin/teams" className="btn btn-secondary mt-4">
          Back to Teams
        </Link>
      </div>
    )
  }

  if (!team) {
    return (
      <div className="container-card">
        <p className="text-sm text-luxury-gray-3">Team not found</p>
        <Link href="/admin/teams" className="btn btn-secondary mt-4">
          Back to Teams
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/teams" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-title">{team.team_name}</h1>
            <span
              className={`text-xs capitalize font-medium ${
                team.status === 'active'
                  ? 'text-green-600'
                  : 'text-luxury-gray-3'
              }`}
            >
              {team.status}
            </span>
          </div>
        </div>
      </div>

      {/* Team Leads */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Crown size={14} className="text-luxury-accent" />
          Team Leads
        </h2>
        {leads.length === 0 ? (
          <p className="text-sm text-luxury-gray-3">No active team leads</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leads.map(lead => (
              <div key={lead.id} className="inner-card flex items-center gap-3">
                {lead.agent.headshot_url ? (
                  <img
                    src={lead.agent.headshot_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-luxury-accent flex items-center justify-center text-white text-sm font-semibold">
                    {getAgentInitials(lead.agent)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {getAgentName(lead.agent)}
                  </p>
                  <p className="text-xs text-luxury-gray-3 truncate">{lead.agent.email}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Members */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Users size={14} />
          Active Team Members ({activeMembers.length})
        </h2>

        {activeMembers.length === 0 ? (
          <p className="text-sm text-luxury-gray-3">No active team members</p>
        ) : (
          <div className="space-y-3">
            {activeMembers.map(member => {
              const isExpanded = expandedMembers[member.id]
              const isHighlighted = member.id === highlightMemberId
              const groupedSplits = groupSplitsByPlanType(member.splits)

              return (
                <div
                  key={member.id}
                  id={`member-${member.id}`}
                  className={`inner-card ${isHighlighted ? 'ring-2 ring-luxury-accent' : ''}`}
                >
                  {/* Member Header - Clickable */}
                  <div
                    className="flex items-center gap-3 cursor-pointer"
                    onClick={() => toggleMember(member.id)}
                  >
                    {member.agent.headshot_url ? (
                      <img
                        src={member.agent.headshot_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white border border-luxury-gray-5 flex items-center justify-center text-black text-sm font-semibold">
                        {getAgentInitials(member.agent)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-luxury-gray-1">
                        {getAgentName(member.agent)}
                        {member.firm_min_override && (
                          <span className="ml-2 text-xs text-luxury-accent">(Firm Min Override)</span>
                        )}
                      </p>
                      <p className="text-xs text-luxury-gray-3">
                        Since {formatDate(member.effective_date)}
                        {member.agent.commission_plan && (
                          <span className="ml-2">• {member.agent.commission_plan}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.agreement_document_url && (
                        <a
                          href={member.agreement_document_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-luxury-gray-3 hover:text-luxury-accent"
                          title="View Agreement"
                        >
                          <FileText size={16} />
                        </a>
                      )}
                      {isExpanded ? (
                        <ChevronDown size={18} className="text-luxury-gray-3" />
                      ) : (
                        <ChevronRight size={18} className="text-luxury-gray-3" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content - Splits */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-luxury-gray-5/30">
                      {member.notes && (
                        <p className="text-xs text-luxury-gray-3 mb-4 italic">{member.notes}</p>
                      )}

                      {Object.keys(groupedSplits).length === 0 ? (
                        <p className="text-xs text-luxury-gray-3">No splits configured</p>
                      ) : (
                        <div className="space-y-4">
                          {Object.entries(groupedSplits).map(([planType, splits]) => (
                            <div key={planType}>
                              <h4 className="text-xs font-semibold text-luxury-gray-2 mb-2">
                                {PLAN_TYPE_LABELS[planType] || planType}
                              </h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-left text-luxury-gray-3">
                                      <th className="pb-2 font-medium">Lead Source</th>
                                      <th className="pb-2 font-medium text-center">Agent</th>
                                      <th className="pb-2 font-medium text-center">Team Lead</th>
                                      <th className="pb-2 font-medium text-center">Firm</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {splits.map(split => (
                                      <tr key={split.id} className="border-t border-luxury-gray-5/20">
                                        <td className="py-2 text-luxury-gray-2">
                                          {LEAD_SOURCE_LABELS[split.lead_source] || split.lead_source}
                                        </td>
                                        <td className="py-2 text-center text-luxury-gray-1 font-medium">
                                          {split.agent_pct}%
                                        </td>
                                        <td className="py-2 text-center text-luxury-gray-1 font-medium">
                                          {split.team_lead_pct}%
                                        </td>
                                        <td className="py-2 text-center text-luxury-gray-1 font-medium">
                                          {split.firm_pct}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* View Full Agreement Link */}
                      <div className="mt-4 pt-4 border-t border-luxury-gray-5/30">
                        <Link
                          href={`/admin/teams/${teamId}/agreements/${member.id}`}
                          className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                          onClick={e => e.stopPropagation()}
                        >
                          View Full Agreement Details
                          <ExternalLink size={12} />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Inactive Members (Collapsible) */}
      {inactiveMembers.length > 0 && (
        <div className="container-card">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest flex items-center gap-2">
              <Users size={14} className="text-luxury-gray-4" />
              Former Members ({inactiveMembers.length})
            </h2>
            {showInactive ? (
              <ChevronDown size={18} className="text-luxury-gray-3" />
            ) : (
              <ChevronRight size={18} className="text-luxury-gray-3" />
            )}
          </button>

          {showInactive && (
            <div className="mt-4 space-y-3">
              {inactiveMembers.map(member => (
                <div key={member.id} className="inner-card opacity-60">
                  <div className="flex items-center gap-3">
                    {member.agent.headshot_url ? (
                      <img
                        src={member.agent.headshot_url}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover grayscale"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-luxury-gray-5 flex items-center justify-center text-luxury-gray-3 text-sm font-semibold">
                        {getAgentInitials(member.agent)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-luxury-gray-2">
                        {getAgentName(member.agent)}
                      </p>
                      <p className="text-xs text-luxury-gray-3">
                        {formatDate(member.effective_date)} - {formatDate(member.end_date)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
