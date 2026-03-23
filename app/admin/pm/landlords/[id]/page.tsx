'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  ExternalLink,
  Send,
  CheckCircle,
  AlertCircle,
  Clock,
  Home,
  FileText,
  DollarSign,
  Copy,
} from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  dashboard_token: string
  w9_status: string
  w9_signed_at: string | null
  bank_status: string
  bank_connected_at: string | null
  status: string
  notes: string | null
  created_at: string
}

interface Property {
  id: string
  property_address: string
  city: string
  status: string
}

interface Disbursement {
  id: string
  net_amount: number
  period_month: number
  period_year: number
  payment_status: string
  payment_date: string | null
}

export default function LandlordDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  const [landlord, setLandlord] = useState<Landlord | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingW9, setSendingW9] = useState(false)
  const [sendingBank, setSendingBank] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState<Partial<Landlord>>({})

  useEffect(() => {
    loadLandlord()
  }, [id])

  const loadLandlord = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/landlords/${id}`)
      if (!res.ok) throw new Error('Landlord not found')
      const data = await res.json()
      setLandlord(data.landlord)
      setProperties(data.properties || [])
      setDisbursements(data.disbursements || [])
      setForm(data.landlord)
    } catch (err) {
      console.error('Error loading landlord:', err)
      setError('Failed to load landlord')
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
      const res = await fetch(`/api/pm/landlords/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to update landlord')
      const data = await res.json()
      setLandlord(data.landlord)
      setForm(data.landlord)
      setIsEditing(false)
      setSuccess('Landlord updated successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const sendW9Request = async () => {
    setSendingW9(true)
    setError('')
    try {
      const res = await fetch('/api/pm/track1099/create-form-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landlord_id: id }),
      })
      if (!res.ok) throw new Error('Failed to send W9 request')
      setSuccess('W9 request sent successfully')
      setTimeout(() => setSuccess(''), 3000)
      loadLandlord()
    } catch (err: any) {
      setError(err.message || 'Failed to send W9 request')
    } finally {
      setSendingW9(false)
    }
  }

  const sendBankActivation = async () => {
    setSendingBank(true)
    setError('')
    try {
      const res = await fetch(`/api/pm/landlords/${id}/send-bank-activation`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to send bank activation')
      setSuccess('Bank activation link sent successfully')
      setTimeout(() => setSuccess(''), 3000)
      loadLandlord()
    } catch (err: any) {
      setError(err.message || 'Failed to send bank activation')
    } finally {
      setSendingBank(false)
    }
  }

  const copyDashboardLink = () => {
    if (!landlord) return
    const url = `${window.location.origin}/pm/landlord/${landlord.dashboard_token}`
    navigator.clipboard.writeText(url)
    setSuccess('Dashboard link copied to clipboard')
    setTimeout(() => setSuccess(''), 2000)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
      case 'connected':
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
            <CheckCircle size={12} /> {status === 'active' ? 'Active' : 'Complete'}
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">
            <Clock size={12} /> Pending
          </span>
        )
      case 'not_started':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            Not Started
          </span>
        )
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
            <AlertCircle size={12} /> Failed
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
            {status}
          </span>
        )
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
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
          <Link href="/admin/pm/landlords" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <div className="h-6 w-48 bg-luxury-gray-5/50 rounded animate-pulse"></div>
        </div>
        <div className="container-card h-96 flex items-center justify-center">
          <p className="text-sm text-luxury-gray-3">Loading landlord...</p>
        </div>
      </div>
    )
  }

  if (!landlord) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/pm/landlords" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <h1 className="page-title">Landlord Not Found</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/pm/landlords" className="p-2 rounded hover:bg-luxury-gray-5/30">
            <ArrowLeft size={18} className="text-luxury-gray-3" />
          </Link>
          <div>
            <h1 className="page-title">
              {landlord.first_name} {landlord.last_name}
            </h1>
            <p className="text-xs text-luxury-gray-3">{landlord.email}</p>
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
            href={`${window.location.origin}/pm/landlord/${landlord.dashboard_token}`}
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
                      setForm(landlord)
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
                    <option value="onboarding">Onboarding</option>
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
                    {landlord.first_name} {landlord.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Email</p>
                  <p className="text-sm font-medium text-luxury-gray-1">{landlord.email}</p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Phone</p>
                  <p className="text-sm font-medium text-luxury-gray-1">
                    {landlord.phone || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-luxury-gray-3">Status</p>
                  {getStatusBadge(landlord.status)}
                </div>
              </div>
            )}

            {/* Mailing Address */}
            <div className="mt-6 pt-4 border-t border-luxury-gray-5/50">
              <p className="text-xs text-luxury-gray-3 mb-2">Mailing Address</p>
              {landlord.mailing_address ? (
                <p className="text-sm text-luxury-gray-1">
                  {landlord.mailing_address}
                  <br />
                  {landlord.mailing_city}, {landlord.mailing_state} {landlord.mailing_zip}
                </p>
              ) : (
                <p className="text-sm text-luxury-gray-3">No address on file</p>
              )}
            </div>

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
                <p className="text-sm text-luxury-gray-1">
                  {landlord.notes || 'No notes'}
                </p>
              )}
            </div>
          </div>

          {/* Properties */}
          <div className="container-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
                Properties ({properties.length})
              </h2>
              <Link
                href={`/admin/pm/properties/new?landlord_id=${id}`}
                className="text-xs text-luxury-accent hover:underline"
              >
                + Add Property
              </Link>
            </div>

            {properties.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-6">No properties yet</p>
            ) : (
              <div className="space-y-2">
                {properties.map((prop) => (
                  <Link
                    key={prop.id}
                    href={`/admin/pm/properties/${prop.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-luxury-light transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Home size={16} className="text-luxury-gray-3" />
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">
                          {prop.property_address}
                        </p>
                        <p className="text-xs text-luxury-gray-3">{prop.city}</p>
                      </div>
                    </div>
                    {getStatusBadge(prop.status)}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Disbursements */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Recent Disbursements
            </h2>

            {disbursements.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 text-center py-6">No disbursements yet</p>
            ) : (
              <div className="space-y-2">
                {disbursements.slice(0, 5).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-luxury-light"
                  >
                    <div className="flex items-center gap-3">
                      <DollarSign size={16} className="text-luxury-gray-3" />
                      <div>
                        <p className="text-sm font-medium text-luxury-gray-1">
                          {formatCurrency(d.net_amount)}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {d.period_month}/{d.period_year}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {getStatusBadge(d.payment_status)}
                      {d.payment_date && (
                        <p className="text-xs text-luxury-gray-3 mt-1">
                          {formatDate(d.payment_date)}
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
          {/* Setup Status */}
          <div className="container-card">
            <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
              Setup Status
            </h2>

            {/* W9 Status */}
            <div className="inner-card mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-luxury-gray-1">W9 Form</p>
                {getStatusBadge(landlord.w9_status)}
              </div>
              {landlord.w9_signed_at && (
                <p className="text-xs text-luxury-gray-3 mb-2">
                  Signed: {formatDate(landlord.w9_signed_at)}
                </p>
              )}
              {landlord.w9_status !== 'completed' && (
                <button
                  onClick={sendW9Request}
                  disabled={sendingW9}
                  className="btn btn-primary w-full text-xs flex items-center justify-center gap-2"
                >
                  <Send size={12} />
                  {sendingW9 ? 'Sending...' : 'Send W9 Request'}
                </button>
              )}
            </div>

            {/* Bank Status */}
            <div className="inner-card">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-luxury-gray-1">Bank Account</p>
                {getStatusBadge(landlord.bank_status)}
              </div>
              {landlord.bank_connected_at && (
                <p className="text-xs text-luxury-gray-3 mb-2">
                  Connected: {formatDate(landlord.bank_connected_at)}
                </p>
              )}
              {landlord.bank_status !== 'connected' && (
                <button
                  onClick={sendBankActivation}
                  disabled={sendingBank}
                  className="btn btn-primary w-full text-xs flex items-center justify-center gap-2"
                >
                  <Send size={12} />
                  {sendingBank ? 'Sending...' : 'Send Bank Activation'}
                </button>
              )}
            </div>
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
                  {formatDate(landlord.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3">Properties</p>
                <p className="text-sm font-medium text-luxury-gray-1">{properties.length}</p>
              </div>
              <div>
                <p className="text-xs text-luxury-gray-3">Total Disbursements</p>
                <p className="text-sm font-medium text-luxury-gray-1">
                  {formatCurrency(
                    disbursements.reduce((sum, d) => sum + (d.net_amount || 0), 0)
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
