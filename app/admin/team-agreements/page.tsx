'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Eye, Edit, FileText, Calendar } from 'lucide-react'
import Link from 'next/link'

interface TeamAgreement {
  id: string
  team_name: string
  team_lead_id: string
  effective_date: string
  expiration_date: string | null
  status: 'active' | 'expired' | 'terminated'
  agreement_document_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  team_lead: {
    id: string
    preferred_first_name: string | null
    preferred_last_name: string | null
    first_name: string
    last_name: string
  }
  team_members: Array<{
    id: string
    agent_id: string
    joined_date: string
    left_date: string | null
    agent: {
      id: string
      preferred_first_name: string | null
      preferred_last_name: string | null
      first_name: string
      last_name: string
    }
  }>
  member_count: number
  total_members: number
}

export default function TeamAgreementsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
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
  const [agreements, setAgreements] = useState<TeamAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'terminated'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    try {
      if (user?.role !== 'Admin') { router.push('/auth/login'); return }
      setUser(user)
      loadAgreements()
    } catch (error) {
      console.error('Error parsing user data:', error)
      router.push('/auth/login')
    }
  }, [router])

  const loadAgreements = async () => {
    setLoading(true)
    try {
      const url = statusFilter === 'all'
        ? '/api/team-agreements'
        : `/api/team-agreements?status=${statusFilter}`
      const response = await fetch(url)
      const data = await response.json()
      if (response.ok) {
        setAgreements(data.agreements || [])
      } else {
        console.error('Error loading agreements:', data.error)
      }
    } catch (error) {
      console.error('Error loading agreements:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) loadAgreements()
  }, [statusFilter, user])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getTeamLeadName = (agreement: TeamAgreement) => {
    if (agreement.team_lead) {
      return agreement.team_lead.preferred_first_name && agreement.team_lead.preferred_last_name
        ? `${agreement.team_lead.preferred_first_name} ${agreement.team_lead.preferred_last_name}`
        : `${agreement.team_lead.first_name} ${agreement.team_lead.last_name}`
    }
    return 'N/A'
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-50 text-green-700'
      case 'expired': return 'bg-yellow-50 text-yellow-700'
      case 'terminated': return 'bg-red-50 text-red-600'
      default: return 'bg-luxury-gray-5/40 text-luxury-gray-3'
    }
  }

  const filteredAgreements = agreements.filter(agreement => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      agreement.team_name.toLowerCase().includes(query) ||
      getTeamLeadName(agreement).toLowerCase().includes(query) ||
      agreement.team_members.some(m => {
        const name = m.agent.preferred_first_name && m.agent.preferred_last_name
          ? `${m.agent.preferred_first_name} ${m.agent.preferred_last_name}`
          : `${m.agent.first_name} ${m.agent.last_name}`
        return name.toLowerCase().includes(query)
      })
    )
  })

  if (!user) return null

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">TEAMS</h1>
          <p className="text-xs text-luxury-gray-3 mt-1">Manage team agreements, splits, and revenue share</p>
        </div>
        <Link href="/admin/team-agreements/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Team Agreement
        </Link>
      </div>

      <div className="container-card">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-5">
          <div className="flex gap-2">
            {(['all', 'active', 'expired', 'terminated'] as const).map((status) => (
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
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-3" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by team name, lead, or member..."
              className="input-luxury pl-10"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading...</p>
          </div>
        ) : filteredAgreements.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">
              {searchQuery ? 'No agreements match your search' : 'No team agreements found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAgreements.map((agreement) => (
              <div key={agreement.id} className="inner-card">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">{agreement.team_name}</h3>
                    <p className="text-xs text-luxury-gray-3">Lead: {getTeamLeadName(agreement)}</p>
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded capitalize font-medium flex-shrink-0 ml-2 ${getStatusStyle(agreement.status)}`}>
                    {agreement.status}
                  </span>
                </div>

                <div className="space-y-1.5 mb-4 text-xs text-luxury-gray-3">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={13} />
                    <span>
                      {formatDate(agreement.effective_date)}
                      {agreement.expiration_date && ` - ${formatDate(agreement.expiration_date)}`}
                    </span>
                  </div>
                  <div>
                    {agreement.member_count} active member{agreement.member_count !== 1 ? 's' : ''}
                    {agreement.total_members > agreement.member_count && (
                      <span className="text-luxury-gray-3/60"> ({agreement.total_members} total)</span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-3 border-t border-luxury-gray-5/30">
                  <Link
                    href={`/admin/team-agreements/${agreement.id}`}
                    className="flex-1 btn btn-secondary text-xs flex items-center justify-center gap-1.5"
                  >
                    <Eye size={13} /> View
                  </Link>
                  <Link
                    href={`/admin/team-agreements/${agreement.id}?edit=true`}
                    className="flex-1 btn btn-secondary text-xs flex items-center justify-center gap-1.5"
                  >
                    <Edit size={13} /> Edit
                  </Link>
                  {agreement.agreement_document_url && (
                    <a
                      href={agreement.agreement_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary text-xs flex items-center justify-center"
                      title="View Document"
                    >
                      <FileText size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
