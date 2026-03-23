'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search,
  Plus,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Clock,
  ExternalLink,
  Mail,
  Phone,
} from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: 'onboarding' | 'active' | 'inactive'
  w9_status: 'not_started' | 'pending' | 'completed' | 'failed'
  bank_status: 'not_started' | 'pending' | 'connected' | 'failed'
  dashboard_token: string
  created_at: string
  properties_count?: number
}

export default function LandlordsListPage() {
  const router = useRouter()
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadLandlords()
  }, [])

  const loadLandlords = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pm/landlords')
      const data = await res.json()
      setLandlords(data.landlords || [])
    } catch (err) {
      console.error('Error loading landlords:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
            <CheckCircle size={12} /> Active
          </span>
        )
      case 'onboarding':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
            <Clock size={12} /> Onboarding
          </span>
        )
      case 'inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            Inactive
          </span>
        )
      default:
        return null
    }
  }

  const getSetupStatus = (landlord: Landlord) => {
    const w9Done = landlord.w9_status === 'completed'
    const bankDone = landlord.bank_status === 'connected'

    if (w9Done && bankDone) {
      return (
        <span className="text-xs text-green-600 flex items-center gap-1">
          <CheckCircle size={12} /> Setup complete
        </span>
      )
    }

    const missing = []
    if (!w9Done) missing.push('W9')
    if (!bankDone) missing.push('Bank')

    return (
      <span className="text-xs text-yellow-600 flex items-center gap-1">
        <AlertCircle size={12} /> Missing: {missing.join(', ')}
      </span>
    )
  }

  const filtered = landlords.filter((l) => {
    const matchesSearch =
      search === '' ||
      `${l.first_name} ${l.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || l.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getDashboardUrl = (token: string) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    return `${baseUrl}/pm/landlord/${token}`
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Landlords</h1>
        <Link href="/admin/pm/landlords/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={14} />
          Add Landlord
        </Link>
      </div>

      {/* Filters */}
      <div className="container-card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="input-luxury pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-luxury md:w-48"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="onboarding">Onboarding</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Landlords List */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading landlords...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">
              {landlords.length === 0 ? 'No landlords yet' : 'No landlords match your filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((landlord) => (
              <div
                key={landlord.id}
                className="flex items-center justify-between p-4 rounded-lg hover:bg-luxury-light transition-colors cursor-pointer border border-transparent hover:border-luxury-gray-5"
                onClick={() => router.push(`/admin/pm/landlords/${landlord.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {landlord.first_name} {landlord.last_name}
                    </p>
                    {getStatusBadge(landlord.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-luxury-gray-3">
                    <span className="flex items-center gap-1">
                      <Mail size={12} />
                      {landlord.email}
                    </span>
                    {landlord.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} />
                        {landlord.phone}
                      </span>
                    )}
                  </div>
                  <div className="mt-1">{getSetupStatus(landlord)}</div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-luxury-gray-3">Added</p>
                    <p className="text-sm text-luxury-gray-1">{formatDate(landlord.created_at)}</p>
                  </div>
                  <a
                    href={getDashboardUrl(landlord.dashboard_token)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                    title="Open landlord dashboard"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <ChevronRight size={16} className="text-luxury-gray-3" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-xs text-luxury-gray-3">
        <p>
          Showing {filtered.length} of {landlords.length} landlords
        </p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            {landlords.filter((l) => l.status === 'active').length} active
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            {landlords.filter((l) => l.status === 'onboarding').length} onboarding
          </span>
        </div>
      </div>
    </div>
  )
}
