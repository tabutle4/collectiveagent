'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, Plus, Search, ArrowLeft, ExternalLink } from 'lucide-react'

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  zip: string | null
  unit_count: number
  property_type: string | null
  status: string
  landlord_id: string
  landlords?: {
    first_name: string
    last_name: string
  }
  pm_leases?: Array<{
    id: string
    status: string
    tenants?: {
      first_name: string
      last_name: string
    }
  }>
}

export default function PropertiesPage() {
  const router = useRouter()
  const [properties, setProperties] = useState<Property[]>([])
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
    loadProperties()
  }

  const loadProperties = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/properties?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProperties(data.properties || [])
      }
    } catch (err) {
      console.error('Failed to load properties:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadProperties, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter])

  const getActiveLease = (property: Property) => {
    return property.pm_leases?.find(l => l.status === 'active')
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-600',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.inactive}`}>
        {status}
      </span>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Home className="w-6 h-6 text-luxury-accent" />
        <h1 className="page-title">Managed Properties</h1>
      </div>

      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by address..."
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
            <option value="inactive">Inactive</option>
          </select>
          <Link href="/admin/pm/properties/new" className="btn btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Property
          </Link>
        </div>
      </div>

      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading properties...</div>
        ) : properties.length === 0 ? (
          <div className="text-center py-12">
            <Home className="w-12 h-12 mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No properties found</p>
            <Link href="/admin/pm/properties/new" className="btn btn-primary mt-4 inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add First Property
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="th-luxury">
                <th className="text-left py-3 px-4">Property</th>
                <th className="text-left py-3 px-4">Landlord</th>
                <th className="text-left py-3 px-4">Current Tenant</th>
                <th className="text-left py-3 px-4">Units</th>
                <th className="text-left py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((property) => {
                const activeLease = getActiveLease(property)
                return (
                  <tr
                    key={property.id}
                    className="tr-luxury-clickable"
                    onClick={() => router.push(`/admin/pm/properties/${property.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">
                        {property.property_address}
                        {property.unit && ` ${property.unit}`}
                      </div>
                      <div className="text-xs text-luxury-gray-3">
                        {property.city}, {property.state} {property.zip}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {property.landlords ? (
                        <Link
                          href={`/admin/pm/landlords/${property.landlord_id}`}
                          className="text-luxury-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {property.landlords.first_name} {property.landlords.last_name}
                        </Link>
                      ) : (
                        <span className="text-luxury-gray-3">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {activeLease?.tenants ? (
                        <Link
                          href={`/admin/pm/tenants/${activeLease.id}`}
                          className="text-luxury-accent hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {activeLease.tenants.first_name} {activeLease.tenants.last_name}
                        </Link>
                      ) : (
                        <span className="text-luxury-gray-3">Vacant</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {property.unit_count}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(property.status)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
