'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import CampaignForm from '@/components/campaigns/CampaignForm'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import { supabase } from '@/lib/supabase'

function CampaignContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const slug = params.slug as string
  const token = searchParams.get('token')
  
  const [campaign, setCampaign] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setError('Invalid campaign link. Please use the link from your email.')
      setLoading(false)
      return
    }

    if (!slug) {
      setError('Invalid campaign URL.')
      setLoading(false)
      return
    }

    fetchCampaignAndUser()
  }, [token, slug])

  const fetchCampaignAndUser = async () => {
    try {
      // Fetch campaign by slug
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (campaignError || !campaignData) {
        setError('Campaign not found or is no longer active.')
        setLoading(false)
        return
      }

      setCampaign(campaignData)

      // Verify token and get user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('campaign_token', token)
        .eq('is_active', true)
        .eq('is_licensed_agent', true)
        .single()

      if (userError || !userData) {
        setError('Invalid or expired campaign link.')
        setLoading(false)
        return
      }

      setUser(userData)
      setLoading(false)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <LuxuryHeader />
        <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <LuxuryHeader />
        <div className="max-w-2xl mx-auto px-6 py-12 text-center">
          <div className="card-section">
            <h2 className="text-2xl font-light mb-4 tracking-luxury text-red-600">
              Access Denied
            </h2>
            <p className="text-luxury-gray-1 mb-6">{error}</p>
            <p className="text-sm text-luxury-gray-2">
              Please contact the office at{' '}
              <a href="mailto:office@collectiverealtyco.com" className="text-luxury-black hover:underline">
                office@collectiverealtyco.com
              </a>
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <LuxuryHeader />
      
      <div className="max-w-6xl mx-auto px-6" style={{ paddingTop: '104px', paddingBottom: '3rem' }}>
        <CampaignForm 
          campaignId={campaign.id}
          userId={user.id}
          userData={user}
          token={token!}
          campaign={campaign}
        />
      </div>
    </div>
  )
}

export default function CampaignPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CampaignContent />
    </Suspense>
  )
}