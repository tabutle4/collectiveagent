'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export default function NewLandlordPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mailing_address: '',
    mailing_city: '',
    mailing_state: 'TX',
    mailing_zip: '',
  })

  const handleSave = async () => {
    if (!form.first_name || !form.last_name || !form.email) {
      alert('Please fill in first name, last name, and email')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/pm/landlords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        const data = await res.json()
        router.push(`/admin/pm/landlords/${data.landlord.id}`)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create landlord')
      }
    } catch (err) {
      alert('Failed to create landlord')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/admin/pm/landlords')}
          className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="page-title">Add Landlord</h1>
      </div>

      <div className="container-card max-w-2xl">
        <div className="space-y-6">
          <div>
            <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Contact Information
            </h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">First Name *</label>
                <input
                  type="text"
                  className="input-luxury"
                  value={form.first_name}
                  onChange={e => setForm({ ...form, first_name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Last Name *</label>
                <input
                  type="text"
                  className="input-luxury"
                  value={form.last_name}
                  onChange={e => setForm({ ...form, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="field-label">Email *</label>
                <input
                  type="email"
                  className="input-luxury"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input
                  type="tel"
                  className="input-luxury"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Mailing Address
            </h3>
            <div className="space-y-4">
              <div>
                <label className="field-label">Street Address</label>
                <input
                  type="text"
                  className="input-luxury"
                  value={form.mailing_address}
                  onChange={e => setForm({ ...form, mailing_address: e.target.value })}
                />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="field-label">City</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={form.mailing_city}
                    onChange={e => setForm({ ...form, mailing_city: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">State</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={form.mailing_state}
                    onChange={e => setForm({ ...form, mailing_state: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">ZIP</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={form.mailing_zip}
                    onChange={e => setForm({ ...form, mailing_zip: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-luxury-gray-5/50">
            <button
              onClick={() => router.push('/admin/pm/landlords')}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Landlord'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}