'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Users, Crown, ChevronRight } from 'lucide-react'
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

export default function TeamsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active')
  const [searchQuery, setSearchQuery] = useState('')

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
        {/* Future: Add New Team button
        <Link href="/admin/teams/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={16} />
          New Team
        </Link>
        */}
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
    </div>
  )
}
