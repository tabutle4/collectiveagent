'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    year: new Date().getFullYear() + 1,
    deadline: '',
    event_staff_email: '',
    is_active: true,
    email_subject: '',
    email_body: '',
  })

  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.name || !formData.slug || !formData.deadline) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/campaigns/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create campaign')
      }

      router.push(`/admin/campaigns/${data.campaign.id}`)
    } catch (err: any) {
      console.error('Error creating campaign:', err)
      setError(err.message || 'Failed to create campaign')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <Link
          href="/admin/campaigns"
          className="text-sm text-luxury-gray-2 hover:text-luxury-black transition-colors mb-4 inline-block"
        >
          ← Back to Campaigns
        </Link>

        <h2 className="text-xl md:text-2xl font-semibold tracking-wide mb-5 md:mb-8">
          Create New Campaign
        </h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="container-card">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => handleNameChange(e.target.value)}
              className="input-luxury"
              placeholder="2027 Plan Selection"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              This will be displayed to agents on the campaign form
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={e => setFormData({ ...formData, slug: e.target.value })}
              className="input-luxury"
              placeholder="2027-plan-selection"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              URL: yoursite.com/campaign/<strong>{formData.slug || 'slug-here'}</strong>?token=...
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Year (Optional)</label>
            <input
              type="number"
              value={formData.year}
              onChange={e => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
              className="input-luxury"
              placeholder="2027"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Leave blank for non-annual campaigns like surveys or onboarding
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Deadline <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.deadline}
              onChange={e => setFormData({ ...formData, deadline: e.target.value })}
              className="input-luxury"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">Last day agents can submit responses</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Event Staff Email (Optional)</label>
            <input
              type="email"
              value={formData.event_staff_email}
              onChange={e => setFormData({ ...formData, event_staff_email: e.target.value })}
              className="input-luxury"
              placeholder="event@venue.com"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">RSVP lists will be sent to this email</p>
          </div>

          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Campaign is Active</span>
            </label>
            <p className="text-xs text-luxury-gray-2 mt-1 ml-7">
              Only active campaigns can be accessed by agents
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email Subject (Optional)</label>
            <input
              type="text"
              value={formData.email_subject}
              onChange={e => setFormData({ ...formData, email_subject: e.target.value })}
              className="input-luxury"
              placeholder="Action Required: Complete Your 2027 Plan Selection"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Subject line for campaign invitation emails
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Email Body Template (Optional)</label>
            <textarea
              value={formData.email_body}
              onChange={e => setFormData({ ...formData, email_body: e.target.value })}
              className="textarea-luxury"
              rows={8}
              placeholder="Hi {first_name},

It's time to complete your annual plan selection for 2027...

Click here to get started: {campaign_link}

Deadline: {deadline}

Thanks!
Collective Realty Co."
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Available variables: {'{first_name}'}, {'{last_name}'}, {'{campaign_link}'},{' '}
              {'{deadline}'}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <Link
            href="/admin/campaigns"
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-secondary inline-block"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}