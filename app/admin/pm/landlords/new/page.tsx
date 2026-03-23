'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'

export default function NewLandlordPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mailing_address: '',
    mailing_city: '',
    mailing_state: 'TX',
    mailing_zip: '',
    notes: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.first_name || !form.last_name || !form.email) {
      setError('First name, last name, and email are required.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/pm/landlords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create landlord')
      }

      const data = await res.json()
      router.push(`/admin/pm/landlords/${data.landlord.id}`)
    } catch (err: any) {
      setError(err.message || 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/pm/landlords"
          className="p-2 rounded hover:bg-luxury-gray-5/30 transition-colors"
        >
          <ArrowLeft size={18} className="text-luxury-gray-3" />
        </Link>
        <h1 className="page-title">Add Landlord</h1>
      </div>

      <form onSubmit={handleSubmit} className="container-card max-w-2xl">
        {error && (
          <div className="alert-error mb-4">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Contact Information */}
          <div>
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Contact Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="first_name"
                  value={form.first_name}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label className="field-label">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="last_name"
                  value={form.last_name}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label className="field-label">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  className="input-luxury"
                  required
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className="input-luxury"
                  placeholder="(555) 555-5555"
                />
              </div>
            </div>
          </div>

          {/* Mailing Address */}
          <div>
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Mailing Address
            </h2>
            <div className="space-y-4">
              <div>
                <label className="field-label">Street Address</label>
                <input
                  type="text"
                  name="mailing_address"
                  value={form.mailing_address}
                  onChange={handleChange}
                  className="input-luxury"
                />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="col-span-2">
                  <label className="field-label">City</label>
                  <input
                    type="text"
                    name="mailing_city"
                    value={form.mailing_city}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">State</label>
                  <select
                    name="mailing_state"
                    value={form.mailing_state}
                    onChange={handleChange}
                    className="select-luxury"
                  >
                    <option value="TX">TX</option>
                    <option value="LA">LA</option>
                    <option value="OK">OK</option>
                    <option value="AR">AR</option>
                    <option value="NM">NM</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">ZIP</label>
                  <input
                    type="text"
                    name="mailing_zip"
                    value={form.mailing_zip}
                    onChange={handleChange}
                    className="input-luxury"
                    maxLength={10}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="field-label">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              className="textarea-luxury"
              rows={3}
              placeholder="Internal notes about this landlord..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-luxury-gray-5/50">
            <Link href="/admin/pm/landlords" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Create Landlord'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
