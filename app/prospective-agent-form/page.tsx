'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import LuxuryHeader from '@/components/LuxuryHeader'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

export default function ProspectiveAgentForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    // Contact Information
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    phone: '',
    email: '',
    location: '',
    instagram_handle: '',
    
    // MLS Information
    mls_choice: '',
    association_status: '',
    previous_brokerage: '',
    
    // Expectations
    expectations: '',
    accountability: '',
    lead_generation: '',
    additional_info: '',
    
    // Referral & Team
    how_heard: '',
    how_heard_other: '',
    referring_agent: '',
    joining_team: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    
    // For phone field, strip all non-digits and limit to 10 digits
    if (name === 'phone') {
      const digitsOnly = value.replace(/\D/g, '')
      const limitedDigits = digitsOnly.slice(0, 10)
      setFormData(prev => ({ ...prev, [name]: limitedDigits }))
      return
    }
    
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear previous brokerage if switching to new agent
    if (name === 'association_status' && value === 'new_agent') {
      setFormData(prev => ({ ...prev, previous_brokerage: '' }))
    }
    
    // Clear how_heard_other if not selecting "Other"
    if (name === 'how_heard' && value !== 'Other') {
      setFormData(prev => ({ ...prev, how_heard_other: '' }))
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
    
    // Format names before submission
    const formattedData = {
      ...formData,
      first_name: formatNameToTitleCase(formData.first_name),
      last_name: formatNameToTitleCase(formData.last_name),
      preferred_first_name: formatNameToTitleCase(formData.preferred_first_name),
      preferred_last_name: formatNameToTitleCase(formData.preferred_last_name),
    }
    
    // Validate phone number is exactly 10 digits
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

      // Redirect to success page
      router.push(`/prospective-agent-form/success?name=${encodeURIComponent(formData.preferred_first_name)}&email=${encodeURIComponent(formData.email)}`)
    } catch (err) {
      setError('An error occurred. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <LuxuryHeader />
      
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-light mb-3 tracking-wide">
            Prospective Agent Form
          </h2>
          <p className="text-sm text-luxury-gray-2 max-w-2xl mx-auto">
            Interested in joining Collective Realty Co.?
            <br />
            Please share some details about your background and career objectives below.
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
              {error}
            </div>
          )}
          
          {/* Contact Information */}
          <div className="card-section">
            <h3 className="text-xl font-light mb-6 tracking-luxury uppercase">
              Contact Information
            </h3>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="first_name" className="block text-sm mb-2 text-luxury-gray-1">
                  First Name (Legal) *
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  value={formData.first_name}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="last_name" className="block text-sm mb-2 text-luxury-gray-1">
                  Last Name (Legal) *
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  value={formData.last_name}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="preferred_first_name" className="block text-sm mb-2 text-luxury-gray-1">
                  Preferred First Name *
                </label>
                <input
                  id="preferred_first_name"
                  name="preferred_first_name"
                  type="text"
                  value={formData.preferred_first_name}
                  onChange={handleChange}
                  className="input-luxury"
                  placeholder="What you go by"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="preferred_last_name" className="block text-sm mb-2 text-luxury-gray-1">
                  Preferred Last Name *
                </label>
                <input
                  id="preferred_last_name"
                  name="preferred_last_name"
                  type="text"
                  value={formData.preferred_last_name}
                  onChange={handleChange}
                  className="input-luxury"
                  placeholder="What you go by"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="phone" className="block text-sm mb-2 text-luxury-gray-1">
                  Phone * <span className="text-xs text-luxury-gray-3">(10 digits only)</span>
                </label>
                <input
                  id="phone"
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
                <label htmlFor="email" className="block text-sm mb-2 text-luxury-gray-1">
                  Email *
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
            </div>
            
            <div className="mt-6">
              <label className="block text-sm mb-3 text-luxury-gray-1">
                Where are you located? *
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="location"
                    value="Houston, TX"
                    checked={formData.location === 'Houston, TX'}
                    onChange={handleChange}
                    className="mr-3"
                    required
                  />
                  <span>Houston, TX</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="location"
                    value="Dallas, TX"
                    checked={formData.location === 'Dallas, TX'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <span>Dallas, TX</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="location"
                    value="Other"
                    checked={formData.location === 'Other'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <span>Other</span>
                </label>
              </div>
            </div>
            
            <div className="mt-6">
              <label htmlFor="instagram_handle" className="block text-sm mb-2 text-luxury-gray-1">
                Instagram Handle
              </label>
              <input
                id="instagram_handle"
                name="instagram_handle"
                type="text"
                value={formData.instagram_handle}
                onChange={handleChange}
                className="input-luxury"
                placeholder="@yourhandle"
              />
            </div>
          </div>
          
          {/* MLS Information */}
          <div className="card-section">
            <h3 className="text-xl font-light mb-6 tracking-luxury uppercase">
              MLS Information
            </h3>
            
            <div>
              <label className="block text-sm mb-3 text-luxury-gray-1">
                Which MLS will you join? *
              </label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="mls_choice"
                    value="HAR"
                    checked={formData.mls_choice === 'HAR'}
                    onChange={handleChange}
                    className="mr-3"
                    required
                  />
                  <span>HAR</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="mls_choice"
                    value="MetroTex | NTREIS"
                    checked={formData.mls_choice === 'MetroTex | NTREIS'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <span>MetroTex | NTREIS</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="mls_choice"
                    value="Both"
                    checked={formData.mls_choice === 'Both'}
                    onChange={handleChange}
                    className="mr-3"
                  />
                  <span>Both</span>
                </label>
              </div>
            </div>
            
            <div className="mt-6">
              <label className="block text-sm mb-3 text-luxury-gray-1">
                Select option that describes your association status *
              </label>
              <div className="space-y-2">
                <label className="flex items-start">
                  <input
                    type="radio"
                    name="association_status"
                    value="new_agent"
                    checked={formData.association_status === 'new_agent'}
                    onChange={handleChange}
                    className="mr-3 mt-1"
                    required
                  />
                  <span>I am a brand new licensed agent</span>
                </label>
                <label className="flex items-start">
                  <input
                    type="radio"
                    name="association_status"
                    value="previous_member"
                    checked={formData.association_status === 'previous_member'}
                    onChange={handleChange}
                    className="mr-3 mt-1"
                  />
                  <span>I was previously a member of {formData.mls_choice || '[selected MLS]'} with another brokerage</span>
                </label>
              </div>
            </div>
            
            {formData.association_status === 'previous_member' && (
              <div className="mt-6">
                <label htmlFor="previous_brokerage" className="block text-sm mb-2 text-luxury-gray-1">
                  What was your previous brokerage? *
                </label>
                <input
                  id="previous_brokerage"
                  name="previous_brokerage"
                  type="text"
                  value={formData.previous_brokerage}
                  onChange={handleChange}
                  className="input-luxury"
                  required={formData.association_status === 'previous_member'}
                />
              </div>
            )}
          </div>
          
          {/* Your Expectations */}
          <div className="card-section">
            <h3 className="text-xl font-light mb-6 tracking-luxury uppercase">
              Your Expectations
            </h3>
            
            <div className="space-y-6">
              <div>
                <label htmlFor="expectations" className="block text-sm mb-2 text-luxury-gray-1">
                  What expectations do you have for Collective Realty Co.? *
                </label>
                <textarea
                  id="expectations"
                  name="expectations"
                  value={formData.expectations}
                  onChange={handleChange}
                  className="textarea-luxury"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="accountability" className="block text-sm mb-2 text-luxury-gray-1">
                  Do you want to be held accountable? *
                </label>
                <textarea
                  id="accountability"
                  name="accountability"
                  value={formData.accountability}
                  onChange={handleChange}
                  className="textarea-luxury"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="lead_generation" className="block text-sm mb-2 text-luxury-gray-1">
                  How do you plan to produce business leads? *
                </label>
                <textarea
                  id="lead_generation"
                  name="lead_generation"
                  value={formData.lead_generation}
                  onChange={handleChange}
                  className="textarea-luxury"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="additional_info" className="block text-sm mb-2 text-luxury-gray-1">
                  Is there anything you would like to add? *
                </label>
                <textarea
                  id="additional_info"
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
          <div className="card-section">
            <h3 className="text-xl font-light mb-6 tracking-luxury uppercase">
              Referral & Team Information
            </h3>
            
            <div className="space-y-6">
              <div>
                <label htmlFor="how_heard" className="block text-sm mb-2 text-luxury-gray-1">
                  How did you hear about us? *
                </label>
                <select
                  id="how_heard"
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
                  <label htmlFor="how_heard_other" className="block text-sm mb-2 text-luxury-gray-1">
                    If other, please describe:
                  </label>
                  <input
                    id="how_heard_other"
                    name="how_heard_other"
                    type="text"
                    value={formData.how_heard_other}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
              )}
              
              <div>
                <label htmlFor="referring_agent" className="block text-sm mb-2 text-luxury-gray-1">
                  If an agent referred you, please list their name below
                </label>
                <input
                  id="referring_agent"
                  name="referring_agent"
                  type="text"
                  value={formData.referring_agent}
                  onChange={handleChange}
                  className="input-luxury"
                />
              </div>
              
              <div>
                <label htmlFor="joining_team" className="block text-sm mb-2 text-luxury-gray-1">
                  Are you joining a team after onboarding? If so, please list the team name or team lead below
                </label>
                <input
                  id="joining_team"
                  name="joining_team"
                  type="text"
                  value={formData.joining_team}
                  onChange={handleChange}
                  className="input-luxury"
                />
              </div>
            </div>
          </div>
          
          <div className="text-center pt-6">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-black px-16"
            >
              {loading ? 'Submitting...' : 'Submit Form'}
            </button>
          </div>
        </form>
      </div>
      
      <div className="bg-gradient-to-br from-luxury-dark-3 to-luxury-dark-2 py-12 mt-16">
        <p className="text-center text-luxury-gray-4 text-sm italic tracking-luxury">
          © 2025 Collective Realty Co. All rights reserved.
        </p>
      </div>
    </div>
  )
}
