'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Receipt, Search, ArrowLeft, Send, CheckCircle, Clock, AlertTriangle, DollarSign, Pencil, X, Plus } from 'lucide-react'

// Sending is what mints the Payload payment link, so every invoice that is not
// paid and not cancelled has to stay sendable. This was gated on 'pending'
// alone, which meant a tenant lost the ability to pay online at the exact
// moment they went past due -- the late fee cron flips the status to 'overdue'
// and the Send button disappeared with it. Mirrors the Mark Paid gate that sits
// beside it. The send route reuses an existing payment link rather than
// creating a second charge, so re-sending cannot double-bill anyone.
const SENDABLE_STATUSES = ['pending', 'sent', 'overdue']

// ---- Tenant Invoice types ----
interface TenantInvoice {
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
  tenants?: { first_name: string; last_name: string; email: string }
  managed_properties?: { property_address: string; unit: string | null; city: string }
  landlords?: { first_name: string; last_name: string }
}

// ---- Landlord Invoice types ----
interface LandlordInvoice {
  id: string
  period_month: number
  period_year: number
  amount: number
  description: string | null
  due_date: string
  status: string
  paid_at: string | null
  paid_amount: number | null
  payment_method: string | null
  payload_payment_link_url: string | null
  notes: string | null
  landlord_id: string
  property_id: string
  landlords?: { first_name: string; last_name: string; email: string }
  managed_properties?: { property_address: string; unit: string | null; city: string }
}

interface Stats {
  pending: number
  sent: number
  overdue: number
  paid: number
  totalOutstanding: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(date: string) {
  const s = date.includes('T') ? date : `${date}T12:00:00`
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function formatMoney(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}
function parseDate(date: string) {
  return new Date(date.includes('T') ? date : `${date}T12:00:00`)
}
function isOverdue(dueDate: string, status: string) {
  if (['paid','cancelled'].includes(status)) return false
  const now = new Date(); now.setHours(12,0,0,0)
  return parseDate(dueDate) < now
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-gray-50 text-gray-600',
    sent: 'bg-blue-50 text-blue-700',
    overdue: 'bg-red-50 text-red-700',
    paid: 'bg-green-50 text-green-700',
    partial: 'bg-amber-50 text-amber-700',
    cancelled: 'bg-gray-50 text-gray-400',
  }
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock size={12} />, sent: <Send size={12} />,
    overdue: <AlertTriangle size={12} />, paid: <CheckCircle size={12} />,
    partial: <DollarSign size={12} />,
  }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${map[status] || map.pending}`}>
      {icons[status]}
      {status}
    </span>
  )
}

// ---- Stats cards (clickable) ----
function StatsCards({ stats, activeFilter, onFilter }: { stats: Stats; activeFilter: string; onFilter: (s: string) => void }) {
  const cards = [
    { key: 'pending', label: 'Pending', value: stats.pending, color: 'text-gray-600' },
    { key: 'sent', label: 'Sent', value: stats.sent, color: 'text-blue-600' },
    { key: 'overdue', label: 'Overdue', value: stats.overdue, color: 'text-red-600' },
    { key: 'paid', label: 'Paid', value: stats.paid, color: 'text-green-600' },
    { key: '', label: 'Outstanding', value: formatMoney(stats.totalOutstanding), color: 'text-luxury-accent', noFilter: true },
  ]
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
      {cards.map(c => (
        <button
          key={c.key}
          onClick={() => !c.noFilter && onFilter(activeFilter === c.key ? 'all' : c.key)}
          className={`container-card text-center transition-all ${!c.noFilter ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${activeFilter === c.key ? 'ring-2 ring-luxury-accent' : ''}`}
        >
          <div className={`text-2xl font-bold ${c.color}`}>{c.value}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">{c.label}</div>
        </button>
      ))}
    </div>
  )
}

// ---- Mark Paid Modal (shared) ----
function MarkPaidModal({
  label,
  amount,
  onConfirm,
  onClose,
  saving,
}: {
  label: string
  amount: number
  onConfirm: (method: string, notes: string, paidAt: string) => void
  onClose: () => void
  saving: boolean
}) {
  const [method, setMethod] = useState('zelle')
  const [notes, setNotes] = useState('')
  const [paidAt, setPaidAt] = useState(new Date().toISOString().split('T')[0])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-luxury-gray-1">Mark as Paid</h2>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="inner-card">
            <div className="text-xs text-luxury-gray-3 mb-1">{label}</div>
            <div className="text-xl font-bold text-luxury-gray-1">{formatMoney(amount)}</div>
          </div>
          <div>
            <label className="field-label">Payment Method *</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="select-luxury w-full">
              <option value="zelle">Zelle</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="field-label">Payment Date *</label>
            <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} className="input-luxury w-full" />
          </div>
          <div>
            <label className="field-label">Notes {method === 'other' ? '*' : '(optional)'}</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="textarea-luxury w-full"
              placeholder={method === 'check' ? 'Check number...' : method === 'other' ? 'Payment details...' : 'Reference or confirmation...'}
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-4 border-t">
          <button onClick={onClose} className="btn btn-secondary" disabled={saving}>Cancel</button>
          <button
            onClick={() => onConfirm(method, notes, paidAt)}
            disabled={saving || !paidAt || (method === 'other' && !notes)}
            className="btn btn-primary flex items-center gap-2"
          >
            <CheckCircle size={16} />
            {saving ? 'Saving...' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// TENANT INVOICES TAB
// ===========================================================================
function TenantInvoicesTab() {
  const [invoices, setInvoices] = useState<TenantInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stats, setStats] = useState<Stats>({ pending: 0, sent: 0, overdue: 0, paid: 0, totalOutstanding: 0 })
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<TenantInvoice | null>(null)
  const [editForm, setEditForm] = useState({
    rent_amount: '', late_fee: '', other_charges: '', other_charges_description: '',
    deposit_amount: '', deposit_description: '', due_date: '', status: 'pending', notes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [markPaidInvoice, setMarkPaidInvoice] = useState<TenantInvoice | null>(null)
  const [savingMarkPaid, setSavingMarkPaid] = useState(false)
  const [invoiceCharges, setInvoiceCharges] = useState<any[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [newCharge, setNewCharge] = useState({ label: '', amount: '', destination: 'owner' })
  const [savingCharge, setSavingCharge] = useState(false)

  useEffect(() => { loadInvoices() }, [])
  useEffect(() => { const t = setTimeout(loadInvoices, 300); return () => clearTimeout(t) }, [search, statusFilter])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      // Always fetch without status filter so stats are always accurate.
      // Overdue is a client-side concept (due_date < today on non-paid invoice)
      // and is not stored as a DB status value.
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const res = await fetch(`/api/pm/invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        const all: TenantInvoice[] = data.invoices || []

        // Compute stats from the full unfiltered list
        setStats({
          pending: all.filter(i => i.status === 'pending').length,
          sent: all.filter(i => i.status === 'sent').length,
          overdue: all.filter(i => isOverdue(i.due_date, i.status)).length,
          paid: all.filter(i => i.status === 'paid').length,
          totalOutstanding: all
            .filter(i => !['paid', 'cancelled'].includes(i.status))
            .reduce((s, i) => s + i.total_amount, 0),
        })

        // Apply status filter client-side
        let filtered = all
        if (statusFilter === 'overdue') {
          filtered = all.filter(i => isOverdue(i.due_date, i.status))
        } else if (statusFilter !== 'all') {
          filtered = all.filter(i => i.status === statusFilter)
        }
        setInvoices(filtered)
      }
    } catch (err) { console.error('Failed to load tenant invoices:', err) }
    finally { setLoading(false) }
  }

  const sendInvoice = async (id: string) => {
    setSendingId(id)
    try {
      const res = await fetch('/api/pm/invoices/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })
      if (res.ok) loadInvoices()
      else { const d = await res.json(); alert(d.error || 'Failed to send') }
    } catch { alert('Failed to send invoice') }
    finally { setSendingId(null) }
  }

  const handleMarkPaid = async (method: string, notes: string, paidAt: string) => {
    if (!markPaidInvoice) return
    setSavingMarkPaid(true)
    try {
      const res = await fetch(`/api/pm/invoices/${markPaidInvoice.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paid_at: new Date(paidAt + 'T12:00:00').toISOString(),
          paid_amount: markPaidInvoice.total_amount,
          payment_method: method,
          notes: notes || null,
        }),
      })
      if (res.ok) { setMarkPaidInvoice(null); loadInvoices() }
      else { const d = await res.json(); alert(d.error || 'Failed to mark paid') }
    } catch { alert('Failed to mark paid') }
    finally { setSavingMarkPaid(false) }
  }

  const openEdit = (inv: TenantInvoice) => {
    setEditingInvoice(inv)
    setEditForm({
      rent_amount: String(inv.rent_amount ?? ''), late_fee: String(inv.late_fee ?? ''),
      other_charges: String(inv.other_charges ?? ''), other_charges_description: inv.other_charges_description || '',
      deposit_amount: String(inv.deposit_amount ?? ''), deposit_description: inv.deposit_description || '',
      due_date: inv.due_date, status: inv.status, notes: inv.notes || '',
    })
    setNewCharge({ label: '', amount: '', destination: 'owner' })
    loadCharges(inv.id)
  }

  const loadCharges = async (invoiceId: string) => {
    setLoadingCharges(true)
    try {
      const res = await fetch(`/api/pm/invoice-charges?tenant_invoice_id=${invoiceId}`)
      if (res.ok) {
        const d = await res.json()
        setInvoiceCharges(d.charges || [])
      }
    } catch { /* non-fatal */ }
    finally { setLoadingCharges(false) }
  }

  const addCharge = async () => {
    if (!editingInvoice) return
    if (!newCharge.label || !newCharge.amount) { alert('Label and amount required'); return }
    if (parseFloat(newCharge.amount) <= 0) { alert('Amount must be greater than zero'); return }
    setSavingCharge(true)
    try {
      const res = await fetch('/api/pm/invoice-charges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_invoice_id: editingInvoice.id,
          label: newCharge.label,
          amount: parseFloat(newCharge.amount),
          destination: newCharge.destination,
        }),
      })
      if (res.ok) {
        setNewCharge({ label: '', amount: '', destination: 'owner' })
        await loadCharges(editingInvoice.id)
        loadInvoices()
      } else { const d = await res.json(); alert(d.error || 'Failed to add charge') }
    } catch { alert('Failed to add charge') }
    finally { setSavingCharge(false) }
  }

  const deleteCharge = async (chargeId: string) => {
    if (!editingInvoice) return
    if (!confirm('Remove this charge?')) return
    try {
      const res = await fetch(`/api/pm/invoice-charges/${chargeId}`, { method: 'DELETE' })
      if (res.ok) {
        await loadCharges(editingInvoice.id)
        loadInvoices()
      } else { const d = await res.json(); alert(d.error || 'Failed to remove charge') }
    } catch { alert('Failed to remove charge') }
  }

  const saveEdit = async () => {
    if (!editingInvoice) return
    setSavingEdit(true)
    try {
      const isPaid = editingInvoice.status === 'paid'
      const body = isPaid
        ? { notes: editForm.notes || null, status: editForm.status }
        : {
            // other_charges is managed via line-item charges (synced by the
            // invoice-charges route), so it is intentionally NOT sent here.
            rent_amount: parseFloat(editForm.rent_amount) || 0,
            late_fee: parseFloat(editForm.late_fee) || 0,
            deposit_amount: parseFloat(editForm.deposit_amount) || 0,
            deposit_description: editForm.deposit_description || null,
            due_date: editForm.due_date, status: editForm.status, notes: editForm.notes || null,
          }
      const res = await fetch(`/api/pm/invoices/${editingInvoice.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) { setEditingInvoice(null); loadInvoices() }
      else { const d = await res.json(); alert(d.error || 'Failed to save') }
    } catch { alert('Failed to save') }
    finally { setSavingEdit(false) }
  }

  return (
    <>
      <StatsCards stats={stats} activeFilter={statusFilter} onFilter={setStatusFilter} />

      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input type="text" placeholder="Search by tenant or property..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-luxury pl-10 w-full" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-luxury w-full sm:w-40">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      <div className="container-card">
        {loading ? <div className="text-center py-12 text-luxury-gray-3">Loading...</div>
        : invoices.length === 0 ? (
          <div className="text-center py-12">
            <Receipt size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No invoices found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">Invoices are auto-generated when leases are created</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {invoices.map(inv => (
                <div key={inv.id} className="inner-card">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-luxury-gray-1">{MONTHS[inv.period_month-1]} {inv.period_year}</div>
                      <div className="text-xs text-luxury-gray-3">{inv.tenants?.first_name} {inv.tenants?.last_name}</div>
                      <div className="text-xs text-luxury-gray-3">{inv.managed_properties?.property_address}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-luxury-gray-1">{formatMoney(inv.total_amount)}</div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <button onClick={() => openEdit(inv)} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Pencil size={11} />Edit</button>
                    {SENDABLE_STATUSES.includes(inv.status) && <button onClick={() => sendInvoice(inv.id)} disabled={sendingId === inv.id} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Send size={11} />{sendingId === inv.id ? '...' : 'Send'}</button>}
                    {['sent','overdue','pending'].includes(inv.status) && <button onClick={() => setMarkPaidInvoice(inv)} className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle size={11} />Mark Paid</button>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Period</th><th className="th-luxury">Tenant</th>
                    <th className="th-luxury">Property</th><th className="th-luxury text-right">Amount</th>
                    <th className="th-luxury">Due</th><th className="th-luxury">Status</th>
                    <th className="th-luxury text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="tr-luxury">
                      <td className="py-3 px-4 font-medium text-luxury-gray-1">{MONTHS[inv.period_month-1]} {inv.period_year}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-luxury-gray-1">{inv.tenants?.first_name} {inv.tenants?.last_name}</div>
                        <div className="text-xs text-luxury-gray-3">{inv.tenants?.email}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-1">
                        {inv.managed_properties?.property_address}{inv.managed_properties?.unit && ` ${inv.managed_properties.unit}`}
                        <div className="text-xs text-luxury-gray-3">{inv.managed_properties?.city}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-luxury-gray-1">
                        {formatMoney(inv.total_amount)}
                        {inv.late_fee > 0 && <div className="text-xs text-red-600">incl. {formatMoney(inv.late_fee)} late</div>}
                      </td>
                      <td className={`py-3 px-4 text-sm ${isOverdue(inv.due_date, inv.status) ? 'text-red-600 font-medium' : 'text-luxury-gray-1'}`}>{formatDate(inv.due_date)}</td>
                      <td className="py-3 px-4">{isOverdue(inv.due_date, inv.status) ? <StatusBadge status="overdue" /> : <StatusBadge status={inv.status} />}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(inv)} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Pencil size={11} />Edit</button>
                          {SENDABLE_STATUSES.includes(inv.status) && <button onClick={() => sendInvoice(inv.id)} disabled={sendingId === inv.id} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Send size={11} />{sendingId === inv.id ? 'Sending...' : 'Send'}</button>}
                          {['sent','overdue','pending'].includes(inv.status) && <button onClick={() => setMarkPaidInvoice(inv)} className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle size={11} />Mark Paid</button>}
                          {inv.status === 'paid' && inv.paid_at && <span className="text-xs text-green-600">Paid {formatDate(inv.paid_at)}</span>}
                          {inv.payload_payment_link_url && !['paid','cancelled'].includes(inv.status) && (
                            <a href={inv.payload_payment_link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent hover:underline">Link</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Edit Invoice</h2>
              <button onClick={() => setEditingInvoice(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="inner-card text-sm">
                <div className="font-medium text-luxury-gray-1">{MONTHS[editingInvoice.period_month-1]} {editingInvoice.period_year}</div>
                <div className="text-xs text-luxury-gray-3">{editingInvoice.tenants?.first_name} {editingInvoice.tenants?.last_name} &middot; {editingInvoice.managed_properties?.property_address}</div>
              </div>
              {editingInvoice.status === 'paid' ? (
                <>
                  <p className="text-xs text-amber-700">This invoice has been paid. Only notes and status are editable.</p>
                  <div><label className="field-label">Status</label>
                    <select value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))} className="select-luxury w-full">
                      <option value="paid">Paid</option><option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div><label className="field-label">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} className="textarea-luxury w-full" rows={3} />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[['rent_amount','Rent Amount'],['late_fee','Late Fee']].map(([k,label]) => (
                      <div key={k}>
                        <label className="field-label">{label}</label>
                        <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input type="number" step="0.01" value={(editForm as any)[k]} onChange={e => setEditForm(p => ({...p, [k]: e.target.value}))} className="input-luxury w-full pl-7" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border border-luxury-gray-5 rounded p-3">
                    <label className="field-label">Additional Charges</label>
                    {loadingCharges ? (
                      <p className="text-xs text-luxury-gray-3 py-2">Loading charges...</p>
                    ) : invoiceCharges.length === 0 ? (
                      <p className="text-xs text-luxury-gray-3 py-2">No additional charges yet.</p>
                    ) : (
                      <div className="space-y-1 mb-3">
                        {invoiceCharges.map((c: any) => (
                          <div key={c.id} className="flex items-center justify-between text-sm border-b border-luxury-gray-5/50 py-1">
                            <div className="min-w-0 flex-1">
                              <span className="text-luxury-gray-1">{c.label}</span>
                              <span className={`ml-2 text-xs ${c.destination === 'crc' ? 'text-luxury-accent' : 'text-luxury-gray-3'}`}>
                                {c.destination === 'crc' ? 'CRC' : 'Landlord'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-luxury-gray-1">{formatMoney(Number(c.amount))}</span>
                              <button onClick={() => deleteCharge(c.id)} className="text-luxury-gray-3 hover:text-red-600" title="Remove charge"><X size={13} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input type="text" value={newCharge.label} onChange={e => setNewCharge(p => ({...p, label: e.target.value}))} className="input-luxury w-full text-sm" placeholder="Label" />
                      <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                        <input type="number" step="0.01" value={newCharge.amount} onChange={e => setNewCharge(p => ({...p, amount: e.target.value}))} className="input-luxury w-full pl-7 text-sm" placeholder="0.00" />
                      </div>
                    </div>
                    <select value={newCharge.destination} onChange={e => setNewCharge(p => ({...p, destination: e.target.value}))} className="select-luxury w-full text-sm mt-2">
                      <option value="owner">Owner Charge (goes to landlord)</option>
                      <option value="crc">Administrative Fee (retained by CRC)</option>
                    </select>
                    <button onClick={addCharge} disabled={savingCharge} className="btn btn-secondary text-xs w-full mt-2 flex items-center justify-center gap-1"><Plus size={12} />{savingCharge ? 'Adding...' : 'Add Charge'}</button>
                  </div>
                  <div><label className="field-label">Security Deposit</label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                      <input type="number" step="0.01" value={editForm.deposit_amount} onChange={e => setEditForm(p => ({...p, deposit_amount: e.target.value}))} className="input-luxury w-full pl-7" />
                    </div>
                  </div>
                  <div><label className="field-label">Due Date</label>
                    <input type="date" value={editForm.due_date} onChange={e => setEditForm(p => ({...p, due_date: e.target.value}))} className="input-luxury w-full" />
                  </div>
                  <div><label className="field-label">Status</label>
                    <select value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))} className="select-luxury w-full">
                      <option value="pending">Pending</option><option value="sent">Sent</option>
                      <option value="overdue">Overdue</option><option value="cancelled">Cancelled</option>
                    </select>
                    <p className="text-xs text-luxury-gray-3 mt-1">Use Mark Paid button to record a manual payment.</p>
                  </div>
                  <div><label className="field-label">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} className="textarea-luxury w-full" rows={2} />
                  </div>
                  <div className="inner-card flex justify-between items-center">
                    <span className="text-sm text-luxury-gray-3">New Total</span>
                    <span className="text-xl font-bold text-luxury-gray-1">{formatMoney((parseFloat(editForm.rent_amount)||0)+(parseFloat(editForm.late_fee)||0)+invoiceCharges.reduce((s,c)=>s+Number(c.amount||0),0)+(parseFloat(editForm.deposit_amount)||0))}</span>
                  </div>
                  <button onClick={() => { setEditingInvoice(null); setMarkPaidInvoice(editingInvoice) }} className="btn btn-primary w-full flex items-center justify-center gap-2"><CheckCircle size={16} />Mark as Paid</button>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button onClick={() => setEditingInvoice(null)} className="btn btn-secondary" disabled={savingEdit}>Cancel</button>
              <button onClick={saveEdit} className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {markPaidInvoice && (
        <MarkPaidModal
          label={`${MONTHS[markPaidInvoice.period_month-1]} ${markPaidInvoice.period_year} - ${markPaidInvoice.tenants?.first_name} ${markPaidInvoice.tenants?.last_name}`}
          amount={markPaidInvoice.total_amount}
          onConfirm={handleMarkPaid}
          onClose={() => setMarkPaidInvoice(null)}
          saving={savingMarkPaid}
        />
      )}
    </>
  )
}

// ===========================================================================
// LANDLORD INVOICES TAB
// ===========================================================================
function LandlordInvoicesTab() {
  const [invoices, setInvoices] = useState<LandlordInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [stats, setStats] = useState<Stats>({ pending: 0, sent: 0, overdue: 0, paid: 0, totalOutstanding: 0 })
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<LandlordInvoice | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', due_date: '', status: 'pending', notes: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [markPaidInvoice, setMarkPaidInvoice] = useState<LandlordInvoice | null>(null)
  const [savingMarkPaid, setSavingMarkPaid] = useState(false)

  useEffect(() => { loadInvoices() }, [])
  useEffect(() => { const t = setTimeout(loadInvoices, 300); return () => clearTimeout(t) }, [search, statusFilter])

  const loadInvoices = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/pm/landlord-invoices?${params}`)
      if (res.ok) {
        const data = await res.json()
        setInvoices(data.invoices || [])
        setStats(data.stats || { pending: 0, sent: 0, overdue: 0, paid: 0, totalOutstanding: 0 })
      }
    } catch (err) { console.error('Failed to load landlord invoices:', err) }
    finally { setLoading(false) }
  }

  const sendInvoice = async (id: string) => {
    setSendingId(id)
    try {
      const res = await fetch('/api/pm/landlord-invoices/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      })
      if (res.ok) loadInvoices()
      else { const d = await res.json(); alert(d.error || 'Failed to send') }
    } catch { alert('Failed to send invoice') }
    finally { setSendingId(null) }
  }

  const handleMarkPaid = async (method: string, notes: string, paidAt: string) => {
    if (!markPaidInvoice) return
    setSavingMarkPaid(true)
    try {
      const res = await fetch(`/api/pm/landlord-invoices/${markPaidInvoice.id}/mark-paid`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method, payment_notes: notes || null, paid_at: new Date(paidAt + 'T12:00:00').toISOString() }),
      })
      if (res.ok) { setMarkPaidInvoice(null); loadInvoices() }
      else { const d = await res.json(); alert(d.error || 'Failed to mark paid') }
    } catch { alert('Failed to mark paid') }
    finally { setSavingMarkPaid(false) }
  }

  const openEdit = (inv: LandlordInvoice) => {
    setEditingInvoice(inv)
    setEditForm({ amount: String(inv.amount), due_date: inv.due_date, status: inv.status, notes: inv.notes || '' })
  }

  const saveEdit = async () => {
    if (!editingInvoice) return
    setSavingEdit(true)
    try {
      const isPaid = editingInvoice.status === 'paid'
      const body = isPaid
        ? { notes: editForm.notes || null }
        : { amount: parseFloat(editForm.amount) || 0, due_date: editForm.due_date, status: editForm.status, notes: editForm.notes || null }
      const res = await fetch(`/api/pm/landlord-invoices/${editingInvoice.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (res.ok) { setEditingInvoice(null); loadInvoices() }
      else { const d = await res.json(); alert(d.error || 'Failed to save') }
    } catch { alert('Failed to save') }
    finally { setSavingEdit(false) }
  }

  return (
    <>
      <StatsCards stats={stats} activeFilter={statusFilter} onFilter={setStatusFilter} />

      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input type="text" placeholder="Search by landlord or property..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-luxury pl-10 w-full" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="select-luxury w-full sm:w-40">
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="sent">Sent</option>
            <option value="overdue">Overdue</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>

      <div className="container-card">
        {loading ? <div className="text-center py-12 text-luxury-gray-3">Loading...</div>
        : invoices.length === 0 ? (
          <div className="text-center py-12">
            <Receipt size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No landlord invoices found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">Management fee invoices are auto-generated when leases are created</p>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {invoices.map(inv => (
                <div key={inv.id} className="inner-card">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-medium text-luxury-gray-1">{MONTHS[inv.period_month-1]} {inv.period_year}</div>
                      <div className="text-xs text-luxury-gray-3">{inv.landlords?.first_name} {inv.landlords?.last_name}</div>
                      <div className="text-xs text-luxury-gray-3">{inv.managed_properties?.property_address}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-luxury-gray-1">{formatMoney(inv.amount)}</div>
                      <StatusBadge status={inv.status} />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap mt-2">
                    <button onClick={() => openEdit(inv)} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Pencil size={11} />Edit</button>
                    {SENDABLE_STATUSES.includes(inv.status) && <button onClick={() => sendInvoice(inv.id)} disabled={sendingId === inv.id} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Send size={11} />{sendingId === inv.id ? '...' : 'Send'}</button>}
                    {['sent','overdue','pending'].includes(inv.status) && <button onClick={() => setMarkPaidInvoice(inv)} className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle size={11} />Mark Paid</button>}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-luxury-gray-5/50">
                    <th className="th-luxury">Period</th><th className="th-luxury">Landlord</th>
                    <th className="th-luxury">Property</th><th className="th-luxury text-right">Amount</th>
                    <th className="th-luxury">Due</th><th className="th-luxury">Status</th>
                    <th className="th-luxury text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => (
                    <tr key={inv.id} className="tr-luxury">
                      <td className="py-3 px-4 font-medium text-luxury-gray-1">{MONTHS[inv.period_month-1]} {inv.period_year}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-luxury-gray-1">{inv.landlords?.first_name} {inv.landlords?.last_name}</div>
                        <div className="text-xs text-luxury-gray-3">{inv.landlords?.email}</div>
                      </td>
                      <td className="py-3 px-4 text-sm text-luxury-gray-1">
                        {inv.managed_properties?.property_address}{inv.managed_properties?.unit && ` ${inv.managed_properties.unit}`}
                        <div className="text-xs text-luxury-gray-3">{inv.managed_properties?.city}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-luxury-gray-1">{formatMoney(inv.amount)}</td>
                      <td className={`py-3 px-4 text-sm ${isOverdue(inv.due_date, inv.status) ? 'text-red-600 font-medium' : 'text-luxury-gray-1'}`}>{formatDate(inv.due_date)}</td>
                      <td className="py-3 px-4"><StatusBadge status={inv.status} /></td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(inv)} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Pencil size={11} />Edit</button>
                          {SENDABLE_STATUSES.includes(inv.status) && <button onClick={() => sendInvoice(inv.id)} disabled={sendingId === inv.id} className="btn btn-secondary text-xs py-1 px-2 flex items-center gap-1"><Send size={11} />{sendingId === inv.id ? 'Sending...' : 'Send'}</button>}
                          {['sent','overdue','pending'].includes(inv.status) && <button onClick={() => setMarkPaidInvoice(inv)} className="btn btn-primary text-xs py-1 px-2 flex items-center gap-1"><CheckCircle size={11} />Mark Paid</button>}
                          {inv.status === 'paid' && inv.paid_at && <span className="text-xs text-green-600">Paid {formatDate(inv.paid_at)}</span>}
                          {inv.payload_payment_link_url && !['paid','cancelled'].includes(inv.status) && (
                            <a href={inv.payload_payment_link_url} target="_blank" rel="noopener noreferrer" className="text-xs text-luxury-accent hover:underline">Link</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Edit Landlord Invoice</h2>
              <button onClick={() => setEditingInvoice(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="inner-card text-sm">
                <div className="font-medium text-luxury-gray-1">{MONTHS[editingInvoice.period_month-1]} {editingInvoice.period_year} - {editingInvoice.description || 'Management Fee'}</div>
                <div className="text-xs text-luxury-gray-3">{editingInvoice.landlords?.first_name} {editingInvoice.landlords?.last_name} &middot; {editingInvoice.managed_properties?.property_address}</div>
              </div>
              {editingInvoice.status === 'paid' ? (
                <>
                  <p className="text-xs text-amber-700">This invoice has been paid. Only notes are editable.</p>
                  <div><label className="field-label">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} className="textarea-luxury w-full" rows={3} />
                  </div>
                </>
              ) : (
                <>
                  <div><label className="field-label">Amount</label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                      <input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm(p => ({...p, amount: e.target.value}))} className="input-luxury w-full pl-7" />
                    </div>
                  </div>
                  <div><label className="field-label">Due Date</label>
                    <input type="date" value={editForm.due_date} onChange={e => setEditForm(p => ({...p, due_date: e.target.value}))} className="input-luxury w-full" />
                  </div>
                  <div><label className="field-label">Status</label>
                    <select value={editForm.status} onChange={e => setEditForm(p => ({...p, status: e.target.value}))} className="select-luxury w-full">
                      <option value="pending">Pending</option><option value="sent">Sent</option><option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div><label className="field-label">Notes</label>
                    <textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} className="textarea-luxury w-full" rows={2} />
                  </div>
                  <button onClick={() => { setEditingInvoice(null); setMarkPaidInvoice(editingInvoice) }} className="btn btn-primary w-full flex items-center justify-center gap-2"><CheckCircle size={16} />Mark as Paid</button>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t">
              <button onClick={() => setEditingInvoice(null)} className="btn btn-secondary" disabled={savingEdit}>Cancel</button>
              <button onClick={saveEdit} className="btn btn-primary" disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}

      {markPaidInvoice && (
        <MarkPaidModal
          label={`${MONTHS[markPaidInvoice.period_month-1]} ${markPaidInvoice.period_year} - ${markPaidInvoice.landlords?.first_name} ${markPaidInvoice.landlords?.last_name}`}
          amount={markPaidInvoice.amount}
          onConfirm={handleMarkPaid}
          onClose={() => setMarkPaidInvoice(null)}
          saving={savingMarkPaid}
        />
      )}
    </>
  )
}

// ===========================================================================
// MAIN PAGE
// ===========================================================================
export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<'tenants' | 'landlords'>('tenants')

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1"><ArrowLeft size={20} /></Link>
        <Receipt size={24} className="text-luxury-accent" />
        <h1 className="page-title">Invoices</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-luxury-gray-5">
        {(['tenants', 'landlords'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-luxury-accent text-luxury-accent'
                : 'border-transparent text-luxury-gray-3 hover:text-luxury-gray-1'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'tenants' ? <TenantInvoicesTab /> : <LandlordInvoicesTab />}
    </div>
  )
}
