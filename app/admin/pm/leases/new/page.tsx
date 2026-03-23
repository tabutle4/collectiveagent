'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FileText, ArrowLeft, Save, AlertCircle } from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
}

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  unit_count: number
  landlord_id: string
}

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
}

export default function NewLeasePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedPropertyId = searchParams.get('property')

  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [properties, setProperties] = useState<Property[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [invoiceCount, setInvoiceCount] = useState(0)

  const [form, setForm] = useState({
    landlord_id: '',
    property_id: preselectedPropertyId || '',
    tenant_id: '',
    lease_start: '',
    lease_end: '',
    move_in_date: '',
    monthly_rent: '',
    rent_due_day: '1',
    security_deposit: '',
    late_fee_grace_days: '2',
    late_fee_initial: '',
    late_fee_daily: '',
    late_fee_max_days: '',
    returned_payment_fee: '150',
    notes: '',
  })

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (form.landlord_id) {
      const filtered = properties.filter(p => p.landlord_id === form.landlord_id)
      setFilteredProperties(filtered)
    } else {
      setFilteredProperties([])
    }
  }, [form.landlord_id, properties])

  useEffect(() => {
    calculateInvoiceCount()
  }, [form.lease_start, form.lease_end])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadData()
  }

  const loadData = async () => {
    try {
      const [landlordRes, propertyRes, tenantRes] = await Promise.all([
        fetch('/api/pm/landlords?status=active'),
        fetch('/api/pm/properties?status=active'),
        fetch('/api/pm/tenants?status=active'),
      ])

      if (landlordRes.ok) {
        const data = await landlordRes.json()
        setLandlords(data.landlords || [])
      }
      if (propertyRes.ok) {
        const data = await propertyRes.json()
        setProperties(data.properties || [])
        
        // If preselected property, set the landlord
        if (preselectedPropertyId) {
          const prop = data.properties?.find((p: Property) => p.id === preselectedPropertyId)
          if (prop) {
            setForm(f => ({ ...f, landlord_id: prop.landlord_id }))
          }
        }
      }
      if (tenantRes.ok) {
        const data = await tenantRes.json()
        setTenants(data.tenants || [])
      }
    } catch (err) {
      console.error('Failed to load data:', err)
    }
  }

  const calculateInvoiceCount = () => {
    if (!form.lease_start || !form.lease_end) {
      setInvoiceCount(0)
      return
    }

    const start = new Date(form.lease_start)
    const end = new Date(form.lease_end)
    
    if (end <= start) {
      setInvoiceCount(0)
      return
    }

    let count = 0
    const current = new Date(start)
    while (current <= end) {
      count++
      current.setMonth(current.getMonth() + 1)
    }
    setInvoiceCount(count)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/pm/leases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monthly_rent: Number(form.monthly_rent),
          rent_due_day: Number(form.rent_due_day) || 1,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : 0,
          late_fee_grace_days: form.late_fee_grace_days ? Number(form.late_fee_grace_days) : 2,
          late_fee_initial: form.late_fee_initial ? Number(form.late_fee_initial) : null,
          late_fee_daily: form.late_fee_daily ? Number(form.late_fee_daily) : null,
          late_fee_max_days: form.late_fee_max_days ? Number(form.late_fee_max_days) : null,
          returned_payment_fee: form.returned_payment_fee ? Number(form.returned_payment_fee) : 150,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create lease')
      }

      const data = await res.json()
      router.push(`/admin/pm/leases/${data.lease.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setForm({ ...form, [name]: value })
    
    // Reset property if landlord changes
    if (name === 'landlord_id' && !preselectedPropertyId) {
      setForm(f => ({ ...f, [name]: value, property_id: '' }))
    }
  }

  const selectedProperty = properties.find(p => p.id === form.property_id)
  const lateFeeCapPct = selectedProperty && selectedProperty.unit_count > 4 ? 10 : 12

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm/leases" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <FileText className="w-6 h-6 text-luxury-accent" />
        <h1 className="page-title">Create Lease</h1>
      </div>

      <form onSubmit={handleSubmit} className="container-card">
        {error && <div className="alert-error mb-4">{error}</div>}

        <div className="space-y-6">
          {/* Property Selection */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Property & Parties</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="field-label">Landlord *</label>
                <select
                  name="landlord_id"
                  value={form.landlord_id}
                  onChange={handleChange}
                  required
                  disabled={!!preselectedPropertyId}
                  className="select-luxury w-full"
                >
                  <option value="">Select landlord...</option>
                  {landlords.map((ll) => (
                    <option key={ll.id} value={ll.id}>
                      {ll.first_name} {ll.last_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Property *</label>
                <select
                  name="property_id"
                  value={form.property_id}
                  onChange={handleChange}
                  required
                  disabled={!!preselectedPropertyId || !form.landlord_id}
                  className="select-luxury w-full"
                >
                  <option value="">Select property...</option>
                  {filteredProperties.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.property_address}{prop.unit ? ` ${prop.unit}` : ''}, {prop.city}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="field-label">Tenant *</label>
                <select
                  name="tenant_id"
                  value={form.tenant_id}
                  onChange={handleChange}
                  required
                  className="select-luxury w-full"
                >
                  <option value="">Select tenant...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.first_name} {t.last_name} ({t.email})
                    </option>
                  ))}
                </select>
                <Link href="/admin/pm/tenants/new" className="text-xs text-luxury-accent hover:underline mt-1 inline-block">
                  + Add new tenant
                </Link>
              </div>
            </div>
          </div>

          {/* Lease Term */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Lease Term</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="field-label">Lease Start *</label>
                <input
                  type="date"
                  name="lease_start"
                  value={form.lease_start}
                  onChange={handleChange}
                  required
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Lease End *</label>
                <input
                  type="date"
                  name="lease_end"
                  value={form.lease_end}
                  onChange={handleChange}
                  required
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Move-In Date</label>
                <input
                  type="date"
                  name="move_in_date"
                  value={form.move_in_date}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
            </div>
            {invoiceCount > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium">{invoiceCount} invoices will be auto-generated</p>
                  <p className="text-xs text-blue-600 mt-1">
                    One invoice per month from {form.lease_start} through {form.lease_end}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Rent & Deposits */}
          <div className="inner-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Rent & Deposits</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="field-label">Monthly Rent *</label>
                <input
                  type="number"
                  name="monthly_rent"
                  value={form.monthly_rent}
                  onChange={handleChange}
                  required
                  min="0"
                  step="0.01"
                  className="input-luxury w-full"
                  placeholder="1500.00"
                />
              </div>
              <div>
                <label className="field-label">Rent Due Day</label>
                <select
                  name="rent_due_day"
                  value={form.rent_due_day}
                  onChange={handleChange}
                  className="select-luxury w-full"
                >
                  {[...Array(28)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Security Deposit</label>
                <input
                  type="number"
                  name="security_deposit"
                  value={form.security_deposit}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  className="input-luxury w-full"
                  placeholder="1500.00"
                />
              </div>
            </div>
          </div>

          {/* Late Fee Rules */}
          <div className="inner-card">
            <div className="flex justify-between items-start mb-4">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Late Fee Rules</p>
              {selectedProperty && (
                <span className="text-xs text-luxury-gray-3">
                  Max: {lateFeeCapPct}% per TX law
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="field-label">Grace Days</label>
                <input
                  type="number"
                  name="late_fee_grace_days"
                  value={form.late_fee_grace_days}
                  onChange={handleChange}
                  min="0"
                  className="input-luxury w-full"
                  placeholder="2"
                />
                <p className="text-xs text-luxury-gray-3 mt-1">Days after due date</p>
              </div>
              <div>
                <label className="field-label">Initial Fee</label>
                <input
                  type="number"
                  name="late_fee_initial"
                  value={form.late_fee_initial}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  className="input-luxury w-full"
                  placeholder="50.00"
                />
              </div>
              <div>
                <label className="field-label">Daily Fee</label>
                <input
                  type="number"
                  name="late_fee_daily"
                  value={form.late_fee_daily}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  className="input-luxury w-full"
                  placeholder="10.00"
                />
              </div>
              <div>
                <label className="field-label">Max Days</label>
                <input
                  type="number"
                  name="late_fee_max_days"
                  value={form.late_fee_max_days}
                  onChange={handleChange}
                  min="0"
                  className="input-luxury w-full"
                  placeholder="30"
                />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-luxury-gray-5">
              <div className="w-1/2">
                <label className="field-label">Returned Payment Fee</label>
                <input
                  type="number"
                  name="returned_payment_fee"
                  value={form.returned_payment_fee}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
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
              placeholder="Any additional notes about the lease..."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-4 border-t border-luxury-gray-5">
            <Link href="/admin/pm/leases" className="btn btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={loading} className="btn btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" />
              {loading ? 'Creating...' : 'Create Lease'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
