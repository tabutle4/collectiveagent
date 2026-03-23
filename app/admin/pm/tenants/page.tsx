'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Plus, ChevronRight, CheckCircle, Mail, Phone, Home } from 'lucide-react'

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: 'active' | 'inactive'
  dashboard_token: string
  created_at: string
  pm_leases?: Array<{
    id: string
    managed_properties: {
      property_address: string
      city: string
    }
  }>
}

export default function TenantsListPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  useEffect(() => {
    loadTenants()
  }, [])

  const loadTenants = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pm/tenants')
      const data = await res.json()
      setTenants(data.tenants || [])
    } catch (err) {
      console.error('Error loading tenants:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
          <CheckCircle size={12} /> Active
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
        Inactive
      </span>
    )
  }

  const filtered = tenants.filter((t) => {
    const matchesSearch =
      search === '' ||
      `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())

    const matchesStatus = statusFilter === 'all' || t.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Tenants</h1>
        <Link href="/admin/pm/tenants/new" className="btn btn-primary flex items-center gap-2">
          <Plus size={14} />
          Add Tenant
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
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Tenants List */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading tenants...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">
              {tenants.length === 0 ? 'No tenants yet' : 'No tenants match your filters'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tenant) => (
              <div
                key={tenant.id}
                className="flex items-center justify-between p-4 rounded-lg hover:bg-luxury-light transition-colors cursor-pointer border border-transparent hover:border-luxury-gray-5"
                onClick={() => router.push(`/admin/pm/tenants/${tenant.id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {tenant.first_name} {tenant.last_name}
                    </p>
                    {getStatusBadge(tenant.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-luxury-gray-3">
                    <span className="flex items-center gap-1">
                      <Mail size={12} />
                      {tenant.email}
                    </span>
                    {tenant.phone && (
                      <span className="flex items-center gap-1">
                        <Phone size={12} />
                        {tenant.phone}
                      </span>
                    )}
                  </div>
                  {tenant.pm_leases && tenant.pm_leases.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-luxury-gray-3">
                      <Home size={12} />
                      {tenant.pm_leases[0].managed_properties.property_address},{' '}
                      {tenant.pm_leases[0].managed_properties.city}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-luxury-gray-3">Added</p>
                    <p className="text-sm text-luxury-gray-1">{formatDate(tenant.created_at)}</p>
                  </div>
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
          Showing {filtered.length} of {tenants.length} tenants
        </p>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            {tenants.filter((t) => t.status === 'active').length} active
          </span>
        </div>
      </div>
    </div>
  )
}
