'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Button } from '@/components/ui'

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
      <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-5 md:mb-8" style={{ fontWeight: '600' }}>
        Admin Dashboard
      </h2>

      {/* Stats */}
      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <Card className="p-5 text-center">
          <div className="text-2xl md:text-3xl font-light mb-1" style={{ color: '#C9A961' }}>
            {stats.new}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            New Prospects
          </div>
        </Card>
        
        <Card className="p-5 text-center">
          <div className="text-2xl md:text-3xl font-light mb-1" style={{ color: '#C9A961' }}>
            {stats.contacted}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            Contacted
          </div>
        </Card>
        
        <Card className="p-5 text-center">
          <div className="text-2xl md:text-3xl font-light mb-1" style={{ color: '#C9A961' }}>
            {stats.total}
          </div>
          <div className="text-base text-luxury-gray-2 tracking-wide">
            Total Prospects
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
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
          <Link href="/admin/prospects">
            <Button variant="outline" size="md">
              View All Prospects
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  )
}
