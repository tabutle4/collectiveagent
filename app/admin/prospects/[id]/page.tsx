'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AdminUserProfileModal from '@/components/admin/AdminUserProfileModal'

export default function ProspectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [prospect, setProspect] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [newStatus, setNewStatus] = useState('')
  const [convertModalOpen, setConvertModalOpen] = useState(false)
  const [selectedSteps, setSelectedSteps] = useState<number[]>([])
  const [resetting, setResetting] = useState(false)
  const [resetResult, setResetResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    if (params.id) {
      fetchProspect()
    }
  }, [params.id])

  const fetchProspect = async () => {
    try {
      const res = await fetch(`/api/prospects/${params.id}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProspect(data.prospect)
      setNewStatus(data.prospect.prospect_status || 'new')
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
      const res = await fetch(`/api/prospects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_status: newStatus }),
      })
      if (!res.ok) throw new Error('Failed to update')
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
      {convertModalOpen && (
        <AdminUserProfileModal
          user={{
            ...prospect,
            status: 'active',
            role: 'agent',
            is_active: true,
            is_licensed_agent: true,
          }}
          onClose={() => setConvertModalOpen(false)}
          onSaved={updatedUser => {
            setConvertModalOpen(false)
            router.push(`/admin/users/${updatedUser.id}`)
          }}
        />
      )}

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

            <button
              onClick={() => setConvertModalOpen(true)}
              className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary"
            >
              Convert to Agent
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="container-card">
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

        <div className="container-card">
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

        <div className="container-card">
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

        <div className="container-card">
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
              <p className="font-medium">{prospect.referring_agent || 'N/A'}</p>
            </div>
            <div>
              <p className="text-luxury-gray-2">Joining Team</p>
              <p className="font-medium">{prospect.joining_team || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* ── Reset & Resend Steps ── */}
        <div className="container-card">
          <h3 className="text-lg font-medium mb-2 tracking-luxury">Reset &amp; Resend Steps</h3>
          <p className="text-sm text-luxury-gray-2 mb-5">
            Select steps to reset and send the agent an email to redo them.
          </p>

          <div className="space-y-2 mb-5">
            {[
              { step: 1, label: 'Step 1 - Your Information' },
              { step: 2, label: 'Step 2 - Onboarding Payment' },
              { step: 3, label: 'Step 3 - Independent Contractor Agreement' },
              { step: 4, label: 'Step 4 - Commission Plan Agreement' },
              { step: 5, label: 'Step 5 - Policy Manual' },
              { step: 6, label: 'Step 6 - W-9' },
            ].map(({ step, label }) => (
              <label key={step} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedSteps.includes(step)}
                  onChange={() => {
                    setSelectedSteps(prev =>
                      prev.includes(step)
                        ? prev.filter(s => s !== step)
                        : [...prev, step]
                    )
                    setResetResult(null)
                  }}
                  className="w-4 h-4 accent-luxury-accent"
                />
                <span className="text-sm text-luxury-gray-1">{label}</span>
              </label>
            ))}
          </div>

          {resetResult === 'success' && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3 mb-4">
              Steps reset and email sent successfully.
            </div>
          )}
          {resetResult === 'error' && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-3 mb-4">
              Something went wrong. Please try again.
            </div>
          )}

          <button
            onClick={async () => {
              if (selectedSteps.length === 0 || resetting) return
              setResetting(true)
              setResetResult(null)
              try {
                const res = await fetch('/api/prospects/reset-steps', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ prospect_id: params.id, steps: selectedSteps }),
                })
                if (!res.ok) throw new Error()
                setResetResult('success')
                setSelectedSteps([])
              } catch {
                setResetResult('error')
              } finally {
                setResetting(false)
              }
            }}
            disabled={selectedSteps.length === 0 || resetting}
            className="btn btn-primary text-sm px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {resetting ? 'Resetting...' : `Reset & Send Email${selectedSteps.length > 0 ? ` (${selectedSteps.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}