'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

export default function NewCampaignPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    year: new Date().getFullYear() + 1, // Default to next year
    deadline: '',
    event_staff_email: '',
    is_active: true,
    email_subject: '',
    email_body: '',
  })

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      slug: name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validation
    if (!formData.name || !formData.slug || !formData.deadline) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)

    try {
      // Check if slug already exists and find a unique one
      let uniqueSlug = formData.slug.trim()
      let attempt = 1
      
      while (attempt <= 10) {
        const { data: existing, error: checkError } = await supabase
          .from('campaigns')
          .select('id')
          .eq('slug', uniqueSlug)
          .maybeSingle()

        if (checkError && checkError.code !== 'PGRST116') {
          // Unexpected error during check
          console.error('Error checking slug uniqueness:', checkError)
        }

        // If no record found, slug is available
        if (!existing) {
          // Slug is available
          break
        }

        // Slug exists, append number
        attempt++
        uniqueSlug = `${formData.slug.trim()}-${attempt}`
      }

      if (attempt > 10) {
        throw new Error('Unable to generate a unique slug after 10 attempts. Please modify the slug manually.')
      }

      // Update slug if it was changed
      if (uniqueSlug !== formData.slug) {
        setFormData(prev => ({ ...prev, slug: uniqueSlug }))
      }

      // Prepare insert data
      const insertData = {
        name: formData.name.trim(),
        slug: uniqueSlug.trim(),
        year: formData.year || null,
        deadline: formData.deadline,
        event_staff_email: formData.event_staff_email?.trim() || null,
        is_active: formData.is_active,
        email_subject: formData.email_subject?.trim() || null,
        email_body: formData.email_body?.trim() || null,
      }

      // Log the data being inserted for debugging
      console.log('Inserting campaign with data:', insertData)

      // Validate required fields before insert
      if (!insertData.name || !insertData.slug || !insertData.deadline) {
        throw new Error('Campaign name, slug, and deadline are required fields.')
      }

      const { data, error: insertError } = await supabase
        .from('campaigns')
        .insert([insertData])
        .select()
        .single()

      if (insertError) {
        // Log all error properties explicitly since Supabase errors don't always serialize well
        const errorInfo: any = {}
        try {
          errorInfo.message = insertError.message
          errorInfo.code = insertError.code
          errorInfo.details = insertError.details
          errorInfo.hint = insertError.hint
          // PostgrestError doesn't have status/statusText, but check if they exist
          if ('status' in insertError) {
            errorInfo.status = (insertError as any).status
          }
          if ('statusText' in insertError) {
            errorInfo.statusText = (insertError as any).statusText
          }
          
          // Try to stringify the whole object
          const errorStr = JSON.stringify(insertError, (key, value) => {
            // Include all properties including non-enumerable ones
            if (typeof value === 'object' && value !== null) {
              const props: any = {}
              for (const prop in value) {
                props[prop] = value[prop]
              }
              // Also try to get non-enumerable properties
              try {
                Object.getOwnPropertyNames(value).forEach(name => {
                  if (!(name in props)) {
                    try {
                      props[name] = (value as any)[name]
                    } catch {}
                  }
                })
              } catch {}
              return props
            }
            return value
          }, 2)
          console.error('Insert error full details:', errorStr)
        } catch (logErr) {
          console.error('Could not log error details:', logErr)
        }
        
        console.error('Insert error info:', errorInfo)
        
        // Create a more informative error
        const errorMessage = insertError.message || 
                            insertError.details || 
                            insertError.hint || 
                            'Unknown error occurred'
        const enhancedError = new Error(errorMessage)
        ;(enhancedError as any).code = insertError.code
        ;(enhancedError as any).details = insertError.details
        ;(enhancedError as any).hint = insertError.hint
        ;(enhancedError as any).originalError = insertError
        throw enhancedError
      }

      if (!data) {
        throw new Error('Campaign was not created. No data returned.')
      }

      // Redirect to the new campaign's detail page
      router.push(`/admin/campaigns/${data.id}`)
    } catch (err: any) {
      // Comprehensive error logging with better extraction
      const errorDetails: any = {
        message: err?.message,
        code: err?.code || err?.error_code,
        details: err?.details,
        hint: err?.hint,
        status: err?.status,
        statusText: err?.statusText,
        type: typeof err,
        constructor: err?.constructor?.name,
        keys: Object.keys(err || {})
      }
      
      // Try to access originalError if it exists
      if (err?.originalError) {
        errorDetails.originalError = {
          message: err.originalError.message,
          code: err.originalError.code,
          details: err.originalError.details,
          hint: err.originalError.hint
        }
      }
      
      console.error('Error creating campaign - Full details:', errorDetails)
      
      // Try to stringify the error
      try {
        const errorStr = JSON.stringify(err, (key, value) => {
          if (typeof value === 'object' && value !== null && !(value instanceof Error)) {
            const props: any = {}
            try {
              Object.getOwnPropertyNames(value).forEach(name => {
                try {
                  props[name] = (value as any)[name]
                } catch {}
              })
            } catch {}
            return props
          }
          return value
        }, 2)
        console.error('Error JSON:', errorStr)
      } catch (stringifyErr) {
        console.error('Could not stringify error:', stringifyErr)
      }

      // Handle Supabase unique constraint violation
      const errorCode = err?.code || err?.error_code || (err?.details?.includes('unique') ? '23505' : null)
      
      if (errorCode === '23505' || errorCode === 'PGRST116' || err?.message?.toLowerCase().includes('unique') || err?.message?.toLowerCase().includes('duplicate')) {
        setError('A campaign with this slug already exists. Please try a different slug.')
      } else if (err?.message) {
        setError(err.message)
      } else if (err?.details) {
        setError(err.details)
      } else {
        setError('Failed to create campaign. Please check the console for details and try again.')
      }
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
        
        <h2 className="text-xl md:text-2xl font-semibold tracking-luxury mb-5 md:mb-8" style={{ fontWeight: '600' }}>
          Create New Campaign
        </h2>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-800 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card-section">
        <div className="space-y-6">
          {/* Campaign Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="input-luxury"
              placeholder="2027 Plan Selection"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              This will be displayed to agents on the campaign form
            </p>
          </div>

          {/* Slug */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="input-luxury"
              placeholder="2027-plan-selection"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              URL: yoursite.com/campaign/<strong>{formData.slug || 'slug-here'}</strong>?token=...
            </p>
          </div>

          {/* Year (Optional) */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Year (Optional)
            </label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 0 })}
              className="input-luxury"
              placeholder="2027"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Leave blank for non-annual campaigns like surveys or onboarding
            </p>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Deadline <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.deadline}
              onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
              className="input-luxury"
              required
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Last day agents can submit responses
            </p>
          </div>

          {/* Event Staff Email */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Event Staff Email (Optional)
            </label>
            <input
              type="email"
              value={formData.event_staff_email}
              onChange={(e) => setFormData({ ...formData, event_staff_email: e.target.value })}
              className="input-luxury"
              placeholder="event@venue.com"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              RSVP lists will be sent to this email
            </p>
          </div>

          {/* Is Active */}
          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_active}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium">Campaign is Active</span>
            </label>
            <p className="text-xs text-luxury-gray-2 mt-1 ml-7">
              Only active campaigns can be accessed by agents
            </p>
          </div>

          {/* Email Subject */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Subject (Optional)
            </label>
            <input
              type="text"
              value={formData.email_subject}
              onChange={(e) => setFormData({ ...formData, email_subject: e.target.value })}
              className="input-luxury"
              placeholder="Action Required: Complete Your 2027 Plan Selection"
            />
            <p className="text-xs text-luxury-gray-2 mt-1">
              Subject line for campaign invitation emails
            </p>
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Email Body Template (Optional)
            </label>
            <textarea
              value={formData.email_body}
              onChange={(e) => setFormData({ ...formData, email_body: e.target.value })}
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
              Available variables: {'{first_name}'}, {'{last_name}'}, {'{campaign_link}'}, {'{deadline}'}
            </p>
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4">
          <button
            type="submit"
            disabled={loading}
            className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Campaign'}
          </button>
          <Link href="/admin/campaigns" className="px-3 md:px-4 py-2.5 md:py-2 text-xs md:text-sm rounded transition-colors text-center btn-white inline-block">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}