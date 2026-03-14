'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const fetchCampaigns = async () => {
    try {
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('year', { ascending: false })
  
      if (error) throw error
  
      // Get completion counts for each campaign
      const campaignsWithCounts = await Promise.all(
        campaigns.map(async (campaign) => {
          try {
            const { count, error: countError } = await supabase
              .from('campaign_recipients')
              .select('*', { count: 'exact', head: true })
              .eq('campaign_id', campaign.id)
              .not('fully_completed_at', 'is', null)
            
            if (countError) {
              console.error(`Error counting recipients for campaign ${campaign.id}:`, countError)
            }
  
            return { ...campaign, completed_count: count || 0 }
          } catch (countErr) {
            console.error(`Error counting recipients for campaign ${campaign.id}:`, countErr)
            return { ...campaign, completed_count: 0 }
          }
        })
      )
  
      setCampaigns(campaignsWithCounts)
      setLoading(false)
    } catch (error: any) {
      // Create a more detailed error object for logging
      const errorDetails: any = {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        status: error?.status,
        statusText: error?.statusText,
      }
      
      // Try to get more info if available
      if (error && typeof error === 'object') {
        try {
          errorDetails.fullError = JSON.stringify(error, Object.getOwnPropertyNames(error))
        } catch {
          errorDetails.fullError = String(error)
        }
      }
      
      console.error('Error fetching campaigns:', error)
      console.error('Error details:', errorDetails)
      alert(`Error loading campaigns: ${error?.message || errorDetails.message || 'Unknown error'}. Check console for details.`)
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-5 md:mb-8 gap-4">
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury" >Campaigns</h2>
        <Link href="/admin/campaigns/builder" className="px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center btn-black w-full md:w-auto inline-block">
          Create New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="card-section text-center py-12">
          <p className="text-luxury-gray-2 mb-6">No campaigns found</p>
          <Link href="/admin/campaigns/builder" className="px-2.5 md:px-4 py-2 text-xs md:text-sm rounded transition-colors text-center btn-black inline-block">
            Create Your First Campaign
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              href={`/admin/campaigns/${campaign.id}`}
              className="card-section block hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="text-lg md:text-xl font-medium tracking-luxury flex-1">
                    {campaign.name}
                  </h3>
                    <span className={`px-2 md:px-3 py-1 rounded text-xs md:text-sm flex-shrink-0 ${campaign.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {campaign.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 text-xs md:text-sm text-luxury-gray-2">
                  {campaign.year && <span>Year: {campaign.year}</span>}
                    <span>Deadline: {new Date(campaign.deadline).toLocaleDateString()}</span>
                    {campaign.sent_at && (
                      <span>Sent: {new Date(campaign.sent_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
                <div className="text-left md:text-right border-t md:border-t-0 md:border-l border-luxury-gray-5 pt-4 md:pt-0 md:pl-6 md:pr-0">
                  <p className="text-xs md:text-sm text-luxury-gray-2 mb-1">Completed</p>
                  <p className="text-xl md:text-2xl font-light" className="text-luxury-accent">
                    {campaign.completed_count || 0}
                  </p>
</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}