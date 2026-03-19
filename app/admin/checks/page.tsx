'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, ChevronDown, ChevronUp, RefreshCw, Edit2, Check,
  X, AlertCircle, Clock, DollarSign, Building2, User
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type CheckStatus =
  | 'received' | 'deposited' | 'cleared' | 'pending_compliance'
  | 'compliance_complete' | 'payouts_in_progress' | 'paid'

type PayoutStatus = 'pending' | 'processed' | 'paid'

interface Payout {
  id: string
  payee_type: string
  payee_name: string | null
  user_id: string | null
  amount: number
  payment_method: string
  payment_status: PayoutStatus
  payment_date: string | null
  payment_reference: string | null
}

interface Check {
  id: string
  property_address: string | null
  check_from: string | null
  check_number?: string | null
  check_amount: number
  received_date: string
  deposited_date?: string | null
  cleared_date?: string | null
  compliance_complete_date?: string | null
  brokerage_amount?: number | null
  crc_transferred?: boolean
  status: CheckStatus
  notes?: string | null
  transaction_id?: string | null
  check_payouts: Payout[]
}

interface DashboardData {
  us_bank_balance: number
  us_bank_balance_updated_at: string | null
  on_hold: number
  processed_payouts: number
  pending_payouts: number
  crc_not_transferred: number
  coverage_check: number
  total_exposure: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(1)}M`
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`
  return fmt(n)
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const BUSINESS_DAYS = 10

function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

function getPayByDate(check: Check): Date | null {
  if (!check.cleared_date && !check.compliance_complete_date) return null
  const dates = [check.cleared_date, check.compliance_complete_date]
    .filter(Boolean)
    .map(d => new Date(d!))
  const latest = new Date(Math.max(...dates.map(d => d.getTime())))
  return addBusinessDays(latest, BUSINESS_DAYS)
}

function daysUntil(date: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function PayByBadge({ check }: { check: Check }) {
  const payBy = getPayByDate(check)
  if (!payBy) return null
  const days = daysUntil(payBy)
  const color = days < 0 ? 'bg-red-100 text-red-700' : days <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-luxury-light text-luxury-gray-2'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
      {' · '}{fmtDate(payBy.toISOString())}
    </span>
  )
}

function StatusBadge({ status }: { status: CheckStatus }) {
  const map: Record<CheckStatus, string> = {
    received: 'bg-gray-100 text-gray-600',
    deposited: 'bg-blue-50 text-blue-600',
    cleared: 'bg-green-50 text-green-700',
    pending_compliance: 'bg-yellow-50 text-yellow-700',
    compliance_complete: 'bg-teal-50 text-teal-700',
    payouts_in_progress: 'bg-orange-50 text-orange-700',
    paid: 'bg-luxury-accent/10 text-luxury-accent',
  }
  const labels: Record<CheckStatus, string> = {
    received: 'Received',
    deposited: 'Deposited',
    cleared: 'Cleared',
    pending_compliance: 'Pending Compliance',
    compliance_complete: 'Compliance Complete',
    payouts_in_progress: 'Payouts In Progress',
    paid: 'Paid',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded ${map[status]}`}>
      {labels[status]}
    </span>
  )
}

function PayoutStatusBadge({ status }: { status: PayoutStatus }) {
  const map: Record<PayoutStatus, string> = {
    pending: 'bg-gray-100 text-gray-600',
    processed: 'bg-blue-50 text-blue-700',
    paid: 'bg-green-50 text-green-700',
  }
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded capitalize ${map[status]}`}>
      {status}
    </span>
  )
}

const PAYEE_TYPES = [
  'Agent', 'Team Lead', 'Selling Agent', 'Listing Agent',
  'Referral Agent', 'Referral Brokerage', 'Co-op Brokerage',
  'eCommission', 'Rev Share Agent',
]

const STATUS_OPTIONS: CheckStatus[] = [
  'received', 'deposited', 'cleared', 'pending_compliance',
  'compliance_complete', 'payouts_in_progress', 'paid',
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminChecksPage() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [onHold, setOnHold] = useState<Check[]>([])
  const [active, setActive] = useState<Check[]>([])
  const [history, setHistory] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSection, setExpandedSection] = useState<Record<string, boolean>>({
    on_hold: true, active: true, history: false,
  })
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [showAddCheck, setShowAddCheck] = useState(false)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)

  // New check form
  const emptyCheckForm = {
    check_amount: '', received_date: '', check_from: '', check_number: '',
    property_address: '', deposited_date: '', cleared_date: '',
    compliance_complete_date: '', brokerage_amount: '', notes: '',
  }
  const [checkForm, setCheckForm] = useState(emptyCheckForm)
  const [savingCheck, setSavingCheck] = useState(false)

  // Edit check state
  const [editingCheck, setEditingCheck] = useState<string | null>(null)
  const [editCheckData, setEditCheckData] = useState<Partial<Check>>({})

  // Add payout state
  const [addingPayoutFor, setAddingPayoutFor] = useState<string | null>(null)
  const [payoutForm, setPayoutForm] = useState({
    payee_type: 'Agent', payee_name: '', amount: '', payment_method: 'ach',
  })
  const [savingPayout, setSavingPayout] = useState(false)

  // Edit payout state
  const [editingPayout, setEditingPayout] = useState<string | null>(null)
  const [editPayoutData, setEditPayoutData] = useState<Partial<Payout>>({})

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [d, h, a, hi] = await Promise.all([
        fetch('/api/checks?section=dashboard').then(r => r.json()),
        fetch('/api/checks?section=on_hold').then(r => r.json()),
        fetch('/api/checks?section=active').then(r => r.json()),
        fetch('/api/checks?section=history').then(r => r.json()),
      ])
      setDashboard(d)
      setOnHold(h.checks || [])
      setActive(a.checks || [])
      setHistory(hi.checks || [])
    } catch (e) {
      console.error('Failed to load checks:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const saveBalance = async () => {
    if (!balanceInput) return
    setSavingBalance(true)
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_balance', balance: parseFloat(balanceInput) }),
    })
    setSavingBalance(false)
    setEditingBalance(false)
    loadAll()
  }

  const saveCheck = async () => {
    if (!checkForm.check_amount || !checkForm.received_date || !checkForm.check_from || !checkForm.property_address) return
    setSavingCheck(true)
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_check', check: checkForm }),
    })
    setSavingCheck(false)
    setShowAddCheck(false)
    setCheckForm(emptyCheckForm)
    loadAll()
  }

  const updateCheck = async (checkId: string, updates: Partial<Check>) => {
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_check', check_id: checkId, updates }),
    })
    setEditingCheck(null)
    loadAll()
  }

  const savePayout = async (checkId: string) => {
    if (!payoutForm.amount || !payoutForm.payee_type) return
    setSavingPayout(true)
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_payout',
        payout: { check_id: checkId, ...payoutForm },
      }),
    })
    setSavingPayout(false)
    setAddingPayoutFor(null)
    setPayoutForm({ payee_type: 'Agent', payee_name: '', amount: '', payment_method: 'ach' })
    loadAll()
  }

  const updatePayout = async (payoutId: string, updates: Partial<Payout>) => {
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_payout', payout_id: payoutId, updates }),
    })
    setEditingPayout(null)
    loadAll()
  }

  const deletePayout = async (payoutId: string) => {
    if (!confirm('Delete this payout?')) return
    await fetch('/api/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_payout', payout_id: payoutId }),
    })
    loadAll()
  }

  // ─── Check Detail Panel ───────────────────────────────────────────────────

  const renderCheckDetail = (check: Check) => {
    const totalPayouts = check.check_payouts.reduce((s, p) => s + p.amount, 0)
    const crc = check.brokerage_amount || 0
    const total = totalPayouts + crc
    const diff = check.check_amount - total
    const balanced = Math.abs(diff) < 0.01

    return (
      <div className="mt-4 pt-4 border-t border-luxury-gray-5/50 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT — Check Info */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Check Info</p>

          {editingCheck === check.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">Received Date</label>
                  <input type="date" className="input-luxury" value={editCheckData.received_date as string || ''} onChange={e => setEditCheckData(p => ({ ...p, received_date: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Deposited Date</label>
                  <input type="date" className="input-luxury" value={editCheckData.deposited_date as string || ''} onChange={e => setEditCheckData(p => ({ ...p, deposited_date: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Cleared Date</label>
                  <input type="date" className="input-luxury" value={editCheckData.cleared_date as string || ''} onChange={e => setEditCheckData(p => ({ ...p, cleared_date: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Compliance Complete Date</label>
                  <input type="date" className="input-luxury" value={editCheckData.compliance_complete_date as string || ''} onChange={e => setEditCheckData(p => ({ ...p, compliance_complete_date: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">CRC Amount ($)</label>
                  <input type="number" step="0.01" className="input-luxury" value={editCheckData.brokerage_amount as number || ''} onChange={e => setEditCheckData(p => ({ ...p, brokerage_amount: parseFloat(e.target.value) }))} />
                </div>
                <div>
                  <label className="field-label">Status</label>
                  <select className="select-luxury" value={editCheckData.status as string || check.status} onChange={e => setEditCheckData(p => ({ ...p, status: e.target.value as CheckStatus }))}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Notes</label>
                <textarea className="input-luxury resize-none" rows={2} value={editCheckData.notes as string || ''} onChange={e => setEditCheckData(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-luxury-gray-2 cursor-pointer">
                  <input type="checkbox" checked={!!editCheckData.crc_transferred} onChange={e => setEditCheckData(p => ({ ...p, crc_transferred: e.target.checked }))} />
                  CRC Transferred
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateCheck(check.id, editCheckData)} className="btn btn-primary text-xs">Save</button>
                <button onClick={() => setEditingCheck(null)} className="btn btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {[
                ['Check From', check.check_from],
                ['Check Number', check.check_number],
                ['Amount', fmt(check.check_amount)],
                ['CRC Amount', check.brokerage_amount ? fmt(check.brokerage_amount) : '—'],
                ['Received', fmtDate(check.received_date)],
                ['Deposited', fmtDate(check.deposited_date)],
                ['Cleared', fmtDate(check.cleared_date)],
                ['Compliance Complete', fmtDate(check.compliance_complete_date)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-xs">
                  <span className="text-luxury-gray-3">{label}</span>
                  <span className="text-luxury-gray-1 font-medium">{value || '—'}</span>
                </div>
              ))}

              {/* Pay-by date */}
              {(check.cleared_date || check.compliance_complete_date) && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-luxury-gray-3 flex items-center gap-1"><Clock size={11} /> Pay By</span>
                  <PayByBadge check={check} />
                </div>
              )}

              {/* CRC transferred */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-luxury-gray-3">CRC Transferred</span>
                {check.crc_transferred
                  ? <span className="text-green-600 font-medium flex items-center gap-1"><Check size={11} /> Yes</span>
                  : <button onClick={() => updateCheck(check.id, { crc_transferred: true })} className="text-luxury-accent hover:underline text-xs">Mark Transferred</button>
                }
              </div>

              {check.notes && (
                <div className="text-xs text-luxury-gray-3 pt-1 italic">{check.notes}</div>
              )}

              <button
                onClick={() => { setEditingCheck(check.id); setEditCheckData({ ...check }) }}
                className="btn btn-secondary text-xs flex items-center gap-1 mt-2"
              >
                <Edit2 size={11} /> Edit Check Info
              </button>
            </div>
          )}
        </div>

        {/* RIGHT — Payouts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Payouts</p>
            <button
              onClick={() => setAddingPayoutFor(addingPayoutFor === check.id ? null : check.id)}
              className="btn btn-secondary text-xs flex items-center gap-1"
            >
              <Plus size={11} /> Add Payee
            </button>
          </div>

          {/* Add payout form */}
          {addingPayoutFor === check.id && (
            <div className="inner-card space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="field-label">Payee Type</label>
                  <select className="select-luxury" value={payoutForm.payee_type} onChange={e => setPayoutForm(p => ({ ...p, payee_type: e.target.value }))}>
                    {PAYEE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label">Name</label>
                  <input className="input-luxury" placeholder="Agent or brokerage name" value={payoutForm.payee_name} onChange={e => setPayoutForm(p => ({ ...p, payee_name: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Amount ($)</label>
                  <input type="number" step="0.01" className="input-luxury" value={payoutForm.amount} onChange={e => setPayoutForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Payment Method</label>
                  <select className="select-luxury" value={payoutForm.payment_method} onChange={e => setPayoutForm(p => ({ ...p, payment_method: e.target.value }))}>
                    <option value="ach">ACH</option>
                    <option value="zelle">Zelle</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => savePayout(check.id)} disabled={savingPayout || !payoutForm.amount} className="btn btn-primary text-xs disabled:opacity-50">
                  {savingPayout ? 'Adding...' : 'Add Payee'}
                </button>
                <button onClick={() => setAddingPayoutFor(null)} className="btn btn-secondary text-xs">Cancel</button>
              </div>
            </div>
          )}

          {/* Payout rows */}
          {check.check_payouts.length === 0 ? (
            <p className="text-xs text-luxury-gray-3">No payees added yet.</p>
          ) : (
            <div className="space-y-2">
              {check.check_payouts.map(payout => (
                <div key={payout.id} className="inner-card">
                  {editingPayout === payout.id ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="field-label">Status</label>
                          <select className="select-luxury" value={editPayoutData.payment_status || payout.payment_status} onChange={e => setEditPayoutData(p => ({ ...p, payment_status: e.target.value as PayoutStatus }))}>
                            <option value="pending">Pending</option>
                            <option value="processed">Processed</option>
                            <option value="paid">Paid</option>
                          </select>
                        </div>
                        <div>
                          <label className="field-label">Payment Date</label>
                          <input type="date" className="input-luxury" value={editPayoutData.payment_date || ''} onChange={e => setEditPayoutData(p => ({ ...p, payment_date: e.target.value }))} />
                        </div>
                        <div className="col-span-2">
                          <label className="field-label">Payment Reference</label>
                          <input className="input-luxury" placeholder="Payload ACH ref or Zelle confirmation" value={editPayoutData.payment_reference || ''} onChange={e => setEditPayoutData(p => ({ ...p, payment_reference: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => updatePayout(payout.id, editPayoutData)} className="btn btn-primary text-xs">Save</button>
                        <button onClick={() => setEditingPayout(null)} className="btn btn-secondary text-xs">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-semibold text-luxury-gray-1">{payout.payee_name || payout.payee_type}</p>
                          <span className="text-xs text-luxury-gray-3">{payout.payee_type}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <PayoutStatusBadge status={payout.payment_status} />
                          <span className="text-xs text-luxury-gray-3 uppercase">{payout.payment_method}</span>
                          {payout.payment_date && <span className="text-xs text-luxury-gray-3">{fmtDate(payout.payment_date)}</span>}
                          {payout.payment_reference && <span className="text-xs text-luxury-gray-3 font-mono">{payout.payment_reference}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-semibold text-luxury-gray-1">{fmt(payout.amount)}</p>
                        <button onClick={() => { setEditingPayout(payout.id); setEditPayoutData({ ...payout }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-accent">Edit</button>
                        <button onClick={() => deletePayout(payout.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* CRC line */}
          {(check.brokerage_amount || 0) > 0 && (
            <div className="inner-card flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 size={13} className="text-luxury-gray-3" />
                <span className="text-xs font-semibold text-luxury-gray-2">CRC (Brokerage)</span>
                {check.crc_transferred && <span className="text-xs text-green-600 flex items-center gap-0.5"><Check size={10} /> Transferred</span>}
              </div>
              <p className="text-sm font-semibold text-luxury-gray-1">{fmt(check.brokerage_amount!)}</p>
            </div>
          )}

          {/* Balance enforcement */}
          <div className={`inner-card flex items-center justify-between ${balanced ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
            <div className="flex items-center gap-2">
              {balanced ? <Check size={13} className="text-green-600" /> : <AlertCircle size={13} className="text-red-500" />}
              <span className="text-xs font-semibold">{balanced ? 'Balanced' : 'Not balanced'}</span>
              {!balanced && <span className="text-xs text-red-500">{fmt(Math.abs(diff))} {diff > 0 ? 'under' : 'over'}</span>}
            </div>
            <div className="text-xs text-luxury-gray-2">
              {fmt(total)} / {fmt(check.check_amount)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Check Row ────────────────────────────────────────────────────────────

  const renderCheckRow = (check: Check, showPayBy = false, showPaidOut = false) => {
    const isOpen = expandedCheck === check.id
    const totalPaid = check.check_payouts.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.amount, 0)
    const remaining = check.check_amount - totalPaid - (check.brokerage_amount || 0)

    return (
      <div key={check.id} className="container-card mb-3">
        <div className="flex items-start justify-between gap-3 cursor-pointer" onClick={() => setExpandedCheck(isOpen ? null : check.id)}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                {check.property_address || 'No address'}
              </p>
              <StatusBadge status={check.status} />
            </div>
            <div className="flex items-center gap-3 flex-wrap text-xs text-luxury-gray-3">
              <span>{check.check_from}</span>
              <span>{fmtDate(check.received_date)}</span>
              {showPayBy && <PayByBadge check={check} />}
              {showPaidOut && totalPaid > 0 && <span className="text-luxury-gray-2">{fmt(totalPaid)} paid · {fmt(remaining)} remaining</span>}
              {check.crc_transferred === false && check.status !== 'received' && check.status !== 'deposited' && (
                <span className="text-orange-500">CRC not transferred</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <p className="text-sm font-semibold text-luxury-gray-1">{fmt(check.check_amount)}</p>
            {isOpen ? <ChevronUp size={16} className="text-luxury-gray-3" /> : <ChevronDown size={16} className="text-luxury-gray-3" />}
          </div>
        </div>
        {isOpen && renderCheckDetail(check)}
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) return <div className="text-center py-12 text-sm text-luxury-gray-3">Loading...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">CHECKS</h1>
        <div className="flex gap-2">
          <button onClick={loadAll} className="btn btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} /> Refresh
          </button>
          <button onClick={() => setShowAddCheck(true)} className="btn btn-primary flex items-center gap-1.5 text-xs">
            <Plus size={13} /> Add Check
          </button>
        </div>
      </div>

      {/* ── Balance Dashboard ── */}
      {dashboard && (
        <div className="container-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Balance Dashboard</p>
            {dashboard.us_bank_balance_updated_at && (
              <p className="text-xs text-luxury-gray-3">Updated {fmtDate(dashboard.us_bank_balance_updated_at)}</p>
            )}
          </div>

          {/* US Bank Balance — editable */}
          <div className="inner-card mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-luxury-gray-3 mb-0.5">US Bank Available Balance</p>
              {editingBalance ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number" step="0.01"
                    className="input-luxury w-40 text-lg font-bold"
                    value={balanceInput}
                    onChange={e => setBalanceInput(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveBalance(); if (e.key === 'Escape') setEditingBalance(false) }}
                  />
                  <button onClick={saveBalance} disabled={savingBalance} className="btn btn-primary text-xs">
                    {savingBalance ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingBalance(false)} className="btn btn-secondary text-xs">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold text-luxury-gray-1">{fmt(dashboard.us_bank_balance)}</p>
                  <button onClick={() => { setEditingBalance(true); setBalanceInput(dashboard.us_bank_balance.toString()) }} className="text-xs text-luxury-gray-3 hover:text-luxury-accent">
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Key metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              { label: 'On Hold', value: dashboard.on_hold, sub: 'Uncleared checks', color: 'text-luxury-gray-1' },
              { label: 'Processed Payouts', value: dashboard.processed_payouts, sub: 'ACH submitted', color: 'text-blue-600' },
              { label: 'Pending Payouts', value: dashboard.pending_payouts, sub: 'Not yet submitted', color: 'text-orange-500' },
              { label: 'CRC Not Transferred', value: dashboard.crc_not_transferred, sub: 'Still in operating account', color: 'text-yellow-600' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="inner-card">
                <p className="text-xs text-luxury-gray-3 mb-1">{label}</p>
                <p className={`text-lg font-bold ${color}`}>{fmtShort(value)}</p>
                <p className="text-xs text-luxury-gray-3 mt-0.5">{sub}</p>
              </div>
            ))}
          </div>

          {/* The two key questions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className={`inner-card border ${dashboard.coverage_check >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
              <p className="text-xs text-luxury-gray-3 mb-1">Can available balance cover what's going out?</p>
              <p className={`text-lg font-bold ${dashboard.coverage_check >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmt(dashboard.coverage_check)}
              </p>
              <p className="text-xs text-luxury-gray-3 mt-0.5">US Bank − Processed Payouts</p>
              {dashboard.coverage_check < 0 && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={11} /> Act immediately</p>
              )}
            </div>
            <div className={`inner-card border ${dashboard.total_exposure >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
              <p className="text-xs text-luxury-gray-3 mb-1">Can total funds cover everything owed?</p>
              <p className={`text-lg font-bold ${dashboard.total_exposure >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                {fmt(dashboard.total_exposure)}
              </p>
              <p className="text-xs text-luxury-gray-3 mt-0.5">(US Bank + On Hold) − (Processed + Pending)</p>
              {dashboard.total_exposure < 0 && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={11} /> Insufficient funds in pipeline</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Check Form ── */}
      {showAddCheck && (
        <div className="container-card mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-luxury-gray-1">Add Check</p>
            <button onClick={() => setShowAddCheck(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="field-label">Check Amount ($) *</label>
              <input type="number" step="0.01" className="input-luxury" value={checkForm.check_amount} onChange={e => setCheckForm(p => ({ ...p, check_amount: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Received Date *</label>
              <input type="date" className="input-luxury" value={checkForm.received_date} onChange={e => setCheckForm(p => ({ ...p, received_date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Check From *</label>
              <input className="input-luxury" placeholder="Title company, tenant, etc." value={checkForm.check_from} onChange={e => setCheckForm(p => ({ ...p, check_from: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Check Number *</label>
              <input className="input-luxury" value={checkForm.check_number} onChange={e => setCheckForm(p => ({ ...p, check_number: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="field-label">Property Address *</label>
              <input className="input-luxury" value={checkForm.property_address} onChange={e => setCheckForm(p => ({ ...p, property_address: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Deposited Date</label>
              <input type="date" className="input-luxury" value={checkForm.deposited_date} onChange={e => setCheckForm(p => ({ ...p, deposited_date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Cleared Date</label>
              <input type="date" className="input-luxury" value={checkForm.cleared_date} onChange={e => setCheckForm(p => ({ ...p, cleared_date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Compliance Complete Date</label>
              <input type="date" className="input-luxury" value={checkForm.compliance_complete_date} onChange={e => setCheckForm(p => ({ ...p, compliance_complete_date: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">CRC Amount ($)</label>
              <input type="number" step="0.01" className="input-luxury" value={checkForm.brokerage_amount} onChange={e => setCheckForm(p => ({ ...p, brokerage_amount: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="field-label">Notes</label>
              <textarea className="input-luxury resize-none" rows={2} value={checkForm.notes} onChange={e => setCheckForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={saveCheck} disabled={savingCheck || !checkForm.check_amount || !checkForm.received_date || !checkForm.check_from || !checkForm.property_address} className="btn btn-primary disabled:opacity-50">
              {savingCheck ? 'Saving...' : 'Add Check'}
            </button>
            <button onClick={() => setShowAddCheck(false)} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* ── On Hold ── */}
      <div className="mb-2">
        <button
          className="flex items-center gap-2 w-full text-left mb-3"
          onClick={() => setExpandedSection(p => ({ ...p, on_hold: !p.on_hold }))}
        >
          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">On Hold ({onHold.length})</p>
          {expandedSection.on_hold ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
        </button>
        {expandedSection.on_hold && (
          onHold.length === 0
            ? <p className="text-xs text-luxury-gray-3 mb-4">No checks on hold.</p>
            : onHold.map(c => renderCheckRow(c))
        )}
      </div>

      {/* ── Active ── */}
      <div className="mb-2">
        <button
          className="flex items-center gap-2 w-full text-left mb-3"
          onClick={() => setExpandedSection(p => ({ ...p, active: !p.active }))}
        >
          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Active ({active.length})</p>
          {expandedSection.active ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
        </button>
        {expandedSection.active && (
          active.length === 0
            ? <p className="text-xs text-luxury-gray-3 mb-4">No active checks.</p>
            : active.map(c => renderCheckRow(c, true, true))
        )}
      </div>

      {/* ── History ── */}
      <div className="mb-2">
        <button
          className="flex items-center gap-2 w-full text-left mb-3"
          onClick={() => setExpandedSection(p => ({ ...p, history: !p.history }))}
        >
          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Check History ({history.length})</p>
          {expandedSection.history ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
        </button>
        {expandedSection.history && (
          history.length === 0
            ? <p className="text-xs text-luxury-gray-3">No check history yet.</p>
            : history.map(c => renderCheckRow(c, false, true))
        )}
      </div>
    </div>
  )
}