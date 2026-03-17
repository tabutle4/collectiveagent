'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

const STEPS = [
  { id: 1, label: 'Join Form' },
  { id: 2, label: 'Payment' },
  { id: 3, label: 'ICA' },
  { id: 4, label: 'Commission Plan' },
  { id: 5, label: 'Policy Manual' },
  { id: 6, label: 'W-9' },
  { id: 7, label: 'TREC' },
]

export default function OnboardingPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [prospect, setProspect] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [invalid, setInvalid] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [joinForm, setJoinForm] = useState({
    // Pre-filled from prospect record
    first_name: '',
    last_name: '',
    preferred_first_name: '',
    preferred_last_name: '',
    email: '',
    phone: '',
    location: '',
    // Additional fields from join form
    personal_phone: '',
    business_phone: '',
    shipping_address_line1: '',
    shipping_address_line2: '',
    shipping_city: '',
    shipping_state: 'TX',
    shipping_zip: '',
    date_of_birth: '',
    license_number: '',
    commission_plan: '',
    mls_id: '',
    nrds_id: '',
    association: '',
    association_status_on_join: '',
    referring_agent: '',
    joining_team: '',
    instagram_handle: '',
    tiktok_handle: '',
    threads_handle: '',
    youtube_url: '',
    linkedin_url: '',
    facebook_url: '',
  })

  useEffect(() => {
    if (!token) return
    verifyToken()
  }, [token])

  const verifyToken = async () => {
    try {
      // Use a prospect-specific token verification
      const res = await fetch(`/api/onboarding/verify?token=${token}`)
      if (!res.ok) { setInvalid(true); setLoading(false); return }
      const data = await res.json()
      const p = data.prospect
      setProspect(p)

      // Pre-fill join form from prospect data
      setJoinForm(prev => ({
        ...prev,
        first_name: p.first_name || '',
        last_name: p.last_name || '',
        preferred_first_name: p.preferred_first_name || '',
        preferred_last_name: p.preferred_last_name || '',
        email: p.email || '',
        phone: p.phone || '',
        location: p.location || '',
        personal_phone: p.personal_phone || p.phone || '',
        instagram_handle: p.instagram_handle || '',
        referring_agent: p.referring_agent || '',
        joining_team: p.joining_team || '',
        association_status_on_join: p.association_status_on_join || '',
        commission_plan: p.commission_plan || '',
        mls_id: p.mls_id || '',
        association: p.association || '',
      }))

      // Determine current step from onboarding session
      if (data.session) {
        setCurrentStep(data.session.current_step || 1)
      }
    } catch {
      setInvalid(true)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'phone' || name === 'personal_phone' || name === 'business_phone') {
      const digits = value.replace(/\D/g, '').slice(0, 10)
      setJoinForm(prev => ({ ...prev, [name]: digits }))
      return
    }
    setJoinForm(prev => ({ ...prev, [name]: value }))
  }

  const handleNameBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    const nameFields = ['first_name', 'last_name', 'preferred_first_name', 'preferred_last_name']
    if (nameFields.includes(name)) {
      setJoinForm(prev => ({ ...prev, [name]: formatNameToTitleCase(value) }))
    }
  }

  const handleSubmitJoinForm = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/onboarding/submit-join-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...joinForm }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      setCurrentStep(2)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center">
        <p className="text-sm text-[#555555]">Loading your onboarding...</p>
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-[#F9F9F9] flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-3">Link Not Found</h1>
          <p className="text-sm text-[#555555]">This onboarding link is invalid or has expired. Please contact the office at <a href="mailto:office@collectiverealtyco.com" className="text-[#C5A278] hover:underline">office@collectiverealtyco.com</a>.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9F9F9]">
      {/* Header */}
      <div className="bg-[#1A1A1A] py-6 px-6 text-center">
        <p className="text-white text-xs tracking-[4px] uppercase font-light">Collective Realty Co.</p>
        <p className="text-[#C5A278] text-xs tracking-[2px] mt-1">The Coaching Brokerage</p>
      </div>

      {/* Progress */}
      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                  currentStep > step.id ? 'bg-green-600 text-white' :
                  currentStep === step.id ? 'bg-[#C5A278] text-white' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {currentStep > step.id ? '✓' : step.id}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-0.5 w-full mx-1 ${currentStep > step.id ? 'bg-green-600' : 'bg-gray-100'}`} style={{ minWidth: '16px' }} />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-center text-[#555555] mt-1">
            Step {currentStep} of {STEPS.length} — {STEPS[currentStep - 1]?.label}
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Step 1 — Join Form */}
        {currentStep === 1 && (
          <form onSubmit={handleSubmitJoinForm} className="space-y-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-2">Welcome, {prospect?.preferred_first_name}.</h1>
              <p className="text-sm text-[#555555]">Let's get you set up. Please confirm your information and fill in the remaining details below.</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Personal Information */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Legal First Name *</label>
                  <input name="first_name" value={joinForm.first_name} onChange={handleChange} onBlur={handleNameBlur} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Legal Last Name *</label>
                  <input name="last_name" value={joinForm.last_name} onChange={handleChange} onBlur={handleNameBlur} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Preferred First Name *</label>
                  <input name="preferred_first_name" value={joinForm.preferred_first_name} onChange={handleChange} onBlur={handleNameBlur} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Preferred Last Name *</label>
                  <input name="preferred_last_name" value={joinForm.preferred_last_name} onChange={handleChange} onBlur={handleNameBlur} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Personal Phone *</label>
                  <input name="personal_phone" value={joinForm.personal_phone} onChange={handleChange} required maxLength={10} className="input-luxury" placeholder="10 digits" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Business Phone</label>
                  <input name="business_phone" value={joinForm.business_phone} onChange={handleChange} maxLength={10} className="input-luxury" placeholder="10 digits" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Date of Birth *</label>
                  <input name="date_of_birth" type="date" value={joinForm.date_of_birth} onChange={handleChange} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Email *</label>
                  <input name="email" type="email" value={joinForm.email} readOnly className="input-luxury bg-gray-50 text-[#555555]" />
                </div>
              </div>
            </div>

            {/* Shipping Address */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">Shipping Address</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Address Line 1 *</label>
                  <input name="shipping_address_line1" value={joinForm.shipping_address_line1} onChange={handleChange} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Address Line 2</label>
                  <input name="shipping_address_line2" value={joinForm.shipping_address_line2} onChange={handleChange} className="input-luxury" placeholder="Apt, Suite, Unit" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-1">
                    <label className="block text-xs text-[#555555] mb-1.5">City *</label>
                    <input name="shipping_city" value={joinForm.shipping_city} onChange={handleChange} required className="input-luxury" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#555555] mb-1.5">State *</label>
                    <input name="shipping_state" value={joinForm.shipping_state} onChange={handleChange} required className="input-luxury" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#555555] mb-1.5">ZIP *</label>
                    <input name="shipping_zip" value={joinForm.shipping_zip} onChange={handleChange} required maxLength={5} className="input-luxury" />
                  </div>
                </div>
              </div>
            </div>

            {/* License & MLS */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">License & MLS</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">TX License Number *</label>
                  <input name="license_number" value={joinForm.license_number} onChange={handleChange} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">MLS ID *</label>
                  <input name="mls_id" value={joinForm.mls_id} onChange={handleChange} required className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">NRDS ID</label>
                  <input name="nrds_id" value={joinForm.nrds_id} onChange={handleChange} className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Association *</label>
                  <select name="association" value={joinForm.association} onChange={handleChange} required className="input-luxury">
                    <option value="">Select</option>
                    <option value="HAR">HAR</option>
                    <option value="MetroTex | NTREIS">MetroTex | NTREIS</option>
                    <option value="Both">Both</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-[#555555] mb-1.5">Association Status *</label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-2 text-sm text-[#1A1A1A]">
                      <input type="radio" name="association_status_on_join" value="new_agent" checked={joinForm.association_status_on_join === 'new_agent'} onChange={handleChange} required className="mt-0.5" />
                      I am a brand new licensed agent
                    </label>
                    <label className="flex items-start gap-2 text-sm text-[#1A1A1A]">
                      <input type="radio" name="association_status_on_join" value="previous_member" checked={joinForm.association_status_on_join === 'previous_member'} onChange={handleChange} className="mt-0.5" />
                      I was previously a member with another brokerage
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Commission Plan */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">Commission Plan *</h2>
              <div className="space-y-2">
                {['New Agent Plan', 'No Cap Plan', 'Cap Plan'].map(plan => (
                  <label key={plan} className="flex items-center gap-2 text-sm text-[#1A1A1A] cursor-pointer">
                    <input type="radio" name="commission_plan" value={plan} checked={joinForm.commission_plan === plan} onChange={handleChange} required />
                    {plan}
                  </label>
                ))}
              </div>
              <p className="text-xs text-[#555555] mt-3">Select the plan offered to you. If you were offered a custom plan, contact the office.</p>
            </div>

            {/* Social Media */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">Social Media</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Instagram</label>
                  <input name="instagram_handle" value={joinForm.instagram_handle} onChange={handleChange} className="input-luxury" placeholder="@handle" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">TikTok</label>
                  <input name="tiktok_handle" value={joinForm.tiktok_handle} onChange={handleChange} className="input-luxury" placeholder="@handle" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Threads</label>
                  <input name="threads_handle" value={joinForm.threads_handle} onChange={handleChange} className="input-luxury" placeholder="@handle" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">LinkedIn</label>
                  <input name="linkedin_url" value={joinForm.linkedin_url} onChange={handleChange} className="input-luxury" placeholder="linkedin.com/in/..." />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Facebook</label>
                  <input name="facebook_url" value={joinForm.facebook_url} onChange={handleChange} className="input-luxury" placeholder="facebook.com/..." />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">YouTube</label>
                  <input name="youtube_url" value={joinForm.youtube_url} onChange={handleChange} className="input-luxury" placeholder="youtube.com/..." />
                </div>
              </div>
            </div>

            {/* Referral */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
              <h2 className="text-xs font-semibold text-[#555555] uppercase tracking-widest mb-5">Referral & Team</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Referring Agent</label>
                  <input name="referring_agent" value={joinForm.referring_agent} onChange={handleChange} className="input-luxury" />
                </div>
                <div>
                  <label className="block text-xs text-[#555555] mb-1.5">Joining Team (name or team lead)</label>
                  <input name="joining_team" value={joinForm.joining_team} onChange={handleChange} className="input-luxury" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 bg-[#1A1A1A] text-white text-sm tracking-widest uppercase font-light hover:bg-[#C5A278] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Continue to Payment →'}
            </button>
          </form>
        )}

        {/* Steps 2-7 — placeholders until built */}
        {currentStep === 2 && (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-3">Step 2: Payment</h2>
            <p className="text-sm text-[#555555]">Coming soon — payment step.</p>
          </div>
        )}
        {currentStep > 2 && (
          <div className="text-center py-16">
            <h2 className="text-xl font-semibold text-[#1A1A1A] mb-3">Step {currentStep}: {STEPS[currentStep - 1]?.label}</h2>
            <p className="text-sm text-[#555555]">This step is being built.</p>
          </div>
        )}
      </div>

      <div className="bg-[#1A1A1A] py-8 text-center mt-16">
        <p className="text-[#555555] text-xs tracking-widest">© 2026 Collective Realty Co. All rights reserved.</p>
      </div>
    </div>
  )
}