'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, X, ChevronDown, ChevronUp } from 'lucide-react'

const fmt$ = (n: any) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 2,
}).format(parseFloat(String(n ?? 0)) || 0)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '--'
  const dateStr = d.length === 10 ? d + 'T12:00:00' : d
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface BillingRecord {
  id: string
  agent_id: string
  record_type: 'credit' | string | null
  debt_type: string | null
  description: string
  amount_owed: number
  amount_paid?: number | null
  amount_remaining: number | null
  date_incurred: string
  due_date?: string | null
  status: string
  notes?: string | null
  offset_transaction_id?: string | null
  offset_transaction_agent_id?: string | null
}

interface Props {
  agentId: string
  tiaId: string
  transactionId: string
  // When checked items change we tell the parent so it can reflect on agent_net
  // appliedTotals = { debts: number, credits: number }
  onAppliedChange: (appliedTotals: { debts: number; credits: number; debt_ids: string[]; credit_ids: string[] }) => void
  isPaid: boolean
  onReversedTia?: () => void
}

export default function AgentBillingPanel({ agentId, tiaId, transactionId, onAppliedChange, isPaid, onReversedTia }: Props) {
  const [loading, setLoading] = useState(true)
  const [debts, setDebts] = useState<BillingRecord[]>([])
  const [credits, setCredits] = useState<BillingRecord[]>([])
  // Records previously applied to THIS transaction (paid debts/credits from
  // a Mark Paid that the admin can now uncheck to reverse).
  const [appliedDebts, setAppliedDebts] = useState<BillingRecord[]>([])
  const [appliedCredits, setAppliedCredits] = useState<BillingRecord[]>([])
  const [checkedDebts, setCheckedDebts] = useState<Set<string>>(new Set())
  const [checkedCredits, setCheckedCredits] = useState<Set<string>>(new Set())
  const [showAddDebt, setShowAddDebt] = useState(false)
  const [showAddCredit, setShowAddCredit] = useState(false)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reversing, setReversing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Outstanding records (eligible for application)
      const outRes = await fetch(`/api/billing?agent_id=${agentId}&status=outstanding`, { cache: 'no-store' })
      if (outRes.ok) {
        const data = await outRes.json()
        const records: BillingRecord[] = data?.records || []
        setDebts(records.filter(r => r.record_type !== 'credit'))
        setCredits(records.filter(r => r.record_type === 'credit'))
      }

      // Records previously applied to THIS transaction (so admin can uncheck/reverse)
      const paidRes = await fetch(
        `/api/billing?agent_id=${agentId}&status=paid&offset_transaction_id=${transactionId}`,
        { cache: 'no-store' }
      )
      if (paidRes.ok) {
        const data = await paidRes.json()
        const records: BillingRecord[] = data?.records || []
        setAppliedDebts(records.filter(r => r.record_type !== 'credit'))
        setAppliedCredits(records.filter(r => r.record_type === 'credit'))
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [agentId, transactionId])

  useEffect(() => {
    load()
  }, [load])

  // Notify parent whenever the checked sets or amounts change
  useEffect(() => {
    const debtTotal = debts
      .filter(d => checkedDebts.has(d.id))
      .reduce((s, d) => s + (d.amount_remaining ?? d.amount_owed), 0)
    const creditTotal = credits
      .filter(c => checkedCredits.has(c.id))
      .reduce((s, c) => s + (c.amount_remaining ?? c.amount_owed), 0)
    onAppliedChange({
      debts: debtTotal,
      credits: creditTotal,
      debt_ids: Array.from(checkedDebts),
      credit_ids: Array.from(checkedCredits),
    })
  }, [debts, credits, checkedDebts, checkedCredits, onAppliedChange])

  const toggleDebt = (id: string) => {
    if (isPaid) return
    setCheckedDebts(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCredit = (id: string) => {
    if (isPaid) return
    setCheckedCredits(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Reverse a previously-applied debt or credit. Server flips:
  //   • agent_debts row: status → outstanding, amount_paid → 0, offset cleared
  //   • TIA row: payment_status → pending, agent_net adjusted
  //   • Transaction office_net recomputed
  const reverseApplied = async (recordId: string, kind: 'debt' | 'credit') => {
    if (!confirm(
      `Uncheck this ${kind}?\n\nThis will:\n• Revert the ${kind} to outstanding\n• Mark this transaction unpaid for this agent\n• Adjust agent net\n\nThe agent's payout will need to be reissued.`
    )) return

    setReversing(recordId)
    setError(null)
    try {
      const body: any = {
        action: 'reverse_mark_paid',
        internal_agent_id: tiaId,
      }
      if (kind === 'debt') body.debt_id = recordId
      else body.credit_id = recordId

      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Reverse failed')
      }
      await load()
      onReversedTia?.()
    } catch (e: any) {
      setError(e.message || 'Reverse failed')
    } finally {
      setReversing(null)
    }
  }

  const addRecord = async (form: AddFormState, recordType: 'debt' | 'credit') => {
    setAdding(true)
    setError(null)
    try {
      const record: any = {
        agent_id: agentId,
        record_type: recordType === 'credit' ? 'credit' : null,
        debt_type: form.debt_type || (recordType === 'credit' ? 'brokerage_credit' : 'custom_invoice'),
        description: form.description,
        amount_owed: parseFloat(form.amount),
        amount_paid: 0,
        date_incurred: form.date_incurred || new Date().toISOString().split('T')[0],
      }
      if (form.due_date) record.due_date = form.due_date
      if (form.notes) record.notes = form.notes

      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', record }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Failed to add')
      }
      // Reload list, then if "apply to this transaction" was checked we
      // pre-check the newest record. We identify it as the newest by
      // refetching and finding the one with the highest created_at.
      await load()
      if (form.apply) {
        // Re-fetch already happened; find the newest matching this description
        try {
          const r = await fetch(`/api/billing?agent_id=${agentId}&status=outstanding`, { cache: 'no-store' })
          if (r.ok) {
            const d = await r.json()
            const rs: BillingRecord[] = d?.records || []
            const filtered = rs.filter(x =>
              (recordType === 'credit' ? x.record_type === 'credit' : x.record_type !== 'credit') &&
              x.description === form.description
            )
            const newest = filtered[0] // returned sorted by date_incurred DESC in API
            if (newest) {
              if (recordType === 'credit') {
                setCheckedCredits(prev => new Set([...prev, newest.id]))
              } else {
                setCheckedDebts(prev => new Set([...prev, newest.id]))
              }
            }
          }
        } catch {
          // silent
        }
      }
      // Close form
      if (recordType === 'debt') setShowAddDebt(false)
      else setShowAddCredit(false)
    } catch (e: any) {
      setError(e.message || 'Failed to add')
    } finally {
      setAdding(false)
    }
  }

  if (loading) {
    return (
      <div className="border-t border-luxury-gray-5/50 mt-2 pt-2 text-xs text-luxury-gray-3">
        Loading billing...
      </div>
    )
  }

  const totalApplied = appliedDebts.length + appliedCredits.length
  const totalOutstanding = debts.length + credits.length

  if (totalOutstanding === 0 && totalApplied === 0 && !showAddDebt && !showAddCredit) {
    return (
      <div className="border-t border-luxury-gray-5/50 mt-2 pt-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-luxury-gray-3">No outstanding billing.</span>
          {!isPaid && (
            <div className="flex gap-1">
              <button onClick={() => setShowAddDebt(true)} className="text-xs text-luxury-accent hover:underline">+ Add Debt</button>
              <button onClick={() => setShowAddCredit(true)} className="text-xs text-luxury-accent hover:underline">+ Add Credit</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-luxury-gray-5/50 mt-2 pt-2">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold text-luxury-gray-2 flex items-center gap-1"
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          Billing
          {totalApplied > 0 && (
            <span className="text-luxury-gray-3 font-normal ml-1">
              ({totalApplied} applied{totalOutstanding > 0 ? `, ${totalOutstanding} outstanding` : ''})
            </span>
          )}
          {totalApplied === 0 && totalOutstanding > 0 && (
            <span className="text-luxury-gray-3 font-normal ml-1">
              ({totalOutstanding} outstanding)
            </span>
          )}
        </button>
        {!isPaid && expanded && (
          <div className="flex gap-2">
            <button onClick={() => setShowAddDebt(true)} className="text-xs text-luxury-accent hover:underline">+ Debt</button>
            <button onClick={() => setShowAddCredit(true)} className="text-xs text-luxury-accent hover:underline">+ Credit</button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="space-y-1.5">
          {/* Applied — pre-checked. Unchecking calls reverse_mark_paid. */}
          {appliedDebts.map(d => (
            <label
              key={`applied-d-${d.id}`}
              className="flex items-start gap-2 p-2 rounded border border-orange-300 bg-orange-50/60"
            >
              <input
                type="checkbox"
                checked={true}
                onChange={() => reverseApplied(d.id, 'debt')}
                disabled={reversing === d.id}
                className="mt-0.5"
                title="Uncheck to reverse"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">
                  {d.description}
                  <span className="ml-2 text-[10px] text-orange-600 font-semibold uppercase">applied</span>
                </p>
                <p className="text-[10px] text-luxury-gray-3">{fmtDate(d.date_incurred)} · {d.debt_type || '-'}</p>
              </div>
              <span className="text-xs font-semibold text-orange-600 shrink-0">
                -{fmt$(d.amount_paid ?? d.amount_owed)}
              </span>
            </label>
          ))}
          {appliedCredits.map(c => (
            <label
              key={`applied-c-${c.id}`}
              className="flex items-start gap-2 p-2 rounded border border-green-300 bg-green-50/60"
            >
              <input
                type="checkbox"
                checked={true}
                onChange={() => reverseApplied(c.id, 'credit')}
                disabled={reversing === c.id}
                className="mt-0.5"
                title="Uncheck to reverse"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">
                  {c.description}
                  <span className="ml-2 text-[10px] text-green-600 font-semibold uppercase">applied</span>
                </p>
                <p className="text-[10px] text-luxury-gray-3">{fmtDate(c.date_incurred)} · credit</p>
              </div>
              <span className="text-xs font-semibold text-green-600 shrink-0">
                +{fmt$(c.amount_paid ?? c.amount_owed)}
              </span>
            </label>
          ))}

          {/* Outstanding — checkbox is local UI state until Mark Paid */}
          {debts.map(d => (
            <label
              key={d.id}
              className={`flex items-start gap-2 p-2 rounded border ${
                checkedDebts.has(d.id)
                  ? 'border-orange-300 bg-orange-50/40'
                  : 'border-luxury-gray-5/40 bg-luxury-gray-5/10'
              } ${isPaid ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={checkedDebts.has(d.id)}
                onChange={() => toggleDebt(d.id)}
                disabled={isPaid}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">{d.description}</p>
                <p className="text-[10px] text-luxury-gray-3">{fmtDate(d.date_incurred)} · {d.debt_type || '-'}</p>
              </div>
              <span className="text-xs font-semibold text-orange-600 shrink-0">
                -{fmt$(d.amount_remaining ?? d.amount_owed)}
              </span>
            </label>
          ))}

          {credits.map(c => (
            <label
              key={c.id}
              className={`flex items-start gap-2 p-2 rounded border ${
                checkedCredits.has(c.id)
                  ? 'border-green-300 bg-green-50/40'
                  : 'border-luxury-gray-5/40 bg-luxury-gray-5/10'
              } ${isPaid ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={checkedCredits.has(c.id)}
                onChange={() => toggleCredit(c.id)}
                disabled={isPaid}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">{c.description}</p>
                <p className="text-[10px] text-luxury-gray-3">{fmtDate(c.date_incurred)} · credit</p>
              </div>
              <span className="text-xs font-semibold text-green-600 shrink-0">
                +{fmt$(c.amount_remaining ?? c.amount_owed)}
              </span>
            </label>
          ))}
        </div>
      )}

      {showAddDebt && <AddRecordForm
        kind="debt"
        adding={adding}
        error={error}
        onCancel={() => { setShowAddDebt(false); setError(null) }}
        onSave={(form) => addRecord(form, 'debt')}
      />}
      {showAddCredit && <AddRecordForm
        kind="credit"
        adding={adding}
        error={error}
        onCancel={() => { setShowAddCredit(false); setError(null) }}
        onSave={(form) => addRecord(form, 'credit')}
      />}
    </div>
  )
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface AddFormState {
  description: string
  amount: string
  debt_type: string
  date_incurred: string
  due_date: string
  notes: string
  apply: boolean
}

const DEBT_TYPES = [
  { value: 'custom_invoice',     label: 'Custom Invoice' },
  { value: 'brokerage_credit',   label: 'Brokerage Credit' },
  { value: 'brokermint_balance', label: 'Brokermint Balance' },
]

function AddRecordForm({
  kind,
  adding,
  error,
  onCancel,
  onSave,
}: {
  kind: 'debt' | 'credit'
  adding: boolean
  error: string | null
  onCancel: () => void
  onSave: (form: AddFormState) => void
}) {
  const [form, setForm] = useState<AddFormState>({
    description: '',
    amount: '',
    debt_type: kind === 'credit' ? 'brokerage_credit' : 'custom_invoice',
    date_incurred: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: '',
    apply: false,
  })
  const [showMore, setShowMore] = useState(false)

  const canSave = form.description.trim() !== '' && parseFloat(form.amount) > 0

  return (
    <div className="mt-2 p-3 border border-luxury-accent/30 bg-luxury-accent/5 rounded">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-semibold text-luxury-gray-1">
          Add {kind === 'credit' ? 'Credit' : 'Debt'}
        </h4>
        <button onClick={onCancel} className="text-luxury-gray-3 hover:text-luxury-gray-1">
          <X size={12} />
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <label className="field-label">Description *</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="input-luxury w-full text-xs"
            placeholder="What is this for?"
          />
        </div>
        <div>
          <label className="field-label">Amount *</label>
          <input
            type="number"
            step="0.01"
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
            className="input-luxury w-full text-xs"
            placeholder="0.00"
          />
        </div>
        {kind === 'debt' && (
          <div>
            <label className="field-label">Type *</label>
            <select
              value={form.debt_type}
              onChange={e => setForm({ ...form, debt_type: e.target.value })}
              className="select-luxury w-full text-xs"
            >
              {DEBT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowMore(!showMore)}
          className="text-xs text-luxury-accent hover:underline"
        >
          {showMore ? 'Hide' : 'Show'} more
        </button>
        {showMore && (
          <>
            <div>
              <label className="field-label">Date incurred</label>
              <input
                type="date"
                value={form.date_incurred}
                onChange={e => setForm({ ...form, date_incurred: e.target.value })}
                className="input-luxury w-full text-xs"
              />
            </div>
            <div>
              <label className="field-label">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="input-luxury w-full text-xs"
              />
            </div>
            <div>
              <label className="field-label">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="input-luxury w-full text-xs"
                rows={2}
              />
            </div>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-luxury-gray-2">
          <input
            type="checkbox"
            checked={form.apply}
            onChange={e => setForm({ ...form, apply: e.target.checked })}
          />
          Apply to this transaction
        </label>
      </div>

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={onCancel}
          disabled={adding}
          className="btn btn-secondary text-xs"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(form)}
          disabled={adding || !canSave}
          className="btn btn-primary text-xs"
        >
          {adding ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
