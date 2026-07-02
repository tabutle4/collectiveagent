'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Home, ArrowLeft, Save, Plus, ExternalLink, X } from 'lucide-react'
import { AgreementOption } from '@/types/pm'
import HeldInTrustWidget from '@/components/pm/HeldInTrustWidget'

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
  pm_agreement_id: string | null
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
    pm_agreement_id: '',
  })
  const [landlordAgreements, setLandlordAgreements] = useState<AgreementOption[]>([])

  // Pending deductions for this property. Property-scoped: only rows
  // where property_id matches AND disbursement_id IS NULL.
  const [pendingDeductions, setPendingDeductions] = useState<any[]>([])
  const [loadingDeductions, setLoadingDeductions] = useState(false)
  const [showAddDeductionModal, setShowAddDeductionModal] = useState(false)
  const [deductionForm, setDeductionForm] = useState({
    label: '',
    amount: '',
    description: '',
    incurred_date: '',
  })
  const [savingDeduction, setSavingDeduction] = useState(false)

  // Tenant charge state
  const [showAddChargeModal, setShowAddChargeModal] = useState(false)
  const [chargeForm, setChargeForm] = useState({
    label: '',
    amount: '',
    description: '',
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
  })
  const [savingCharge, setSavingCharge] = useState(false)

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
    // Kick off the deductions fetch in parallel - it doesn't depend on
    // property data and the panel sits below the form anyway.
    loadPendingDeductions()
    try {
      const res = await fetch(`/api/pm/properties/${id}`)
      if (!res.ok) {
        router.push('/admin/pm/properties')
        return
      }
      const data = await res.json()
      setProperty(data.property)
      setLeases(data.property?.pm_leases || [])
      
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
        pm_agreement_id: p.pm_agreement_id || '',
      })

      // Load this landlord's agreements for the picker
      if (p.landlord_id) {
        try {
          const agRes = await fetch(`/api/pm/agreements?landlord_id=${p.landlord_id}`)
          if (agRes.ok) {
            const agData = await agRes.json()
            setLandlordAgreements(agData.agreements || [])
          }
        } catch (agErr) {
          console.error('Failed to load landlord agreements:', agErr)
        }
      }
    } catch (err) {
      console.error('Failed to load property:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadPendingDeductions = async () => {
    setLoadingDeductions(true)
    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions?property_id=${id}&pending=true`
      )
      if (res.ok) {
        const data = await res.json()
        setPendingDeductions(data.deductions || [])
      }
    } catch (err) {
      console.error('Error loading pending deductions:', err)
    } finally {
      setLoadingDeductions(false)
    }
  }

  const openAddDeductionModal = () => {
    setDeductionForm({
      label: '',
      amount: '',
      description: '',
      incurred_date: '',
    })
    setShowAddDeductionModal(true)
  }

  const saveDeduction = async () => {
    if (!property) return
    if (!deductionForm.label || !deductionForm.amount) {
      alert('Label and amount are required')
      return
    }
    if (parseFloat(deductionForm.amount) <= 0) {
      alert('Amount must be greater than zero')
      return
    }

    setSavingDeduction(true)
    try {
      const res = await fetch('/api/pm/landlord-disbursement-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlord_id: property.landlord_id,
          property_id: id,
          label: deductionForm.label,
          amount: parseFloat(deductionForm.amount),
          description: deductionForm.description || null,
          incurred_date: deductionForm.incurred_date || null,
        }),
      })

      if (res.ok) {
        setShowAddDeductionModal(false)
        loadPendingDeductions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save deduction')
      }
    } catch (err) {
      console.error('Error saving deduction:', err)
      alert('Failed to save deduction')
    } finally {
      setSavingDeduction(false)
    }
  }

  const deleteDeduction = async (deductionId: string) => {
    if (!confirm('Delete this pending deduction?')) return

    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions/${deductionId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        loadPendingDeductions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete deduction')
      }
    } catch (err) {
      console.error('Error deleting deduction:', err)
      alert('Failed to delete deduction')
    }
  }

  const saveCharge = async () => {
    if (!property) return
    if (!chargeForm.label || !chargeForm.amount) {
      alert('Label and amount are required')
      return
    }
    if (parseFloat(chargeForm.amount) <= 0) {
      alert('Amount must be greater than zero')
      return
    }

    setSavingCharge(true)
    try {
      // Find the unpaid invoice for this property and period
      const res = await fetch(
        `/api/pm/invoices?property_id=${id}&period_month=${chargeForm.period_month}&period_year=${chargeForm.period_year}`
      )
      if (!res.ok) throw new Error('Failed to fetch invoices')
      const data = await res.json()

      const invoice = (data.invoices || []).find(
        (inv: any) => inv.status !== 'paid'
      )

      if (!invoice) {
        alert(`No unpaid invoice found for ${chargeForm.period_month}/${chargeForm.period_year}. Make sure the invoice exists and is not already paid.`)
        return
      }

      // Build updated other_charges and description
      const currentOther = Number(invoice.other_charges || 0)
      const newOther = currentOther + parseFloat(chargeForm.amount)
      const currentDesc = invoice.other_charges_description || ''
      const newDesc = currentDesc
        ? `${currentDesc}; ${chargeForm.label}${chargeForm.description ? ` (${chargeForm.description})` : ''}`
        : `${chargeForm.label}${chargeForm.description ? ` (${chargeForm.description})` : ''}`

      const patchRes = await fetch(`/api/pm/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          other_charges: newOther,
          other_charges_description: newDesc,
        }),
      })

      if (patchRes.ok) {
        setShowAddChargeModal(false)
        setChargeForm({
          label: '',
          amount: '',
          description: '',
          period_month: new Date().getMonth() + 1,
          period_year: new Date().getFullYear(),
        })
        alert(`Charge of $${parseFloat(chargeForm.amount).toFixed(2)} added to the ${chargeForm.period_month}/${chargeForm.period_year} invoice.`)
      } else {
        const errData = await patchRes.json()
        alert(errData.error || 'Failed to add charge')
      }
    } catch (err: any) {
      console.error('Error saving charge:', err)
      alert(err.message || 'Failed to add charge')
    } finally {
      setSavingCharge(false)
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
          pm_agreement_id: form.pm_agreement_id || null,
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

      {/* Mobile-only quick action buttons */}
      <div className="flex gap-3 mb-4 lg:hidden">
        <button
          onClick={openAddDeductionModal}
          className="btn btn-secondary text-xs flex items-center gap-1 flex-1"
        >
          <Plus size={12} /> Landlord Deduction
        </button>
        <button
          onClick={() => setShowAddChargeModal(true)}
          className="btn btn-secondary text-xs flex items-center gap-1 flex-1"
        >
          <Plus size={12} /> Tenant Charge
        </button>
      </div>

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

          {/* PM Agreement */}
          <div className="container-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Property Management Agreement</p>
            <div>
              <label className="field-label">Active Agreement</label>
              <select
                name="pm_agreement_id"
                value={form.pm_agreement_id}
                onChange={handleChange}
                className="select-luxury w-full"
              >
                <option value="">None / Unassigned</option>
                {landlordAgreements.map((ag) => {
                  const startStr = ag.commencement_date
                    ? new Date(`${ag.commencement_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'No start date'
                  const endStr = ag.expiration_date
                    ? new Date(`${ag.expiration_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : 'no end'
                  return (
                    <option key={ag.id} value={ag.id}>
                      {startStr} to {endStr} ({ag.status})
                    </option>
                  )
                })}
              </select>
              <p className="text-xs text-luxury-gray-3 mt-2">
                Selects which of this landlord&apos;s agreements governs disbursements for this property. Changing this updates future disbursement calculations. Past disbursements are not recalculated.
              </p>
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
          {/* Held-in-Trust - scoped to this specific property */}
          {property.landlord_id && (
            <HeldInTrustWidget
              landlordId={property.landlord_id}
              propertyId={id}
            />
          )}

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

      {/* Bottom cards: Landlord Deductions + Tenant Charges - always visible */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* Landlord Deductions */}
        <div className="container-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              Landlord Deductions
            </h2>
            <button
              onClick={openAddDeductionModal}
              className="btn btn-secondary text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Add Deduction
            </button>
          </div>

          {loadingDeductions ? (
            <p className="text-sm text-luxury-gray-3 text-center py-4">
              Loading deductions...
            </p>
          ) : pendingDeductions.length === 0 ? (
            <p className="text-sm text-luxury-gray-3 text-center py-4">
              No pending deductions. Add one to apply against the next disbursement.
            </p>
          ) : (
            <div className="space-y-2">
              {pendingDeductions.map((d: any) => (
                <div key={d.id} className="inner-card">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                          {d.label}
                        </p>
                        {d.source_repair_id && (
                          <span className="text-xs text-luxury-gray-3 shrink-0">
                            (from repair)
                          </span>
                        )}
                        {d.source_invoice_id && (
                          <span className="text-xs text-luxury-gray-3 shrink-0">
                            (from unpaid invoice)
                          </span>
                        )}
                      </div>
                      {d.description && (
                        <p className="text-xs text-luxury-gray-3 truncate">{d.description}</p>
                      )}
                      {d.incurred_date && (
                        <p className="text-xs text-luxury-gray-3">
                          Incurred {formatDate(d.incurred_date)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-semibold text-luxury-gray-1">
                        {formatMoney(Number(d.amount))}
                      </span>
                      <button
                        onClick={() => deleteDeduction(d.id)}
                        className="text-luxury-gray-3 hover:text-red-600"
                        title="Delete deduction"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tenant Charges */}
        <div className="container-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              Tenant Charges
            </h2>
            <button
              onClick={() => setShowAddChargeModal(true)}
              className="btn btn-secondary text-xs flex items-center gap-1"
            >
              <Plus size={12} /> Add Charge
            </button>
          </div>
          <p className="text-sm text-luxury-gray-3 text-center py-4">
            Add a charge to a tenant&apos;s existing rent invoice for a specific month.
          </p>
        </div>
      </div>

      {/* Add Landlord Deduction Modal */}
      {showAddDeductionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Landlord Deduction</h2>
              <button
                onClick={() => setShowAddDeductionModal(false)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Label</label>
                <input
                  type="text"
                  value={deductionForm.label}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, label: e.target.value }))}
                  className="input-luxury w-full"
                  placeholder="e.g., HOA fee, lawn care, commission"
                />
              </div>

              <div>
                <label className="field-label">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={deductionForm.amount}
                    onChange={(e) => setDeductionForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="input-luxury w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Incurred Date (optional)</label>
                <input
                  type="date"
                  value={deductionForm.incurred_date}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, incurred_date: e.target.value }))}
                  className="input-luxury w-full"
                />
              </div>

              <div>
                <label className="field-label">Description (optional)</label>
                <textarea
                  value={deductionForm.description}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input-luxury w-full"
                  rows={2}
                  placeholder="Additional context"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddDeductionModal(false)}
                  className="btn btn-secondary"
                  disabled={savingDeduction}
                >
                  Cancel
                </button>
                <button
                  onClick={saveDeduction}
                  className="btn btn-primary"
                  disabled={savingDeduction}
                >
                  {savingDeduction ? 'Saving...' : 'Add Deduction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tenant Charge Modal */}
      {showAddChargeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Tenant Charge</h2>
              <button
                onClick={() => setShowAddChargeModal(false)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Label</label>
                <input
                  type="text"
                  value={chargeForm.label}
                  onChange={(e) => setChargeForm(prev => ({ ...prev, label: e.target.value }))}
                  className="input-luxury w-full"
                  placeholder="e.g., Late move-out fee, cleaning charge"
                />
              </div>

              <div>
                <label className="field-label">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={chargeForm.amount}
                    onChange={(e) => setChargeForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="input-luxury w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Rent Month</label>
                  <select
                    value={chargeForm.period_month}
                    onChange={(e) => setChargeForm(prev => ({ ...prev, period_month: Number(e.target.value) }))}
                    className="select-luxury w-full"
                  >
                    {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Year</label>
                  <select
                    value={chargeForm.period_year}
                    onChange={(e) => setChargeForm(prev => ({ ...prev, period_year: Number(e.target.value) }))}
                    className="select-luxury w-full"
                  >
                    {[2025, 2026, 2027, 2028].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="field-label">Description (optional)</label>
                <textarea
                  value={chargeForm.description}
                  onChange={(e) => setChargeForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input-luxury w-full"
                  rows={2}
                  placeholder="Additional context"
                />
              </div>

              <p className="text-xs text-luxury-gray-3">
                This charge will be added to the existing unpaid invoice for the selected month. The invoice total will be updated automatically.
              </p>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddChargeModal(false)}
                  className="btn btn-secondary"
                  disabled={savingCharge}
                >
                  Cancel
                </button>
                <button
                  onClick={saveCharge}
                  className="btn btn-primary"
                  disabled={savingCharge}
                >
                  {savingCharge ? 'Saving...' : 'Add Charge'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
