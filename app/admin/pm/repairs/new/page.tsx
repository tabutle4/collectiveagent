'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wrench, ArrowLeft, Building2, User, AlertTriangle } from 'lucide-react'

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  landlord_id: string
  landlords?: {
    id: string
    first_name: string
    last_name: string
  }
}

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
}

interface Lease {
  id: string
  tenant_id: string
  tenants?: Tenant
}

const CATEGORIES = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'structural', label: 'Structural' },
  { value: 'pest', label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'other', label: 'Other' },
]

const URGENCIES = [
  { value: 'routine', label: 'Routine', description: 'Non-urgent, can wait for scheduling' },
  { value: 'urgent', label: 'Urgent', description: 'Needs attention within 24-48 hours' },
  { value: 'emergency', label: 'Emergency', description: 'Immediate attention required' },
]

export default function NewRepairPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  const [properties, setProperties] = useState<Property[]>([])
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [activeLease, setActiveLease] = useState<Lease | null>(null)
  
  const [form, setForm] = useState({
    property_id: '',
    category: '',
    urgency: 'routine',
    title: '',
    description: '',
    vendor_name: '',
    vendor_phone: '',
    vendor_email: '',
    estimated_cost: '',
    admin_notes: ''
  })

  useEffect(() => {
    loadProperties()
  }, [])

  const loadProperties = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pm/properties?status=active')
      if (res.ok) {
        const data = await res.json()
        setProperties(data.properties || [])
      }
    } catch (err) {
      console.error('Failed to load properties:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePropertyChange = async (propertyId: string) => {
    setForm({ ...form, property_id: propertyId })
    setSelectedProperty(null)
    setActiveLease(null)
    
    if (!propertyId) return
    
    const prop = properties.find(p => p.id === propertyId)
    if (prop) {
      setSelectedProperty(prop)
      
      // Fetch active lease for this property
      try {
        const res = await fetch(`/api/pm/leases?property_id=${propertyId}&status=active`)
        if (res.ok) {
          const data = await res.json()
          if (data.leases && data.leases.length > 0) {
            setActiveLease(data.leases[0])
          }
        }
      } catch (err) {
        console.error('Failed to load lease:', err)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!form.property_id) {
      setError('Please select a property')
      return
    }
    if (!form.category) {
      setError('Please select a category')
      return
    }
    if (!form.title.trim()) {
      setError('Please enter a title')
      return
    }
    
    setSubmitting(true)
    
    try {
      const res = await fetch('/api/pm/repair-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: form.property_id,
          landlord_id: selectedProperty?.landlord_id,
          tenant_id: activeLease?.tenant_id || null,
          lease_id: activeLease?.id || null,
          created_by_type: 'admin',
          category: form.category,
          urgency: form.urgency,
          title: form.title.trim(),
          description: form.description.trim() || null,
          vendor_name: form.vendor_name.trim() || null,
          vendor_phone: form.vendor_phone.trim() || null,
          vendor_email: form.vendor_email.trim() || null,
          estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
          admin_notes: form.admin_notes.trim() || null
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        router.push(`/admin/pm/repairs/${data.repair.id}`)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to create repair request')
      }
    } catch (err) {
      console.error('Failed to create repair:', err)
      setError('An error occurred')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-luxury-gray-3">Loading...</div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm/repairs" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={20} />
        </Link>
        <Wrench size={24} className="text-luxury-accent" />
        <h1 className="page-title">New Repair Request</h1>
      </div>

      {error && (
        <div className="alert-error mb-6 flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Property Selection */}
        <div className="container-card mb-6">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Property
          </h2>
          
          <div className="mb-4">
            <label className="field-label">Select Property *</label>
            <select
              value={form.property_id}
              onChange={(e) => handlePropertyChange(e.target.value)}
              className="select-luxury w-full"
              required
            >
              <option value="">Select a property...</option>
              {properties.map(prop => (
                <option key={prop.id} value={prop.id}>
                  {prop.property_address}{prop.unit ? ` ${prop.unit}` : ''}, {prop.city}
                </option>
              ))}
            </select>
          </div>

          {selectedProperty && (
            <div className="inner-card">
              <div className="flex items-start gap-3">
                <Building2 size={20} className="text-luxury-accent mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium text-luxury-gray-1">
                    {selectedProperty.property_address}
                    {selectedProperty.unit && ` ${selectedProperty.unit}`}
                  </div>
                  <div className="text-sm text-luxury-gray-3">
                    {selectedProperty.city}, {selectedProperty.state}
                  </div>
                  {selectedProperty.landlords && (
                    <div className="text-sm text-luxury-gray-3 mt-1">
                      Landlord: {selectedProperty.landlords.first_name} {selectedProperty.landlords.last_name}
                    </div>
                  )}
                </div>
              </div>
              
              {activeLease && activeLease.tenants && (
                <div className="flex items-start gap-3 mt-3 pt-3 border-t border-luxury-gray-5">
                  <User size={20} className="text-luxury-gray-3 mt-0.5" />
                  <div>
                    <div className="text-sm text-luxury-gray-1">
                      Tenant: {activeLease.tenants.first_name} {activeLease.tenants.last_name}
                    </div>
                    <div className="text-xs text-luxury-gray-3">{activeLease.tenants.email}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Request Details */}
        <div className="container-card mb-6">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Request Details
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="field-label">Category *</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="select-luxury w-full"
                required
              >
                <option value="">Select category...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="field-label">Urgency *</label>
              <select
                value={form.urgency}
                onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                className="select-luxury w-full"
                required
              >
                {URGENCIES.map(urg => (
                  <option key={urg.value} value={urg.value}>{urg.label}</option>
                ))}
              </select>
              <p className="text-xs text-luxury-gray-3 mt-1">
                {URGENCIES.find(u => u.value === form.urgency)?.description}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="field-label">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Brief description of the issue"
              className="input-luxury w-full"
              required
            />
          </div>

          <div>
            <label className="field-label">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detailed description of the repair needed..."
              rows={4}
              className="textarea-luxury w-full"
            />
          </div>
        </div>

        {/* Vendor Info */}
        <div className="container-card mb-6">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Vendor Information
          </h2>
          <p className="text-sm text-luxury-gray-3 mb-4">Optional - add if vendor is already assigned</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="field-label">Vendor Name</label>
              <input
                type="text"
                value={form.vendor_name}
                onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                placeholder="Company or individual name"
                className="input-luxury w-full"
              />
            </div>
            
            <div>
              <label className="field-label">Estimated Cost</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.estimated_cost}
                  onChange={(e) => setForm({ ...form, estimated_cost: e.target.value })}
                  placeholder="0.00"
                  className="input-luxury w-full pl-7"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Vendor Phone</label>
              <input
                type="tel"
                value={form.vendor_phone}
                onChange={(e) => setForm({ ...form, vendor_phone: e.target.value })}
                placeholder="(555) 555-5555"
                className="input-luxury w-full"
              />
            </div>
            
            <div>
              <label className="field-label">Vendor Email</label>
              <input
                type="email"
                value={form.vendor_email}
                onChange={(e) => setForm({ ...form, vendor_email: e.target.value })}
                placeholder="vendor@example.com"
                className="input-luxury w-full"
              />
            </div>
          </div>
        </div>

        {/* Admin Notes */}
        <div className="container-card mb-6">
          <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
            Admin Notes
          </h2>
          
          <textarea
            value={form.admin_notes}
            onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
            placeholder="Internal notes (not visible to tenant or landlord)"
            rows={3}
            className="textarea-luxury w-full"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary flex-1"
          >
            {submitting ? 'Creating...' : 'Create Repair Request'}
          </button>
          <Link href="/admin/pm/repairs" className="btn btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  )
}