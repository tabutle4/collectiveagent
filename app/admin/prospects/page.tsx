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
      setLoading(false)
    } catch (error) {
      console.error('Error fetching prospects:', error)
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

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5 md:mb-8">
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury" >
          Prospects
        </h2>
      </div>

      {/* Filter Tabs */}
      <div className="mb-4 md:mb-6 -mx-6 px-6 md:mx-0 md:px-0">
        <div className="grid grid-cols-2 md:flex md:flex-row gap-2 md:gap-2">
          {Object.entries(statusCounts).map(([status, count]) => {
            const label = status === 'all' ? 'All' : status.replace('_', ' ')
            const isActive = filter === status
            return (
          <button
            key={status}
            onClick={() => setFilter(status)}
                className={`px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors flex items-center justify-center gap-1 font-medium ${
                  isActive
                ? 'bg-luxury-black text-white'
                : 'btn-white'
            }`}
          >
                <span className="capitalize">{label}</span>
                <span className="text-[11px] md:text-xs font-normal opacity-80">({count})</span>
          </button>
            )
          })}
        </div>
      </div>

      {filteredProspects.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2">No prospects found</p>
        </div>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredProspects.map((prospect) => (
              <div key={prospect.id} className="card-section">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <p className="font-medium text-base">{prospect.preferred_first_name} {prospect.preferred_last_name}</p>
                    <p className="text-sm text-luxury-gray-2">{prospect.first_name} {prospect.last_name}</p>
                  </div>
                  <span className={`inline-block px-3 py-1 text-xs rounded flex-shrink-0 ml-2 ${
                    prospect.prospect_status === 'new' ? 'bg-blue-100 text-blue-800' :
                    prospect.prospect_status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                    prospect.prospect_status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                    prospect.prospect_status === 'joined' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {prospect.prospect_status.replace('_', ' ')}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-luxury-gray-2">Email: </span>
                    <span className="text-luxury-black break-all">{prospect.email}</span>
                  </div>
                  {prospect.location && (
                    <div>
                      <span className="text-luxury-gray-2">Location: </span>
                      <span className="text-luxury-black">{prospect.location}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-luxury-gray-2">Submitted: </span>
                    <span className="text-luxury-black">{new Date(prospect.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-luxury-gray-5">
                  <Link
                    href={`/admin/prospects/${prospect.id}`}
                    className="text-sm text-luxury-black hover:underline font-medium"
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block card-section">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-luxury-gray-5">
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Name</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Email</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Location</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2">Submitted</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-luxury-gray-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredProspects.map((prospect) => (
                  <tr key={prospect.id} className="border-b border-luxury-gray-5 hover:bg-luxury-light transition-colors">
                    <td className="py-4 px-4">
                      <p className="font-medium">{prospect.preferred_first_name} {prospect.preferred_last_name}</p>
                      <p className="text-sm text-luxury-gray-2">{prospect.first_name} {prospect.last_name}</p>
                    </td>
                    <td className="py-4 px-4 text-sm">{prospect.email}</td>
                    <td className="py-4 px-4 text-sm">{prospect.location}</td>
                    <td className="py-4 px-4">
                      <span className={`inline-block px-3 py-1 text-xs rounded ${
                        prospect.prospect_status === 'new' ? 'bg-blue-100 text-blue-800' :
                        prospect.prospect_status === 'contacted' ? 'bg-yellow-100 text-yellow-800' :
                        prospect.prospect_status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                        prospect.prospect_status === 'joined' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {prospect.prospect_status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-luxury-gray-2">
                      {new Date(prospect.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4">
                      <Link
                        href={`/admin/prospects/${prospect.id}`}
                        className="text-sm text-luxury-black hover:underline"
                      >
                        View Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
    </div>
  )
}