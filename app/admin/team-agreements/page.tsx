'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
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
    is_team_lead: boolean
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
  const [agreements, setAgreements] = useState<TeamAgreement[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'terminated'>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    if (user) {
      loadAgreements()
    }
  }, [statusFilter, user])

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getTeamLeadName = (agreement: TeamAgreement) => {
    if (agreement.team_lead) {
      return agreement.team_lead.preferred_first_name && agreement.team_lead.preferred_last_name
        ? `${agreement.team_lead.preferred_first_name} ${agreement.team_lead.preferred_last_name}`
        : `${agreement.team_lead.first_name} ${agreement.team_lead.last_name}`
    }
    return 'N/A'
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'expired':
        return 'bg-yellow-100 text-yellow-800'
      case 'terminated':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
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

  if (!user) {
    return null
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-light tracking-luxury mb-2">
            Team Agreements
          </h1>
          <p className="text-sm text-luxury-gray-2">
            Manage team agreements, splits, and revenue share
          </p>
        </div>
        <Link
          href="/admin/team-agreements/new"
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center bg-luxury-black text-white hover:opacity-90 inline-flex items-center gap-2"
        >
          <Plus size={16} />
          Create New Team Agreement
        </Link>
      </div>

      {/* Filters and Search */}
      <div className="card-section mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Status Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                statusFilter === 'all'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-1 hover:bg-luxury-gray-5'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                statusFilter === 'active'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-1 hover:bg-luxury-gray-5'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('expired')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                statusFilter === 'expired'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-1 hover:bg-luxury-gray-5'
              }`}
            >
              Expired
            </button>
            <button
              onClick={() => setStatusFilter('terminated')}
              className={`px-4 py-2 text-sm rounded transition-colors ${
                statusFilter === 'terminated'
                  ? 'bg-luxury-black text-white'
                  : 'bg-luxury-light text-luxury-gray-1 hover:bg-luxury-gray-5'
              }`}
            >
              Terminated
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-luxury-gray-2 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by team name, team lead, or member..."
              className="input-luxury pl-12 py-3 text-base w-full"
            />
          </div>
        </div>
      </div>

      {/* Agreements List */}
      {loading ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">Loading...</p>
        </div>
      ) : filteredAgreements.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">
            {searchQuery ? 'No agreements match your search' : 'No team agreements found'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAgreements.map((agreement) => (
            <div key={agreement.id} className="card-section">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-luxury-black mb-1">
                    {agreement.team_name}
                  </h3>
                  <p className="text-sm text-luxury-gray-2">
                    Team Lead: {getTeamLeadName(agreement)}
                  </p>
                </div>
                <span className={`px-2 py-1 text-xs rounded capitalize ${getStatusBadgeClass(agreement.status)}`}>
                  {agreement.status}
                </span>
              </div>

              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-luxury-gray-2">
                  <Calendar size={14} />
                  <span>
                    {formatDate(agreement.effective_date)}
                    {agreement.expiration_date && ` - ${formatDate(agreement.expiration_date)}`}
                  </span>
                </div>
                <div className="text-luxury-gray-2">
                  {agreement.member_count} active member{agreement.member_count !== 1 ? 's' : ''}
                  {agreement.total_members > agreement.member_count && (
                    <span className="text-luxury-gray-3">
                      {' '}({agreement.total_members} total)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-luxury-gray-5">
                <Link
                  href={`/admin/team-agreements/${agreement.id}`}
                  className="flex-1 btn-outline flex items-center justify-center gap-2 text-sm"
                >
                  <Eye size={14} />
                  View Details
                </Link>
                <Link
                  href={`/admin/team-agreements/${agreement.id}?edit=true`}
                  className="flex-1 btn-outline flex items-center justify-center gap-2 text-sm"
                >
                  <Edit size={14} />
                  Edit
                </Link>
                {agreement.agreement_document_url && (
                  <a
                    href={agreement.agreement_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline flex items-center justify-center gap-2 text-sm px-3"
                    title="View Document"
                  >
                    <FileText size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

