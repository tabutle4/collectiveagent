'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

export default function ProspectiveAgentForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    phone: '',
    email: '',
    location: '',
    location_other: '',
    instagram_handle: '',
    mls_choice: '',
    association_status: '',
    previous_brokerage: '',
    expectations: '',
    accountability: '',
    lead_generation: '',
    additional_info: '',
    how_heard: '',
    how_heard_other: '',
    referring_agent: '',
    joining_team: '',
  })

  // Pre-select MLS choice if type=referral in URL
  useEffect(() => {
    const type = searchParams.get('type')
    if (type === 'referral') {
      setFormData(prev => ({
        ...prev,
        mls_choice: 'Referral Collective (No MLS)',
        association_status: '',
        previous_brokerage: '',
        joining_team: '',
      }))
    }
  }, [searchParams])

  const isReferralAgent = formData.mls_choice === 'Referral Collective (No MLS)'
  const brokerageName = isReferralAgent ? 'Referral Collective' : 'Collective Realty Co.'

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target

    if (name === 'phone') {
      const digitsOnly = value.replace(/\D/g, '')
      const limitedDigits = digitsOnly.slice(0, 10)
      setFormData(prev => ({ ...prev, [name]: limitedDigits }))
      return
    }

    setFormData(prev => ({ ...prev, [name]: value }))

    if (name === 'association_status' && value === 'new_agent') {
      setFormData(prev => ({ ...prev, previous_brokerage: '' }))
    }

    if (name === 'how_heard' && value !== 'Other') {
      setFormData(prev => ({ ...prev, how_heard_other: '' }))
    }

    if (name === 'location' && value !== 'Other') {
      setFormData(prev => ({ ...prev, location_other: '' }))
    }

    // Clear association status and joining team when switching to referral
    if (name === 'mls_choice' && value === 'Referral Collective (No MLS)') {
      setFormData(prev => ({ ...prev, association_status: '', previous_brokerage: '', joining_team: '' }))
    }
  }

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const nameFields = ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name']
    if (nameFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: formatNameToTitleCase(value) }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const formattedData = {
      ...formData,
      first_name: formatNameToTitleCase(formData.first_name),
      last_name: formatNameToTitleCase(formData.last_name),
      preferred_first_name: formatNameToTitleCase(formData.preferred_first_name),
      preferred_last_name: formatNameToTitleCase(formData.preferred_last_name),
    }

    const phoneDigits = formattedData.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      setError('Phone number must be exactly 10 digits')
      return
    }

    setLoading(true)

    try {
      const response = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formattedData, phone: phoneDigits }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Submission failed')
        setLoading(false)
        return
      }

      router.push(
        `/prospective-agent-form/success?name=${encodeURIComponent(formData.preferred_first_name)}&email=${encodeURIComponent(formData.email)}`
      )
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />

        <div
          className="flex-1 max-w-2xl mx-auto w-full px-6"
          style={{ paddingTop: '120px', paddingBottom: '60px' }}
        >
          <div className="text-center mb-8">
            <h1 className="page-title mb-2">
              {!formData.mls_choice 
                ? 'Join Our Firm'
                : `Join ${brokerageName}`}
            </h1>
            <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
              {!formData.mls_choice
                ? 'First, tell us which MLS you plan to join.'
                : isReferralAgent 
                  ? 'Keep your license active, earn referral income, skip the overhead.'
                  : 'Share some details about your background and goals below.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* MLS Selection - Always First */}
            <div className="container-card">
              <h2 className="section-title">MLS Selection</h2>
              <div>
                <label className="block text-xs text-luxury-gray-3 mb-3">Which MLS will you join? *</label>
                <div className="space-y-2">
                  {['HAR', 'MetroTex | NTREIS', 'Both', 'Referral Collective (No MLS)'].map(mls => (
                    <label key={mls} className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="radio"
                        name="mls_choice"
                        value={mls}
                        checked={formData.mls_choice === mls}
                        onChange={handleChange}
                        required={mls === 'HAR'}
                      />
                      <span className="text-sm text-luxury-gray-2">{mls}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Rest of form only shows after MLS selection */}
            {formData.mls_choice && (
              <>
                {/* Contact Information */}
                <div className="container-card">
                  <h2 className="section-title">Contact Information</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">First Name (Legal) *</label>
                      <input
                        name="first_name"
                        type="text"
                        value={formData.first_name}
                        onChange={handleChange}
                        onBlur={handleNameBlur}
                        className="input-luxury"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Last Name (Legal) *</label>
                      <input
                        name="last_name"
                        type="text"
                        value={formData.last_name}
                        onChange={handleChange}
                        onBlur={handleNameBlur}
                        className="input-luxury"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Preferred First Name *</label>
                      <input
                        name="preferred_first_name"
                        type="text"
                        value={formData.preferred_first_name}
                        onChange={handleChange}
                        onBlur={handleNameBlur}
                        className="input-luxury"
                        placeholder="What you go by"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Preferred Last Name *</label>
                      <input
                        name="preferred_last_name"
                        type="text"
                        value={formData.preferred_last_name}
                        onChange={handleChange}
                        onBlur={handleNameBlur}
                        className="input-luxury"
                        placeholder="What you go by"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        Phone * <span className="text-luxury-gray-4">(10 digits)</span>
                      </label>
                      <input
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        className="input-luxury"
                        pattern="[0-9]{10}"
                        maxLength={10}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">Email *</label>
                      <input
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        className="input-luxury"
                        required
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-xs text-luxury-gray-3 mb-3">Where are you located? *</label>
                    <div className="space-y-2">
                      {['Greater Houston', 'DFW', 'Other'].map(loc => (
                        <label key={loc} className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="location"
                            value={loc}
                            checked={formData.location === loc}
                            onChange={handleChange}
                            required={loc === 'Greater Houston'}
                          />
                          <span className="text-sm text-luxury-gray-2">{loc}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {formData.location === 'Other' && (
                    <div className="mt-4">
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">City and State *</label>
                      <input
                        name="location_other"
                        type="text"
                        value={formData.location_other}
                        onChange={handleChange}
                        className="input-luxury"
                        placeholder="e.g. Austin, TX"
                        required
                      />
                    </div>
                  )}

                  <div className="mt-4">
                    <label className="block text-xs text-luxury-gray-3 mb-1.5">Instagram Handle</label>
                    <input
                      name="instagram_handle"
                      type="text"
                      value={formData.instagram_handle}
                      onChange={handleChange}
                      className="input-luxury"
                      placeholder="@yourhandle"
                    />
                  </div>
                </div>

                {/* Association Status - Only for non-referral agents */}
                {!isReferralAgent && (
                  <div className="container-card">
                    <h2 className="section-title">Association Status</h2>
                    <div className="space-y-2">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="association_status"
                          value="new_agent"
                          checked={formData.association_status === 'new_agent'}
                          onChange={handleChange}
                          className="mt-0.5"
                          required
                        />
                        <span className="text-sm text-luxury-gray-2">I am a brand new licensed agent</span>
                      </label>
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="radio"
                          name="association_status"
                          value="previous_member"
                          checked={formData.association_status === 'previous_member'}
                          onChange={handleChange}
                          className="mt-0.5"
                        />
                        <span className="text-sm text-luxury-gray-2">
                          I was previously a member of {formData.mls_choice || '[selected MLS]'} with another brokerage
                        </span>
                      </label>
                    </div>

                    {formData.association_status === 'previous_member' && (
                      <div className="mt-4">
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Previous brokerage *</label>
                        <input
                          name="previous_brokerage"
                          type="text"
                          value={formData.previous_brokerage}
                          onChange={handleChange}
                          className="input-luxury"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Your Expectations */}
                <div className="container-card">
                  <h2 className="section-title">Your Expectations</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        What expectations do you have for {brokerageName}? *
                      </label>
                      <textarea
                        name="expectations"
                        value={formData.expectations}
                        onChange={handleChange}
                        className="textarea-luxury"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        Do you want to be held accountable? *
                      </label>
                      <textarea
                        name="accountability"
                        value={formData.accountability}
                        onChange={handleChange}
                        className="textarea-luxury"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        How do you plan to produce business leads? *
                      </label>
                      <textarea
                        name="lead_generation"
                        value={formData.lead_generation}
                        onChange={handleChange}
                        className="textarea-luxury"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        Is there anything you would like to add? *
                      </label>
                      <textarea
                        name="additional_info"
                        value={formData.additional_info}
                        onChange={handleChange}
                        className="textarea-luxury"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Referral & Team Information */}
                <div className="container-card">
                  <h2 className="section-title">
                    {isReferralAgent ? 'Referral Information' : 'Referral & Team Information'}
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">How did you hear about us? *</label>
                      <select
                        name="how_heard"
                        value={formData.how_heard}
                        onChange={handleChange}
                        className="select-luxury"
                        required
                      >
                        <option value="">Select an option</option>
                        <option value="Agent referral">Agent referral</option>
                        <option value="Social media">Social media</option>
                        <option value="Google search">Google search</option>
                        <option value="Friend/family">Friend/family</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    {formData.how_heard === 'Other' && (
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">Please describe</label>
                        <input
                          name="how_heard_other"
                          type="text"
                          value={formData.how_heard_other}
                          onChange={handleChange}
                          className="input-luxury"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs text-luxury-gray-3 mb-1.5">
                        If an agent referred you, please list their name below
                      </label>
                      <input
                        name="referring_agent"
                        type="text"
                        value={formData.referring_agent}
                        onChange={handleChange}
                        className="input-luxury"
                      />
                    </div>
                    {!isReferralAgent && (
                      <div>
                        <label className="block text-xs text-luxury-gray-3 mb-1.5">
                          Are you joining a team after onboarding? If so, please list the team name or team lead below
                        </label>
                        <input
                          name="joining_team"
                          type="text"
                          value={formData.joining_team}
                          onChange={handleChange}
                          className="input-luxury"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary w-full py-3.5 text-sm tracking-widest uppercase disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit'}
                </button>
              </>
            )}
          </form>
        </div>

        <AuthFooter />
      </div>
    </div>
  )
}