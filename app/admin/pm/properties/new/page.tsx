'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, ArrowLeft, Save } from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function NewPropertyPage() {
  const router = useRouter()
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    landlord_id: '',
    property_address: '',
    unit: '',
    city: '',
    state: 'TX',
    zip: '',
    county: '',
    unit_count: 1,
    property_type: '',
    bedrooms: '',
    bathrooms: '',
    square_feet: '',
    year_built: '',
    hoa_name: '',
    hoa_contact: '',
    hoa_phone: '',
    hoa_email: '',
    notes: '',
  })

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadLandlords()
  }

  const loadLandlords = async () => {
    try {
      const res = await fetch('/api/pm/landlords?status=active')
      if (res.ok) {
        const data = await res.json()
        setLandlords(data.landlords || [])
      }
    } catch (err) {
      console.error('Failed to load landlords:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/pm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          unit_count: Number(form.unit_count) || 1,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
          square_feet: form.square_feet ? Number(form.square_feet) : null,
          year_built: form.year_built ? Number(form.year_built) : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create property')
      }

      const data = await res.json()
      router.push(`/admin/pm/properties/${data.property.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm/properties" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Home className="w-6 h-6 text-luxury-accent" />
        <h1 className="page-title">Add Property</h1>
      </div>

      <form onSubmit={handleSubmit} className="container-card">
        {error && (
          <div className="alert-error mb-4">{error}</div>
        )}

        <div className="space-y-6">
          {/* Landlord Selection */}
          <div>
            <label className="field-label">Landlord *</label>
            <select
              name="landlord_id"
              value={form.landlord_id}
              onChange={handleChange}
              required
              className="select-luxury w-full"
            >
              <option value="">Select landlord...</option>
              {landlords.map((ll) => (
                <option key={ll.id} value={ll.id}>
                  {ll.first_name} {ll.last_name} ({ll.email})
                </option>
              ))}
            </select>
          </div>

          {/* Address Section */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Property Address</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="field-label">Street Address *</label>
                <input
                  type="text"
                  name="property_address"
                  value={form.property_address}
                  onChange={handleChange}
                  required
                  className="input-luxury w-full"
                  placeholder="123 Main Street"
                />
              </div>
              <div>
                <label className="field-label">Unit/Suite</label>
                <input
                  type="text"
                  name="unit"
                  value={form.unit}
                  onChange={handleChange}
                  className="input-luxury w-full"
                  placeholder="Apt 4B"
                />
              </div>
              <div>
                <label className="field-label">City *</label>
                <input
                  type="text"
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  required
                  className="input-luxury w-full"
                  placeholder="Houston"
                />
              </div>
              <div>
                <label className="field-label">State</label>
                <input
                  type="text"
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">ZIP</label>
                <input
                  type="text"
                  name="zip"
                  value={form.zip}
                  onChange={handleChange}
                  className="input-luxury w-full"
                  placeholder="77001"
                />
              </div>
              <div>
                <label className="field-label">County</label>
                <input
                  type="text"
                  name="county"
                  value={form.county}
                  onChange={handleChange}
                  className="input-luxury w-full"
                  placeholder="Harris"
                />
              </div>
            </div>
          </div>

          {/* Property Details */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Property Details</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="field-label">Unit Count</label>
                <input
                  type="number"
                  name="unit_count"
                  value={form.unit_count}
                  onChange={handleChange}
                  min="1"
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Property Type</label>
                <select
                  name="property_type"
                  value={form.property_type}
                  onChange={handleChange}
                  className="select-luxury w-full"
                >
                  <option value="">Select...</option>
                  <option value="single_family">Single Family</option>
                  <option value="condo">Condo</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="duplex">Duplex</option>
                  <option value="triplex">Triplex</option>
                  <option value="fourplex">Fourplex</option>
                  <option value="multi_family">Multi-Family</option>
                </select>
              </div>
              <div>
                <label className="field-label">Bedrooms</label>
                <input
                  type="number"
                  name="bedrooms"
                  value={form.bedrooms}
                  onChange={handleChange}
                  min="0"
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Bathrooms</label>
                <input
                  type="number"
                  name="bathrooms"
                  value={form.bathrooms}
                  onChange={handleChange}
                  min="0"
                  step="0.5"
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Sq Ft</label>
                <input
                  type="number"
                  name="square_feet"
                  value={form.square_feet}
                  onChange={handleChange}
                  min="0"
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Year Built</label>
                <input
                  type="number"
                  name="year_built"
                  value={form.year_built}
                  onChange={handleChange}
                  min="1800"
                  max="2030"
                  className="input-luxury w-full"
                />
              </div>
            </div>
          </div>

          {/* HOA Info */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">HOA Information (Optional)</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">HOA Name</label>
                <input
                  type="text"
                  name="hoa_name"
                  value={form.hoa_name}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">HOA Contact</label>
                <input
                  type="text"
                  name="hoa_contact"
                  value={form.hoa_contact}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">HOA Phone</label>
                <input
                  type="tel"
                  name="hoa_phone"
                  value={form.hoa_phone}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">HOA Email</label>
                <input
                  type="email"
                  name="hoa_email"
                  value={form.hoa_email}
                  onChange={handleChange}
                  className="input-luxury w-full"
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
              rows={3}
              className="textarea-luxury w-full"
              placeholder="Any additional notes about the property..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-luxury-gray-5">
            <Link href="/admin/pm/properties" className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {loading ? 'Creating...' : 'Create Property'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
