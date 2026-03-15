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
    } catch (error) {
      console.error('Error fetching prospects:', error)
    } finally {
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
      <h1 className="page-title mb-6">DASHBOARD</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* Left container card - Needs Attention */}
        <div className="lg:col-span-5">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Needs Attention</h2>

            <div className="space-y-3">
              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Compliance Requested</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions awaiting compliance review</p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Approved - CDA Needed</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions ready for CDA</p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Eligible for Payout</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No transactions eligible for payout</p>
              </div>

              <div className="inner-card">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-semibold text-luxury-gray-1">Broker Approval Pending</p>
                  <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
                </div>
                <p className="text-xs text-luxury-gray-3">No CDAs awaiting broker approval</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right container card - Overview */}
        <div className="lg:col-span-7">
          <div className="container-card h-full">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Overview</h2>

            {/* Stats row - flat inner cards */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">New Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.new}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Contacted</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.contacted}</p>
              </div>
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-3 mb-1">Total Prospects</p>
                <p className="text-2xl font-semibold text-luxury-accent">{stats.total}</p>
              </div>
            </div>

            {/* Contact submissions - flat inner card */}
            <div className="inner-card mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm font-semibold text-luxury-gray-1">Contact Submissions</p>
                <span className="text-xs font-semibold text-luxury-accent bg-luxury-accent/10 px-2.5 py-1 rounded">0</span>
              </div>
              <p className="text-xs text-luxury-gray-3 mb-2">No new contact submissions</p>
              <Link href="/admin/contact-submissions" className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors">
                View all submissions
              </Link>
            </div>

            {/* Recent Activity - flat inner card */}
            <div className="inner-card">
              <h3 className="text-sm font-semibold text-luxury-gray-1 mb-3 pb-3 border-b border-luxury-gray-5/50">
                Recent Activity
              </h3>

              {recentProspects.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">No prospects yet</p>
              ) : (
                <div>
                  {recentProspects.map((prospect) => (
                    <div
                      key={prospect.id}
                      className="flex items-center justify-between py-2.5 border-b border-luxury-gray-5/50 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-luxury-gray-1">
                          {prospect.preferred_first_name} {prospect.preferred_last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {new Date(prospect.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Link
                        href={`/admin/prospects/${prospect.id}`}
                        className="text-xs text-luxury-accent hover:text-luxury-gray-1 transition-colors"
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
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}