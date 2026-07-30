'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export default function ReferralForm() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me')
        if (!response.ok) {
          router.push('/auth/login')
          return
        }
        const data = await response.json()
        setUser(data.user)
      } catch {
        router.push('/auth/login')
      }
    }
    if (!user) fetchUser()
  }, [router, user])

  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitResult, setSubmitResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [agreementFile, setAgreementFile] = useState<File | null>(null)

  const [formData, setFormData] = useState({
    closing_side: '' as '' | 'crc' | 'external',
    closing_brokerage: '',
    closing_contact_name: '',
    closing_contact_email: '',
    lead_name: '',
    lead_email: '',
    lead_phone: '',
    referral_type: '' as '' | 'sale' | 'lease' | 'apartment',
    fee_terms: '',
    notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const payload = new FormData()
      Object.entries(formData).forEach(([key, value]) => payload.append(key, value))
      if (agreementFile) payload.append('agreement', agreementFile)

      const res = await fetch('/api/agent/forms/referral', { method: 'POST', body: payload })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.')
        setLoading(false)
        return
      }

      setSubmitResult(data)
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Success screen. Mirrors the just-listed form so the two feel the same.
  if (submitted && submitResult) {
    return (
      <div className="min-h-screen bg-luxury-light py-8 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="container-card">
            <div className="flex flex-col items-center py-12 text-center gap-4">
              <CheckCircle2 size={40} className="text-green-600" />
              <p className="text-sm font-semibold text-luxury-gray-1">Submitted successfully</p>
              <p className="text-xs text-luxury-gray-3 max-w-sm">{submitResult.message}</p>
              <button
                onClick={() => {
                  setSubmitted(false)
                  setSubmitResult(null)
                  setAgreementFile(null)
                  setFormData({
                    closing_side: '',
                    closing_brokerage: '',
                    closing_contact_name: '',
                    closing_contact_email: '',
                    lead_name: '',
                    lead_email: '',
                    lead_phone: '',
                    referral_type: '',
                    fee_terms: '',
                    notes: '',
                  })
                }}
                className="btn btn-primary text-xs mt-2"
              >
                Submit Another Referral
              </button>
              <button
                onClick={() => router.push('/agent/profile')}
                className="btn btn-secondary text-xs"
              >
                Back to Profile
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-light py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="container-card">
          <h1 className="text-2xl font-light mb-2 tracking-luxury">Submit a Referral</h1>
          <p className="text-sm text-luxury-gray-2 mb-6">
            Log a referral with Referral Collective. Attach the signed referral agreement now if you
            have it, or send it later. The agreement is required before your split can be paid.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* ── The lead ─────────────────────────────────────────────────── */}
            <div className="border-t border-luxury-gray-5 pt-6">
              <h2 className="text-sm font-medium text-luxury-gray-1 mb-4">The Lead</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">
                    Lead Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lead_name}
                    onChange={e => setFormData({ ...formData, lead_name: e.target.value })}
                    className="input-luxury"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">Lead Email</label>
                    <input
                      type="email"
                      value={formData.lead_email}
                      onChange={e => setFormData({ ...formData, lead_email: e.target.value })}
                      className="input-luxury"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">Lead Phone</label>
                    <input
                      type="tel"
                      value={formData.lead_phone}
                      onChange={e => setFormData({ ...formData, lead_phone: e.target.value })}
                      className="input-luxury"
                      placeholder="(281) 555-0100"
                    />
                  </div>
                </div>

                <p className="text-xs text-luxury-gray-3">
                  Email and phone are how we match your lead to a transaction later. Add them if you
                  have them.
                </p>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Referral Type</label>
                  <select
                    value={formData.referral_type}
                    onChange={e =>
                      setFormData({
                        ...formData,
                        referral_type: e.target.value as '' | 'sale' | 'lease' | 'apartment',
                      })
                    }
                    className="select-luxury"
                  >
                    <option value="">Select type...</option>
                    <option value="sale">Sale</option>
                    <option value="lease">Lease</option>
                    <option value="apartment">Apartment</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Who is closing ───────────────────────────────────────────── */}
            <div className="border-t border-luxury-gray-5 pt-6">
              <h2 className="text-sm font-medium text-luxury-gray-1 mb-4">Who Is Closing This Deal</h2>

              <div className="space-y-2">
                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="closing_side"
                    value="crc"
                    checked={formData.closing_side === 'crc'}
                    onChange={() => setFormData({ ...formData, closing_side: 'crc' })}
                    className="mt-0.5"
                    required
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">A Collective Realty Co. Agent</p>
                    <p className="text-xs text-luxury-gray-2">
                      The office will assign the deal and handle the paperwork.
                    </p>
                  </div>
                </label>

                <label className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="closing_side"
                    value="external"
                    checked={formData.closing_side === 'external'}
                    onChange={() => setFormData({ ...formData, closing_side: 'external' })}
                    className="mt-0.5"
                    required
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">An Outside Brokerage</p>
                    <p className="text-xs text-luxury-gray-2">
                      Attach your referral agreement with that brokerage below.
                    </p>
                  </div>
                </label>
              </div>

              {formData.closing_side === 'external' && (
                <div className="mt-4 ml-7 pl-4 border-l-2 border-luxury-gray-5 space-y-4">
                  <div>
                    <label className="block text-sm mb-2 text-luxury-gray-1">
                      Closing Brokerage <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.closing_brokerage}
                      onChange={e => setFormData({ ...formData, closing_brokerage: e.target.value })}
                      className="input-luxury"
                      placeholder="Keller Williams Memorial"
                      required={formData.closing_side === 'external'}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm mb-2 text-luxury-gray-1">Broker Contact</label>
                      <input
                        type="text"
                        value={formData.closing_contact_name}
                        onChange={e =>
                          setFormData({ ...formData, closing_contact_name: e.target.value })
                        }
                        className="input-luxury"
                        placeholder="Jane Smith"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-2 text-luxury-gray-1">
                        Broker Contact Email
                      </label>
                      <input
                        type="email"
                        value={formData.closing_contact_email}
                        onChange={e =>
                          setFormData({ ...formData, closing_contact_email: e.target.value })
                        }
                        className="input-luxury"
                        placeholder="ops@brokerage.com"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Fee and agreement ────────────────────────────────────────── */}
            <div className="border-t border-luxury-gray-5 pt-6">
              <h2 className="text-sm font-medium text-luxury-gray-1 mb-4">Fee and Agreement</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Fee Terms</label>
                  <input
                    type="text"
                    value={formData.fee_terms}
                    onChange={e => setFormData({ ...formData, fee_terms: e.target.value })}
                    className="input-luxury"
                    placeholder="25% of the closing agent's commission"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Referral Agreement</label>
                  {agreementFile ? (
                    <div className="flex items-center gap-3">
                      <p className="text-sm text-luxury-gray-1">{agreementFile.name}</p>
                      <button
                        type="button"
                        onClick={() => setAgreementFile(null)}
                        className="text-xs text-luxury-gray-2 hover:text-luxury-black underline"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        onChange={e => setAgreementFile(e.target.files?.[0] || null)}
                        className="hidden"
                        id="agreement-input"
                      />
                      <label
                        htmlFor="agreement-input"
                        className="inline-block px-4 py-2 text-sm rounded transition-colors btn-primary cursor-pointer"
                      >
                        Choose File
                      </label>
                    </>
                  )}
                  <p className="text-xs text-luxury-gray-3 mt-1">
                    Optional now. Required before your split can be paid. Saved to your documents
                    folder.
                  </p>
                </div>

                <div>
                  <label className="block text-sm mb-2 text-luxury-gray-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    className="input-luxury"
                    rows={4}
                    placeholder="Anything the office should know about this lead"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded text-xs text-red-700">
                <AlertCircle size={14} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-center gap-4 pt-6">
              <button type="submit" disabled={loading} className="btn btn-primary text-xs">
                {loading ? 'Submitting...' : 'Submit Referral'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
