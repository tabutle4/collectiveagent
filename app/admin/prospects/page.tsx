'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    fetchProspects()
  }, [])

  const fetchProspects = async () => {
    try {
      const response = await fetch('/api/prospects')
      const data = await response.json()
      setProspects(data.prospects || [])
    } catch (error) {
      console.error('Error fetching prospects:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProspects = filter === 'all'
    ? prospects
    : prospects.filter(p => p.prospect_status === filter)

  const statusCounts = {
    all: prospects.length,
    new: prospects.filter(p => p.prospect_status === 'new').length,
    contacted: prospects.filter(p => p.prospect_status === 'contacted').length,
    scheduled: prospects.filter(p => p.prospect_status === 'scheduled').length,
    joined: prospects.filter(p => p.prospect_status === 'joined').length,
    not_interested: prospects.filter(p => p.prospect_status === 'not_interested').length,
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'new': return 'bg-luxury-accent/10 text-luxury-accent'
      case 'contacted': return 'bg-luxury-gray-5/40 text-luxury-gray-2'
      case 'scheduled': return 'bg-luxury-accent/20 text-luxury-accent'
      case 'joined': return 'bg-green-50 text-green-700'
      case 'not_interested': return 'bg-red-50 text-red-600'
      default: return 'bg-luxury-gray-5/40 text-luxury-gray-3'
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <h1 className="page-title mb-6">PROSPECTS</h1>

      {/* Filter Tabs */}
      <div className="mb-5">
        <div className="grid grid-cols-2 md:flex md:flex-row gap-2">
          {Object.entries(statusCounts).map(([status, count]) => {
            const label = status === 'all' ? 'All' : status.replace('_', ' ')
            const isActive = filter === status
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`btn text-sm flex items-center justify-center gap-1 ${
                  isActive ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                <span className="capitalize">{label}</span>
                <span className="text-xs font-normal opacity-80">({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="container-card">
        {filteredProspects.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-luxury-gray-3">No prospects found</p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredProspects.map((prospect) => (
                <div key={prospect.id} className="inner-card">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-luxury-gray-1">{prospect.preferred_first_name} {prospect.preferred_last_name}</p>
                      <p className="text-xs text-luxury-gray-3">{prospect.first_name} {prospect.last_name}</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded flex-shrink-0 ml-2 font-medium ${getStatusStyle(prospect.prospect_status)}`}>
                      {prospect.prospect_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-luxury-gray-3">Email: </span>
                      <span className="text-luxury-gray-1 break-all">{prospect.email}</span>
                    </div>
                    {prospect.location && (
                      <div>
                        <span className="text-luxury-gray-3">Location: </span>
                        <span className="text-luxury-gray-1">{prospect.location}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-luxury-gray-3">Submitted: </span>
                      <span className="text-luxury-gray-1">{new Date(prospect.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-luxury-gray-5/30">
                    <Link
                      href={`/admin/prospects/${prospect.id}`}
                      className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors font-medium"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Name</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Email</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Location</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-luxury-gray-3 uppercase tracking-wider">Submitted</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProspects.map((prospect) => (
                    <tr key={prospect.id} className="border-b border-luxury-gray-5/30 last:border-0 hover:bg-luxury-light/50 transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-sm font-semibold text-luxury-gray-1">{prospect.preferred_first_name} {prospect.preferred_last_name}</p>
                        <p className="text-xs text-luxury-gray-3">{prospect.first_name} {prospect.last_name}</p>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{prospect.email}</td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-2">{prospect.location}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2.5 py-1 rounded font-medium ${getStatusStyle(prospect.prospect_status)}`}>
                          {prospect.prospect_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-luxury-gray-3">
                        {new Date(prospect.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/prospects/${prospect.id}`}
                          className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}