'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Receipt, Search, ArrowLeft, Send, CheckCircle, Clock, AlertTriangle, DollarSign, Pencil, X } from 'lucide-react'

interface Invoice {
  id: string
  period_month: number
  period_year: number
  rent_amount: number
  late_fee: number
  other_charges: number
  other_charges_description: string | null
  deposit_amount: number
  deposit_description: string | null
  total_amount: number
  due_date: string
  status: string
  paid_at: string | null
  paid_amount: number | null
  payload_payment_link_url: string | null
  notes: string | null
  tenant_id: string
  landlord_id: string
  property_id: string
  lease_id: string
  tenants?: {
    first_name: string
    last_name: string
    email: string
  }
  managed_properties?: {
    property_address: string
    unit: string | null
    city: string
  }
  landlords?: {
    first_name: string
    last_name: string
  }
}

interface Stats {
  pending: number
  sent: number
  overdue: number
  paid: number
  totalOutstanding: number
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)
  // Edit modal state. Holds the invoice being edited, the form values, and
  // a saving flag while PATCH is in flight.
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [editForm, setEditForm] = useState({
    rent_amount: '',
    late_fee: '',
    other_charges: '',
    other_charges_description: '',
    deposit_amount: '',
    deposit_description: '',
    due_date: '',
    status: 'pending',
    notes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    sent: 0,
    overdue: 0,
    paid: 0,
    totalOutstanding: 0
  })

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
        calculateStats(data.invoices || [])
      }
    } catch (err) {
      console.error('Failed to load invoices:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateStats = (invoiceList: Invoice[]) => {
    const newStats: Stats = {
      pending: 0,
      sent: 0,
      overdue: 0,
      paid: 0,
      totalOutstanding: 0
    }
    
    invoiceList.forEach(inv => {
      if (inv.status === 'pending') newStats.pending++
      else if (inv.status === 'sent') newStats.sent++
      else if (inv.status === 'overdue') newStats.overdue++
      else if (inv.status === 'paid') newStats.paid++
      
      if (['pending', 'sent', 'overdue'].includes(inv.status)) {
        newStats.totalOutstanding += inv.total_amount
      }
    })
    
    setStats(newStats)
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadInvoices, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter])

  const formatDate = (date: string) => {
    // Append T12:00:00 to date-only strings to prevent timezone shift
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
  }

  // Helper to parse date-only strings correctly
  const parseDate = (date: string) => {
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr)
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      pending: { bg: 'bg-gray-50 text-gray-600', icon: <Clock size={12} /> },
      sent: { bg: 'bg-blue-50 text-blue-700', icon: <Send size={12} /> },
      overdue: { bg: 'bg-red-50 text-red-700', icon: <AlertTriangle size={12} /> },
      paid: { bg: 'bg-green-50 text-green-700', icon: <CheckCircle size={12} /> },
      partial: { bg: 'bg-amber-50 text-amber-700', icon: <DollarSign size={12} /> },
      cancelled: { bg: 'bg-gray-50 text-gray-400', icon: null },
    }
    const style = styles[status] || styles.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
        {style.icon}
        {status}
      </span>
    )
  }

  const sendInvoice = async (invoiceId: string) => {
    if (sendingId) return
    setSendingId(invoiceId)
    
    try {
      const res = await fetch('/api/pm/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId })
      })
      
      if (res.ok) {
        loadInvoices()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to send invoice')
      }
    } catch (err) {
      console.error('Failed to send invoice:', err)
      alert('Failed to send invoice')
    } finally {
      setSendingId(null)
    }
  }

  const markAsPaid = async (invoice: Invoice) => {
    if (!confirm(`Mark invoice for ${invoice.tenants?.first_name} ${invoice.tenants?.last_name} (${formatMoney(invoice.total_amount)}) as paid via Zelle?`)) {
      return
    }
    
    setMarkingPaidId(invoice.id)
    
    try {
      const res = await fetch(`/api/pm/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_amount: invoice.total_amount,
          payment_method: 'zelle'
        })
      })
      
      if (res.ok) {
        loadInvoices()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to mark as paid')
      }
    } catch (err) {
      console.error('Failed to mark as paid:', err)
      alert('Failed to mark as paid')
    } finally {
      setMarkingPaidId(null)
    }
  }

  const openEditModal = (invoice: Invoice) => {
    setEditingInvoice(invoice)
    setEditForm({
      rent_amount: String(invoice.rent_amount ?? ''),
      late_fee: String(invoice.late_fee ?? ''),
      other_charges: String(invoice.other_charges ?? ''),
      other_charges_description: invoice.other_charges_description || '',
      deposit_amount: String(invoice.deposit_amount ?? ''),
      deposit_description: invoice.deposit_description || '',
      due_date: invoice.due_date,
      status: invoice.status,
      notes: invoice.notes || '',
    })
  }

  const closeEditModal = () => {
    setEditingInvoice(null)
  }

  const saveEdit = async () => {
    if (!editingInvoice) return

    setSavingEdit(true)
    try {
      // Build PATCH body. For paid invoices, only notes/status are editable
      // per server-side allowlist; sending other fields is harmless but
      // pointless. For unpaid, exclude 'paid' as a target status - paid
      // marking happens in Payload, not here.
      const isPaid = editingInvoice.status === 'paid'
      const body: Record<string, any> = isPaid
        ? {
            notes: editForm.notes || null,
            status: editForm.status,
          }
        : {
            rent_amount: parseFloat(editForm.rent_amount) || 0,
            late_fee: parseFloat(editForm.late_fee) || 0,
            other_charges: parseFloat(editForm.other_charges) || 0,
            other_charges_description: editForm.other_charges_description || null,
            deposit_amount: parseFloat(editForm.deposit_amount) || 0,
            deposit_description: editForm.deposit_description || null,
            due_date: editForm.due_date,
            status: editForm.status,
            notes: editForm.notes || null,
          }

      const res = await fetch(`/api/pm/invoices/${editingInvoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        closeEditModal()
        loadInvoices()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save invoice')
      }
    } catch (err) {
      console.error('Failed to save invoice:', err)
      alert('Failed to save invoice')
    } finally {
      setSavingEdit(false)
    }
  }

  const isOverdue = (invoice: Invoice) => {
    if (['paid', 'cancelled'].includes(invoice.status)) return false
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    return parseDate(invoice.due_date) < now
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <ArrowLeft size={20} />
        </Link>
        <Receipt size={24} className="text-luxury-accent" />
        <h1 className="page-title">Invoices</h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.sent}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Sent</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Overdue</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-green-600">{stats.paid}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Paid</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-luxury-accent">{formatMoney(stats.totalOutstanding)}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Outstanding</div>
        </div>
      </div>

      {/* Filters */}
      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by tenant or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-luxury pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-luxury w-full sm:w-40"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12">
            <Receipt size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No invoices found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Invoices are auto-generated when leases are created
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-luxury-gray-5/50">
                  <th className="th-luxury">Period</th>
                  <th className="th-luxury">Tenant</th>
                  <th className="th-luxury">Property</th>
                  <th className="th-luxury">Amount</th>
                  <th className="th-luxury">Due Date</th>
                  <th className="th-luxury">Status</th>
                  <th className="th-luxury">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="tr-luxury"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">
                        {getMonthName(invoice.period_month)} {invoice.period_year}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {invoice.tenants ? (
                        <div>
                          <div className="font-medium text-luxury-gray-1">
                            {invoice.tenants.first_name} {invoice.tenants.last_name}
                          </div>
                          <div className="text-xs text-luxury-gray-3">{invoice.tenants.email}</div>
                        </div>
                      ) : (
                        <span className="text-luxury-gray-3">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-luxury-gray-1">
                        {invoice.managed_properties?.property_address}
                        {invoice.managed_properties?.unit && ` ${invoice.managed_properties.unit}`}
                      </div>
                      <div className="text-xs text-luxury-gray-3">
                        {invoice.managed_properties?.city}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="font-medium text-luxury-gray-1">
                        {formatMoney(invoice.total_amount)}
                      </div>
                      {invoice.late_fee > 0 && (
                        <div className="text-xs text-red-600">
                          incl. {formatMoney(invoice.late_fee)} late fee
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className={`text-sm ${isOverdue(invoice) ? 'text-red-600 font-medium' : 'text-luxury-gray-1'}`}>
                        {formatDate(invoice.due_date)}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(invoice.status)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(invoice)}
                          className="btn btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                          title="Edit invoice"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        {invoice.status === 'pending' && (
                          <button
                            onClick={() => sendInvoice(invoice.id)}
                            disabled={sendingId === invoice.id}
                            className="btn btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                          >
                            <Send size={12} />
                            {sendingId === invoice.id ? 'Sending...' : 'Send'}
                          </button>
                        )}
                        {['sent', 'overdue'].includes(invoice.status) && (
                          <>
                            <button
                              onClick={() => markAsPaid(invoice)}
                              disabled={markingPaidId === invoice.id}
                              className="btn btn-primary text-xs py-1 px-3 flex items-center gap-1"
                            >
                              <CheckCircle size={12} />
                              {markingPaidId === invoice.id ? 'Saving...' : 'Mark Paid'}
                            </button>
                            {invoice.payload_payment_link_url && (
                              <a
                                href={invoice.payload_payment_link_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-luxury-accent hover:underline"
                              >
                                Link
                              </a>
                            )}
                          </>
                        )}
                        {invoice.status === 'paid' && invoice.paid_at && (
                          <span className="text-xs text-green-600">
                            Paid {formatDate(invoice.paid_at)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Edit Invoice</h2>
              <button
                onClick={closeEditModal}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="inner-card">
                <div className="text-xs text-luxury-gray-3 uppercase tracking-widest mb-1">
                  Invoice
                </div>
                <div className="text-sm text-luxury-gray-1">
                  {getMonthName(editingInvoice.period_month)} {editingInvoice.period_year}
                </div>
                {editingInvoice.tenants && (
                  <div className="text-xs text-luxury-gray-3 mt-1">
                    {editingInvoice.tenants.first_name} {editingInvoice.tenants.last_name}
                  </div>
                )}
                {editingInvoice.managed_properties && (
                  <div className="text-xs text-luxury-gray-3">
                    {editingInvoice.managed_properties.property_address}
                  </div>
                )}
              </div>

              {editingInvoice.status === 'paid' ? (
                // Paid invoices: only notes + status editable. Payments are
                // tracked in Payload so we deliberately do not let admin
                // touch rent/late_fee/etc on a paid invoice.
                <>
                  <div className="text-xs text-amber-700">
                    This invoice has been paid. Only notes and status are editable here.
                  </div>
                  <div>
                    <label className="field-label">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="select-luxury w-full"
                    >
                      <option value="paid">Paid</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="input-luxury w-full"
                      rows={3}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Rent Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.rent_amount}
                          onChange={(e) => setEditForm(prev => ({ ...prev, rent_amount: e.target.value }))}
                          className="input-luxury w-full pl-7"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="field-label">Late Fee</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.late_fee}
                          onChange={(e) => setEditForm(prev => ({ ...prev, late_fee: e.target.value }))}
                          className="input-luxury w-full pl-7"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="field-label">Other Charges</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.other_charges}
                        onChange={(e) => setEditForm(prev => ({ ...prev, other_charges: e.target.value }))}
                        className="input-luxury w-full pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {parseFloat(editForm.other_charges) > 0 && (
                    <div>
                      <label className="field-label">Other Charges Description</label>
                      <input
                        type="text"
                        value={editForm.other_charges_description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, other_charges_description: e.target.value }))}
                        className="input-luxury w-full"
                        placeholder="e.g., Pet fee, utility reimbursement"
                      />
                    </div>
                  )}

                  <div>
                    <label className="field-label">Security Deposit</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={editForm.deposit_amount}
                        onChange={(e) => setEditForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                        className="input-luxury w-full pl-7"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {parseFloat(editForm.deposit_amount) > 0 && (
                    <div>
                      <label className="field-label">Deposit Description</label>
                      <input
                        type="text"
                        value={editForm.deposit_description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, deposit_description: e.target.value }))}
                        className="input-luxury w-full"
                        placeholder="e.g., Security deposit"
                      />
                    </div>
                  )}

                  <div>
                    <label className="field-label">Due Date</label>
                    <input
                      type="date"
                      value={editForm.due_date}
                      onChange={(e) => setEditForm(prev => ({ ...prev, due_date: e.target.value }))}
                      className="input-luxury w-full"
                    />
                  </div>

                  <div>
                    <label className="field-label">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                      className="select-luxury w-full"
                    >
                      <option value="pending">Pending</option>
                      <option value="sent">Sent</option>
                      <option value="overdue">Overdue</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <p className="text-xs text-luxury-gray-3 mt-1">
                      Paid status is set automatically when payment is received in Payload.
                    </p>
                  </div>

                  <div>
                    <label className="field-label">Notes</label>
                    <textarea
                      value={editForm.notes}
                      onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                      className="input-luxury w-full"
                      rows={3}
                    />
                  </div>

                  {/* Recalculated total preview */}
                  <div className="inner-card">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-luxury-gray-3">New Total</span>
                      <span className="text-xl font-bold text-luxury-gray-1">
                        {formatMoney(
                          (parseFloat(editForm.rent_amount) || 0) +
                          (parseFloat(editForm.late_fee) || 0) +
                          (parseFloat(editForm.other_charges) || 0) +
                          (parseFloat(editForm.deposit_amount) || 0)
                        )}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={closeEditModal}
                className="btn btn-secondary"
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                className="btn btn-primary"
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}