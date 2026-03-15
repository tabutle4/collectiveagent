'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ContentCard from '@/components/shared/ContentCard'

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
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-luxury-gray-1 mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Middle Column - Transactions Needing Attention */}
        <div className="lg:col-span-5 space-y-4">
          <h2 className="text-sm font-semibold text-luxury-gray-3 uppercase tracking-widest">Needs Attention</h2>

          <ContentCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-luxury-gray-1">Compliance Requested</p>
              <span className="text-xs text-luxury-gray-3 bg-luxury-light px-2 py-1 rounded">0</span>
            </div>
            <p className="text-xs text-luxury-gray-3">No transactions awaiting compliance review</p>
          </ContentCard>

          <ContentCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-luxury-gray-1">Approved - CDA Needed</p>
              <span className="text-xs text-luxury-gray-3 bg-luxury-light px-2 py-1 rounded">0</span>
            </div>
            <p className="text-xs text-luxury-gray-3">No transactions ready for CDA</p>
          </ContentCard>

          <ContentCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-luxury-gray-1">Eligible for Payout</p>
              <span className="text-xs text-luxury-gray-3 bg-luxury-light px-2 py-1 rounded">0</span>
            </div>
            <p className="text-xs text-luxury-gray-3">No transactions eligible for payout</p>
          </ContentCard>

          <ContentCard>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-luxury-gray-1">Broker Approval Pending</p>
              <span className="text-xs text-luxury-gray-3 bg-luxury-light px-2 py-1 rounded">0</span>
            </div>
            <p className="text-xs text-luxury-gray-3">No CDAs awaiting broker approval</p>
          </ContentCard>
        </div>

        {/* Right Column - Stats and Activity */}
        <div className="lg:col-span-7 space-y-4">
          <h2 className="text-sm font-semibold text-luxury-gray-3 uppercase tracking-widest">Overview</h2>

          <div className="grid grid-cols-3 gap-4">
            <ContentCard>
              <p className="text-xs text-luxury-gray-3 mb-1">New Prospects</p>
              <p className="text-2xl font-semibold text-luxury-gray-1">{stats.new}</p>
            </ContentCard>
            <ContentCard>
              <p className="text-xs text-luxury-gray-3 mb-1">Contacted</p>
              <p className="text-2xl font-semibold text-luxury-gray-1">{stats.contacted}</p>
            </ContentCard>
            <ContentCard>
              <p className="text-xs text-luxury-gray-3 mb-1">Total Prospects</p>
              <p className="text-2xl font-semibold text-luxury-gray-1">{stats.total}</p>
            </ContentCard>
          </div>

          <ContentCard>
            <h3 className="text-sm font-semibold text-luxury-gray-1 mb-4 pb-3 border-b border-luxury-gray-5/50">
              Recent Activity
            </h3>

            {recentProspects.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-8">No prospects yet</p>
            ) : (
              <div>
                {recentProspects.map((prospect) => (
                  <div
                    key={prospect.id}
                    className="flex items-center justify-between py-3 border-b border-luxury-gray-5/50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-luxury-gray-1">
                        {prospect.preferred_first_name} {prospect.preferred_last_name}
                      </p>
                      <p className="text-xs text-luxury-gray-3">
                        {new Date(prospect.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Link
                      href={`/admin/prospects/${prospect.id}`}
                      className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
                    >
                      View
                    </Link>
                  </div>
                ))}
              </div>
            )}

            <div className="text-center mt-4">
              <Link href="/admin/prospects" className="btn btn-secondary text-sm">
                View All Prospects
              </Link>
            </div>
          </ContentCard>
        </div>

      </div>
    </div>
  )
}
