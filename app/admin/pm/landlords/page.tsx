'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: string
  w9_status: string
  bank_status: string
  created_at: string
}

export default function LandlordsListPage() {
  const router = useRouter()
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'onboarding'>('all')

  useEffect(() => {
    loadLandlords()
  }, [])

  const loadLandlords = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pm/landlords')
      const data = await res.json()
      if (data.landlords) {
        setLandlords(data.landlords)
      }
    } catch (err) {
      console.error('Error loading landlords:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this landlord? Note: Landlords with active properties cannot be deleted.')) {
      return
    }
    try {
      const res = await fetch(`/api/pm/landlords/${id}`, { method: 'DELETE' })
      if (res.ok) {
        loadLandlords()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete landlord')
      }
    } catch (err) {
      alert('Failed to delete landlord')
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const filteredLandlords = landlords.filter(l => {
    if (filter === 'active') return l.status === 'active'
    if (filter === 'onboarding') return l.status === 'onboarding'
    return true
  })

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="page-title">Landlords</h1>
        <button
          onClick={() => router.push('/admin/pm/landlords/new')}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={14} /> Add Landlord
        </button>
      </div>

      <div className="container-card">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'active', 'onboarding'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`btn text-sm capitalize ${filter === status ? 'btn-primary' : 'btn-secondary'}`}
            >
              {status} (
              {status === 'all'
                ? landlords.length
                : status === 'active'
                  ? landlords.filter(l => l.status === 'active').length
                  : landlords.filter(l => l.status === 'onboarding').length}
              )
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">Loading...</p>
          </div>
        ) : filteredLandlords.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3 mb-4">No landlords found</p>
            <button
              onClick={() => router.push('/admin/pm/landlords/new')}
              className="btn btn-primary"
            >
              Add First Landlord
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLandlords.map(landlord => (
              <div key={landlord.id} className="inner-card">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-luxury-gray-1 mb-1">
                      {landlord.first_name} {landlord.last_name}
                    </h3>
                    <p className="text-xs text-luxury-gray-3 mb-3">
                      {landlord.email}
                      {landlord.phone && ` · ${landlord.phone}`}
                    </p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs text-luxury-gray-3">Status</p>
                        <p className="text-xs font-medium">
                          <span className={landlord.status === 'active' ? 'text-green-700' : 'text-amber-600'}>
                            {landlord.status === 'active' ? 'Active' : 'Onboarding'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">W9</p>
                        <p className="text-xs font-medium">
                          <span className={landlord.w9_status === 'completed' ? 'text-green-700' : 'text-amber-600'}>
                            {landlord.w9_status === 'completed' ? 'Complete' : 'Pending'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Bank</p>
                        <p className="text-xs font-medium">
                          <span className={landlord.bank_status === 'connected' ? 'text-green-700' : 'text-amber-600'}>
                            {landlord.bank_status === 'connected' ? 'Connected' : 'Not Connected'}
                          </span>
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-luxury-gray-3">Added</p>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {formatDate(landlord.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex md:flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/admin/pm/landlords/${landlord.id}`)}
                      className="btn btn-primary text-xs"
                    >
                      Manage
                    </button>
                    <button
                      onClick={(e) => handleDelete(landlord.id, e)}
                      className="btn text-xs bg-white border border-red-600 text-red-600 hover:bg-red-50 flex items-center justify-center gap-1.5"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}