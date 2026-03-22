'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns/list')
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to load campaigns')

      setCampaigns(data.campaigns || [])
      setLoading(false)
    } catch (error: any) {
      console.error('Error fetching campaigns:', error)
      alert(`Error loading campaigns: ${error?.message || 'Unknown error'}. Check console for details.`)
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">CAMPAIGNS</h1>
        <Link href="/admin/campaigns/builder" className="btn btn-primary">
          Create New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="container-card text-center py-12">
          <p className="text-sm text-luxury-gray-3 mb-6">No campaigns found</p>
          <Link href="/admin/campaigns/builder" className="btn btn-primary">
            Create Your First Campaign
          </Link>
        </div>
      ) : (
        <div className="container-card">
          <div className="space-y-3">
            {campaigns.map(campaign => (
              <Link
                key={campaign.id}
                href={`/admin/campaigns/${campaign.id}`}
                className="inner-card block hover:bg-luxury-gray-5/60 transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1.5">
                      <h3 className="text-sm font-semibold text-luxury-gray-1">{campaign.name}</h3>
                      <span
                        className={`text-xs px-2.5 py-1 rounded font-medium ${campaign.is_active ? 'bg-green-50 text-green-700' : 'bg-luxury-gray-5/40 text-luxury-gray-3'}`}
                      >
                        {campaign.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-luxury-gray-3">
                      {campaign.year && <span>Year: {campaign.year}</span>}
                      <span>Deadline: {new Date(campaign.deadline).toLocaleDateString()}</span>
                      {campaign.sent_at && (
                        <span>Sent: {new Date(campaign.sent_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-left md:text-right flex-shrink-0">
                    <p className="text-xs text-luxury-gray-3">Completed</p>
                    <p className="text-2xl font-semibold text-luxury-accent">
                      {campaign.completed_count || 0}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}