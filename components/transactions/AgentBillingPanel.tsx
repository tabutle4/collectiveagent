'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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

interface MonthlyInvoice {
  id: string
  description: string
  amount_due: number
  due_date: string | null
}

interface PayloadInvoice {
  id: string
  amount_due: number
  due_date: string | null
  status: string
  description: string
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
  // The internal ledger change succeeded but the Payload side of it did not.
  // Rendered separately from `error` because the debt itself did move, and
  // showing this as a failure would send the office looking for the wrong
  // problem. What it means in practice: Payload still needs a hand.
  const [payloadWarning, setPayloadWarning] = useState<string | null>(null)

  // onAppliedChange is held in a ref and deliberately kept OUT of the notify
  // effect's dependency array below.
  //
  // The page passes it as `handleBillingChange(a.id)`. useCallback there
  // memoizes the OUTER function, but calling it returns a NEW inner closure on
  // every render, so the prop's identity changed every time the page
  // re-rendered. With the prop in the dep array the effect re-fired, called it
  // with a fresh object literal, the page did
  // setBillingApplied(prev => ({ ...prev, [tiaId]: applied })) - always a new
  // object, so React could never bail out - the page re-rendered, and the whole
  // thing went round again without end. React tore the subtree down with
  // "Maximum update depth exceeded", which is why unchecking an applied debt
  // did nothing at all: the click never got as far as sending a request.
  //
  // A ref keeps the latest callback available without making it a trigger, so
  // the effect now fires only when the billing data actually changes.
  const onAppliedChangeRef = useRef(onAppliedChange)
  useEffect(() => {
    onAppliedChangeRef.current = onAppliedChange
  }, [onAppliedChange])
  const [reversing, setReversing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  // Payload monthly fee invoices (unpaid, not yet staged)
  const [monthlyInvoices, setMonthlyInvoices] = useState<MonthlyInvoice[]>([])
  const [stagingInvoice, setStagingInvoice] = useState<string | null>(null)
  // ALL open (unpaid) Payload invoices for this agent. Display-only: anything
  // open in Payload that is not already represented in this panel gets a red
  // warning so the office never processes a payout past an open invoice.
  const [payloadInvoices, setPayloadInvoices] = useState<PayloadInvoice[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      // Outstanding records (eligible for staging)
      const outRes = await fetch(`/api/billing?agent_id=${agentId}&status=outstanding`, { cache: 'no-store' })
      if (outRes.ok) {
        const data = await outRes.json()
        const records: BillingRecord[] = data?.records || []
        setDebts(records.filter(r => r.record_type !== 'credit'))
        setCredits(records.filter(r => r.record_type === 'credit'))
      } else {
        const errData = await outRes.json().catch(() => ({}))
        setError(`Could not load billing records: ${errData.error || outRes.status}`)
      }

      // Records previously staged or paid against THIS transaction.
      // After staging a debt is set status='paid' with offset_* pointing here,
      // so the same query that finds Mark-Paid-applied debts also finds staged
      // ones. The TIA's payment_status decides whether unchecking these calls
      // unstage_debt (TIA still pending) or reverse_mark_paid (TIA paid).
      const paidRes = await fetch(
        `/api/billing?agent_id=${agentId}&status=paid&offset_transaction_id=${transactionId}`,
        { cache: 'no-store' }
      )
      if (paidRes.ok) {
        const data = await paidRes.json()
        const records: BillingRecord[] = data?.records || []
        // Only show records staged/applied to THIS card. When one agent has
        // two commission cards on a deal (e.g. a second-check co_agent row),
        // a debt staged to one card must not appear on the other. The null
        // fallback keeps legacy rows (staged before offset_transaction_agent_id
        // existed) visible so single-card agents do not lose them.
        const forThisCard = (r: BillingRecord) =>
          r.offset_transaction_agent_id === tiaId || r.offset_transaction_agent_id == null
        setAppliedDebts(records.filter(r => r.record_type !== 'credit' && forThisCard(r)))
        setAppliedCredits(records.filter(r => r.record_type === 'credit' && forThisCard(r)))
      }
      // Payload monthly fee invoices — show unpaid ones as stageable.
      // We pass the agentId (users.id) which the API maps to payload_payee_id.
      try {
        const mRes = await fetch(`/api/payload/agent-monthly-fees?user_id=${agentId}`, { cache: 'no-store' })
        if (mRes.ok) {
          const mData = await mRes.json()
          // Filter out any that are already staged against this transaction
          // (they appear in appliedDebts with debt_type='monthly_fee').
          // We rely on the reload after staging to remove them from this list.
          setMonthlyInvoices(mData.invoices || [])
        }
      } catch {
        // non-fatal — monthly invoices are a bonus, not critical
      }
      // Every open Payload invoice for this agent, monthly or not. Rendered
      // as display-only warnings when nothing in this panel accounts for it.
      try {
        const pRes = await fetch(`/api/payload/open-invoices?user_id=${agentId}`, { cache: 'no-store' })
        if (pRes.ok) {
          const pData = await pRes.json()
          setPayloadInvoices(pData.invoices || [])
        }
      } catch {
        // non-fatal — warnings only
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [agentId, transactionId, tiaId])

  useEffect(() => {
    load()
  }, [load])

  // Notify parent whenever the checked sets or amounts change.
  // When the TIA is not yet paid, include already-staged records (the
  // "applied" rows in the bottom section) so the preview on the agent
  // card reflects all upcoming deductions. When the TIA is paid, those
  // amounts are already in TIA.debts_deducted (rendered as "Debts
  // (saved)") so excluding them here avoids double-counting.
  useEffect(() => {
    const stagedDebts = isPaid ? [] : appliedDebts
    const stagedCredits = isPaid ? [] : appliedCredits

    const debtTotal =
      debts
        .filter(d => checkedDebts.has(d.id))
        .reduce((s, d) => s + (d.amount_remaining ?? d.amount_owed), 0) +
      stagedDebts.reduce((s, d) => s + (d.amount_paid ?? d.amount_owed), 0)

    const creditTotal =
      credits
        .filter(c => checkedCredits.has(c.id))
        .reduce((s, c) => s + (c.amount_remaining ?? c.amount_owed), 0) +
      stagedCredits.reduce((s, c) => s + (c.amount_paid ?? c.amount_owed), 0)

    onAppliedChangeRef.current({
      debts: debtTotal,
      credits: creditTotal,
      debt_ids: [...Array.from(checkedDebts), ...stagedDebts.map(d => d.id)],
      credit_ids: [...Array.from(checkedCredits), ...stagedCredits.map(c => c.id)],
    })
    // onAppliedChange is intentionally absent: see the ref above.
  }, [debts, credits, appliedDebts, appliedCredits, isPaid, checkedDebts, checkedCredits])

  const toggleDebt = async (id: string) => {
    if (isPaid) return
    setPayloadWarning(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stage_debt',
          internal_agent_id: tiaId,
          debt_id: id,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Failed to stage debt')
        return
      }
      if (d.payload_warning) setPayloadWarning(d.payload_warning)
      // Reload — the debt moves from outstanding (debts) to applied (paid+offset).
      await load()
    } catch {
      setError('Network error staging debt')
    }
  }

  const toggleCredit = async (id: string) => {
    if (isPaid) return
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stage_credit',
          internal_agent_id: tiaId,
          credit_id: id,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to stage credit')
        return
      }
      await load()
    } catch {
      setError('Network error staging credit')
    }
  }

  // Reverse a previously-applied debt or credit. Server flips:
  //   • agent_debts row: status → outstanding, amount_paid → 0, offset cleared
  //   • TIA row: payment_status → pending, agent_net adjusted
  //   • Transaction office_net recomputed
  const reverseApplied = async (recordId: string, kind: 'debt' | 'credit') => {
    // When the TIA is still pending, unchecking a previously-staged record
    // is a per-record unstage — no agent-level payout to undo. When the TIA
    // has been Marked Paid, reverse_mark_paid is needed to roll back the
    // entire payout (debts, credits, payment metadata, agent_net).
    const useUnstage = !isPaid

    if (!useUnstage) {
      if (!confirm(
        `Uncheck this ${kind}?\n\nThis will:\n• Revert the ${kind} to outstanding\n• Mark this transaction unpaid for this agent\n• Adjust agent net\n\nThe agent's payout will need to be reissued.`
      )) return
    }

    setReversing(recordId)
    setError(null)
    setPayloadWarning(null)
    try {
      const body: any = {
        action: useUnstage
          ? (kind === 'debt' ? 'unstage_debt' : 'unstage_credit')
          : 'reverse_mark_paid',
        internal_agent_id: tiaId,
      }
      if (kind === 'debt') body.debt_id = recordId
      else body.credit_id = recordId

      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(d.error || 'Reverse failed')
      }
      if (d.payload_warning) setPayloadWarning(d.payload_warning)
      await load()
      if (!useUnstage) onReversedTia?.()
    } catch (e: any) {
      setError(e.message || 'Reverse failed')
    } finally {
      setReversing(null)
    }
  }

  const stageMonthlyInvoice = async (inv: MonthlyInvoice) => {
    if (isPaid) return
    setStagingInvoice(inv.id)
    setError(null)
    setPayloadWarning(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'stage_monthly_invoice',
          internal_agent_id: tiaId,
          agent_id: agentId,
          invoice_id: inv.id,
          amount: inv.amount_due,
          description: inv.description,
          date_incurred: inv.due_date || new Date().toISOString().split('T')[0],
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Failed to stage monthly invoice')
        return
      }
      if (d.payload_warning) setPayloadWarning(d.payload_warning)
      // Reload — the invoice should now appear in appliedDebts
      await load()
    } catch {
      setError('Network error staging monthly invoice')
    } finally {
      setStagingInvoice(null)
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

  // Open Payload invoices that need attention. Matching is by exact Payload
  // invoice ID from the debt's notes stamp ("Payload invoice ID: inv_..."),
  // never by amount: two invoices can share an amount without being the same
  // invoice. Three cases:
  //   1. ID matches an OUTSTANDING debt here: hidden, the debt already shows
  //      as a stageable row above.
  //   2. ID matches an APPLIED debt here: loudest warning. The money was
  //      collected on this deal but the invoice is still open in Payload,
  //      so the agent is about to be billed twice. Settle/void in Payload.
  //   3. No ID match anywhere: warning. Open in Payload with no record on
  //      this deal, resolve before paying out.
  // Monthly fee invoices are excluded, they render in their own section.
  const extractPayloadId = (notes?: string | null) => {
    const m = /payload[ _]invoice(?:[ _]id)?:?\s*([A-Za-z0-9_-]+)/i.exec(notes || '')
    return m ? m[1] : null
  }
  const outstandingPayloadIds = new Set(
    debts.map(d => extractPayloadId(d.notes)).filter(Boolean) as string[]
  )
  const appliedPayloadIds = new Set(
    appliedDebts.map(d => extractPayloadId(d.notes)).filter(Boolean) as string[]
  )
  const monthlyIds = new Set(monthlyInvoices.map(i => i.id))
  const openPayloadWarnings = payloadInvoices.filter(
    inv => !monthlyIds.has(inv.id) && !outstandingPayloadIds.has(inv.id)
  )

  if (totalOutstanding === 0 && totalApplied === 0 && monthlyInvoices.length === 0 && openPayloadWarnings.length === 0 && !showAddDebt && !showAddCredit) {
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
              ({totalApplied} applied{totalOutstanding + monthlyInvoices.length > 0 ? `, ${totalOutstanding + monthlyInvoices.length} outstanding` : ''})
            </span>
          )}
          {totalApplied === 0 && (totalOutstanding + monthlyInvoices.length) > 0 && (
            <span className="text-luxury-gray-3 font-normal ml-1">
              ({totalOutstanding + monthlyInvoices.length} outstanding)
            </span>
          )}
          {openPayloadWarnings.length > 0 && (
            <span className="text-red-600 font-semibold ml-1">
              ({openPayloadWarnings.length} open in Payload)
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

      {/* Failures from staging, unstaging and reversing land in `error`. This
          block is the only thing that renders it in this panel. Without it the
          value was set and never shown - the sole reader was the add-debt /
          add-credit form's `error` prop, so unless one of those forms happened
          to be open, a failed uncheck looked exactly like a click that did
          nothing. Outside the collapse so it cannot be missed. */}
      {error && (
        <div className="p-2 rounded border border-red-300 bg-red-50 mb-1.5">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* The internal ledger change went through but Payload did not. Shown
          outside the collapse so it cannot be missed, and separately from
          `error` so the office does not go looking for a failure that did not
          happen. */}
      {payloadWarning && (
        <div className="p-2 rounded border border-amber-200 bg-amber-50 mb-1.5">
          <p className="text-xs text-amber-800">
            Saved here, but Payload was not updated. {payloadWarning}
          </p>
        </div>
      )}

      {expanded && (
        <div className="space-y-1.5">
          {/* Open Payload invoices with no internal record. Display-only. */}
          {openPayloadWarnings.map(inv => {
            const collectedHere = appliedPayloadIds.has(inv.id)
            return (
              <div
                key={`payload-${inv.id}`}
                className="flex items-start gap-2 p-2 rounded border border-red-300 bg-red-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-luxury-gray-1 truncate">
                    {inv.description}
                    <span className="ml-2 text-[10px] text-red-600 font-semibold uppercase">open in Payload</span>
                  </p>
                  <p className="text-[10px] text-luxury-gray-3">
                    {inv.due_date ? fmtDate(inv.due_date) : '--'} · Payload invoice {inv.id}
                  </p>
                  <p className="text-[10px] text-red-600 mt-0.5">
                    {collectedHere
                      ? 'This invoice was already deducted on this deal but is still open in Payload. Settle or void it in Payload so the agent is not billed twice.'
                      : 'No matching record on this deal. Resolve on the Billing page before paying out.'}
                  </p>
                </div>
                <span className="text-xs font-semibold text-red-600 shrink-0">
                  {fmt$(inv.amount_due)}
                </span>
              </div>
            )
          })}

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

          {/* Payload monthly fee invoices — unpaid, stageable */}
          {monthlyInvoices.map(inv => (
            <label
              key={`monthly-${inv.id}`}
              className={`flex items-start gap-2 p-2 rounded border border-orange-200 bg-orange-50/20 ${isPaid ? 'cursor-default' : 'cursor-pointer'}`}
              onClick={isPaid || stagingInvoice === inv.id ? undefined : () => stageMonthlyInvoice(inv)}
            >
              <input
                type="checkbox"
                checked={false}
                readOnly
                disabled={isPaid || stagingInvoice === inv.id}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-luxury-gray-1 truncate">
                  {inv.description}
                  <span className="ml-2 text-[10px] text-orange-500 font-normal">monthly fee</span>
                </p>
                <p className="text-[10px] text-luxury-gray-3">
                  {inv.due_date ? fmtDate(inv.due_date) : '--'} · Payload invoice
                </p>
              </div>
              <span className="text-xs font-semibold text-orange-600 shrink-0">
                {stagingInvoice === inv.id ? '...' : `-${fmt$(inv.amount_due)}`}
              </span>
            </label>
          ))}

          {/* Outstanding agent_debts — checkbox is local UI state until Mark Paid */}
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
  { value: 'ecommission',        label: 'eCommission' },
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
