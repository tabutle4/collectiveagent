'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save } from 'lucide-react'

export default function NewTenantPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    notes: '',
  })

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
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
      const res = await fetch('/api/pm/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create tenant')
      }

      const data = await res.json()
      router.push(`/admin/pm/tenants/${data.tenant.id}`)
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
          href="/admin/pm/tenants"
          className="p-2 rounded hover:bg-luxury-gray-5/30 transition-colors"
        >
          <ArrowLeft size={18} className="text-luxury-gray-3" />
        </Link>
        <h1 className="page-title">Add Tenant</h1>
      </div>

      <form onSubmit={handleSubmit} className="container-card max-w-2xl">
        {error && <div className="alert-error mb-4">{error}</div>}

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

          {/* Notes */}
          <div>
            <label className="field-label">Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              className="textarea-luxury"
              rows={3}
              placeholder="Internal notes about this tenant..."
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-luxury-gray-5/50">
            <Link href="/admin/pm/tenants" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary flex items-center gap-2"
            >
              <Save size={14} />
              {saving ? 'Saving...' : 'Create Tenant'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
