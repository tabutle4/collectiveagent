'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, Search, ArrowLeft, Calendar } from 'lucide-react'

interface Lease {
  id: string
  lease_start: string
  lease_end: string
  move_in_date: string | null
  monthly_rent: number
  security_deposit: number
  status: string
  property_id: string
  tenant_id: string
  landlord_id: string
  managed_properties?: {
    property_address: string
    unit: string | null
    city: string
    state: string
  }
  tenants?: {
    first_name: string
    last_name: string
    email: string
  }
  landlords?: {
    first_name: string
    last_name: string
  }
}

export default function LeasesPage() {
  const router = useRouter()
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadLeases()
  }

  const loadLeases = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/leases?${params}`)
      if (res.ok) {
        const data = await res.json()
        setLeases(data.leases || [])
      }
    } catch (err) {
      console.error('Failed to load leases:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadLeases, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter])

  const formatDate = (date: string) => {
    // Append T12:00:00 to date-only strings to prevent timezone shift
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Helper to parse date-only strings correctly
  const parseDate = (date: string) => {
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr)
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-50 text-green-700',
      expired: 'bg-gray-50 text-gray-600',
      terminated: 'bg-red-50 text-red-700',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.expired}`}>
        {status}
      </span>
    )
  }

  const isExpiringSoon = (lease: Lease) => {
    const endDate = parseDate(lease.lease_end)
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const daysUntilEnd = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    return lease.status === 'active' && daysUntilEnd <= 60 && daysUntilEnd > 0
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={20} />
        </Link>
        <FileText size={24} className="text-luxury-accent" />
        <h1 className="page-title">Leases</h1>
      </div>

      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by property or tenant..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-luxury pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-luxury w-full sm:w-40"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
          </select>
          <Link href="/admin/pm/leases/new" className="btn btn-primary flex items-center gap-2">
            <Plus size={16} />
            Create Lease
          </Link>
        </div>
      </div>

      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading leases...</div>
        ) : leases.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No leases found</p>
            <Link href="/admin/pm/leases/new" className="btn btn-primary mt-4 inline-flex items-center gap-2">
              <Plus size={16} />
              Create First Lease
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="th-luxury">
                <th className="text-left py-3 px-4">Property</th>
                <th className="text-left py-3 px-4">Tenant</th>
                <th className="text-left py-3 px-4">Lease Term</th>
                <th className="text-right py-3 px-4">Rent</th>
                <th className="text-left py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {leases.map((lease) => (
                <tr
                  key={lease.id}
                  className="tr-luxury-clickable"
                  onClick={() => router.push(`/admin/pm/leases/${lease.id}`)}
                >
                  <td className="py-3 px-4">
                    <div className="font-medium text-luxury-gray-1">
                      {lease.managed_properties?.property_address}
                      {lease.managed_properties?.unit && ` ${lease.managed_properties.unit}`}
                    </div>
                    <div className="text-xs text-luxury-gray-3">
                      {lease.managed_properties?.city}, {lease.managed_properties?.state}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {lease.tenants ? (
                      <div>
                        <div className="font-medium text-luxury-gray-1">
                          {lease.tenants.first_name} {lease.tenants.last_name}
                        </div>
                        <div className="text-xs text-luxury-gray-3">{lease.tenants.email}</div>
                      </div>
                    ) : (
                      <span className="text-luxury-gray-3">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-sm text-luxury-gray-1">
                      {formatDate(lease.lease_start)} — {formatDate(lease.lease_end)}
                    </div>
                    {isExpiringSoon(lease) && (
                      <div className="flex items-center gap-1 mt-1">
                        <Calendar size={12} className="text-amber-600" />
                        <span className="text-xs text-amber-600">Expiring soon</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-medium text-luxury-gray-1">{formatMoney(lease.monthly_rent)}</span>
                    <span className="text-xs text-luxury-gray-3">/mo</span>
                  </td>
                  <td className="py-3 px-4">
                    {getStatusBadge(lease.status)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
