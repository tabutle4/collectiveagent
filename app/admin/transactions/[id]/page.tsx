'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft, ExternalLink, Camera, Check, X, ChevronDown, ChevronUp,
  AlertCircle, Building2, User, DollarSign, FileText, ClipboardList, Send
} from 'lucide-react'
import { TransactionStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/transactions/types'
import StatusBadge from '@/components/transactions/StatusBadge'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined) => {
  if (n == null) return '--'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Number(n))
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const fmtName = (u: any) =>
  u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : ''

const isLease = (txnType: string | null) => {
  if (!txnType) return false
  const t = txnType.toLowerCase()
  return t.includes('lease') || t.includes('apartment') || t.includes('rent')
}

const getDaysUntil = (dateStr: string | null) => {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

const addBusinessDays = (date: Date, days: number) => {
  let d = new Date(date)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <p className="section-title mb-3">{children}</p>
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === '--') return null
  return (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-luxury-gray-5/30 last:border-0">
      <span className="field-label shrink-0">{label}</span>
      <span className="text-xs text-luxury-gray-1 text-right">{value}</span>
    </div>
  )
}

function CheckImageUpload({
  checkId, existingUrl, transactionFolderPath, onUploaded,
}: {
  checkId?: string; existingUrl?: string | null
  transactionFolderPath?: string | null; onUploaded: (url: string) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null)

  const handleFile = async (file: File) => {
    setUploading(true)
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
        <div className="relative mt-1">
          <a href={previewUrl} target="_blank" rel="noopener noreferrer">
            <img src={previewUrl} alt="Check" className="w-full max-h-40 object-cover rounded-lg border border-luxury-gray-5" />
          </a>
          <label className={`absolute bottom-2 right-2 bg-white/90 border border-luxury-gray-5 rounded-lg px-2 py-1 flex items-center gap-1 text-xs font-medium text-luxury-gray-2 cursor-pointer shadow-sm hover:bg-white ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Camera size={11} />{uploading ? 'Uploading...' : 'Replace'}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <label className={`mt-1 flex flex-col items-center justify-center gap-1.5 w-full py-5 border-2 border-dashed border-luxury-gray-5 rounded-lg cursor-pointer hover:border-luxury-accent transition-colors bg-luxury-light ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading ? <p className="text-xs text-luxury-gray-3">Uploading...</p> : (
            <>
              <Camera size={18} className="text-luxury-gray-3" />
              <p className="text-xs text-luxury-gray-3">Upload check photo</p>
            </>
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </label>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type NavTab = 'overview' | 'commissions' | 'check_payouts' | 'contacts' | 'documents'

export default function AdminTransactionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<NavTab>('overview')

  // Check & Payouts state
  const [editCheckData, setEditCheckData] = useState<any>(null)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [emailDraft, setEmailDraft] = useState({ to: '', subject: '', body: '' })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [newPayoutForm, setNewPayoutForm] = useState<any>(null)
  const [checklistExpanded, setChecklistExpanded] = useState(true)

  // Right panel section toggles
  const [expandedSections, setExpandedSections] = useState({
    transaction: true, agent: true, billing: true, team: true, referrals: true,
  })

  // Auth
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUser(d.user))
      .catch(() => router.push('/auth/login'))
  }, [router])

  // Load data
  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`)
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)
      // Init check edit state
      if (json.check) setEditCheckData({ ...json.check })
    } catch {
      alert('Failed to load transaction')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const updateTransaction = async (updates: any) => {
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_transaction', updates }),
      })
      setData((prev: any) => ({ ...prev, transaction: { ...prev.transaction, ...updates } }))
    } finally { setSaving(false) }
  }

  const updateCheck = async (updates: any) => {
    if (!data?.check) return
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_check', check_id: data.check.id, updates }),
      })
      setData((prev: any) => ({ ...prev, check: { ...prev.check, ...updates } }))
      setEditCheckData((prev: any) => ({ ...prev, ...updates }))
    } finally { setSaving(false) }
  }

  const toggleChecklist = async (itemId: string, currentlyComplete: boolean) => {
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_checklist',
          checklist_item_id: itemId,
          completed_by: user?.id,
          completing: !currentlyComplete,
        }),
      })
      setData((prev: any) => ({
        ...prev,
        checklist: prev.checklist.map((item: any) =>
          item.id === itemId
            ? { ...item, completion: !currentlyComplete ? { completed_by: user?.id, completed_at: new Date().toISOString() } : null }
            : item
        ),
      }))
    } finally { setSaving(false) }
  }

  const addPayout = async () => {
    if (!newPayoutForm || !data?.check) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_payout',
          payout: { ...newPayoutForm, check_id: data.check.id },
        }),
      })
      const json = await res.json()
      setData((prev: any) => ({
        ...prev,
        check: { ...prev.check, check_payouts: [...(prev.check.check_payouts || []), json.payout] },
      }))
      setNewPayoutForm(null)
    } finally { setSaving(false) }
  }

  const deletePayout = async (payoutId: string) => {
    if (!confirm('Delete this payout?')) return
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_payout', payout_id: payoutId }),
      })
      setData((prev: any) => ({
        ...prev,
        check: { ...prev.check, check_payouts: prev.check.check_payouts.filter((p: any) => p.id !== payoutId) },
      }))
    } finally { setSaving(false) }
  }

  const sendEmailAgent = async () => {
    setSendingEmail(true)
    try {
      const res = await fetch('/api/checks/notify-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: data?.check?.id, ...emailDraft }),
      })
      if (!res.ok) throw new Error()
      setShowEmailModal(false)
      alert('Email sent.')
    } catch {
      alert('Failed to send email.')
    } finally { setSendingEmail(false) }
  }

  // ── Computed values ──────────────────────────────────────────────────────────

  const txn = data?.transaction
  const primaryAgent = data?.primary_agent
  const agentBilling = data?.agent_billing
  const teamInfo = data?.team_info
  const check = data?.check
  const checklist = data?.checklist || []
  const settings = data?.company_settings
  const agents = data?.agents || []

  const payByDate = check?.cleared_date
    ? addBusinessDays(new Date(check.cleared_date), 10)
    : null
  const daysUntilPay = payByDate ? getDaysUntil(payByDate.toISOString()) : null

  const totalPayouts = (check?.check_payouts || []).reduce((s: number, p: any) => s + parseFloat(p.amount || 0), 0)
  const checkAmount = parseFloat(check?.check_amount || 0)
  const payoutBalance = checkAmount - totalPayouts

  const completedCount = checklist.filter((i: any) => i.completion).length

  const leaseTransaction = txn ? isLease(txn.transaction_type) : false

  // Pre-fill email draft when modal opens
  const openEmailModal = () => {
    const agentEmail = primaryAgent?.office_email || primaryAgent?.email || ''
    const agentFirstName = primaryAgent?.preferred_first_name || primaryAgent?.first_name || 'Agent'
    const addr = txn?.property_address || 'your transaction'
    setEmailDraft({
      to: agentEmail,
      subject: `Commission Statement - ${addr}`,
      body: `Hi ${agentFirstName},\n\nYour commission for ${addr} has been processed. Please see your statement attached.\n\nThank you,\nCollective Realty Co.`,
    })
    setShowEmailModal(true)
  }

  const toggleSection = (key: keyof typeof expandedSections) =>
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!user || loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-luxury-gray-3">Loading...</p>
    </div>
  )

  if (!txn) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-luxury-gray-3">Transaction not found.</p>
    </div>
  )

  const addr = txn.property_address || 'No address'
  const addrParts = addr.split(',')
  const addrStreet = addrParts[0]?.trim() || addr
  const addrCity = addrParts.slice(1).join(',').trim()

  const navTabs: { key: NavTab; label: string; show: boolean }[] = [
    { key: 'overview', label: 'Overview', show: true },
    { key: 'commissions', label: 'Commissions', show: true },
    { key: 'check_payouts', label: 'Check & Payouts', show: leaseTransaction },
    { key: 'contacts', label: 'Contacts', show: true },
    { key: 'documents', label: 'Documents', show: true },
  ]

  return (
    <div className="flex flex-col -mx-4 -mt-4 md:-mx-6 md:-mt-6">

      {saving && (
        <div className="fixed top-4 right-4 bg-luxury-gray-1 text-white px-4 py-2 rounded text-xs z-50 shadow-lg">
          Saving...
        </div>
      )}

      {/* ── Mobile Header + Tab Bar ───────────────────────────────────────── */}
      <div className="border-b border-luxury-gray-5 bg-luxury-light">
        <div className="p-3">
          <button onClick={() => router.push('/admin/transactions')} className="flex items-center gap-1.5 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 mb-2 transition-colors">
            <ArrowLeft size={13} /> Back to Transactions
          </button>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-luxury-gray-1 leading-tight">{addrStreet}</p>
              {addrCity && <p className="text-xs text-luxury-gray-3">{addrCity}</p>}
            </div>
            <StatusBadge status={txn.status as TransactionStatus} />
          </div>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">{txn.transaction_type}</span>
            {txn.office_location && <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">{txn.office_location}</span>}
          </div>
        </div>
        <div className="flex overflow-x-auto px-3 pb-0 gap-0 border-t border-luxury-gray-5/50">
          {navTabs.filter(t => t.show).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                activeTab === tab.key
                  ? 'border-luxury-accent text-luxury-accent font-semibold'
                  : 'border-transparent text-luxury-gray-3 hover:text-luxury-gray-1'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Left Sidebar ───────────────────────────────────────────────────── */}
      <div className="hidden">
        <div className="p-4">
          <button onClick={() => router.push('/admin/transactions')} className="flex items-center gap-1.5 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 mb-5 transition-colors">
            <ArrowLeft size={13} /> Back to Transactions
          </button>

          {/* Property card */}
          <div className="container-card mb-4 p-3">
            <p className="text-sm font-semibold text-luxury-gray-1 leading-tight">{addrStreet}</p>
            {addrCity && <p className="text-xs text-luxury-gray-3 mt-0.5 leading-tight">{addrCity}</p>}
            <div className="mt-2">
              <StatusBadge status={txn.status as TransactionStatus} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">
                {txn.transaction_type || 'Unknown type'}
              </span>
              {txn.office_location && (
                <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">
                  {txn.office_location}
                </span>
              )}
            </div>
          </div>

          {/* Nav */}
          <nav className="space-y-0.5">
            {navTabs.filter(t => t.show).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full text-left px-3 py-2 rounded text-xs transition-colors ${
                  activeTab === tab.key
                    ? 'bg-luxury-accent text-white font-semibold'
                    : 'text-luxury-gray-2 hover:bg-luxury-gray-5/40'
                }`}
              >
                {tab.label}
                {tab.key === 'check_payouts' && check && (
                  <span className="ml-1 text-xs opacity-70">
                    ({(check.check_payouts || []).length})
                  </span>
                )}
                {tab.key === 'check_payouts' && !check && (
                  <span className="ml-1 text-xs opacity-50">(no check)</span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Main Content + Right Panel ──────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row min-w-0">

        {/* Main content */}
        <div className="flex-1 p-4 md:p-6 min-w-0">

          {/* ── OVERVIEW TAB ─────────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <h1 className="page-title">OVERVIEW</h1>

              {/* Transaction Info */}
              <div className="container-card">
                <SectionHeader>Transaction</SectionHeader>
                <div className="space-y-0">
                  <FieldRow label="Property" value={txn.property_address} />
                  <FieldRow label="Type" value={txn.transaction_type} />
                  <FieldRow label="Status" value={<StatusBadge status={txn.status as TransactionStatus} />} />
                  <FieldRow label="Compliance" value={
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      txn.compliance_status === 'approved' ? 'bg-green-50 text-green-700' :
                      txn.compliance_status === 'revision_requested' ? 'bg-orange-50 text-orange-700' :
                      ['submitted', 'in_review'].includes(txn.compliance_status) ? 'bg-purple-50 text-purple-700' :
                      'bg-luxury-light text-luxury-gray-3'
                    }`}>
                      {txn.compliance_status?.replace(/_/g, ' ') || 'not requested'}
                    </span>
                  } />
                  <FieldRow label="Representing" value={txn.representation_type?.replace(/_/g, ' ')} />
                  <FieldRow label="Lead Source" value={txn.lead_source?.replace(/_/g, ' ')} />
                  <FieldRow label="Office" value={txn.office_location} />
                  {txn.mls_link && (
                    <FieldRow label="MLS Link" value={
                      <a href={txn.mls_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-luxury-accent hover:underline text-xs">
                        View <ExternalLink size={10} />
                      </a>
                    } />
                  )}
                </div>
              </div>

              {/* Financials */}
              <div className="container-card">
                <SectionHeader>Financials</SectionHeader>
                <div className="space-y-0">
                  {leaseTransaction ? (
                    <>
                      <FieldRow label="Monthly Rent" value={fmt$(txn.monthly_rent)} />
                      <FieldRow label="Lease Term" value={txn.lease_term ? `${txn.lease_term} months` : null} />
                      <FieldRow label="Move-In Date" value={fmtDate(txn.move_in_date)} />
                    </>
                  ) : (
                    <>
                      <FieldRow label="Sales Price" value={fmt$(txn.sales_price)} />
                      <FieldRow label="Sales Volume" value={fmt$(txn.sales_volume)} />
                      <FieldRow label="Closing Date" value={fmtDate(txn.closing_date)} />
                      <FieldRow label="Closed Date" value={fmtDate(txn.closed_date)} />
                    </>
                  )}
                  <FieldRow label="Gross Commission" value={fmt$(txn.gross_commission)} />
                  <FieldRow label="Listing Side" value={fmt$(txn.listing_side_commission)} />
                  <FieldRow label="Buying Side" value={fmt$(txn.buying_side_commission)} />
                  <FieldRow label="Office Gross" value={fmt$(txn.office_gross)} />
                  <FieldRow label="Office Net" value={
                    <span className="font-semibold text-green-600">{fmt$(txn.office_net)}</span>
                  } />
                  {txn.bonus_amount > 0 && <FieldRow label="Bonus" value={fmt$(txn.bonus_amount)} />}
                  {txn.rebate_amount > 0 && <FieldRow label="Rebate" value={fmt$(txn.rebate_amount)} />}
                  {txn.has_btsa && <FieldRow label="BTSA" value={fmt$(txn.btsa_amount)} />}
                  {txn.expedite_requested && <FieldRow label="Expedite Fee" value={fmt$(txn.expedite_fee)} />}
                  {txn.internal_referral && <FieldRow label="Internal Referral Fee" value={fmt$(txn.internal_referral_fee)} />}
                  {txn.external_referral && <FieldRow label="External Referral Fee" value={fmt$(txn.external_referral_fee)} />}
                </div>
              </div>

              {/* Key Dates */}
              <div className="container-card">
                <SectionHeader>Key Dates</SectionHeader>
                <div className="space-y-0">
                  <FieldRow label="Created" value={fmtDate(txn.created_at)} />
                  <FieldRow label="Acceptance Date" value={fmtDate(txn.acceptance_date)} />
                  {!leaseTransaction && <FieldRow label="Closing Date" value={fmtDate(txn.closing_date)} />}
                  {leaseTransaction && <FieldRow label="Move-In Date" value={fmtDate(txn.move_in_date)} />}
                  {txn.compliance_submitted_at && <FieldRow label="Compliance Submitted" value={fmtDate(txn.compliance_submitted_at)} />}
                  {txn.compliance_approved_at && <FieldRow label="Compliance Approved" value={fmtDate(txn.compliance_approved_at)} />}
                  {txn.broker_approved_at && <FieldRow label="Broker Approved" value={fmtDate(txn.broker_approved_at)} />}
                  {txn.goal_paydate && <FieldRow label="Goal Pay Date" value={fmtDate(txn.goal_paydate)} />}
                </div>
              </div>

              {/* Client */}
              {(txn.client_name || txn.client_email || txn.client_phone) && (
                <div className="container-card">
                  <SectionHeader>Client</SectionHeader>
                  <div className="space-y-0">
                    <FieldRow label="Name" value={txn.client_name} />
                    <FieldRow label="Email" value={txn.client_email} />
                    <FieldRow label="Phone" value={txn.client_phone} />
                  </div>
                </div>
              )}

              {/* Title (sales only) */}
              {!leaseTransaction && (txn.title_company || txn.title_officer_name) && (
                <div className="container-card">
                  <SectionHeader>Title</SectionHeader>
                  <div className="space-y-0">
                    <FieldRow label="Company" value={txn.title_company} />
                    <FieldRow label="Officer" value={txn.title_officer_name} />
                    <FieldRow label="Email" value={txn.title_company_email} />
                  </div>
                </div>
              )}

              {/* Agents summary */}
              {agents.length > 0 && (
                <div className="container-card">
                  <SectionHeader>Agents on Transaction</SectionHeader>
                  <div className="space-y-2">
                    {agents.map((a: any) => (
                      <div key={a.id} className="inner-card flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-luxury-gray-1">{fmtName(a.user)}</p>
                          <p className="text-xs text-luxury-gray-3">{a.agent_role?.replace(/_/g, ' ')}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-luxury-gray-1">{fmt$(a.agent_net)}</p>
                          <p className={`text-xs ${a.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}>
                            {a.payment_status || 'pending'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── COMMISSIONS TAB ──────────────────────────────────────────── */}
          {activeTab === 'commissions' && (
            <div className="space-y-4">
              <h1 className="page-title">COMMISSIONS</h1>
              <div className="container-card">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Office Gross</p>
                    <p className="text-sm font-semibold text-luxury-gray-1">{fmt$(txn.office_gross)}</p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Total Paid Out</p>
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {fmt$(agents.reduce((s: number, a: any) => s + parseFloat(a.agent_net || 0), 0))}
                    </p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Office Net</p>
                    <p className="text-sm font-semibold text-green-600">{fmt$(txn.office_net)}</p>
                  </div>
                </div>

                {agents.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">No agents on this transaction.</p>
                ) : (
                  <div className="space-y-3">
                    {agents.map((a: any) => (
                      <div key={a.id} className="inner-card">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-luxury-gray-1">{fmtName(a.user)}</p>
                            <p className="text-xs text-luxury-gray-3">{a.agent_role?.replace(/_/g, ' ')} · {a.commission_plan || '--'}</p>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            a.payment_status === 'paid' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                          }`}>
                            {a.payment_status || 'pending'}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <FieldRow label="Basis" value={fmt$(a.agent_basis)} />
                          <FieldRow label="Split" value={a.split_percentage ? `${a.split_percentage}%` : null} />
                          <FieldRow label="Agent Gross" value={fmt$(a.agent_gross)} />
                          <FieldRow label="Processing Fee" value={a.processing_fee > 0 ? fmt$(a.processing_fee) : null} />
                          <FieldRow label="Coaching Fee" value={a.coaching_fee > 0 ? fmt$(a.coaching_fee) : null} />
                          <FieldRow label="Rebate" value={a.rebate_amount > 0 ? fmt$(a.rebate_amount) : null} />
                          <FieldRow label="BTSA" value={a.btsa_amount > 0 ? fmt$(a.btsa_amount) : null} />
                        </div>
                        <div className="border-t border-luxury-gray-5/50 mt-2 pt-2 flex justify-between items-center">
                          <span className="text-xs font-semibold text-luxury-gray-2">Agent Net</span>
                          <span className="text-sm font-bold text-luxury-accent">{fmt$(a.agent_net)}</span>
                        </div>
                        {a.payment_date && (
                          <p className="text-xs text-luxury-gray-3 mt-1">Paid {fmtDate(a.payment_date)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHECK & PAYOUTS TAB ──────────────────────────────────────── */}
          {activeTab === 'check_payouts' && leaseTransaction && (
            <div className="space-y-4">
              <h1 className="page-title">CHECK & PAYOUTS</h1>

              {/* No check yet */}
              {!check && (
                <div className="container-card text-center py-8">
                  <p className="text-sm text-luxury-gray-3 mb-3">No check linked to this transaction yet.</p>
                  <p className="text-xs text-luxury-gray-3">Link a check from the Checks page or it will auto-link when a check is created for this address.</p>
                </div>
              )}

              {/* Check exists */}
              {check && editCheckData && (
                <>
                  {/* Pay-by countdown */}
                  {payByDate && (
                    <div className={`inner-card flex items-center gap-3 ${
                      daysUntilPay != null && daysUntilPay <= 2 ? 'border border-red-200 bg-red-50/30' :
                      daysUntilPay != null && daysUntilPay <= 5 ? 'border border-orange-200 bg-orange-50/30' :
                      'border border-green-200 bg-green-50/30'
                    }`}>
                      <AlertCircle size={16} className={
                        daysUntilPay != null && daysUntilPay <= 2 ? 'text-red-500' :
                        daysUntilPay != null && daysUntilPay <= 5 ? 'text-orange-500' : 'text-green-600'
                      } />
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-1">
                          Pay by {payByDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {daysUntilPay != null
                            ? daysUntilPay <= 0 ? 'Overdue' : `${daysUntilPay} business day${daysUntilPay !== 1 ? 's' : ''} remaining`
                            : '10 business days from clear date'
                          }
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Check info */}
                  <div className="container-card">
                    <div className="flex items-center justify-between mb-3">
                      <SectionHeader>Check Details</SectionHeader>
                      <button onClick={openEmailModal} className="btn btn-secondary text-xs flex items-center gap-1">
                        <Send size={11} /> Email Agent
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="field-label">Check Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-luxury text-xs"
                          value={editCheckData.check_amount || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, check_amount: e.target.value }))}
                          onBlur={() => updateCheck({ check_amount: editCheckData.check_amount })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Check From</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={editCheckData.check_from || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, check_from: e.target.value }))}
                          onBlur={() => updateCheck({ check_from: editCheckData.check_from })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Check #</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={editCheckData.check_number || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, check_number: e.target.value }))}
                          onBlur={() => updateCheck({ check_number: editCheckData.check_number })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Received</label>
                        <input
                          type="date"
                          className="input-luxury text-xs"
                          value={editCheckData.received_date || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, received_date: e.target.value }))}
                          onBlur={() => updateCheck({ received_date: editCheckData.received_date })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Deposited</label>
                        <input
                          type="date"
                          className="input-luxury text-xs"
                          value={editCheckData.deposited_date || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, deposited_date: e.target.value }))}
                          onBlur={() => updateCheck({ deposited_date: editCheckData.deposited_date })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Cleared</label>
                        <input
                          type="date"
                          className="input-luxury text-xs"
                          value={editCheckData.cleared_date || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, cleared_date: e.target.value }))}
                          onBlur={() => updateCheck({ cleared_date: editCheckData.cleared_date })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Compliance Complete</label>
                        <input
                          type="date"
                          className="input-luxury text-xs"
                          value={editCheckData.compliance_complete_date || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, compliance_complete_date: e.target.value }))}
                          onBlur={() => updateCheck({ compliance_complete_date: editCheckData.compliance_complete_date })}
                        />
                      </div>
                      <div>
                        <label className="field-label">Brokerage Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          className="input-luxury text-xs"
                          value={editCheckData.brokerage_amount || ''}
                          onChange={e => setEditCheckData((p: any) => ({ ...p, brokerage_amount: e.target.value }))}
                          onBlur={() => updateCheck({ brokerage_amount: editCheckData.brokerage_amount })}
                        />
                      </div>
                    </div>

                    {/* CRC Transferred toggle */}
                    <div className="flex items-center justify-between inner-card mb-3">
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-1">CRC Transferred</p>
                        <p className="text-xs text-luxury-gray-3">Brokerage portion moved to CRC account</p>
                      </div>
                      <button
                        onClick={() => updateCheck({ crc_transferred: !check.crc_transferred })}
                        className={`relative w-10 h-5 rounded-full transition-colors ${check.crc_transferred ? 'bg-luxury-accent' : 'bg-luxury-gray-5'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${check.crc_transferred ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="field-label">Notes</label>
                      <textarea
                        className="input-luxury text-xs"
                        rows={2}
                        value={editCheckData.notes || ''}
                        onChange={e => setEditCheckData((p: any) => ({ ...p, notes: e.target.value }))}
                        onBlur={() => updateCheck({ notes: editCheckData.notes })}
                      />
                    </div>

                    {/* Check photo */}
                    <div className="mt-3">
                      <CheckImageUpload
                        checkId={check.id}
                        existingUrl={check.check_image_url}
                        transactionFolderPath={txn.onedrive_folder_url}
                        onUploaded={url => updateCheck({ check_image_url: url })}
                      />
                    </div>
                  </div>

                  {/* Payouts */}
                  <div className="container-card">
                    <div className="flex items-center justify-between mb-3">
                      <SectionHeader>Payouts</SectionHeader>
                      <div className="text-right">
                        <p className="text-xs text-luxury-gray-3">Balance</p>
                        <p className={`text-sm font-bold ${payoutBalance < 0 ? 'text-red-500' : payoutBalance === 0 ? 'text-green-600' : 'text-luxury-accent'}`}>
                          {fmt$(payoutBalance)}
                        </p>
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="inner-card flex justify-between items-center mb-3">
                      <span className="text-xs text-luxury-gray-3">Check Amount</span>
                      <span className="text-xs font-semibold text-luxury-gray-1">{fmt$(checkAmount)}</span>
                    </div>

                    {(check.check_payouts || []).length === 0 && (
                      <p className="text-xs text-luxury-gray-3 text-center py-3">No payouts added yet.</p>
                    )}

                    <div className="space-y-2 mb-3">
                      {(check.check_payouts || []).map((p: any) => (
                        <div key={p.id} className="inner-card flex items-center justify-between group">
                          <div>
                            <p className="text-xs font-semibold text-luxury-gray-1">{p.payee_name || p.payee_type}</p>
                            <p className="text-xs text-luxury-gray-3">{p.payee_type?.replace(/_/g, ' ')} · {p.payment_status}</p>
                            {p.payment_date && <p className="text-xs text-luxury-gray-3">{fmtDate(p.payment_date)}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-luxury-gray-1">{fmt$(p.amount)}</span>
                            <button
                              onClick={() => deletePayout(p.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Add payout form */}
                    {newPayoutForm ? (
                      <div className="inner-card space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="field-label">Payee Type</label>
                            <select
                              className="select-luxury text-xs"
                              value={newPayoutForm.payee_type || ''}
                              onChange={e => setNewPayoutForm((p: any) => ({ ...p, payee_type: e.target.value }))}
                            >
                              <option value="">Select...</option>
                              {['agent', 'team_lead', 'referral_agent', 'referral_brokerage', 'rev_share_agent', 'ecommission'].map(t => (
                                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="field-label">Payee Name</label>
                            <input
                              type="text"
                              className="input-luxury text-xs"
                              value={newPayoutForm.payee_name || ''}
                              onChange={e => setNewPayoutForm((p: any) => ({ ...p, payee_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="field-label">Amount ($)</label>
                            <input
                              type="number"
                              step="0.01"
                              className="input-luxury text-xs"
                              value={newPayoutForm.amount || ''}
                              onChange={e => setNewPayoutForm((p: any) => ({ ...p, amount: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="field-label">Method</label>
                            <select
                              className="select-luxury text-xs"
                              value={newPayoutForm.payment_method || ''}
                              onChange={e => setNewPayoutForm((p: any) => ({ ...p, payment_method: e.target.value }))}
                            >
                              <option value="">Select...</option>
                              <option value="ach">ACH</option>
                              <option value="zelle">Zelle</option>
                              <option value="check">Check</option>
                            </select>
                          </div>
                        </div>
                        {parseFloat(newPayoutForm.amount || 0) > payoutBalance + parseFloat(newPayoutForm.amount || 0) && (
                          <p className="text-xs text-red-500 flex items-center gap-1">
                            <AlertCircle size={11} /> Amount exceeds remaining balance.
                          </p>
                        )}
                        <div className="flex gap-2">
                          <button onClick={addPayout} className="btn btn-primary text-xs flex-1" disabled={!newPayoutForm.amount || !newPayoutForm.payee_type}>Add Payout</button>
                          <button onClick={() => setNewPayoutForm(null)} className="btn btn-secondary text-xs">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setNewPayoutForm({ payment_status: 'pending' })}
                        className="w-full text-xs text-luxury-accent hover:underline text-center py-1"
                      >
                        + Add Payout
                      </button>
                    )}
                  </div>

                  {/* Checklist */}
                  {checklist.length > 0 && (
                    <div className="container-card">
                      <button
                        className="flex items-center justify-between w-full mb-3"
                        onClick={() => setChecklistExpanded(p => !p)}
                      >
                        <span className="section-title">
                          Checklist ({completedCount}/{checklist.length})
                        </span>
                        {checklistExpanded ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
                      </button>
                      {checklistExpanded && (
                        <div className="space-y-1.5">
                          {checklist.map((item: any) => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${item.completion ? 'bg-green-50/50' : 'hover:bg-luxury-light'}`}
                              onClick={() => toggleChecklist(item.id, !!item.completion)}
                            >
                              <div className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors ${item.completion ? 'bg-green-500 border-green-500' : 'border-luxury-gray-4 bg-white'}`}>
                                {item.completion && <Check size={10} className="text-white" />}
                              </div>
                              <div className="flex-1">
                                <p className={`text-xs font-medium ${item.completion ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}>
                                  {item.label}
                                </p>
                                {item.description && (
                                  <p className="text-xs text-luxury-gray-3 mt-0.5">{item.description}</p>
                                )}
                                {item.section && (
                                  <p className="text-xs text-luxury-gray-4 mt-0.5">{item.section}</p>
                                )}
                              </div>
                              {item.completion && (
                                <p className="text-xs text-luxury-gray-3 shrink-0">{fmtDate(item.completion.completed_at)}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── CONTACTS TAB ─────────────────────────────────────────────── */}
          {activeTab === 'contacts' && (
            <div className="space-y-4">
              <h1 className="page-title">CONTACTS</h1>
              <div className="container-card">
                <p className="text-xs text-luxury-gray-3 text-center py-6">Contact management coming soon.</p>
              </div>
            </div>
          )}

          {/* ── DOCUMENTS TAB ────────────────────────────────────────────── */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <h1 className="page-title">DOCUMENTS</h1>
              {txn.onedrive_folder_url && (
                <div className="container-card">
                  <a href={txn.onedrive_folder_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-luxury-accent hover:underline text-sm">
                    <ExternalLink size={14} /> Open OneDrive Folder
                  </a>
                </div>
              )}
              <div className="container-card">
                <p className="text-xs text-luxury-gray-3 text-center py-6">Document management coming soon.</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel ────────────────────────────────────────────────────── */}
        <div className="md:w-72 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-luxury-gray-5 p-4 space-y-3 bg-white">

          {/* Agent Profile */}
          {primaryAgent && (
            <div className="container-card p-3">
              <button className="flex items-center justify-between w-full mb-2" onClick={() => toggleSection('agent')}>
                <span className="section-title flex items-center gap-1.5"><User size={12} /> Agent</span>
                {expandedSections.agent ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
              </button>
              {expandedSections.agent && (
                <>
                  {primaryAgent.headshot_url && (
                    <img src={primaryAgent.headshot_url} alt="" className="w-12 h-12 rounded-full object-cover object-top mb-2 border border-luxury-gray-5" />
                  )}
                  <p className="text-sm font-semibold text-luxury-gray-1 mb-0.5">{fmtName(primaryAgent)}</p>
                  <p className="text-xs text-luxury-gray-3 mb-2">{primaryAgent.office_email || primaryAgent.email}</p>
                  <div className="space-y-0">
                    <FieldRow label="Office" value={primaryAgent.office} />
                    <FieldRow label="Commission Plan" value={primaryAgent.commission_plan} />
                    <FieldRow label="Division" value={primaryAgent.division} />
                    <FieldRow label="License #" value={primaryAgent.license_number} />
                    <FieldRow label="License Exp" value={fmtDate(primaryAgent.license_expiration)} />
                    <FieldRow label="NRDS ID" value={primaryAgent.nrds_id} />
                    <FieldRow label="MLS ID" value={primaryAgent.mls_id} />
                    <FieldRow label="Join Date" value={fmtDate(primaryAgent.join_date)} />
                    {primaryAgent.cap_progress > 0 && <FieldRow label="Cap Progress" value={fmt$(primaryAgent.cap_progress)} />}
                    {primaryAgent.qualifying_transaction_count > 0 && <FieldRow label="Qualifying Txns" value={primaryAgent.qualifying_transaction_count} />}
                    {primaryAgent.waive_processing_fees && <FieldRow label="Processing Fees" value="Waived" />}
                    {primaryAgent.special_commission_notes && (
                      <div className="mt-2 p-2 bg-orange-50 rounded text-xs text-orange-700">
                        {primaryAgent.special_commission_notes}
                      </div>
                    )}
                  </div>
                  {primaryAgent.revenue_share === 'yes' && (
                    <div className="mt-2 p-2 bg-luxury-light rounded">
                      <p className="text-xs font-semibold text-luxury-gray-2">Rev Share</p>
                      <p className="text-xs text-luxury-gray-3">{primaryAgent.revenue_share_percentage ? `${primaryAgent.revenue_share_percentage}%` : 'Enrolled'}</p>
                      {primaryAgent.referring_agent && <p className="text-xs text-luxury-gray-3">{primaryAgent.referring_agent}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Agent Billing */}
          {agentBilling && (
            <div className="container-card p-3">
              <button className="flex items-center justify-between w-full mb-2" onClick={() => toggleSection('billing')}>
                <span className="section-title flex items-center gap-1.5"><DollarSign size={12} /> Agent Billing</span>
                {expandedSections.billing ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
              </button>
              {expandedSections.billing && (
                <>
                  {agentBilling.debts.length === 0 && agentBilling.credits.length === 0 ? (
                    <p className="text-xs text-luxury-gray-3">No outstanding balances.</p>
                  ) : (
                    <>
                      {agentBilling.debts.map((d: any) => (
                        <div key={d.id} className="inner-card border border-orange-100 bg-orange-50/20 mb-1.5">
                          <p className="text-xs font-medium text-luxury-gray-1">{d.description}</p>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-xs text-luxury-gray-3">{fmtDate(d.date_incurred)}</span>
                            <span className="text-xs font-semibold text-orange-600">{fmt$(d.amount_remaining ?? d.amount_owed)}</span>
                          </div>
                        </div>
                      ))}
                      {agentBilling.credits.map((c: any) => (
                        <div key={c.id} className="inner-card border border-green-100 bg-green-50/20 mb-1.5">
                          <p className="text-xs font-medium text-luxury-gray-1">{c.description}</p>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-xs text-luxury-gray-3">{fmtDate(c.date_incurred)}</span>
                            <span className="text-xs font-semibold text-green-600">-{fmt$(c.amount_remaining ?? c.amount_owed)}</span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1.5 mt-1 border-t border-luxury-gray-5/50">
                        <span className="text-xs font-semibold text-luxury-gray-2">Net Balance</span>
                        <span className={`text-sm font-bold ${agentBilling.net_balance > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {agentBilling.net_balance > 0 ? fmt$(agentBilling.net_balance) : `-${fmt$(Math.abs(agentBilling.net_balance))}`}
                        </span>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Team Info */}
          {teamInfo && (
            <div className="container-card p-3">
              <button className="flex items-center justify-between w-full mb-2" onClick={() => toggleSection('team')}>
                <span className="section-title flex items-center gap-1.5"><Building2 size={12} /> Team</span>
                {expandedSections.team ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
              </button>
              {expandedSections.team && (
                <>
                  <p className="text-sm font-semibold text-luxury-gray-1 mb-1">{teamInfo.agreement?.team_name}</p>
                  {teamInfo.team_lead_name && <p className="text-xs text-luxury-gray-3 mb-2">Lead: {teamInfo.team_lead_name}</p>}
                  <div className="space-y-0">
                    <FieldRow label="Status" value={teamInfo.agreement?.status} />
                    <FieldRow label="Effective" value={fmtDate(teamInfo.agreement?.effective_date)} />
                    {teamInfo.agreement?.min_firm_sale_pct && <FieldRow label="Min Firm (Sales)" value={`${teamInfo.agreement.min_firm_sale_pct}%`} />}
                    {teamInfo.agreement?.min_firm_lease_pct && <FieldRow label="Min Firm (Leases)" value={`${teamInfo.agreement.min_firm_lease_pct}%`} />}
                  </div>
                  {teamInfo.agreement?.agreement_document_url && (
                    <a href={teamInfo.agreement.agreement_document_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-luxury-accent hover:underline text-xs mt-2">
                      <FileText size={11} /> Team Agreement
                    </a>
                  )}
                </>
              )}
            </div>
          )}

          {/* Referrals */}
          {(settings?.referral_tracking_url || settings?.crm_url) && (
            <div className="container-card p-3">
              <button className="flex items-center justify-between w-full mb-2" onClick={() => toggleSection('referrals')}>
                <span className="section-title flex items-center gap-1.5"><ClipboardList size={12} /> Referrals</span>
                {expandedSections.referrals ? <ChevronUp size={12} className="text-luxury-gray-3" /> : <ChevronDown size={12} className="text-luxury-gray-3" />}
              </button>
              {expandedSections.referrals && (
                <div className="space-y-2">
                  {settings?.referral_tracking_url && (
                    <a href={settings.referral_tracking_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-luxury-accent hover:underline text-xs">
                      <ExternalLink size={11} /> Referral Tracker (SharePoint)
                    </a>
                  )}
                  {settings?.crm_url && (
                    <a href={settings.crm_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-luxury-accent hover:underline text-xs">
                      <ExternalLink size={11} /> {settings.crm_name || 'CRM'}
                    </a>
                  )}
                  {txn.has_referral && (
                    <div className="inner-card">
                      <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Referral on This Deal</p>
                      {txn.internal_referral && <p className="text-xs text-luxury-gray-3">Internal: {fmt$(txn.internal_referral_fee)}</p>}
                      {txn.external_referral && <p className="text-xs text-luxury-gray-3">External: {fmt$(txn.external_referral_fee)}</p>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Email Agent Modal ───────────────────────────────────────────────── */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5">
              <p className="text-sm font-semibold text-luxury-gray-1">Email Agent</p>
              <button onClick={() => setShowEmailModal(false)}><X size={16} className="text-luxury-gray-3" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="field-label">To</label>
                <input type="email" className="input-luxury text-xs" value={emailDraft.to} onChange={e => setEmailDraft(p => ({ ...p, to: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Subject</label>
                <input type="text" className="input-luxury text-xs" value={emailDraft.subject} onChange={e => setEmailDraft(p => ({ ...p, subject: e.target.value }))} />
              </div>
              <div>
                <label className="field-label">Message</label>
                <textarea className="input-luxury text-xs" rows={6} value={emailDraft.body} onChange={e => setEmailDraft(p => ({ ...p, body: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button onClick={sendEmailAgent} disabled={sendingEmail} className="btn btn-primary text-xs flex-1 disabled:opacity-50">
                {sendingEmail ? 'Sending...' : 'Send Email'}
              </button>
              <button onClick={() => setShowEmailModal(false)} className="btn btn-secondary text-xs">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}