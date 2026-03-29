'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  FileText,
  Calendar,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  User,
  History,
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

interface Split {
  id: string
  plan_type: string
  lead_source: string
  agent_pct: number
  team_lead_pct: number
  firm_pct: number
}

interface Agreement {
  id: string
  team_id: string
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

export default function AgreementDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; agreementId: string }> | { teamId: string; agreementId: string }
}) {
  const router = useRouter()
  const resolvedParams =
    typeof params === 'object' && 'then' in params ? use(params) : params
  const { teamId, agreementId } = resolvedParams

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [team, setTeam] = useState<Team | null>(null)
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [agentHistory, setAgentHistory] = useState<Agreement[]>([])
  const [crossTeamAgreements, setCrossTeamAgreements] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showCrossTeam, setShowCrossTeam] = useState(false)
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
    if (!user || !teamId || !agreementId) return
    loadAgreement()
  }, [user, teamId, agreementId])

  const loadAgreement = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch agreement details
      const response = await fetch(`/api/teams/${teamId}/members/${agreementId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load agreement')
      }

      setAgreement(data.agreement)
      setTeam(data.team)
      setAgentHistory(data.agentHistory || [])
      setCrossTeamAgreements(data.crossTeamAgreements || [])
      setIsAdmin(data.isAdmin || false)
    } catch (err: any) {
      setError(err.message)
      console.error('Error loading agreement:', err)
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
    if (!dateString) return 'Present'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
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
        <p className="text-sm text-luxury-gray-3">Loading agreement...</p>
      </div>
    )
  }

  if (error || !agreement) {
    return (
      <div className="container-card">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle size={20} />
          <span>{error || 'Agreement not found'}</span>
        </div>
        <Link href={`/admin/teams/${teamId}`} className="btn btn-secondary mt-4">
          Back to Team
        </Link>
      </div>
    )
  }

  const groupedSplits = groupSplitsByPlanType(agreement.splits)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="mb-5">
        <Link
          href={`/admin/teams/${teamId}`}
          className="inline-flex items-center gap-2 text-sm text-luxury-gray-3 hover:text-luxury-accent transition-colors"
        >
          <ArrowLeft size={16} />
          Back to {team?.team_name || 'Team'}
        </Link>
      </div>

      {/* Agreement Header */}
      <div className="container-card mb-5">
        <div className="flex items-start gap-4">
          {agreement.agent.headshot_url ? (
            <img
              src={agreement.agent.headshot_url}
              alt=""
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-white border border-luxury-gray-5 flex items-center justify-center text-black text-lg font-semibold">
              {getAgentInitials(agreement.agent)}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-luxury-gray-1">
              {getAgentName(agreement.agent)}
            </h1>
            <p className="text-sm text-luxury-gray-3 mt-1">{agreement.agent.email}</p>
            <div className="flex items-center gap-4 mt-2 text-sm">
              <span className="flex items-center gap-1 text-luxury-gray-2">
                <Calendar size={14} />
                {formatDate(agreement.effective_date)} - {formatDate(agreement.end_date)}
              </span>
              {agreement.end_date && (
                <span className="text-xs font-medium text-luxury-gray-3">
                  Ended
                </span>
              )}
              {!agreement.end_date && (
                <span className="text-xs font-medium text-green-600">
                  Active
                </span>
              )}
              {agreement.firm_min_override && (
                <span className="text-xs font-medium text-luxury-accent">
                  Firm Min Override
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/users?search=${encodeURIComponent(agreement.agent.email)}`}
              className="btn btn-secondary text-xs"
            >
              <User size={14} />
              View Profile
            </Link>
            {agreement.agreement_document_url && (
              <a
                href={agreement.agreement_document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary text-xs"
              >
                <FileText size={14} />
                View Document
              </a>
            )}
          </div>
        </div>

        {agreement.notes && (
          <div className="mt-4 pt-4 border-t border-luxury-gray-5/30">
            <p className="text-xs text-luxury-gray-3 uppercase tracking-widest mb-2">Notes</p>
            <p className="text-sm text-luxury-gray-2 italic">{agreement.notes}</p>
          </div>
        )}
      </div>

      {/* Commission Splits */}
      <div className="container-card mb-5">
        <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
          Commission Splits
        </h2>

        {Object.keys(groupedSplits).length === 0 ? (
          <p className="text-sm text-luxury-gray-3">No splits configured</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedSplits).map(([planType, splits]) => (
              <div key={planType}>
                <h3 className="text-sm font-semibold text-luxury-gray-2 mb-3">
                  {PLAN_TYPE_LABELS[planType] || planType}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-luxury-gray-3 border-b border-luxury-gray-5/30">
                        <th className="pb-3 font-medium">Lead Source</th>
                        <th className="pb-3 font-medium text-center">Agent</th>
                        <th className="pb-3 font-medium text-center">Team Lead</th>
                        <th className="pb-3 font-medium text-center">Firm</th>
                      </tr>
                    </thead>
                    <tbody>
                      {splits.map(split => (
                        <tr key={split.id} className="border-b border-luxury-gray-5/20">
                          <td className="py-3 text-luxury-gray-2">
                            {LEAD_SOURCE_LABELS[split.lead_source] || split.lead_source}
                          </td>
                          <td className="py-3 text-center text-luxury-gray-1 font-medium">
                            {split.agent_pct}%
                          </td>
                          <td className="py-3 text-center text-luxury-gray-1 font-medium">
                            {split.team_lead_pct}%
                          </td>
                          <td className="py-3 text-center text-luxury-gray-1 font-medium">
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
      </div>

      {/* Agent's History on This Team (Collapsed) */}
      {agentHistory.length > 0 && (
        <div className="container-card mb-5">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest flex items-center gap-2">
              <History size={14} />
              Other Agreements on This Team ({agentHistory.length})
            </h2>
            {showHistory ? (
              <ChevronDown size={18} className="text-luxury-gray-3" />
            ) : (
              <ChevronRight size={18} className="text-luxury-gray-3" />
            )}
          </button>

          {showHistory && (
            <div className="mt-4 space-y-3">
              {agentHistory.map(hist => (
                <Link
                  key={hist.id}
                  href={`/admin/teams/${teamId}/agreements/${hist.id}`}
                  className="inner-card flex items-center justify-between hover:bg-luxury-gray-6/50 transition-colors"
                >
                  <div>
                    <p className="text-sm text-luxury-gray-2">
                      {formatDate(hist.effective_date)} - {formatDate(hist.end_date)}
                    </p>
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      {hist.splits.length} split{hist.splits.length !== 1 ? 's' : ''} configured
                      {hist.firm_min_override && ' • Firm Min Override'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-luxury-gray-4" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Only: Agent's Agreements on Other Teams */}
      {isAdmin && crossTeamAgreements.length > 0 && (
        <div className="container-card">
          <button
            onClick={() => setShowCrossTeam(!showCrossTeam)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest flex items-center gap-2">
              <History size={14} className="text-luxury-accent" />
              Agreements on Other Teams ({crossTeamAgreements.length})
            </h2>
            {showCrossTeam ? (
              <ChevronDown size={18} className="text-luxury-gray-3" />
            ) : (
              <ChevronRight size={18} className="text-luxury-gray-3" />
            )}
          </button>

          {showCrossTeam && (
            <div className="mt-4 space-y-3">
              {crossTeamAgreements.map(otherAgreement => (
                <Link
                  key={otherAgreement.id}
                  href={`/admin/teams/${otherAgreement.team_id}/agreements/${otherAgreement.id}`}
                  className="inner-card flex items-center justify-between hover:bg-luxury-gray-6/50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-luxury-gray-1">
                      {otherAgreement.team?.team_name || 'Unknown Team'}
                    </p>
                    <p className="text-sm text-luxury-gray-2 mt-0.5">
                      {formatDate(otherAgreement.effective_date)} - {formatDate(otherAgreement.end_date)}
                    </p>
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      {otherAgreement.splits.length} split{otherAgreement.splits.length !== 1 ? 's' : ''} configured
                      {otherAgreement.firm_min_override && ' • Firm Min Override'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-luxury-gray-4" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
