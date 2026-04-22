'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronUp, Trash2, AlertCircle, Edit, Lock,
  DollarSign, Clock, Calendar, User,
} from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

const num = (v: any): number => parseFloat(v ?? 0) || 0

const AGENT_ROLE_OPTIONS = [
  { value: 'primary_agent', label: 'Primary Agent' },
  { value: 'listing_agent', label: 'Listing Agent' },
  { value: 'co_agent', label: 'Co-Agent' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'referral_agent', label: 'Referral Agent' },
  { value: 'momentum_partner', label: 'Momentum Partner' },
]

const LEAD_SOURCE_OPTIONS = [
  { value: 'own', label: 'Own Lead' },
  { value: 'team_lead', label: 'Team Lead Lead' },
  { value: 'firm', label: 'Firm Lead' },
]

const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'payload', label: 'Payload' },
]

const FUNDING_SOURCES = [
  { value: 'crc', label: 'CRC' },
  { value: 'rc', label: 'RC' },
]

// ─── Editable field row ──────────────────────────────────────────────────────

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

  useEffect(() => { setLocal(value ?? '') }, [value])

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
            <input
              type="checkbox"
              checked={!!local}
              onChange={e => setLocal(e.target.checked)}
              className="h-3 w-3"
            />
          ) : type === 'select' && options ? (
            <select
              className="select-luxury text-xs"
              value={local}
              onChange={e => setLocal(e.target.value)}
            >
              <option value="">--</option>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              type={type}
              value={local}
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

// ─── Context panel (warnings, cap progress, debts) ───────────────────────────

function ContextPanel({ user, membership, billing }: { user: any; membership?: any; billing?: any }) {
  const warnings: { kind: 'warn' | 'info'; text: string }[] = []

  if (user?.license_expiration) {
    const daysLeft = Math.ceil((new Date(user.license_expiration + 'T12:00:00').getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft < 0) warnings.push({ kind: 'warn', text: `License EXPIRED ${fmtDate(user.license_expiration)}` })
    else if (daysLeft <= 60) warnings.push({ kind: 'warn', text: `License expires ${fmtDate(user.license_expiration)} (${daysLeft}d)` })
  }

  if (user?.monthly_fee_paid_through) {
    const daysBehind = Math.ceil((Date.now() - new Date(user.monthly_fee_paid_through + 'T12:00:00').getTime()) / (1000 * 60 * 60 * 24))
    if (daysBehind > 0) warnings.push({ kind: 'warn', text: `Monthly fee overdue (paid through ${fmtDate(user.monthly_fee_paid_through)})` })
  }

  if (billing && billing.total_debts > 0) {
    warnings.push({ kind: 'warn', text: `${billing.debts.length} outstanding debt${billing.debts.length !== 1 ? 's' : ''}: ${fmt$(billing.total_debts)}` })
  }

  if (user?.waive_buyer_processing_fees) warnings.push({ kind: 'info', text: 'Buyer processing fees waived' })
  if (user?.waive_seller_processing_fees) warnings.push({ kind: 'info', text: 'Seller/listing processing fees waived' })

  if (user?.special_commission_notes) {
    warnings.push({ kind: 'info', text: `Note: ${user.special_commission_notes}` })
  }

  if (membership?.team?.team_name) {
    const leadName = membership.team?.team_lead ? fmtName(membership.team.team_lead) : 'no lead set'
    warnings.push({ kind: 'info', text: `Team: ${membership.team.team_name} · Lead: ${leadName}` })
  }

  if (user?.referring_agent_id && user?.revenue_share_percentage) {
    warnings.push({ kind: 'info', text: `Momentum partner set (${user.revenue_share_percentage}%)` })
  }

  if (warnings.length === 0) return null

  return (
    <div className="mb-3 space-y-1">
      {warnings.map((w, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${
            w.kind === 'warn'
              ? 'bg-amber-50 text-amber-900 border border-amber-200'
              : 'bg-luxury-gray-5/40 text-luxury-gray-2'
          }`}
        >
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          <span>{w.text}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Mark Paid sub-section ──────────────────────────────────────────────────

function MarkPaidSection({
  tia, transactionId, transactionType, debts, onDone, onCancel,
}: {
  tia: any
  transactionId: string
  transactionType: string | null
  debts: any[]
  onDone: () => void
  onCancel: () => void
}) {
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [fundingSource, setFundingSource] = useState('crc')
  const [countsProgress, setCountsProgress] = useState(tia.counts_toward_progress !== false)
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totalDebts = Object.values(selected).reduce((s, v) => s + v, 0)
  const amount1099 = num(tia.amount_1099_reportable)
  // Under Model A, team_lead is already carved out of agent_gross, so
  // agent_net = amount_1099_reportable - debts (no TL deduction).
  const netPreview = amount1099 - totalDebts

  const toggleDebt = (id: string, maxAmount: number) => {
    setSelected(prev => {
      if (id in prev) {
        const { [id]: _, ...rest } = prev
        return rest
      }
      return { ...prev, [id]: maxAmount }
    })
  }

  const updateDebtAmount = (id: string, amount: number, max: number) => {
    const clamped = Math.max(0, Math.min(amount, max))
    setSelected(prev => ({ ...prev, [id]: clamped }))
  }

  const submit = async () => {
    if (!paymentDate) { setError('Payment date required'); return }
    if (!paymentMethod) { setError('Payment method required'); return }
    if ((paymentMethod === 'check' || paymentMethod === 'wire') && !paymentRef) {
      setError('Reference required for check or wire'); return
    }

    setSaving(true)
    setError(null)
    try {
      const debts_to_apply = Object.entries(selected)
        .filter(([, amt]) => amt > 0)
        .map(([debt_id, amount]) => ({ debt_id, amount }))

      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid',
          internal_agent_id: tia.id,
          transaction_type: transactionType,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_reference: paymentRef || null,
          funding_source: fundingSource,
          debts_to_apply,
          counts_toward_progress: countsProgress,
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
          <input
            type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
            className="input-luxury text-xs w-full"
          />
        </div>
        <div>
          <label className="field-label">Method</label>
          <select
            value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
            className="select-luxury text-xs w-full"
          >
            <option value="">--</option>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="field-label">Reference</label>
          <input
            value={paymentRef} onChange={e => setPaymentRef(e.target.value)}
            className="input-luxury text-xs w-full"
            placeholder={paymentMethod === 'check' ? 'Check #' : paymentMethod === 'wire' ? 'Wire ref' : 'Optional'}
          />
        </div>
        <div>
          <label className="field-label">Funding Source</label>
          <select
            value={fundingSource} onChange={e => setFundingSource(e.target.value)}
            className="select-luxury text-xs w-full"
          >
            {FUNDING_SOURCES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-1.5 text-xs text-luxury-gray-2">
            <input
              type="checkbox" checked={countsProgress}
              onChange={e => setCountsProgress(e.target.checked)}
              className="h-3 w-3"
            />
            Counts toward cap/qualifying
          </label>
        </div>
      </div>

      {debts.length > 0 && (
        <div className="mb-3">
          <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Apply Debts</p>
          <div className="space-y-1">
            {debts.map(debt => {
              const max = num(debt.amount_remaining ?? debt.amount_owed)
              const selectedAmt = selected[debt.id]
              const isSel = selectedAmt != null
              return (
                <div key={debt.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox" checked={isSel}
                    onChange={() => toggleDebt(debt.id, max)}
                    className="h-3 w-3"
                  />
                  <span className="flex-1 text-luxury-gray-2">
                    {debt.debt_type_other || debt.debt_type}: {debt.description || fmt$(max)}
                  </span>
                  {isSel && (
                    <input
                      type="number" value={selectedAmt}
                      onChange={e => updateDebtAmount(debt.id, parseFloat(e.target.value) || 0, max)}
                      step="0.01" min="0" max={max}
                      className="input-luxury text-xs w-20 text-right"
                    />
                  )}
                  {!isSel && <span className="text-luxury-gray-3">{fmt$(max)}</span>}
                </div>
              )
            })}
          </div>
          {totalDebts > 0 && (
            <p className="text-xs text-luxury-gray-3 mt-1">Debts total: −{fmt$(totalDebts)}</p>
          )}
        </div>
      )}

      <div className="bg-white rounded px-3 py-2 mb-3 border border-luxury-gray-5">
        <div className="flex justify-between text-xs">
          <span className="text-luxury-gray-3">1099 reportable</span>
          <span className="text-luxury-gray-1">{fmt$(amount1099)}</span>
        </div>
        {totalDebts > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-luxury-gray-3">Debts</span>
            <span className="text-luxury-gray-1">−{fmt$(totalDebts)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs pt-1 mt-1 border-t border-luxury-gray-5 font-semibold">
          <span>Net to pay</span>
          <span className="text-luxury-accent">{fmt$(netPreview)}</span>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 mb-2">{error}</p>
      )}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          disabled={saving}
          className="btn btn-secondary text-xs px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={saving}
          className="btn btn-primary text-xs px-3 py-1.5"
        >
          {saving ? 'Saving...' : 'Mark Paid'}
        </button>
      </div>
    </div>
  )
}

// ─── Main AgentCard ─────────────────────────────────────────────────────────

export default function AgentCard({
  tia, transactionId, transaction, onRefresh,
}: {
  tia: any
  transactionId: string
  transaction: any
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [linkedPreview, setLinkedPreview] = useState<any[]>([])
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [leadSource, setLeadSource] = useState<string>('own')
  const [commissionAmount, setCommissionAmount] = useState<string>(
    tia.agent_basis ? String(tia.agent_basis) : (transaction?.office_gross ? String(transaction.office_gross) : '')
  )
  const [debts, setDebts] = useState<any[]>([])

  const user = tia.user
  const membership = tia.team_membership
  const billing = tia.billing
  const paid = tia.payment_status === 'paid'

  const canApplySplit =
    (tia.agent_role === 'primary_agent' ||
      tia.agent_role === 'listing_agent' ||
      tia.agent_role === 'co_agent') &&
    transaction?.status !== 'closed'
  const txnType = transaction?.transaction_type || null

  // Fetch debts when opening mark paid
  const loadDebts = useCallback(async () => {
    if (!tia.agent_id) return
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_agent_debts', agent_id: tia.agent_id }),
      })
      if (res.ok) {
        const d = await res.json()
        setDebts(d.debts || [])
      }
    } catch {}
  }, [tia.agent_id, transactionId])

  const openMarkPaid = async () => {
    await loadDebts()
    setShowMarkPaid(true)
  }

  const updateField = async (field: string, value: any) => {
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_internal_agent',
        internal_agent_id: tia.id,
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

  const applySplit = async () => {
    if (!canApplySplit) return
    const amt = parseFloat(commissionAmount)
    if (!amt || amt <= 0) { setApplyError('Enter commission amount first'); return }
    setApplying(true)
    setApplyError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_primary_split',
          internal_agent_id: tia.id,
          commission_amount: amt,
          lead_source: leadSource,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Apply split failed')
      }
      onRefresh()
    } catch (e: any) {
      setApplyError(e.message || 'Apply split failed')
    } finally {
      setApplying(false)
    }
  }

  const unmarkPaid = async () => {
    if (!confirm('Unmark this row as paid? This will reverse the payment and any debts applied.')) return
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unmark_paid', internal_agent_id: tia.id }),
    })
    if (res.ok) {
      onRefresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Unmark paid failed')
    }
  }

  const beginDelete = async () => {
    // Preview linked rows
    if (canApplySplit) {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_internal_agent_cascade',
          internal_agent_id: tia.id,
          preview: true,
        }),
      })
      if (res.ok) {
        const d = await res.json()
        setLinkedPreview(d.linked_rows || [])
      }
    }
    setShowDeleteConfirm(true)
  }

  const confirmDelete = async () => {
    const action = canApplySplit ? 'delete_internal_agent_cascade' : 'delete_internal_agent'
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, internal_agent_id: tia.id }),
    })
    if (res.ok) {
      onRefresh()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Delete failed')
    }
    setShowDeleteConfirm(false)
  }

  const roleLabel = AGENT_ROLE_OPTIONS.find(r => r.value === tia.agent_role)?.label || tia.agent_role

  return (
    <div className={`container-card mb-3 ${paid ? 'border-l-4 border-l-green-500' : ''}`}>
      {/* ── Header (always visible) ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-2 text-left w-full"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                {fmtName(user) || '(no agent selected)'}
              </p>
              <p className="text-xs text-luxury-gray-3 truncate">
                {roleLabel} · {tia.commission_plan || 'no plan'}
                {membership?.team?.team_name ? ` · ${membership.team.team_name}` : ''}
              </p>
            </div>
          </button>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-luxury-gray-1">{fmt$(tia.agent_net)}</p>
          <p className={`text-xs ${paid ? 'text-green-700 font-semibold' : 'text-amber-700'}`}>
            {paid ? `Paid ${fmtDate(tia.payment_date)}` : 'Pending'}
          </p>
        </div>
      </div>

      {/* ── Expanded content ── */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">
          <ContextPanel user={user} membership={membership} billing={billing} />

          {/* Apply split controls (primary/listing only, not paid) */}
          {canApplySplit && !paid && (
            <div className="mb-3 p-2 rounded bg-luxury-accent/5 border border-luxury-accent/20">
              <p className="text-xs font-semibold text-luxury-gray-1 mb-2 flex items-center gap-1">
                <DollarSign size={12} /> Apply Split
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">Commission amount</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={commissionAmount}
                    onChange={e => setCommissionAmount(e.target.value)}
                    className="input-luxury text-xs w-full"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="field-label">Lead source</label>
                  <select
                    value={leadSource}
                    onChange={e => setLeadSource(e.target.value)}
                    className="select-luxury text-xs w-full"
                  >
                    {LEAD_SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {applyError && (
                <p className="text-xs text-red-600 mt-1">{applyError}</p>
              )}
              <button
                onClick={applySplit}
                disabled={applying}
                className="btn btn-secondary text-xs mt-2 w-full"
              >
                {applying ? 'Applying...' : 'Apply Split (uses plan + team + momentum)'}
              </button>
              <p className="text-xs text-luxury-gray-3 mt-1">
                Creates/updates linked team lead and momentum partner rows automatically.
              </p>
            </div>
          )}

          {/* Commission details */}
          <div className="mb-3">
            <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Commission</p>
            <FieldRow label="Role" value={tia.agent_role} type="select" options={AGENT_ROLE_OPTIONS} locked={paid} onSave={v => updateField('agent_role', v)} />
            <FieldRow label="Commission plan" value={tia.commission_plan} locked={paid} onSave={v => updateField('commission_plan', v)} />
            <FieldRow label="Sales volume" value={tia.sales_volume} type="number" money locked={paid} onSave={v => updateField('sales_volume', v)} />
            <FieldRow label="Units" value={tia.units} type="number" locked={paid} onSave={v => updateField('units', v)} />
            <FieldRow label="Split %" value={tia.split_percentage} type="number" locked={paid} onSave={v => updateField('split_percentage', v)} />
            <FieldRow label="Agent gross" value={tia.agent_gross} type="number" money locked={paid} onSave={v => updateField('agent_gross', v)} />
            <FieldRow label="Processing fee" value={tia.processing_fee} type="number" money locked={paid} onSave={v => updateField('processing_fee', v)} />
            <FieldRow label="Coaching fee" value={tia.coaching_fee} type="number" money locked={paid} onSave={v => updateField('coaching_fee', v)} />
            <FieldRow label="Other fees" value={tia.other_fees} type="number" money locked={paid} onSave={v => updateField('other_fees', v)} />
            {num(tia.other_fees) > 0 && (
              <FieldRow label="Other fees description" value={tia.other_fees_description} locked={paid} onSave={v => updateField('other_fees_description', v)} />
            )}
            {transaction?.has_btsa && (
              <FieldRow label="BTSA amount" value={tia.btsa_amount} type="number" money locked={paid} onSave={v => updateField('btsa_amount', v)} />
            )}
            <FieldRow label="Team lead commission" value={tia.team_lead_commission} type="number" money locked={paid} onSave={v => updateField('team_lead_commission', v)} />
            <FieldRow label="Brokerage split" value={tia.brokerage_split} type="number" money locked={paid} onSave={v => updateField('brokerage_split', v)} />
            <FieldRow label="Counts toward progress" value={tia.counts_toward_progress} type="checkbox" locked={paid} onSave={v => updateField('counts_toward_progress', v)} />
          </div>

          {/* Totals */}
          <div className="mb-3 p-2 bg-luxury-gray-5/20 rounded">
            <FieldRow label="Agent net" value={tia.agent_net} type="number" money locked={paid} onSave={v => updateField('agent_net', v)} />
            <FieldRow label="1099 reportable" value={tia.amount_1099_reportable} type="number" money locked={paid} onSave={v => updateField('amount_1099_reportable', v)} />
            {paid && num(tia.debts_deducted) > 0 && (
              <div className="flex justify-between py-1.5 text-xs">
                <span className="text-luxury-gray-3">Debts deducted at payment</span>
                <span className="text-luxury-gray-1">{fmt$(tia.debts_deducted)}</span>
              </div>
            )}
          </div>

          {/* Payment details (visible when paid) */}
          {paid && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Payment</p>
              <FieldRow label="Date" value={tia.payment_date} type="date" onSave={v => updateField('payment_date', v)} />
              <FieldRow label="Method" value={tia.payment_method} type="select" options={PAYMENT_METHODS} onSave={v => updateField('payment_method', v)} />
              <FieldRow label="Reference" value={tia.payment_reference} onSave={v => updateField('payment_reference', v)} />
              <FieldRow label="Funding source" value={tia.funding_source} type="select" options={FUNDING_SOURCES} onSave={v => updateField('funding_source', v)} />
            </div>
          )}

          {/* Mark Paid inline section */}
          {showMarkPaid && !paid && (
            <MarkPaidSection
              tia={tia}
              transactionId={transactionId}
              transactionType={txnType}
              debts={debts}
              onDone={() => { setShowMarkPaid(false); onRefresh() }}
              onCancel={() => setShowMarkPaid(false)}
            />
          )}

          {/* Action bar */}
          <div className="flex items-center justify-between pt-3 border-t border-luxury-gray-5/50">
            <button
              onClick={beginDelete}
              className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              <Trash2 size={12} /> Delete
            </button>
            <div className="flex gap-2">
              {paid ? (
                <button
                  onClick={unmarkPaid}
                  className="btn btn-secondary text-xs px-3 py-1.5"
                >
                  Unmark Paid
                </button>
              ) : (
                !showMarkPaid && (
                  <button
                    onClick={openMarkPaid}
                    className="btn btn-primary text-xs px-3 py-1.5"
                  >
                    Mark Paid
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-4">
            <p className="text-sm font-semibold text-luxury-gray-1 mb-2">Delete {fmtName(user) || 'agent'}?</p>
            {canApplySplit && linkedPreview.length > 0 && (
              <>
                <p className="text-xs text-luxury-gray-2 mb-2">
                  This will also delete {linkedPreview.length} linked row{linkedPreview.length !== 1 ? 's' : ''}:
                </p>
                <ul className="text-xs space-y-1 mb-3 max-h-40 overflow-y-auto">
                  {linkedPreview.map((r: any) => (
                    <li key={r.id} className="flex justify-between bg-luxury-gray-5/30 px-2 py-1 rounded">
                      <span>{fmtName(r.user) || '(unknown)'} · {r.agent_role?.replace(/_/g, ' ')}</span>
                      <span className="text-luxury-gray-3">{fmt$(r.agent_net)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {canApplySplit && linkedPreview.length === 0 && (
              <p className="text-xs text-luxury-gray-3 mb-3">No linked rows.</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="btn text-xs px-3 py-1.5 bg-white border border-red-600 text-red-600 hover:bg-red-50 rounded"
              >
                Delete {canApplySplit && linkedPreview.length > 0 ? `${linkedPreview.length + 1} rows` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
