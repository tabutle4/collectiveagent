'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus, ChevronDown, ChevronUp, RefreshCw, Edit2, Check,
  X, AlertCircle, Clock, Building2, Mail, Camera, ImageIcon
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

interface CheckRecord {
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

const fmtShort = (n: number) => fmt(n)

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

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

function getPayByDate(check: CheckRecord): Date | null {
  if (!check.cleared_date && !check.compliance_complete_date) return null
  const dates = [check.cleared_date, check.compliance_complete_date]
    .filter(Boolean).map(d => new Date(d!))
  const latest = new Date(Math.max(...dates.map(d => d.getTime())))
  return addBusinessDays(latest, 10)
}

function daysUntil(date: Date): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Small components ─────────────────────────────────────────────────────────

function PayByBadge({ check }: { check: CheckRecord }) {
  const payBy = getPayByDate(check)
  if (!payBy) return null
  const days = daysUntil(payBy)
  const color = days < 0 ? 'bg-red-100 text-red-700' : days <= 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-luxury-light text-luxury-gray-2'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${color}`}>
      <Clock size={10} />
      {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d`}
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
    received: 'Received', deposited: 'Deposited', cleared: 'Cleared',
    pending_compliance: 'Pending Compliance', compliance_complete: 'Compliance Complete',
    payouts_in_progress: 'Payouts In Progress', paid: 'Paid',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap ${map[status]}`}>
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

const STATUS_STEPS: CheckStatus[] = [
  'received', 'deposited', 'cleared', 'pending_compliance',
  'compliance_complete', 'payouts_in_progress', 'paid',
]

// Tap-friendly status advancer
function StatusStepper({ current, onChange }: { current: CheckStatus; onChange: (s: CheckStatus) => void }) {
  const idx = STATUS_STEPS.indexOf(current)
  const next = STATUS_STEPS[idx + 1]
  const prev = STATUS_STEPS[idx - 1]
  const nextLabel: Record<CheckStatus, string> = {
    received: 'Mark Deposited',
    deposited: 'Mark Cleared',
    cleared: 'Pending Compliance',
    pending_compliance: 'Compliance Complete',
    compliance_complete: 'Start Payouts',
    payouts_in_progress: 'Mark Paid',
    paid: '',
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusBadge status={current} />
      {next && (
        <button
          onClick={() => onChange(next)}
          className="text-xs font-medium text-luxury-accent hover:text-luxury-gray-1 border border-luxury-accent/40 hover:border-luxury-gray-3 px-3 py-1.5 rounded transition-colors"
        >
          {nextLabel[current]} →
        </button>
      )}
      {prev && (
        <button onClick={() => onChange(prev)} className="text-xs text-luxury-gray-3 hover:text-luxury-gray-1">
          ← Undo
        </button>
      )}
    </div>
  )
}

const PAYEE_TYPES = [
  'Agent', 'Team Lead', 'Selling Agent', 'Listing Agent',
  'Referral Agent', 'Referral Brokerage', 'Co-op Brokerage',
  'eCommission', 'Rev Share Agent',
]

// ─── Check Image Upload ───────────────────────────────────────────────────────

function CheckImageUpload({
  checkId,
  existingUrl,
  transactionFolderPath,
  onUploaded,
}: {
  checkId?: string
  existingUrl?: string | null
  transactionFolderPath?: string | null
  onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null)

  const handleFile = async (file: File) => {
    if (!file) return
    setUploading(true)
    // Optimistic preview
    setPreviewUrl(URL.createObjectURL(file))
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (checkId) fd.append('check_id', checkId)
      if (transactionFolderPath) fd.append('transaction_folder_path', transactionFolderPath)
      const res = await fetch('/api/checks/upload-image', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setPreviewUrl(data.url)
      onUploaded(data.url)
    } catch (err: any) {
      setPreviewUrl(existingUrl || null)
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="field-label">Check Photo</label>
      {previewUrl ? (
        <div className="relative">
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={previewUrl}
              alt="Check"
              className="w-full max-h-48 object-cover rounded-lg border border-luxury-gray-5 cursor-pointer"
            />
          </a>
          <label className={`absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm border border-luxury-gray-5 rounded-lg px-2 py-1.5 flex items-center gap-1.5 text-xs font-medium text-luxury-gray-2 cursor-pointer shadow-sm hover:bg-white transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Camera size={12} />
            {uploading ? 'Uploading...' : 'Replace'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center gap-2 w-full py-6 border-2 border-dashed border-luxury-gray-5 rounded-lg cursor-pointer hover:border-luxury-accent transition-colors bg-luxury-light ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading ? (
            <p className="text-xs text-luxury-gray-3">Uploading...</p>
          ) : (
            <>
              <Camera size={22} className="text-luxury-gray-3" />
              <p className="text-xs font-medium text-luxury-gray-2">Take photo or upload</p>
              <p className="text-xs text-luxury-gray-3">Opens camera on mobile</p>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminChecksPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [onHold, setOnHold] = useState<CheckRecord[]>([])
  const [active, setActive] = useState<CheckRecord[]>([])
  const [history, setHistory] = useState<CheckRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedSection, setExpandedSection] = useState<Record<string, boolean>>({
    on_hold: true, active: true, history: false,
  })
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null)
  const [showAddCheck, setShowAddCheck] = useState(false)
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [savingBalance, setSavingBalance] = useState(false)
  const [sendingEmail, setSendingEmail] = useState<string | null>(null)
  const [showOptionalFields, setShowOptionalFields] = useState(false)

  const emptyCheckForm = {
    check_amount: '', received_date: new Date().toISOString().split('T')[0],
    check_from: '', check_number: '', property_address: '',
    deposited_date: '', cleared_date: '', compliance_complete_date: '',
    brokerage_amount: '', notes: '', check_image_url: '',
  }
  const [checkForm, setCheckForm] = useState(emptyCheckForm)
  const [savingCheck, setSavingCheck] = useState(false)

  const [editingCheck, setEditingCheck] = useState<string | null>(null)
  const [editCheckData, setEditCheckData] = useState<Partial<CheckRecord>>({})
  const [addingPayoutFor, setAddingPayoutFor] = useState<string | null>(null)
  const [payoutForm, setPayoutForm] = useState({
    payee_type: 'Agent', payee_name: '', amount: '', payment_method: 'ach',
  })
  const [savingPayout, setSavingPayout] = useState(false)
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
    } catch (e) { console.error('Failed to load checks:', e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const saveBalance = async () => {
    if (!balanceInput) return
    setSavingBalance(true)
    await fetch('/api/checks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_check', check: checkForm }),
    })
    setSavingCheck(false)
    setShowAddCheck(false)
    setCheckForm(emptyCheckForm)
    setShowOptionalFields(false)
    loadAll()
  }

  const updateCheck = async (checkId: string, updates: Partial<CheckRecord>) => {
    await fetch('/api/checks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_check', check_id: checkId, updates }),
    })
    setEditingCheck(null)
    loadAll()
  }

  const sendAgentEmail = async (check: CheckRecord) => {
    setSendingEmail(check.id)
    try {
      const res = await fetch('/api/checks/notify-agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: check.id }),
      })
      if (!res.ok) throw new Error()
      alert('Email sent to agent.')
    } catch {
      alert('Could not send email. /api/checks/notify-agent needs to be set up.')
    } finally { setSendingEmail(null) }
  }

  const savePayout = async (checkId: string) => {
    if (!payoutForm.amount || !payoutForm.payee_type) return
    setSavingPayout(true)
    await fetch('/api/checks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_payout', payout: { check_id: checkId, ...payoutForm } }),
    })
    setSavingPayout(false)
    setAddingPayoutFor(null)
    setPayoutForm({ payee_type: 'Agent', payee_name: '', amount: '', payment_method: 'ach' })
    loadAll()
  }

  const updatePayout = async (payoutId: string, updates: Partial<Payout>) => {
    await fetch('/api/checks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_payout', payout_id: payoutId, updates }),
    })
    setEditingPayout(null)
    loadAll()
  }

  const deletePayout = async (payoutId: string) => {
    if (!confirm('Delete this payout?')) return
    await fetch('/api/checks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_payout', payout_id: payoutId }),
    })
    loadAll()
  }

  // ─── Check detail ─────────────────────────────────────────────────────────

  const renderCheckDetail = (check: CheckRecord) => {
    const totalPayouts = check.check_payouts.reduce((s, p) => s + p.amount, 0)
    const crc = check.brokerage_amount || 0
    const total = totalPayouts + crc
    const diff = check.check_amount - total
    const balanced = Math.abs(diff) < 0.01

    return (
      <div className="mt-3 pt-3 border-t border-luxury-gray-5/50 space-y-5">

        {/* Status stepper — primary action on mobile */}
        <div>
          <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">Status</p>
          <StatusStepper current={check.status} onChange={(s) => updateCheck(check.id, { status: s })} />
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => sendAgentEmail(check)}
            disabled={sendingEmail === check.id}
            className="btn btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <Mail size={12} />
            {sendingEmail === check.id ? 'Sending...' : 'Email Agent'}
          </button>
          {!check.crc_transferred ? (
            <button
              onClick={() => updateCheck(check.id, { crc_transferred: true })}
              className="btn btn-secondary text-xs flex items-center gap-1.5"
            >
              <Building2 size={12} /> Mark CRC Transferred
            </button>
          ) : (
            <span className="text-xs text-green-600 flex items-center gap-1 px-2 py-1.5 bg-green-50 rounded border border-green-100">
              <Check size={11} /> CRC Transferred
            </span>
          )}
        </div>

        {/* Desktop: side by side. Mobile: stacked */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Check Info */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Check Info</p>

            {editingCheck === check.id ? (
              <div className="space-y-3">
                {[
                  { label: 'Received Date', field: 'received_date', type: 'date' },
                  { label: 'Deposited Date', field: 'deposited_date', type: 'date' },
                  { label: 'Cleared Date', field: 'cleared_date', type: 'date' },
                  { label: 'Compliance Complete Date', field: 'compliance_complete_date', type: 'date' },
                  { label: 'CRC Amount ($)', field: 'brokerage_amount', type: 'number' },
                ].map(({ label, field, type }) => (
                  <div key={field}>
                    <label className="field-label">{label}</label>
                    <input
                      type={type} step={type === 'number' ? '0.01' : undefined}
                      className="input-luxury"
                      value={(editCheckData as any)[field] || ''}
                      onChange={e => setEditCheckData(p => ({ ...p, [field]: type === 'number' ? parseFloat(e.target.value) : e.target.value }))}
                    />
                  </div>
                ))}
                <div>
                  <label className="field-label">Notes</label>
                  <textarea className="input-luxury resize-none" rows={2} value={editCheckData.notes as string || ''} onChange={e => setEditCheckData(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updateCheck(check.id, editCheckData)} className="btn btn-primary text-xs flex-1">Save</button>
                  <button onClick={() => setEditingCheck(null)} className="btn btn-secondary text-xs">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="space-y-1.5 mb-3">
                  {[
                    ['Check From', check.check_from],
                    ['Check #', check.check_number],
                    ['Amount', fmt(check.check_amount)],
                    ['CRC Amount', check.brokerage_amount ? fmt(check.brokerage_amount) : '—'],
                    ['Received', fmtDate(check.received_date)],
                    ['Deposited', fmtDate(check.deposited_date)],
                    ['Cleared', fmtDate(check.cleared_date)],
                    ['Compliance', fmtDate(check.compliance_complete_date)],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-luxury-gray-3">{label}</span>
                      <span className="text-luxury-gray-1 font-medium">{value || '—'}</span>
                    </div>
                  ))}
                  {(check.cleared_date || check.compliance_complete_date) && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-luxury-gray-3">Pay By</span>
                      <PayByBadge check={check} />
                    </div>
                  )}
                </div>
                {check.notes && <p className="text-xs text-luxury-gray-3 italic mb-3">{check.notes}</p>}
                <button
                  onClick={() => { setEditingCheck(check.id); setEditCheckData({ ...check }) }}
                  className="btn btn-secondary text-xs flex items-center gap-1 w-full justify-center"
                >
                  <Edit2 size={11} /> Edit Check Info
                </button>

                {/* Check photo — always visible below edit button */}
                <div className="pt-1">
                  <CheckImageUpload
                    checkId={check.id}
                    existingUrl={check.check_image_url}
                    transactionFolderPath={check.onedrive_folder_url}
                    onUploaded={(url) => updateCheck(check.id, { check_image_url: url })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payouts */}
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

            {/* Add payout — all single column */}
            {addingPayoutFor === check.id && (
              <div className="inner-card space-y-3">
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
                  <input type="number" step="0.01" inputMode="decimal" className="input-luxury" value={payoutForm.amount} onChange={e => setPayoutForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div>
                  <label className="field-label">Payment Method</label>
                  <div className="flex gap-2">
                    {['ach', 'zelle'].map(m => (
                      <button
                        key={m}
                        onClick={() => setPayoutForm(p => ({ ...p, payment_method: m }))}
                        className={`flex-1 py-2.5 text-xs font-semibold rounded border transition-colors ${payoutForm.payment_method === m ? 'bg-luxury-gray-1 text-white border-luxury-gray-1' : 'border-luxury-gray-5 text-luxury-gray-2'}`}
                      >
                        {m.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => savePayout(check.id)} disabled={savingPayout || !payoutForm.amount} className="btn btn-primary text-xs flex-1 disabled:opacity-50">
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
                        <div>
                          <label className="field-label">Payment Reference</label>
                          <input className="input-luxury" placeholder="Payload ACH ref or Zelle confirmation" value={editPayoutData.payment_reference || ''} onChange={e => setEditPayoutData(p => ({ ...p, payment_reference: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => updatePayout(payout.id, editPayoutData)} className="btn btn-primary text-xs flex-1">Save</button>
                          <button onClick={() => setEditingPayout(null)} className="btn btn-secondary text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-luxury-gray-1 truncate">{payout.payee_name || payout.payee_type}</p>
                            <p className="text-xs text-luxury-gray-3">{payout.payee_type}</p>
                          </div>
                          <p className="text-sm font-bold text-luxury-gray-1 flex-shrink-0">{fmt(payout.amount)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <PayoutStatusBadge status={payout.payment_status} />
                            <span className="text-xs text-luxury-gray-3 uppercase">{payout.payment_method}</span>
                            {payout.payment_date && <span className="text-xs text-luxury-gray-3">{fmtDate(payout.payment_date)}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button onClick={() => { setEditingPayout(payout.id); setEditPayoutData({ ...payout }) }} className="text-xs text-luxury-gray-3 hover:text-luxury-accent">Edit</button>
                            <button onClick={() => deletePayout(payout.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                          </div>
                        </div>
                        {payout.payment_reference && (
                          <p className="text-xs text-luxury-gray-3 font-mono mt-1 truncate">{payout.payment_reference}</p>
                        )}
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
                  {check.crc_transferred && <span className="text-xs text-green-600"><Check size={10} /></span>}
                </div>
                <p className="text-sm font-bold text-luxury-gray-1">{fmt(check.brokerage_amount!)}</p>
              </div>
            )}

            {/* Balance check */}
            <div className={`inner-card flex items-center justify-between ${balanced ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex items-center gap-2">
                {balanced ? <Check size={13} className="text-green-600" /> : <AlertCircle size={13} className="text-red-500" />}
                <span className="text-xs font-semibold">
                  {balanced ? 'Balanced' : `${fmt(Math.abs(diff))} ${diff > 0 ? 'under' : 'over'}`}
                </span>
              </div>
              <span className="text-xs text-luxury-gray-2">{fmt(total)} / {fmt(check.check_amount)}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Check row ─────────────────────────────────────────────────────────────

  const renderCheckRow = (check: CheckRecord, showPayBy = false, showPaidOut = false) => {
    const isOpen = expandedCheck === check.id
    const totalPaid = check.check_payouts.filter(p => p.payment_status === 'paid').reduce((s, p) => s + p.amount, 0)
    const remaining = check.check_amount - totalPaid - (check.brokerage_amount || 0)

    return (
      <div key={check.id} className="container-card mb-3">
        <div
          className="flex items-start justify-between gap-3 cursor-pointer"
          style={{ minHeight: '52px' }}
          onClick={() => setExpandedCheck(isOpen ? null : check.id)}
        >
          <div className="flex-1 min-w-0 py-0.5">
            <div className="flex items-start gap-2 flex-wrap mb-1">
              <p className="text-sm font-semibold text-luxury-gray-1 leading-snug">
                {check.property_address || 'No address'}
              </p>
              <StatusBadge status={check.status} />
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-luxury-gray-3">
              {check.check_from && <span>{check.check_from}</span>}
              <span>{fmtDate(check.received_date)}</span>
            </div>
            {showPayBy && <div className="mt-1"><PayByBadge check={check} /></div>}
            {showPaidOut && totalPaid > 0 && (
              <p className="text-xs text-luxury-gray-2 mt-1">{fmt(totalPaid)} paid · {fmt(remaining)} remaining</p>
            )}
            {check.crc_transferred === false && !['received', 'deposited'].includes(check.status) && (
              <p className="text-xs text-orange-500 mt-0.5">CRC not transferred</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
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
      <div className="flex items-center justify-between mb-5">
        <h1 className="page-title">CHECKS</h1>
        <div className="flex gap-2">
          <button onClick={loadAll} className="btn btn-secondary p-2.5" title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setShowAddCheck(true)} className="btn btn-primary flex items-center gap-1.5">
            <Plus size={14} /> Add Check
          </button>
        </div>
      </div>

      {/* ── Balance Dashboard ── */}
      {dashboard && (
        <div className="container-card mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Balance</p>
            {dashboard.us_bank_balance_updated_at && (
              <p className="text-xs text-luxury-gray-3">Updated {fmtDate(dashboard.us_bank_balance_updated_at)}</p>
            )}
          </div>

          {/* US Bank — big tap target */}
          <div className="mb-4">
            {editingBalance ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="number" step="0.01" inputMode="decimal"
                  className="input-luxury text-xl font-bold w-44"
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
              <button
                onClick={() => { setEditingBalance(true); setBalanceInput(dashboard.us_bank_balance.toString()) }}
                className="flex items-center gap-2 group"
              >
                <div className="text-left">
                  <p className="text-xs text-luxury-gray-3 mb-0.5">US Bank Balance</p>
                  <p className="text-3xl font-bold text-luxury-gray-1">{fmtShort(dashboard.us_bank_balance)}</p>
                </div>
                <Edit2 size={13} className="text-luxury-gray-3 group-hover:text-luxury-accent flex-shrink-0" />
              </button>
            )}
          </div>

          {/* Metrics — 2 col always */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              { label: 'On Hold', value: dashboard.on_hold, color: 'text-luxury-gray-1' },
              { label: 'Processed', value: dashboard.processed_payouts, color: 'text-blue-600' },
              { label: 'Pending', value: dashboard.pending_payouts, color: 'text-orange-500' },
              { label: 'CRC Owed', value: dashboard.crc_not_transferred, color: 'text-yellow-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className="inner-card py-2.5">
                <p className="text-xs text-luxury-gray-3 mb-0.5">{label}</p>
                <p className={`text-base font-bold ${color}`}>{fmtShort(value)}</p>
              </div>
            ))}
          </div>

          {/* Key questions — compact on mobile */}
          <div className="space-y-2">
            <div className={`inner-card border ${dashboard.coverage_check >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-luxury-gray-3 flex-1">Available covers ACH going out?</p>
                <p className={`text-sm font-bold flex-shrink-0 ${dashboard.coverage_check >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtShort(dashboard.coverage_check)}
                </p>
              </div>
              {dashboard.coverage_check < 0 && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} /> Act immediately</p>
              )}
            </div>
            <div className={`inner-card border ${dashboard.total_exposure >= 0 ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-luxury-gray-3 flex-1">Total funds cover all payouts?</p>
                <p className={`text-sm font-bold flex-shrink-0 ${dashboard.total_exposure >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {fmtShort(dashboard.total_exposure)}
                </p>
              </div>
              {dashboard.total_exposure < 0 && (
                <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle size={10} /> Insufficient in pipeline</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add Check Form ── */}
      {showAddCheck && (
        <div className="container-card mb-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-luxury-gray-1">Add Check</p>
            <button onClick={() => { setShowAddCheck(false); setShowOptionalFields(false) }} className="p-1 text-luxury-gray-3 hover:text-luxury-gray-1">
              <X size={18} />
            </button>
          </div>
          <div className="space-y-3 mb-3">
            <div>
              <label className="field-label">Amount ($) *</label>
              <input type="number" step="0.01" inputMode="decimal" className="input-luxury text-lg" placeholder="0.00" value={checkForm.check_amount} onChange={e => setCheckForm(p => ({ ...p, check_amount: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Check From *</label>
              <input className="input-luxury" placeholder="Title company, tenant, etc." value={checkForm.check_from} onChange={e => setCheckForm(p => ({ ...p, check_from: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Property Address *</label>
              <input className="input-luxury" value={checkForm.property_address} onChange={e => setCheckForm(p => ({ ...p, property_address: e.target.value }))} />
            </div>
            <div>
              <label className="field-label">Received Date *</label>
              <input type="date" className="input-luxury" value={checkForm.received_date} onChange={e => setCheckForm(p => ({ ...p, received_date: e.target.value }))} />
            </div>
            <CheckImageUpload
              onUploaded={(url) => setCheckForm(p => ({ ...p, check_image_url: url }))}
            />
          </div>

          <button onClick={() => setShowOptionalFields(!showOptionalFields)} className="text-xs text-luxury-accent flex items-center gap-1 mb-3">
            {showOptionalFields ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showOptionalFields ? 'Hide' : 'Add'} optional fields
          </button>

          {showOptionalFields && (
            <div className="space-y-3 mb-3">
              <div>
                <label className="field-label">Check Number</label>
                <input className="input-luxury" value={checkForm.check_number} onChange={e => setCheckForm(p => ({ ...p, check_number: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">CRC Amount ($)</label>
                <input type="number" step="0.01" inputMode="decimal" className="input-luxury" value={checkForm.brokerage_amount} onChange={e => setCheckForm(p => ({ ...p, brokerage_amount: e.target.value }))} />
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
                <label className="field-label">Notes</label>
                <textarea className="input-luxury resize-none" rows={2} value={checkForm.notes} onChange={e => setCheckForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          )}

          <button
            onClick={saveCheck}
            disabled={savingCheck || !checkForm.check_amount || !checkForm.received_date || !checkForm.check_from || !checkForm.property_address}
            className="btn btn-primary w-full disabled:opacity-50"
          >
            {savingCheck ? 'Saving...' : 'Add Check'}
          </button>
        </div>
      )}

      {/* ── Sections ── */}
      {[
        { key: 'on_hold', label: 'On Hold', checks: onHold, showPayBy: false, showPaidOut: false },
        { key: 'active', label: 'Active', checks: active, showPayBy: true, showPaidOut: true },
        { key: 'history', label: 'History', checks: history, showPayBy: false, showPaidOut: true },
      ].map(({ key, label, checks, showPayBy, showPaidOut }) => (
        <div key={key} className="mb-2">
          <button
            className="flex items-center justify-between w-full text-left py-2 mb-2"
            onClick={() => setExpandedSection(p => ({ ...p, [key]: !p[key] }))}
          >
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
              {label} <span className="text-luxury-gray-2 normal-case font-normal">({checks.length})</span>
            </p>
            {expandedSection[key] ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
          </button>
          {expandedSection[key] && (
            checks.length === 0
              ? <p className="text-xs text-luxury-gray-3 mb-4 px-1">No checks.</p>
              : checks.map(c => renderCheckRow(c, showPayBy, showPaidOut))
          )}
        </div>
      ))}
    </div>
  )
}