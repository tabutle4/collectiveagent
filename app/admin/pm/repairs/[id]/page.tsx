'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { 
  Wrench, ArrowLeft, Building2, User, AlertTriangle, Save,
  Clock, CheckCircle, Loader2, XCircle, DollarSign, FileText
} from 'lucide-react'

interface Repair {
  id: string
  property_id: string
  tenant_id: string | null
  landlord_id: string
  lease_id: string | null
  created_by_type: string
  category: string
  urgency: string
  title: string
  description: string | null
  photos: string[]
  status: string
  vendor_name: string | null
  vendor_phone: string | null
  vendor_email: string | null
  estimated_cost: number | null
  actual_cost: number | null
  invoice_url: string | null
  payment_status: string
  payment_date: string | null
  completed_at: string | null
  admin_notes: string | null
  created_at: string
  managed_properties?: {
    id: string
    property_address: string
    unit: string | null
    city: string
    state: string
    zip: string
  }
  tenants?: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
  }
  landlords?: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
  }
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
  { value: 'routine', label: 'Routine' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'emergency', label: 'Emergency' },
]

const STATUSES = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'landlord_paid', label: 'Landlord Paid' },
  { value: 'deducted_from_rent', label: 'Deducted from Rent' },
  { value: 'not_applicable', label: 'N/A' },
]

export default function RepairDetailPage() {
  const router = useRouter()
  const params = useParams()
  const repairId = params.id as string
  
  const [repair, setRepair] = useState<Repair | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [form, setForm] = useState({
    category: '',
    urgency: '',
    title: '',
    description: '',
    status: '',
    vendor_name: '',
    vendor_phone: '',
    vendor_email: '',
    estimated_cost: '',
    actual_cost: '',
    invoice_url: '',
    payment_status: '',
    admin_notes: ''
  })

  useEffect(() => {
    loadRepair()
  }, [repairId])

  const loadRepair = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/repair-requests/${repairId}`)
      if (res.ok) {
        const data = await res.json()
        setRepair(data.repair)
        setForm({
          category: data.repair.category || '',
          urgency: data.repair.urgency || '',
          title: data.repair.title || '',
          description: data.repair.description || '',
          status: data.repair.status || '',
          vendor_name: data.repair.vendor_name || '',
          vendor_phone: data.repair.vendor_phone || '',
          vendor_email: data.repair.vendor_email || '',
          estimated_cost: data.repair.estimated_cost?.toString() || '',
          actual_cost: data.repair.actual_cost?.toString() || '',
          invoice_url: data.repair.invoice_url || '',
          payment_status: data.repair.payment_status || '',
          admin_notes: data.repair.admin_notes || ''
        })
      } else {
        setError('Repair request not found')
      }
    } catch (err) {
      console.error('Failed to load repair:', err)
      setError('Failed to load repair request')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    
    try {
      const res = await fetch(`/api/pm/repair-requests/${repairId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category,
          urgency: form.urgency,
          title: form.title.trim(),
          description: form.description.trim() || null,
          status: form.status,
          vendor_name: form.vendor_name.trim() || null,
          vendor_phone: form.vendor_phone.trim() || null,
          vendor_email: form.vendor_email.trim() || null,
          estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
          actual_cost: form.actual_cost ? parseFloat(form.actual_cost) : null,
          invoice_url: form.invoice_url.trim() || null,
          payment_status: form.payment_status,
          admin_notes: form.admin_notes.trim() || null
        })
      })
      
      if (res.ok) {
        const data = await res.json()
        setRepair(data.repair)
        setSuccess('Repair request updated')
        setTimeout(() => setSuccess(''), 3000)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update')
      }
    } catch (err) {
      console.error('Failed to update repair:', err)
      setError('An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (date: string) => {
    // For date-only strings, append T12:00:00 to prevent timezone shift
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', day: 'numeric', year: 'numeric', 
      hour: 'numeric', minute: '2-digit'
    })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getStatusIcon = (status: string) => {
    const icons: Record<string, React.ReactNode> = {
      submitted: <Clock size={16} className="text-blue-600" />,
      approved: <CheckCircle size={16} className="text-purple-600" />,
      in_progress: <Loader2 size={16} className="text-amber-600" />,
      completed: <CheckCircle size={16} className="text-green-600" />,
      cancelled: <XCircle size={16} className="text-gray-400" />,
    }
    return icons[status] || icons.submitted
  }

  if (loading) {
    return (
      <div className="text-center py-12 text-luxury-gray-3">Loading...</div>
    )
  }

  if (!repair) {
    return (
      <div>
        <div className="alert-error">{error || 'Repair request not found'}</div>
        <Link href="/admin/pm/repairs" className="btn btn-secondary mt-4">
          Back to Repairs
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/pm/repairs" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <Wrench size={24} className="text-luxury-accent" />
          <div>
            <h1 className="page-title">{repair.title}</h1>
            <p className="text-sm text-luxury-gray-3">
              Created {formatDate(repair.created_at)}
              {repair.created_by_type === 'tenant' && ' by tenant'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(repair.status)}
          <span className="text-sm font-medium text-luxury-gray-1 capitalize">
            {repair.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {error && (
        <div className="alert-error mb-6 flex items-center gap-2">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      {success && (
        <div className="alert-success mb-6 flex items-center gap-2">
          <CheckCircle size={16} />
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit}>
            {/* Status & Details */}
            <div className="container-card mb-6">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Request Details
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="field-label">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="select-luxury w-full"
                  >
                    {STATUSES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="field-label">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="select-luxury w-full"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="field-label">Urgency</label>
                  <select
                    value={form.urgency}
                    onChange={(e) => setForm({ ...form, urgency: e.target.value })}
                    className="select-luxury w-full"
                  >
                    {URGENCIES.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="field-label">Title</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="input-luxury w-full"
                />
              </div>

              <div>
                <label className="field-label">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="textarea-luxury w-full"
                />
              </div>
            </div>

            {/* Vendor & Cost */}
            <div className="container-card mb-6">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                Vendor & Cost
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="field-label">Vendor Name</label>
                  <input
                    type="text"
                    value={form.vendor_name}
                    onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
                    className="input-luxury w-full"
                  />
                </div>
                
                <div>
                  <label className="field-label">Vendor Phone</label>
                  <input
                    type="tel"
                    value={form.vendor_phone}
                    onChange={(e) => setForm({ ...form, vendor_phone: e.target.value })}
                    className="input-luxury w-full"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="field-label">Vendor Email</label>
                <input
                  type="email"
                  value={form.vendor_email}
                  onChange={(e) => setForm({ ...form, vendor_email: e.target.value })}
                  className="input-luxury w-full"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                      className="input-luxury w-full pl-7"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="field-label">Actual Cost</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.actual_cost}
                      onChange={(e) => setForm({ ...form, actual_cost: e.target.value })}
                      className="input-luxury w-full pl-7"
                    />
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="field-label">Invoice URL</label>
                <input
                  type="url"
                  value={form.invoice_url}
                  onChange={(e) => setForm({ ...form, invoice_url: e.target.value })}
                  placeholder="https://..."
                  className="input-luxury w-full"
                />
              </div>

              <div>
                <label className="field-label">Payment Status</label>
                <select
                  value={form.payment_status}
                  onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
                  className="select-luxury w-full"
                >
                  {PAYMENT_STATUSES.map(ps => (
                    <option key={ps.value} value={ps.value}>{ps.label}</option>
                  ))}
                </select>
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
                disabled={saving}
                className="btn btn-primary flex-1 flex items-center justify-center gap-2"
              >
                <Save size={16} />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <Link href="/admin/pm/repairs" className="btn btn-secondary">
                Cancel
              </Link>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Property Card */}
          {repair.managed_properties && (
            <div className="container-card">
              <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                Property
              </h3>
              <div className="inner-card">
                <div className="flex items-start gap-3">
                  <Building2 size={20} className="text-luxury-accent mt-0.5" />
                  <div>
                    <Link 
                      href={`/admin/pm/properties/${repair.property_id}`}
                      className="font-medium text-luxury-gray-1 hover:text-luxury-accent"
                    >
                      {repair.managed_properties.property_address}
                      {repair.managed_properties.unit && ` ${repair.managed_properties.unit}`}
                    </Link>
                    <div className="text-sm text-luxury-gray-3">
                      {repair.managed_properties.city}, {repair.managed_properties.state} {repair.managed_properties.zip}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Landlord Card */}
          {repair.landlords && (
            <div className="container-card">
              <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                Landlord
              </h3>
              <div className="inner-card">
                <div className="flex items-start gap-3">
                  <User size={20} className="text-luxury-accent mt-0.5" />
                  <div>
                    <Link 
                      href={`/admin/pm/landlords/${repair.landlord_id}`}
                      className="font-medium text-luxury-gray-1 hover:text-luxury-accent"
                    >
                      {repair.landlords.first_name} {repair.landlords.last_name}
                    </Link>
                    <div className="text-sm text-luxury-gray-3">{repair.landlords.email}</div>
                    {repair.landlords.phone && (
                      <div className="text-sm text-luxury-gray-3">{repair.landlords.phone}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tenant Card */}
          {repair.tenants && (
            <div className="container-card">
              <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                Tenant
              </h3>
              <div className="inner-card">
                <div className="flex items-start gap-3">
                  <User size={20} className="text-luxury-gray-3 mt-0.5" />
                  <div>
                    <Link 
                      href={`/admin/pm/tenants/${repair.tenant_id}`}
                      className="font-medium text-luxury-gray-1 hover:text-luxury-accent"
                    >
                      {repair.tenants.first_name} {repair.tenants.last_name}
                    </Link>
                    <div className="text-sm text-luxury-gray-3">{repair.tenants.email}</div>
                    {repair.tenants.phone && (
                      <div className="text-sm text-luxury-gray-3">{repair.tenants.phone}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Cost Summary */}
          {(repair.estimated_cost || repair.actual_cost) && (
            <div className="container-card">
              <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                Cost Summary
              </h3>
              <div className="inner-card space-y-2">
                {repair.estimated_cost && (
                  <div className="flex justify-between">
                    <span className="text-sm text-luxury-gray-3">Estimated</span>
                    <span className="text-sm text-luxury-gray-1">{formatMoney(repair.estimated_cost)}</span>
                  </div>
                )}
                {repair.actual_cost && (
                  <div className="flex justify-between">
                    <span className="text-sm text-luxury-gray-3">Actual</span>
                    <span className="text-sm font-semibold text-luxury-gray-1">{formatMoney(repair.actual_cost)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="container-card">
            <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
              Timeline
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <div>
                  <div className="text-sm text-luxury-gray-1">Created</div>
                  <div className="text-xs text-luxury-gray-3">{formatDate(repair.created_at)}</div>
                </div>
              </div>
              {repair.completed_at && (
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <div>
                    <div className="text-sm text-luxury-gray-1">Completed</div>
                    <div className="text-xs text-luxury-gray-3">{formatDate(repair.completed_at)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}