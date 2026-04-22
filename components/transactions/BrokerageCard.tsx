'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Trash2, AlertCircle, Edit, Lock } from 'lucide-react'

const fmt$ = (n: number | null | undefined) => {
  if (n == null || (typeof n === 'number' && isNaN(n))) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n))
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '--'
  const dateStr = d.length === 10 ? d + 'T12:00:00' : d
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const num = (v: any): number => parseFloat(v ?? 0) || 0

const BROKERAGE_ROLE_OPTIONS = [
  { value: 'buyers_agent', label: "Buyer's Agent" },
  { value: 'sellers_agent', label: "Seller's Agent" },
  { value: 'listing_agent', label: 'Listing Agent' },
  { value: 'cooperating_agent', label: 'Cooperating Agent' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
]

const FEDERAL_ID_TYPES = [
  { value: 'ein', label: 'EIN' },
  { value: 'ssn', label: 'SSN' },
]

const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'payload', label: 'Payload' },
]

function FieldRow({
  label, value, onSave, locked, type = 'text', money, options, placeholder,
}: {
  label: string
  value: any
  onSave: (v: any) => void | Promise<void>
  locked?: boolean
  type?: 'text' | 'number' | 'date' | 'select' | 'checkbox'
  money?: boolean
  options?: { value: string; label: string }[]
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState<any>(value ?? '')

  const save = () => {
    const v = type === 'number' ? (local === '' ? null : parseFloat(local)) : local
    onSave(v)
    setEditing(false)
  }

  const display = () => {
    if (type === 'checkbox') return value ? 'Yes' : 'No'
    if (type === 'select' && options) return options.find(o => o.value === value)?.label || value || '--'
    if (money) return fmt$(value)
    if (type === 'date') return fmtDate(value)
    return value ?? '--'
  }

  if (locked) {
    return (
      <div className="flex justify-between items-center py-1.5 border-b border-luxury-gray-5/30 last:border-0">
        <span className="text-xs text-luxury-gray-3 flex items-center gap-1">
          <Lock size={10} className="opacity-50" /> {label}
        </span>
        <span className="text-xs text-luxury-gray-1">{display()}</span>
      </div>
    )
  }

  return (
    <div className="flex justify-between items-center py-1.5 border-b border-luxury-gray-5/30 last:border-0 group">
      <span className="text-xs text-luxury-gray-3">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          {type === 'checkbox' ? (
            <input type="checkbox" checked={!!local} onChange={e => setLocal(e.target.checked)} className="h-3 w-3" />
          ) : type === 'select' && options ? (
            <select className="select-luxury text-xs" value={local} onChange={e => setLocal(e.target.value)}>
              <option value="">--</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={type} value={local}
              onChange={e => setLocal(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') save()
                if (e.key === 'Escape') { setLocal(value ?? ''); setEditing(false) }
              }}
              className="input-luxury text-xs w-32"
              placeholder={placeholder}
              autoFocus
            />
          )}
          <button onClick={save} className="text-luxury-accent text-xs">Save</button>
          <button onClick={() => { setLocal(value ?? ''); setEditing(false) }} className="text-luxury-gray-3 text-xs">X</button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-luxury-gray-1 hover:text-luxury-accent flex items-center gap-1"
        >
          {display()}
          <Edit size={10} className="opacity-0 group-hover:opacity-70" />
        </button>
      )}
    </div>
  )
}

function WarningPanel({ teb }: { teb: any }) {
  const warnings: string[] = []
  const commission = num(teb.commission_amount)

  if (commission >= 600) {
    if (!teb.w9_on_file) warnings.push('W-9 required for 1099 ($600+ payout)')
    if (!teb.federal_id_number) warnings.push('Federal ID required for 1099')
  }
  if (!teb.brokerage_role) warnings.push('Role not set')
  if (!teb.amount_1099_reportable && commission > 0) warnings.push('1099 amount not set')

  if (warnings.length === 0) return null

  return (
    <div className="mb-3 space-y-1">
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 px-2 py-1 rounded text-xs bg-amber-50 text-amber-900 border border-amber-200">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}
    </div>
  )
}

function MarkPaidSection({
  teb, transactionId, onDone, onCancel,
}: {
  teb: any
  transactionId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!paymentDate) { setError('Payment date required'); return }
    if (!paymentMethod) { setError('Payment method required'); return }
    if ((paymentMethod === 'check' || paymentMethod === 'wire') && !paymentRef) {
      setError('Reference required for check or wire'); return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_brokerage_paid',
          brokerage_id: teb.id,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_reference: paymentRef || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Mark paid failed')
      }
      onDone()
    } catch (e: any) {
      setError(e.message || 'Failed to mark paid')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-luxury-gray-5/20 border border-luxury-gray-5">
      <p className="text-xs font-semibold text-luxury-gray-1 mb-3">Mark Paid</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="field-label">Payment Date</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-luxury text-xs w-full" />
        </div>
        <div>
          <label className="field-label">Method</label>
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="select-luxury text-xs w-full">
            <option value="">--</option>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="field-label">Reference</label>
          <input value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="input-luxury text-xs w-full" placeholder={paymentMethod === 'check' ? 'Check #' : 'Optional'} />
        </div>
      </div>
      <div className="bg-white rounded px-3 py-2 mb-3 border border-luxury-gray-5">
        <div className="flex justify-between text-xs">
          <span className="text-luxury-gray-3">Commission</span>
          <span className="text-luxury-gray-1 font-semibold">{fmt$(teb.commission_amount)}</span>
        </div>
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} disabled={saving} className="btn btn-secondary text-xs px-3 py-1.5">Cancel</button>
        <button onClick={submit} disabled={saving} className="btn btn-primary text-xs px-3 py-1.5">
          {saving ? 'Saving...' : 'Mark Paid'}
        </button>
      </div>
    </div>
  )
}

export default function BrokerageCard({
  teb, transactionId, onRefresh,
}: {
  teb: any
  transactionId: string
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const paid = teb.payment_status === 'paid'

  const updateField = async (field: string, value: any) => {
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_external_brokerage',
        brokerage_id: teb.id,
        updates: { [field]: value },
      }),
    })
    if (res.ok) {
      onRefresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Update failed')
    }
  }

  const unmarkPaid = async () => {
    if (!confirm('Unmark this brokerage as paid?')) return
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unmark_brokerage_paid', brokerage_id: teb.id }),
    })
    if (res.ok) onRefresh()
    else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Unmark failed')
    }
  }

  const confirmDelete = async () => {
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_external_brokerage', brokerage_id: teb.id }),
    })
    if (res.ok) onRefresh()
    else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Delete failed')
    }
    setShowDeleteConfirm(false)
  }

  const roleLabel = BROKERAGE_ROLE_OPTIONS.find(r => r.value === teb.brokerage_role)?.label || teb.brokerage_role

  return (
    <div className={`container-card mb-3 ${paid ? 'border-l-4 border-l-green-500' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button onClick={() => setExpanded(e => !e)} className="flex items-center gap-2 text-left w-full">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-luxury-gray-1 truncate">{teb.brokerage_name}</p>
              <p className="text-xs text-luxury-gray-3 truncate">
                {roleLabel}{teb.agent_name ? ` · ${teb.agent_name}` : ''}
              </p>
            </div>
          </button>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-luxury-gray-1">{fmt$(teb.commission_amount)}</p>
          <p className={`text-xs ${paid ? 'text-green-700 font-semibold' : 'text-amber-700'}`}>
            {paid ? `Paid ${fmtDate(teb.payment_date)}` : 'Pending'}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">
          <WarningPanel teb={teb} />

          <div className="mb-3">
            <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Brokerage</p>
            <FieldRow label="Brokerage name" value={teb.brokerage_name} locked={paid} onSave={v => updateField('brokerage_name', v)} />
            <FieldRow label="Role" value={teb.brokerage_role} type="select" options={BROKERAGE_ROLE_OPTIONS} locked={paid} onSave={v => updateField('brokerage_role', v)} />
            <FieldRow label="Broker name" value={teb.broker_name} locked={paid} onSave={v => updateField('broker_name', v)} />
            <FieldRow label="Agent name" value={teb.agent_name} locked={paid} onSave={v => updateField('agent_name', v)} />
            <FieldRow label="Agent email" value={teb.agent_email} locked={paid} onSave={v => updateField('agent_email', v)} />
            <FieldRow label="Agent phone" value={teb.agent_phone} locked={paid} onSave={v => updateField('agent_phone', v)} />
          </div>

          <div className="mb-3">
            <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Tax / 1099</p>
            <FieldRow label="Federal ID type" value={teb.federal_id_type} type="select" options={FEDERAL_ID_TYPES} locked={paid} onSave={v => updateField('federal_id_type', v)} />
            <FieldRow label="Federal ID number" value={teb.federal_id_number} locked={paid} onSave={v => updateField('federal_id_number', v)} />
            <FieldRow label="EIN" value={teb.brokerage_ein} locked={paid} onSave={v => updateField('brokerage_ein', v)} />
            <FieldRow label="W-9 on file" value={teb.w9_on_file} type="checkbox" locked={paid} onSave={v => updateField('w9_on_file', v)} />
            {teb.w9_on_file && (
              <FieldRow label="W-9 date received" value={teb.w9_date_received} type="date" locked={paid} onSave={v => updateField('w9_date_received', v)} />
            )}
          </div>

          <div className="mb-3 p-2 bg-luxury-gray-5/20 rounded">
            <FieldRow label="Commission amount" value={teb.commission_amount} type="number" money locked={paid} onSave={v => updateField('commission_amount', v)} />
            <FieldRow label="1099 reportable" value={teb.amount_1099_reportable} type="number" money locked={paid} onSave={v => updateField('amount_1099_reportable', v)} />
          </div>

          {paid && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Payment</p>
              <FieldRow label="Date" value={teb.payment_date} type="date" onSave={v => updateField('payment_date', v)} />
              <FieldRow label="Method" value={teb.payment_method} type="select" options={PAYMENT_METHODS} onSave={v => updateField('payment_method', v)} />
              <FieldRow label="Reference" value={teb.payment_reference} onSave={v => updateField('payment_reference', v)} />
            </div>
          )}

          {showMarkPaid && !paid && (
            <MarkPaidSection
              teb={teb} transactionId={transactionId}
              onDone={() => { setShowMarkPaid(false); onRefresh() }}
              onCancel={() => setShowMarkPaid(false)}
            />
          )}

          <div className="flex items-center justify-between pt-3 border-t border-luxury-gray-5/50">
            <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1">
              <Trash2 size={12} /> Delete
            </button>
            <div className="flex gap-2">
              {paid ? (
                <button onClick={unmarkPaid} className="btn btn-secondary text-xs px-3 py-1.5">Unmark Paid</button>
              ) : (
                !showMarkPaid && (
                  <button onClick={() => setShowMarkPaid(true)} className="btn btn-primary text-xs px-3 py-1.5">Mark Paid</button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4">
            <p className="text-sm font-semibold text-luxury-gray-1 mb-2">Delete {teb.brokerage_name}?</p>
            <p className="text-xs text-luxury-gray-3 mb-3">This cannot be undone.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteConfirm(false)} className="btn btn-secondary text-xs px-3 py-1.5">Cancel</button>
              <button onClick={confirmDelete} className="btn text-xs px-3 py-1.5 bg-white border border-red-600 text-red-600 hover:bg-red-50 rounded">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
