'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, ArrowLeft, Save, Plus, ExternalLink } from 'lucide-react'

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  zip: string | null
  county: string | null
  unit_count: number
  property_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  square_feet: number | null
  year_built: number | null
  hoa_name: string | null
  hoa_contact: string | null
  hoa_phone: string | null
  hoa_email: string | null
  status: string
  notes: string | null
  landlord_id: string
  landlords?: {
    id: string
    first_name: string
    last_name: string
    email: string
    dashboard_token: string
  }
}

interface Lease {
  id: string
  lease_start: string
  lease_end: string
  monthly_rent: number
  status: string
  tenants?: {
    first_name: string
    last_name: string
  }
}

export default function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
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
    status: 'active',
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
    loadProperty()
  }

  const loadProperty = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/properties/${id}`)
      if (!res.ok) {
        router.push('/admin/pm/properties')
        return
      }
      const data = await res.json()
      setProperty(data.property)
      setLeases(data.leases || [])
      
      // Populate form
      const p = data.property
      setForm({
        property_address: p.property_address || '',
        unit: p.unit || '',
        city: p.city || '',
        state: p.state || 'TX',
        zip: p.zip || '',
        county: p.county || '',
        unit_count: p.unit_count || 1,
        property_type: p.property_type || '',
        bedrooms: p.bedrooms?.toString() || '',
        bathrooms: p.bathrooms?.toString() || '',
        square_feet: p.square_feet?.toString() || '',
        year_built: p.year_built?.toString() || '',
        hoa_name: p.hoa_name || '',
        hoa_contact: p.hoa_contact || '',
        hoa_phone: p.hoa_phone || '',
        hoa_email: p.hoa_email || '',
        status: p.status || 'active',
        notes: p.notes || '',
      })
    } catch (err) {
      console.error('Failed to load property:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/pm/properties/${id}`, {
        method: 'PATCH',
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
        throw new Error(data.error || 'Failed to update property')
      }

      setSuccess('Property updated')
      loadProperty()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const formatDate = (date: string) => {
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-50 text-green-700',
      expired: 'bg-gray-50 text-gray-600',
      terminated: 'bg-red-50 text-red-700',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.expired}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12 text-luxury-gray-3">Loading property...</div>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12 text-luxury-gray-3">Property not found</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm/properties" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={20} />
        </Link>
        <Home size={24} className="text-luxury-accent" />
        <h1 className="page-title">{property.property_address}</h1>
      </div>

      {error && <div className="alert-error mb-4">{error}</div>}
      {success && <div className="alert-success mb-4">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6">
          <div className="container-card">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Property Details</p>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="field-label">Street Address</label>
                  <input
                    type="text"
                    name="property_address"
                    value={form.property_address}
                    onChange={handleChange}
                    className="input-luxury w-full"
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
                  />
                </div>
                <div>
                  <label className="field-label">City</label>
                  <input
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    className="input-luxury w-full"
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
                  />
                </div>
                <div>
                  <label className="field-label">Status</label>
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="select-luxury w-full"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-luxury-gray-5">
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
                    className="input-luxury w-full"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-luxury-gray-5">
                <label className="field-label">Notes</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  className="textarea-luxury w-full"
                />
              </div>
            </div>
          </div>

          {/* HOA Info */}
          <div className="container-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">HOA Information</p>
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

          {/* Leases */}
          <div className="container-card">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Leases</p>
              <Link href={`/admin/pm/leases/new?property=${id}`} className="btn btn-secondary text-sm flex items-center gap-2">
                <Plus size={16} />
                Add Lease
              </Link>
            </div>
            {leases.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 py-4">No leases for this property</p>
            ) : (
              <div className="space-y-3">
                {leases.map((lease) => (
                  <Link
                    key={lease.id}
                    href={`/admin/pm/leases/${lease.id}`}
                    className="inner-card block hover:bg-luxury-light transition-colors"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-luxury-gray-1">
                          {lease.tenants?.first_name} {lease.tenants?.last_name}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {formatDate(lease.lease_start)} - {formatDate(lease.lease_end)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-luxury-gray-1">{formatMoney(lease.monthly_rent)}/mo</p>
                        {getStatusBadge(lease.status)}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Landlord Card */}
          {property.landlords && (
            <div className="container-card">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Landlord</p>
              <div className="inner-card">
                <p className="font-medium text-luxury-gray-1">
                  {property.landlords.first_name} {property.landlords.last_name}
                </p>
                <p className="text-sm text-luxury-gray-3">{property.landlords.email}</p>
                <Link
                  href={`/admin/pm/landlords/${property.landlords.id}`}
                  className="text-sm text-luxury-accent hover:underline mt-2 inline-block"
                >
                  View Landlord →
                </Link>
              </div>
            </div>
          )}

          {/* Late Fee Info */}
          <div className="container-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Late Fee Rules</p>
            <div className="inner-card">
              <p className="text-sm text-luxury-gray-1">
                {(form.unit_count || 1) <= 4 ? (
                  <>Max late fee: <span className="font-medium">12%</span> of monthly rent</>
                ) : (
                  <>Max late fee: <span className="font-medium">10%</span> of monthly rent</>
                )}
              </p>
              <p className="text-xs text-luxury-gray-3 mt-1">
                Per Texas Property Code § 92.019 for {(form.unit_count || 1) <= 4 ? '1-4' : '5+'} unit properties
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="container-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Quick Stats</p>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-luxury-gray-3">Total Leases</span>
                <span className="text-sm font-medium text-luxury-gray-1">{leases.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-luxury-gray-3">Active Leases</span>
                <span className="text-sm font-medium text-luxury-gray-1">
                  {leases.filter(l => l.status === 'active').length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
