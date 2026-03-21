'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function ProspectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [prospect, setProspect] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newStatus, setNewStatus] = useState('')

  useEffect(() => {
    if (params.id) {
      fetchProspect()
    }
  }, [params.id])

  const fetchProspect = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', params.id)
        .eq('status', 'prospect')
        .single()

      if (error) throw error

      setProspect(data)
      setNewStatus(data.prospect_status || 'new')
      setLoading(false)
    } catch (error) {
      console.error('Error fetching prospect:', error)
      setLoading(false)
    }
  }

  const updateStatus = async () => {
    if (!prospect || newStatus === prospect.prospect_status) return

    setUpdating(true)
    try {
      const { error } = await supabase
        .from('users')
        .update({ prospect_status: newStatus })
        .eq('id', prospect.id)

      if (error) throw error

      setProspect({ ...prospect, prospect_status: newStatus })
      alert('Status updated successfully')
    } catch (error) {
      console.error('Error updating status:', error)
      alert('Failed to update status')
    }
    setUpdating(false)
  }

  if (loading) {
    return <div className="text-center py-12 text-luxury-gray-2">Loading...</div>
  }

  if (!prospect) {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-2 mb-6">Prospect not found</p>
        <Link
          href="/admin/prospects"
          className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary inline-block"
        >
          Back to Prospects
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/prospects"
          className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block"
        >
          ← Back to Prospects
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-4 md:mb-6">
              {prospect.preferred_first_name} {prospect.preferred_last_name}
            </h2>
            <p className="text-luxury-gray-2">
              {prospect.email} • {prospect.phone}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="select-luxury"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="scheduled">Scheduled</option>
              <option value="joined">Joined</option>
              <option value="not_interested">Not Interested</option>
            </select>

            {newStatus !== prospect.prospect_status && (
              <button
                onClick={updateStatus}
                disabled={updating}
                className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {updating ? 'Updating...' : 'Update Status'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="card-section">
          <h3 className="text-lg font-medium mb-4 tracking-luxury">Contact Information</h3>
          <div className="grid md:grid-cols-2 gap-4 text-base">
            <div>
              <p className="text-luxury-gray-2">Legal Name</p>
              <p className="font-medium">
                {prospect.first_name} {prospect.last_name}
              </p>
            </div>
            <div>
              <p className="text-luxury-gray-2">Location</p>
              <p className="font-medium">{prospect.location}</p>
            </div>
            {prospect.instagram_handle && (
              <div>
                <p className="text-luxury-gray-2">Instagram</p>
                <p className="font-medium">@{prospect.instagram_handle}</p>
              </div>
            )}
            <div>
              <p className="text-luxury-gray-2">Submitted</p>
              <p className="font-medium">{new Date(prospect.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="card-section">
          <h3 className="text-lg font-medium mb-4 tracking-luxury">MLS Information</h3>
          <div className="space-y-3 text-base">
            <div>
              <p className="text-luxury-gray-2">MLS Choice</p>
              <p className="font-medium">{prospect.mls_choice}</p>
            </div>
            <div>
              <p className="text-luxury-gray-2">Association Status</p>
              <p className="font-medium">
                {prospect.association_status_on_join === 'new_agent'
                  ? 'Brand new licensed agent'
                  : 'Previously a member with another brokerage'}
              </p>
            </div>
            {prospect.previous_brokerage && (
              <div>
                <p className="text-luxury-gray-2">Previous Brokerage</p>
                <p className="font-medium">{prospect.previous_brokerage}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card-section">
          <h3 className="text-lg font-medium mb-4 tracking-luxury">Expectations</h3>
          <div className="space-y-4 text-base">
            <div>
              <p className="text-luxury-gray-2 font-medium mb-1">
                What expectations do you have for Collective Realty Co.?
              </p>
              <p className="text-luxury-gray-1 italic">"{prospect.expectations}"</p>
            </div>
            <div>
              <p className="text-luxury-gray-2 font-medium mb-1">
                Do you want to be held accountable?
              </p>
              <p className="text-luxury-gray-1 italic">"{prospect.accountability}"</p>
            </div>
            <div>
              <p className="text-luxury-gray-2 font-medium mb-1">
                How do you plan to produce business leads?
              </p>
              <p className="text-luxury-gray-1 italic">"{prospect.lead_generation}"</p>
            </div>
            <div>
              <p className="text-luxury-gray-2 font-medium mb-1">
                Is there anything you would like to add?
              </p>
              <p className="text-luxury-gray-1 italic">"{prospect.additional_info}"</p>
            </div>
          </div>
        </div>

        <div className="card-section">
          <h3 className="text-lg font-medium mb-4 tracking-luxury">Referral & Team Information</h3>
          <div className="space-y-3 text-base">
            <div>
              <p className="text-luxury-gray-2">How did you hear about us?</p>
              <p className="font-medium">
                {prospect.how_heard}
                {prospect.how_heard_other && ` - ${prospect.how_heard_other}`}
              </p>
            </div>
            <div>
              <p className="text-luxury-gray-2">Referring Agent</p>
              <p className="font-medium">{prospect.referred_by_agent || 'N/A'}</p>
            </div>
            <div>
              <p className="text-luxury-gray-2">Joining Team</p>
              <p className="font-medium">{prospect.joining_team || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
