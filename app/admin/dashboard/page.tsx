'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AdminDashboard() {
  const [prospects, setProspects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  const stats = {
    new: prospects.filter(p => p.status === 'new').length,
    contacted: prospects.filter(p => p.status === 'contacted').length,
    total: prospects.length,
  }

  const recentProspects = prospects.slice(0, 5)

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-5 md:mb-8" >
        Admin Dashboard
      </h2>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-luxury-gray-5 rounded p-5 text-center shadow-sm">
          <div className="text-2xl md:text-3xl font-light mb-1" className="text-luxury-accent">
            {stats.new}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            New Prospects
          </div>
        </div>
        
        <div className="bg-white border border-luxury-gray-5 rounded p-5 text-center shadow-sm">
          <div className="text-2xl md:text-3xl font-light mb-1" className="text-luxury-accent">
            {stats.contacted}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            Contacted
          </div>
        </div>
        
        <div className="bg-white border border-luxury-gray-5 rounded p-5 text-center shadow-sm">
          <div className="text-2xl md:text-3xl font-light mb-1" className="text-luxury-accent">
            {stats.total}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            Total Prospects
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white border border-luxury-gray-5 rounded shadow-sm p-6">
        <h3 className="text-base font-medium mb-4 tracking-wide text-luxury-gray-2 border-b border-luxury-gray-5 pb-2">
          Recent Activity
        </h3>
        
        {recentProspects.length === 0 ? (
          <p className="text-luxury-gray-2 text-center py-8">
            No prospects yet
          </p>
        ) : (
          <div className="space-y-3">
            {recentProspects.map((prospect) => (
              <div
                key={prospect.id}
                className="flex items-center justify-between py-3 border-b border-luxury-gray-5 last:border-0"
              >
                <div>
                  <p className="font-medium">
                    {prospect.preferred_first_name} {prospect.preferred_last_name}
                  </p>
                  <p className="text-base text-luxury-gray-2">
                    {new Date(prospect.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link
                  href={`/admin/prospects/${prospect.id}`}
                  className="text-base text-luxury-black hover:underline"
                >
                  View Details →
                </Link>
              </div>
            ))}
          </div>
        )}
        
        <div className="text-center mt-6">
          <Link href="/admin/prospects" className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white inline-block">
            View All Prospects
          </Link>
        </div>
      </div>
    </div>
  )
}
