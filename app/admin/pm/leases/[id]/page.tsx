'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, ArrowLeft, Save, Send, ExternalLink } from 'lucide-react'

interface Lease {
  id: string
  lease_start: string
  lease_end: string
  move_in_date: string | null
  monthly_rent: number
  rent_due_day: number
  security_deposit: number
  late_fee_grace_days: number | null
  late_fee_initial: number | null
  late_fee_daily: number | null
  late_fee_max_days: number | null
  late_fee_cap_pct: number | null
  returned_payment_fee: number | null
  status: string
  notes: string | null
  property_id: string
  tenant_id: string
  landlord_id: string
  managed_properties?: {
    id: string
    property_address: string
    unit: string | null
    city: string
    state: string
    unit_count: number
  }
  tenants?: {
    id: string
    first_name: string
    last_name: string
    email: string
    phone: string | null
    dashboard_token: string
  }
  landlords?: {
    id: string
    first_name: string
    last_name: string
    email: string
  }
}

interface Invoice {
  id: string
  period_month: number
  period_year: number
  rent_amount: number
  late_fee: number
  other_charges: number
  total_amount: number
  due_date: string
  status: string
  paid_at: string | null
  paid_amount: number | null
}

export default function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [lease, setLease] = useState<Lease | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    lease_start: '',
    lease_end: '',
    move_in_date: '',
    monthly_rent: '',
    rent_due_day: '1',
    security_deposit: '',
    late_fee_grace_days: '',
    late_fee_initial: '',
    late_fee_daily: '',
    late_fee_max_days: '',
    returned_payment_fee: '',
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
    loadLease()
  }

  const loadLease = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/leases/${id}`)
      if (!res.ok) {
        router.push('/admin/pm/leases')
        return
      }
      const data = await res.json()
      setLease(data.lease)
      setInvoices(data.invoices || [])

      const l = data.lease
      setForm({
        lease_start: l.lease_start || '',
        lease_end: l.lease_end || '',
        move_in_date: l.move_in_date || '',
        monthly_rent: l.monthly_rent?.toString() || '',
        rent_due_day: l.rent_due_day?.toString() || '1',
        security_deposit: l.security_deposit?.toString() || '',
        late_fee_grace_days: l.late_fee_grace_days?.toString() || '',
        late_fee_initial: l.late_fee_initial?.toString() || '',
        late_fee_daily: l.late_fee_daily?.toString() || '',
        late_fee_max_days: l.late_fee_max_days?.toString() || '',
        returned_payment_fee: l.returned_payment_fee?.toString() || '',
        status: l.status || 'active',
        notes: l.notes || '',
      })
    } catch (err) {
      console.error('Failed to load lease:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/pm/leases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monthly_rent: Number(form.monthly_rent),
          rent_due_day: Number(form.rent_due_day) || 1,
          security_deposit: form.security_deposit ? Number(form.security_deposit) : 0,
          late_fee_grace_days: form.late_fee_grace_days ? Number(form.late_fee_grace_days) : null,
          late_fee_initial: form.late_fee_initial ? Number(form.late_fee_initial) : null,
          late_fee_daily: form.late_fee_daily ? Number(form.late_fee_daily) : null,
          late_fee_max_days: form.late_fee_max_days ? Number(form.late_fee_max_days) : null,
          returned_payment_fee: form.returned_payment_fee ? Number(form.returned_payment_fee) : null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update lease')
      }

      setSuccess('Lease updated')
      loadLease()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch('/api/pm/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to send invoice')
      }

      setSuccess('Invoice sent')
      loadLease()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleDateString('en-US', { month: 'short' })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-100 text-gray-600',
      sent: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800',
      partial: 'bg-yellow-100 text-yellow-800',
      overdue: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-500',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status] || styles.pending}`}>
        {status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-12 text-luxury-gray-3">Loading lease...</div>
      </div>
    )
  }

  if (!lease) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-center py-12 text-luxury-gray-3">Lease not found</div>
      </div>
    )
  }

  const pendingInvoices = invoices.filter(i => i.status === 'pending' || i.status === 'overdue')
  const totalOutstanding = pendingInvoices.reduce((sum, i) => sum + i.total_amount, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm/leases" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <FileText className="w-6 h-6 text-luxury-accent" />
        <div>
          <h1 className="page-title">
            {lease.managed_properties?.property_address}
            {lease.managed_properties?.unit && ` ${lease.managed_properties.unit}`}
          </h1>
          <p className="text-sm text-luxury-gray-3">
            {lease.tenants?.first_name} {lease.tenants?.last_name} — {formatMoney(lease.monthly_rent)}/mo
          </p>
        </div>
      </div>

      {error && <div className="alert-error mb-4">{error}</div>}
      {success && <div className="alert-success mb-4">{success}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Lease Details */}
          <div className="container-card">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Lease Details</p>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary text-sm flex items-center gap-2">
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="field-label">Lease Start</label>
                <input
                  type="date"
                  name="lease_start"
                  value={form.lease_start}
                  onChange={handleChange}
                  className="input-luxury w-full"
                />
              </div>
              <div>
                <label className="field-label">Lease End</label>
                <input
                  type="date"
                  name="lease_end"
                  value={form.lease_end}
                  onChange={handleChange}
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
              <div>
                <label className="field-label">Monthly Rent</label>
                <input
                  type="number"
                  name="monthly_rent"
                  value={form.monthly_rent}
                  onChange={handleChange}
                  step="0.01"
                  className="input-luxury w-full"
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
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
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
                  step="0.01"
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
                  <option value="expired">Expired</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-luxury-gray-5">
              <label className="field-label">Notes</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                rows={2}
                className="textarea-luxury w-full"
              />
            </div>
          </div>

          {/* Invoices */}
          <div className="container-card">
            <div className="flex justify-between items-center mb-4">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Invoices</p>
              {totalOutstanding > 0 && (
                <span className="text-sm font-medium text-red-600">
                  {formatMoney(totalOutstanding)} outstanding
                </span>
              )}
            </div>

            {invoices.length === 0 ? (
              <p className="text-sm text-luxury-gray-3 py-4">No invoices for this lease</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="th-luxury">
                      <th className="text-left py-2 px-3">Period</th>
                      <th className="text-right py-2 px-3">Rent</th>
                      <th className="text-right py-2 px-3">Late Fee</th>
                      <th className="text-right py-2 px-3">Total</th>
                      <th className="text-left py-2 px-3">Due</th>
                      <th className="text-left py-2 px-3">Status</th>
                      <th className="text-right py-2 px-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="tr-luxury">
                        <td className="py-2 px-3 font-medium">
                          {getMonthName(inv.period_month)} {inv.period_year}
                        </td>
                        <td className="py-2 px-3 text-right">{formatMoney(inv.rent_amount)}</td>
                        <td className="py-2 px-3 text-right">
                          {inv.late_fee > 0 ? formatMoney(inv.late_fee) : '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-medium">{formatMoney(inv.total_amount)}</td>
                        <td className="py-2 px-3 text-luxury-gray-3">{formatDate(inv.due_date)}</td>
                        <td className="py-2 px-3">{getStatusBadge(inv.status)}</td>
                        <td className="py-2 px-3 text-right">
                          {inv.status === 'pending' && (
                            <button
                              onClick={() => handleSendInvoice(inv.id)}
                              className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                            >
                              <Send className="w-3 h-3" />
                              Send
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Tenant Card */}
          {lease.tenants && (
            <div className="container-card">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Tenant</p>
              <div className="inner-card">
                <p className="font-medium text-luxury-gray-1">
                  {lease.tenants.first_name} {lease.tenants.last_name}
                </p>
                <p className="text-sm text-luxury-gray-3">{lease.tenants.email}</p>
                {lease.tenants.phone && (
                  <p className="text-sm text-luxury-gray-3">{lease.tenants.phone}</p>
                )}
                <div className="flex gap-2 mt-3">
                  <Link
                    href={`/admin/pm/tenants/${lease.tenants.id}`}
                    className="text-xs text-luxury-accent hover:underline"
                  >
                    View Details
                  </Link>
                  <span className="text-luxury-gray-4">|</span>
                  <a
                    href={`/pm/tenant/${lease.tenants.dashboard_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-luxury-accent hover:underline flex items-center gap-1"
                  >
                    Dashboard <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Property Card */}
          {lease.managed_properties && (
            <div className="container-card">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Property</p>
              <div className="inner-card">
                <p className="font-medium text-luxury-gray-1">
                  {lease.managed_properties.property_address}
                  {lease.managed_properties.unit && ` ${lease.managed_properties.unit}`}
                </p>
                <p className="text-sm text-luxury-gray-3">
                  {lease.managed_properties.city}, {lease.managed_properties.state}
                </p>
                <Link
                  href={`/admin/pm/properties/${lease.managed_properties.id}`}
                  className="text-xs text-luxury-accent hover:underline mt-2 inline-block"
                >
                  View Property →
                </Link>
              </div>
            </div>
          )}

          {/* Landlord Card */}
          {lease.landlords && (
            <div className="container-card">
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Landlord</p>
              <div className="inner-card">
                <p className="font-medium text-luxury-gray-1">
                  {lease.landlords.first_name} {lease.landlords.last_name}
                </p>
                <p className="text-sm text-luxury-gray-3">{lease.landlords.email}</p>
                <Link
                  href={`/admin/pm/landlords/${lease.landlords.id}`}
                  className="text-xs text-luxury-accent hover:underline mt-2 inline-block"
                >
                  View Landlord →
                </Link>
              </div>
            </div>
          )}

          {/* Late Fee Info */}
          <div className="container-card">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">Late Fee Rules</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-luxury-gray-3">Grace Days</span>
                <span className="text-luxury-gray-1">{lease.late_fee_grace_days || 2}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-luxury-gray-3">Max Late Fee</span>
                <span className="text-luxury-gray-1">{lease.late_fee_cap_pct || 12}%</span>
              </div>
              {lease.late_fee_initial && (
                <div className="flex justify-between">
                  <span className="text-luxury-gray-3">Initial Fee</span>
                  <span className="text-luxury-gray-1">{formatMoney(lease.late_fee_initial)}</span>
                </div>
              )}
              {lease.late_fee_daily && (
                <div className="flex justify-between">
                  <span className="text-luxury-gray-3">Daily Fee</span>
                  <span className="text-luxury-gray-1">{formatMoney(lease.late_fee_daily)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
