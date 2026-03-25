'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  ExternalLink,
  CheckCircle,
  Clock,
  Home,
  FileText,
  DollarSign,
  Copy,
} from 'lucide-react'

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: string
  dashboard_token: string
  notes: string | null
  created_at: string
}

interface Lease {
  id: string
  property_id: string
  monthly_rent: number
  lease_start: string
  lease_end: string
  status: string
  managed_properties: {
    property_address: string
    city: string
  }
}

interface Invoice {
  id: string
  total_amount: number
  period_month: number
  period_year: number
  status: string
  due_date: string
  paid_at: string | null
}

export default function TenantDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [leases, setLeases] = useState<Lease[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<Tenant>>({})

  useEffect(() => {
    loadTenant()
  }, [id])

  const loadTenant = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/tenants/${id}`)
      if (!res.ok) throw new Error('Tenant not found')
      const data = await res.json()
      setTenant(data.tenant)
      setLeases(data.leases || [])
      setInvoices(data.invoices || [])
      setForm(data.tenant)
    } catch (err) {
      console.error('Error loading tenant:', err)
      setError('Failed to load tenant')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch(`/api/pm/tenants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to update tenant')
      const data = await res.json()
      setTenant(data.tenant)
      setForm(data.tenant)
      setIsEditing(false)
      setSuccess('Tenant updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const copyDashboardLink = () => {
    if (!tenant) return
    const url = `${window.location.origin}/pm/tenant/${tenant.dashboard_token}`
    navigator.clipboard.writeText(url)
    setSuccess('Dashboard link copied to clipboard')
    setTimeout(() => setSuccess(''), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700">
            <CheckCircle size={12} /> {status === 'paid' ? 'Paid' : 'Active'}
          </span>
        )
      case 'pending':
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-50 text-yellow-700">
            <Clock size={12} /> Pending
          </span>
        )
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
            Overdue
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-50 text-gray-600">
            {status}
          </span>
        )
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const ds = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`
    return new Date(ds).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/pm/tenants" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <div className="h-6 w-48 bg-luxury-gray-5/50 rounded animate-pulse"></div>
        </div>
        <div className="container-card h-96 flex items-center justify-center">
          <p className="text-sm text-luxury-gray-3">Loading tenant...</p>
        </div>
      </div>
    )
  }

  if (!tenant) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/pm/tenants" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <h1 className="page-title">Tenant Not Found</h1>
        </div>
      </div>
    )
  }

  const currentBalance = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'cancelled')
    .reduce((sum, i) => sum + i.total_amount, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/pm/tenants" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <div>
            <h1 className="page-title">
              {tenant.first_name} {tenant.last_name}
            </h1>
            <p className="text-xs text-luxury-gray-3">{tenant.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyDashboardLink}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Copy size={14} />
            Copy Dashboard Link
          </button>
          <a
            href={`${window.location.origin}/pm/tenant/${tenant.dashboard_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Open Dashboard
          </a>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="alert-error">{error}</div>}
      {success && <div className="alert-success">{success}</div>}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Contact Info */}
          <div className="container-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
                Contact Information
              </h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="text-xs text-luxury-accent hover:underline"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditing(false)
                      setForm(tenant)
                    }}
                    className="text-xs text-luxury-gray-3 hover:underline"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                  >
                    <Save size={12} />
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {isEditing ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={form.first_name || ''}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={form.last_name || ''}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={form.email || ''}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div>
                  <label className="field-label">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone || ''}
                    onChange={handleChange}
                    className="input-luxury"
                  />
                </div>
                <div className="col-span-2">
                  <label className="field-label">Status</label>
                  <select
                    name="status"
                    value={form.status || ''}
                    onChange={handleChange}
                    className="select-luxury"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-luxury-gray-3">Name</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {tenant.first_name} {tenant.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Email</p>
                  <p className="text-sm font-medium text-luxury-gray-1">{tenant.email}</p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Phone</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {tenant.phone || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Status</p>
                  {getStatusBadge(tenant.status)}
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="mt-4 pt-4 border-t border-luxury-gray-5/50">
              <p className="text-xs text-luxury-gray-3 mb-2">Notes</p>
              {isEditing ? (
                <textarea
                  name="notes"
                  value={form.notes || ''}
                  onChange={handleChange}
                  className="textarea-luxury"
                  rows={3}
                />
              ) : (
                <p className="text-sm text-luxury-gray-1">{tenant.notes || 'No notes'}</p>
              )}
            </div>
          </div>

          {/* Leases */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Leases ({leases.length})
            </h2>

            {leases.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-6">No leases yet</p>
            ) : (
              <div className="space-y-2">
                {leases.map((lease) => (
                  <Link
                    key={lease.id}
                    href={`/admin/pm/leases/${lease.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Home size={16} className="text-luxury-gray-3" />
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">
                          {lease.managed_properties.property_address}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {formatCurrency(lease.monthly_rent)}/mo &bull;{' '}
                          {formatDate(lease.lease_start)} - {formatDate(lease.lease_end)}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(lease.status)}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Invoices */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Invoices
            </h2>

            {invoices.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-6">No invoices yet</p>
            ) : (
              <div className="space-y-2">
                {invoices.slice(0, 10).map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-luxury-light"
                  >
                    <div className="flex items-center gap-3">
                      <FileText size={16} className="text-luxury-gray-3" />
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">
                          {formatCurrency(invoice.total_amount)}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {invoice.period_month}/{invoice.period_year} &bull; Due{' '}
                          {formatDate(invoice.due_date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(invoice.status)}
                      {invoice.paid_at && (
                        <p className="text-xs text-luxury-gray-3 mt-1">
                          Paid {formatDate(invoice.paid_at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Balance */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Current Balance
            </h2>
            <p
              className={`text-3xl font-semibold ${currentBalance > 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {formatCurrency(currentBalance)}
            </p>
            {currentBalance > 0 && (
              <p className="text-xs text-luxury-gray-3 mt-1">
                {invoices.filter((i) => i.status === 'overdue').length} overdue invoices
              </p>
            )}
          </div>

          {/* Quick Info */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Quick Info
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-luxury-gray-3">Added</p>
                <p className="text-sm font-medium text-luxury-gray-1">
                  {formatDate(tenant.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3">Total Invoices</p>
                <p className="text-sm font-medium text-luxury-gray-1">{invoices.length}</p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3">Total Paid</p>
                <p className="text-sm font-medium text-luxury-gray-1">
                  {formatCurrency(
                    invoices
                      .filter((i) => i.status === 'paid')
                      .reduce((sum, i) => sum + i.total_amount, 0)
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
