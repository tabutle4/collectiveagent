'use client'

import { useState, useEffect, useCallback, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { Loader2, ExternalLink, Image as ImageIcon, AlertCircle, Lock, Mail, Plus, X, Check, ChevronDown, ChevronRight, RefreshCw, Search, ArrowUpDown, Link2 } from 'lucide-react'

interface TrackerRow {
  id: string
  transaction_id: string | null
  agent_id: string | null
  agent_name: string
  submitted_at: string
  side: string | null
  compliance_status: string
  post_closing_status: string
  post_closing_completed_at: string | null
  post_closing_notes: string | null
  missing_notes: string | null
  completed_at: string | null
  paid: boolean
  cda_sent: boolean
  cda_status?: string | null
  flyer: { id: string; flyer_type: string; has_photo: boolean; downloaded: boolean; sent: boolean } | null
  recheck_requested: boolean
  recheck_at: string | null
  recheck_changed_fields: string[] | null
  missing_items: { name: string; notes: string | null }[]
  property_address: string | null
  client_name: string | null
  closing_date: string | null
  transaction_type: string | null
  is_locked: boolean
  is_lease: boolean
  checklist_complete: boolean
  transaction_status: string | null
  funding_status: string | null
  office_gross: number | null
  office_net: number | null
  agent_net: number | null
  form_data: Record<string, any>
}

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_review', label: 'In review' },
  { value: 'complete', label: 'Complete' },
  { value: 'incomplete', label: 'Incomplete' },
]

// Post closing compliance is tracked per deal and starts before anyone has
// looked at it, so it carries a not-started state the pre-closing list does not.
const POST_CLOSING_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_review', label: 'In review' },
  { value: 'complete', label: 'Complete' },
  { value: 'incomplete', label: 'Incomplete' },
]

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null

const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : null

const fmtMoney = (v: any) => {
  const n = parseFloat(v)
  if (isNaN(n)) return String(v)
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

const yesNo = (v: any) => (v === true ? 'Yes' : v === false ? 'No' : String(v))

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// Every question on the compliance form, smart-grouped for the expandable
// detail. A field renders only when it has a value; a group renders only when
// at least one of its fields does. Nothing with data is ever hidden.
const FIELD_GROUPS: { title: string; fields: { key: string; label: string; fmt?: (v: any, d: Record<string, any>) => string }[] }[] = [
  {
    title: 'Deal',
    fields: [
      { key: 'team_or_office', label: 'Team / office' },
      { key: 'representing', label: 'Representing', fmt: v => cap(String(v)) },
      { key: 'unit', label: 'Unit' },
      { key: 'in_matrix', label: 'In MLS Matrix', fmt: yesNo },
      { key: 'mls_link', label: 'MLS link' },
      { key: 'acceptance_date', label: 'Acceptance date', fmt: v => fmtDate(String(v)) || String(v) },
      { key: 'closing_or_movein_date', label: 'Closing / move-in', fmt: v => fmtDate(String(v)) || String(v) },
    ],
  },
  {
    title: 'Client',
    fields: [
      { key: 'client_name', label: 'Client name' },
      { key: 'client_email', label: 'Client email' },
      { key: 'client_phone', label: 'Client phone' },
      { key: 'lead_source', label: 'Lead source' },
    ],
  },
  {
    title: 'Lease details',
    fields: [
      { key: 'tenant_transaction_type', label: 'Lease type' },
      { key: 'lease_term_months', label: 'Lease term (months)' },
      { key: 'referred_client_type', label: 'Referred client type' },
    ],
  },
  {
    title: 'Financials',
    fields: [
      { key: 'commission_basis_price', label: 'Commission basis price', fmt: fmtMoney },
      { key: 'total_sales_rent_price', label: 'Total sales / rent price', fmt: fmtMoney },
      { key: 'commission_rate', label: 'Commission rate', fmt: (v, d) => (d.commission_rate_type === 'flat' ? fmtMoney(v) : `${v}%`) },
      { key: 'bonus_btsa_amount', label: 'BTSA', fmt: fmtMoney },
      { key: 'rebate_amount', label: 'Rebate', fmt: fmtMoney },
      { key: 'expedite_acknowledged', label: 'Expedite', fmt: yesNo },
    ],
  },
  {
    title: 'Referrals',
    fields: [
      { key: 'internal_referral', label: 'Internal referral', fmt: yesNo },
      { key: 'internal_referral_fee', label: 'Internal fee' },
      { key: 'external_referral', label: 'External referral', fmt: yesNo },
      { key: 'external_referral_fee', label: 'External fee' },
      { key: 'brokerage_referral', label: 'Brokerage referral', fmt: yesNo },
      { key: 'brokerage_referral_fee', label: 'Brokerage fee' },
    ],
  },
  {
    title: 'Title & loan',
    fields: [
      { key: 'title_officer_name', label: 'Title officer' },
      { key: 'title_company', label: 'Title company' },
      { key: 'title_company_email', label: 'Title email' },
      { key: 'title_phone', label: 'Title phone' },
      { key: 'loan_type', label: 'Loan type' },
    ],
  },
  {
    title: 'Flyer & notes',
    fields: [
      { key: 'flyer_display_type', label: 'Flyer display', fmt: v => cap(String(v)) },
      { key: 'flyer_display_line', label: 'Division / team line' },
      { key: 'bedrooms', label: 'Bedrooms' },
      { key: 'bathrooms', label: 'Bathrooms' },
      { key: 'garage', label: 'Garage' },
      { key: 'sqft', label: 'Sqft' },
      { key: 'additional_notes', label: 'Additional notes' },
    ],
  },
]

const hasValue = (v: any) => {
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'boolean') return v === true
  if (typeof v === 'number') return v !== 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

export default function AdminCompliancePage() {
  const router = useRouter()
  const { hasPermission, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [flyerMsg, setFlyerMsg] = useState('')
  const [rows, setRows] = useState<TrackerRow[]>([])
  const [tab, setTab] = useState<'all' | 'pending_compliance' | 'pending_checklist' | 'needs_cda'>('all')
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | 'closed' | 'cancelled'>('active')
  const [search, setSearch] = useState('')
  const [linkFilter, setLinkFilter] = useState<'all' | 'linked' | 'unlinked'>('all')
  const [sortBy, setSortBy] = useState<'recent' | 'closing' | 'agent' | 'status'>('recent')
  const [linkPanelId, setLinkPanelId] = useState<string | null>(null)
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<any[]>([])
  const [linkSearching, setLinkSearching] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Status editing (per row)
  const [editStatus, setEditStatus] = useState<string>('')
  const [editDate, setEditDate] = useState<string>('')
  const [editNotes, setEditNotes] = useState<string>('')
  const [savingStatus, setSavingStatus] = useState(false)
  const [pcStatus, setPcStatus] = useState<string>('')
  const [pcDate, setPcDate] = useState<string>('')
  const [pcNotes, setPcNotes] = useState<string>('')
  const [savingPc, setSavingPc] = useState(false)
  const [editClosingDate, setEditClosingDate] = useState<string>('')
  const [savingClosing, setSavingClosing] = useState(false)

  // Flyer actions
  const [generatingFlyer, setGeneratingFlyer] = useState<string | null>(null)
  const [sendingFlyer, setSendingFlyer] = useState<string | null>(null)

  // Notification settings
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifEmails, setNotifEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifSaved, setNotifSaved] = useState(false)
  const [notifError, setNotifError] = useState('')

  const loadRows = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setRows(data.submissions || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadRows() }, [loadRows])

  const pendingCompliance = (r: TrackerRow) => r.compliance_status !== 'complete'
  const pendingChecklist = (r: TrackerRow) => !r.checklist_complete
  // Referred-out deals never get a CDA from CRC - the receiving brokerage
  // closes them - so they are excluded from the Needs CDA list.
  const isReferredOut = (r: TrackerRow) =>
    String(r.transaction_type || '').includes('referred_out') ||
    String(r.side || '').toLowerCase() === 'referred_out' ||
    String((r.form_data || {}).representing || '').toLowerCase() === 'referred_out'
  const needsCda = (r: TrackerRow) => !r.is_lease && !isReferredOut(r) && r.compliance_status === 'complete' && !r.cda_sent
  const tabPredicate: Record<string, (r: TrackerRow) => boolean> = {
    pending_compliance: pendingCompliance,
    pending_checklist: pendingChecklist,
    needs_cda: needsCda,
  }
  // Transaction status filter. "Active deals" = the working set: active or
  // pending, plus submissions not yet linked to a transaction. Prospect, closed,
  // and cancelled (either spelling) are hidden unless explicitly chosen.
  const txnStatus = (r: TrackerRow) => (r.transaction_status || '').toLowerCase()
  const statusPasses = (r: TrackerRow) => {
    const s = txnStatus(r)
    if (statusFilter === 'all') return true
    if (statusFilter === 'closed') return s === 'closed'
    if (statusFilter === 'cancelled') return s === 'cancelled' || s === 'canceled'
    return s === 'active' || s === 'pending' || s === '' // 'active' (default)
  }
  const pendingComplianceCount = rows.filter(r => statusPasses(r) && pendingCompliance(r)).length
  const pendingChecklistCount = rows.filter(r => statusPasses(r) && pendingChecklist(r)).length
  const needsCdaCount = rows.filter(r => statusPasses(r) && needsCda(r)).length
  // Where the "Work Deal" link lands, per tab: Pending checklist opens the
  // Check & Payouts tab (where the checklist lives); Needs CDA opens the
  // Commissions tab (where the CDA is worked); All and Pending compliance open
  // the Documents tab for review.
  const workTab =
    tab === 'pending_checklist' ? 'check_payouts'
    : tab === 'needs_cda' ? 'commissions'
    : 'documents'
  const visible = (() => {
    let list = rows.filter(statusPasses)
    if (tab !== 'all') list = list.filter(tabPredicate[tab])

    if (linkFilter === 'linked') list = list.filter(r => r.transaction_id)
    else if (linkFilter === 'unlinked') list = list.filter(r => !r.transaction_id)

    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(r =>
        (r.agent_name || '').toLowerCase().includes(q) ||
        (r.property_address || '').toLowerCase().includes(q) ||
        (r.client_name || '').toLowerCase().includes(q)
      )
    }

    const time = (s: string | null) => (s ? new Date(s).getTime() : 0)
    list.sort((a, b) => {
      if (sortBy === 'recent') return time(b.submitted_at) - time(a.submitted_at)
      // Needs CDA works like the Brokermint CDA report: soonest closing first.
      if (sortBy === 'closing') return tab === 'needs_cda' ? time(a.closing_date) - time(b.closing_date) : time(b.closing_date) - time(a.closing_date)
      if (sortBy === 'agent') return (a.agent_name || '').localeCompare(b.agent_name || '')
      if (sortBy === 'status') return (a.compliance_status || '').localeCompare(b.compliance_status || '')
      return 0
    })
    return list
  })()

  const unlinkedCount = rows.filter(r => !r.transaction_id).length

  const openExpand = (r: TrackerRow) => {
    if (expandedId === r.id) { setExpandedId(null); return }
    setExpandedId(r.id)
    setEditStatus(r.compliance_status)
    setEditDate(r.completed_at ? r.completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setEditNotes(
      r.missing_notes ||
      r.missing_items.map(m => `${m.name}${m.notes ? `: ${m.notes}` : ''}`).join('\n')
    )
    setPcStatus(r.post_closing_status || 'not_started')
    setPcDate(r.post_closing_completed_at ? r.post_closing_completed_at.slice(0, 10) : new Date().toISOString().slice(0, 10))
    setPcNotes(r.post_closing_notes || '')
    setEditClosingDate(r.closing_date ? r.closing_date.slice(0, 10) : '')
  }

  const savePostClosing = async (r: TrackerRow) => {
    if (!r.transaction_id) { setError('Link this submission to a transaction before tracking post closing compliance.'); return }
    setSavingPc(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/set-post-closing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: r.transaction_id,
          status: pcStatus,
          completed_at: pcStatus === 'complete' && pcDate ? new Date(`${pcDate}T12:00:00`).toISOString() : undefined,
          notes: pcStatus === 'incomplete' ? pcNotes : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save post closing status')
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingPc(false)
    }
  }

  const saveStatus = async (r: TrackerRow) => {
    setSavingStatus(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/set-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: r.id,
          status: editStatus,
          completed_at: editStatus === 'complete' && editDate ? new Date(`${editDate}T12:00:00`).toISOString() : undefined,
          missing_notes: editStatus === 'incomplete' ? editNotes : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save status')
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingStatus(false)
    }
  }

  const saveClosingDate = async (r: TrackerRow) => {
    if (!r.transaction_id) { setError('Link this submission to a transaction before setting the closing date.'); return }
    setSavingClosing(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/set-closing-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submission_id: r.id,
          closing_date: editClosingDate || null,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not save closing date')
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSavingClosing(false)
    }
  }

  const openLinkPanel = (rowId: string) => {
    if (linkPanelId === rowId) { setLinkPanelId(null); return }
    setLinkPanelId(rowId)
    setLinkQuery('')
    setLinkResults([])
    setError('')
  }

  const runLinkSearch = async (rowId: string, query: string) => {
    setLinkQuery(query)
    if (query.trim().length < 2) { setLinkResults([]); return }
    setLinkSearching(true)
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', query }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setLinkResults(data.transactions || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinkSearching(false)
    }
  }

  const linkToTransaction = async (submissionId: string, transactionId: string, relink = false) => {
    setLinkBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', submission_id: submissionId, transaction_id: transactionId, relink }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not link')
      setLinkPanelId(null)
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinkBusy(false)
    }
  }

  const unlinkTransaction = async (submissionId: string) => {
    setLinkBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unlink', submission_id: submissionId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not unlink')
      setLinkPanelId(null)
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinkBusy(false)
    }
  }

  const createTransactionForRow = async (submissionId: string) => {
    setLinkBusy(true)
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', submission_id: submissionId }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Could not create transaction')
      setLinkPanelId(null)
      await loadRows()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLinkBusy(false)
    }
  }

  const generateFlyer = async (transactionId: string) => {
    setGeneratingFlyer(transactionId)
    setFlyerMsg('')
    setError('')
    try {
      const res = await fetch('/api/admin/compliance/generate-flyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        // Open the flyer page so Leah can add a photo, download, or send it.
        window.open(`/agent/flyer/${transactionId}`, '_blank', 'noopener,noreferrer')
        await loadRows()
      } else {
        setError(data.error || 'Could not generate the flyer. Please try again.')
      }
    } catch {
      setError('Could not generate the flyer. Please try again.')
    } finally {
      setGeneratingFlyer(null)
    }
  }

  const sendFlyerEmail = async (transactionId: string, mode: 'request_photo' | 'flyer_ready', flyerId?: string | null) => {
    setSendingFlyer(transactionId)
    try {
      const res = await fetch('/api/admin/compliance/send-flyer-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction_id: transactionId, mode, flyer_id: flyerId || null }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || 'Could not send the email. Please try again.')
      } else {
        setFlyerMsg(data.sent_to ? `Email sent to ${data.sent_to}.` : 'Email sent.')
        setTimeout(() => setFlyerMsg(''), 4000)
      }
    } catch {
      setError('Could not send the email. Please try again.')
    } finally {
      setSendingFlyer(null)
    }
  }

  const loadNotifEmails = useCallback(async () => {
    setNotifLoading(true)
    setNotifError('')
    try {
      const res = await fetch('/api/admin/compliance/notification-emails')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setNotifEmails(data.emails || [])
    } catch (err: any) {
      setNotifError(err.message)
    } finally {
      setNotifLoading(false)
    }
  }, [])

  const openSettings = () => {
    setSettingsOpen(true)
    loadNotifEmails()
  }

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase()
    setNotifError('')
    if (!e) return
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(e)) { setNotifError('Please enter a valid email address.'); return }
    if (notifEmails.includes(e)) { setNotifError('That email is already on the list.'); return }
    setNotifEmails([...notifEmails, e])
    setNewEmail('')
  }

  const removeEmail = (e: string) => setNotifEmails(notifEmails.filter(x => x !== e))

  const saveNotifEmails = async () => {
    setNotifError('')
    setNotifSaved(false)
    let toSave = notifEmails
    const typed = newEmail.trim().toLowerCase()
    if (typed) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(typed)) { setNotifError('Please enter a valid email address, or clear the box before saving.'); return }
      if (!notifEmails.includes(typed)) {
        toSave = [...notifEmails, typed]
        setNotifEmails(toSave)
      }
      setNewEmail('')
    }
    setNotifSaving(true)
    try {
      const res = await fetch('/api/admin/compliance/notification-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: toSave }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setNotifEmails(data.emails || [])
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 3000)
    } catch (err: any) {
      setNotifError(err.message)
    } finally {
      setNotifSaving(false)
    }
  }

  const statusBadge = (status: string) => {
    const label = status.replace(/_/g, ' ')
    if (status === 'complete') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs capitalize bg-green-50 text-green-700">{label}</span>
    }
    if (status === 'incomplete') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs capitalize bg-red-50 text-red-700">{label}</span>
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs capitalize bg-luxury-gray-5/40 text-luxury-gray-2">{label}</span>
  }

  // The admin layout already blocks this route, but guard defensively too.
  if (!authLoading && !hasPermission('can_review_compliance')) {
    return (
      <div className="container-card max-w-md mx-auto text-center">
        <h1 className="text-xl font-semibold text-luxury-gray-1 mb-2">Access Denied</h1>
        <p className="text-luxury-gray-3">You do not have permission to view compliance requests.</p>
      </div>
    )
  }

  const renderLinkPanel = (r: TrackerRow) => (
                        <div className="space-y-3 max-w-xl">
                          <p className="text-xs font-semibold text-luxury-gray-1">
                            {r.transaction_id
                              ? 'Re-link this compliance submission to a different transaction'
                              : 'Link this compliance submission to a transaction'}
                          </p>
                          {r.transaction_id && (
                            <p className="text-xs text-luxury-gray-3">
                              Currently linked to: {r.property_address || 'this transaction'}
                            </p>
                          )}
                          <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
                            <input
                              type="text"
                              value={linkQuery}
                              onChange={e => runLinkSearch(r.id, e.target.value)}
                              placeholder="Search by property address or client name"
                              className="input-luxury text-xs pl-7 py-1.5 w-full"
                              autoFocus
                            />
                          </div>

                          {linkSearching ? (
                            <p className="text-xs text-luxury-gray-3">Searching...</p>
                          ) : linkResults.length > 0 ? (
                            <div className="border border-luxury-gray-5 rounded divide-y divide-luxury-gray-5">
                              {linkResults.map(t => (
                                <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2">
                                  <div className="min-w-0">
                                    <span className="block text-xs text-luxury-gray-1 truncate">{t.property_address || 'No address'}</span>
                                    <span className="block text-xs text-luxury-gray-3 truncate">
                                      {[t.client_name, t.status].filter(Boolean).join(' - ')}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => linkToTransaction(r.id, t.id, !!r.transaction_id)}
                                    disabled={linkBusy}
                                    className="btn btn-secondary text-xs whitespace-nowrap disabled:opacity-50"
                                  >
                                    Link
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : linkQuery.trim().length >= 2 ? (
                            <p className="text-xs text-luxury-gray-3">No matching transactions found.</p>
                          ) : null}

                          <div className="flex items-center gap-2 pt-1">
                            {!r.transaction_id && (
                              <button
                                onClick={() => createTransactionForRow(r.id)}
                                disabled={linkBusy}
                                className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <Plus size={12} /> Create new transaction
                              </button>
                            )}
                            {r.transaction_id && (
                              <button
                                onClick={() => unlinkTransaction(r.id)}
                                disabled={linkBusy}
                                className="btn btn-secondary text-xs inline-flex items-center gap-1 text-red-600 disabled:opacity-50"
                              >
                                <X size={12} /> Remove link
                              </button>
                            )}
                            <button
                              onClick={() => setLinkPanelId(null)}
                              className="btn btn-secondary text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                          {!r.transaction_id && (
                            <p className="text-xs text-luxury-gray-3">
                              Creating a transaction uses this submission&apos;s address, client, and closing date.
                            </p>
                          )}
                        </div>
  )

  const renderExpandedDetail = (r: TrackerRow) => (
                        <div className="space-y-4">

                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-semibold text-luxury-gray-1">
                              {r.property_address || 'Deal'}
                            </span>
                            <span className="text-[11px] text-luxury-gray-3">Submitted {fmtDate(r.submitted_at)}</span>
                            {r.recheck_requested && (
                              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700">
                                <RefreshCw size={10} /> Recheck requested {r.recheck_at ? fmtDate(r.recheck_at) : ''}
                              </span>
                            )}
                          </div>

                          {r.recheck_requested && r.recheck_changed_fields && r.recheck_changed_fields.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-luxury-gray-1">Recheck changed fields: </span>
                              <span className="text-luxury-gray-2">
                                {r.recheck_changed_fields.map(f => f.replace(/_/g, ' ')).join(', ')}
                              </span>
                            </div>
                          )}

                          {/* Editable compliance status: the submission is the truth */}
                          <div
                            className="flex items-end gap-3 flex-wrap p-3 bg-white border border-luxury-gray-5 rounded-lg"
                            onClick={e => e.stopPropagation()}
                          >
                            <div>
                              <label className="field-label block mb-1">Compliance status</label>
                              <select
                                value={editStatus}
                                onChange={e => setEditStatus(e.target.value)}
                                className="select-luxury text-xs"
                              >
                                {STATUS_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                            {editStatus === 'complete' && (
                              <div>
                                <label className="field-label block mb-1">Date completed</label>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={e => setEditDate(e.target.value)}
                                  className="input-luxury text-xs"
                                />
                              </div>
                            )}
                            {editStatus === 'incomplete' && (
                              <div className="flex-1 min-w-[240px]">
                                <label className="field-label block mb-1">Missing / incomplete items</label>
                                <textarea
                                  value={editNotes}
                                  onChange={e => setEditNotes(e.target.value)}
                                  rows={2}
                                  className="input-luxury text-xs w-full resize-none"
                                  placeholder="Missing: Settlement Statement, Survey"
                                />
                              </div>
                            )}
                            <button
                              onClick={() => saveStatus(r)}
                              disabled={savingStatus}
                              className="btn btn-primary text-xs disabled:opacity-50"
                            >
                              {savingStatus ? 'Saving...' : 'Save'}
                            </button>
                            {r.completed_at && r.compliance_status === 'complete' && (
                              <span className="text-[11px] text-luxury-gray-3 pb-2">
                                Completed {fmtDate(r.completed_at)}
                              </span>
                            )}
                          </div>

                          {/* Post closing compliance: tracked per deal, same shape as above */}
                          <div
                            className="flex items-end gap-3 flex-wrap p-3 bg-white border border-luxury-gray-5 rounded-lg"
                            onClick={e => e.stopPropagation()}
                          >
                            <div>
                              <label className="field-label block mb-1">Post closing compliance</label>
                              <select
                                value={pcStatus}
                                onChange={e => setPcStatus(e.target.value)}
                                className="select-luxury text-xs"
                              >
                                {POST_CLOSING_STATUS_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                            {pcStatus === 'complete' && (
                              <div>
                                <label className="field-label block mb-1">Date completed</label>
                                <input
                                  type="date"
                                  value={pcDate}
                                  onChange={e => setPcDate(e.target.value)}
                                  className="input-luxury text-xs"
                                />
                              </div>
                            )}
                            {pcStatus === 'incomplete' && (
                              <div className="flex-1 min-w-[240px]">
                                <label className="field-label block mb-1">Missing / incomplete items</label>
                                <textarea
                                  value={pcNotes}
                                  onChange={e => setPcNotes(e.target.value)}
                                  rows={2}
                                  className="input-luxury text-xs w-full resize-none"
                                  placeholder="Missing: Final Settlement Statement, Survey"
                                />
                              </div>
                            )}
                            <button
                              onClick={() => savePostClosing(r)}
                              disabled={savingPc || !r.transaction_id}
                              className="btn btn-primary text-xs disabled:opacity-50"
                            >
                              {savingPc ? 'Saving...' : 'Save'}
                            </button>
                            {!r.transaction_id && (
                              <span className="text-[11px] text-luxury-gray-3 pb-2">
                                Link a transaction first
                              </span>
                            )}
                            {r.post_closing_completed_at && r.post_closing_status === 'complete' && (
                              <span className="text-[11px] text-luxury-gray-3 pb-2">
                                Completed {fmtDate(r.post_closing_completed_at)}
                              </span>
                            )}
                          </div>

                          {/* Editable closing date: two-way synced to the transaction */}
                          <div
                            className="flex items-end gap-3 flex-wrap p-3 bg-white border border-luxury-gray-5 rounded-lg"
                            onClick={e => e.stopPropagation()}
                          >
                            <div>
                              <label className="field-label block mb-1">Closing date</label>
                              <input
                                type="date"
                                value={editClosingDate}
                                onChange={e => setEditClosingDate(e.target.value)}
                                className="input-luxury text-xs"
                              />
                            </div>
                            <button
                              onClick={() => saveClosingDate(r)}
                              disabled={savingClosing || !r.transaction_id}
                              className="btn btn-primary text-xs disabled:opacity-50"
                            >
                              {savingClosing ? 'Saving...' : 'Save'}
                            </button>
                            {!r.transaction_id && (
                              <span className="text-[11px] text-luxury-gray-3 pb-2">
                                Link a transaction first
                              </span>
                            )}
                          </div>

                          {/* Missing items from Leah's document review */}
                          {r.missing_items.length > 0 && (
                            <div className="text-xs">
                              <span className="font-medium text-luxury-gray-1">Missing / needs correction (from review): </span>
                              <ul className="mt-1 ml-4 list-disc space-y-0.5">
                                {r.missing_items.map((m, i) => (
                                  <li key={i} className="text-luxury-gray-2">
                                    {m.name}
                                    {m.notes ? <span className="text-luxury-gray-3"> - {m.notes}</span> : null}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Every form answer with a value, smart-grouped */}
                          {FIELD_GROUPS.map(group => {
                            const filled = group.fields.filter(f => hasValue(r.form_data?.[f.key]))
                            if (filled.length === 0) return null
                            return (
                              <div key={group.title}>
                                <p className="text-[10px] text-luxury-gray-3 uppercase tracking-wider mb-1.5">{group.title}</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-2 text-xs">
                                  {filled.map(f => {
                                    const raw = r.form_data[f.key]
                                    const val = f.fmt ? f.fmt(raw, r.form_data) : String(raw)
                                    return (
                                      <div key={f.key} className={f.key === 'additional_notes' ? 'col-span-2 md:col-span-4' : ''}>
                                        <span className="text-luxury-gray-3 block">{f.label}</span>
                                        <span className="text-luxury-gray-1 break-words">{val}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}

                          {/* Flyer actions */}
                          {r.transaction_id && (
                            <div className="flex items-center gap-3 pt-2 border-t border-luxury-gray-5/50" onClick={e => e.stopPropagation()}>
                              {r.flyer ? (
                                r.flyer.has_photo ? (
                                  <button
                                    onClick={() => sendFlyerEmail(r.transaction_id!, 'flyer_ready', r.flyer?.id)}
                                    disabled={sendingFlyer === r.transaction_id}
                                    className="text-xs text-luxury-accent hover:underline disabled:opacity-50"
                                  >
                                    {sendingFlyer === r.transaction_id ? 'Sending...' : 'Email agent: flyer ready'}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => sendFlyerEmail(r.transaction_id!, 'request_photo', r.flyer?.id)}
                                    disabled={sendingFlyer === r.transaction_id}
                                    className="text-xs text-luxury-accent hover:underline disabled:opacity-50"
                                  >
                                    {sendingFlyer === r.transaction_id ? 'Sending...' : 'Email agent: request photo'}
                                  </button>
                                )
                              ) : (
                                <button
                                  onClick={() => generateFlyer(r.transaction_id!)}
                                  disabled={generatingFlyer === r.transaction_id}
                                  className="text-xs text-luxury-accent hover:underline disabled:opacity-50"
                                >
                                  {generatingFlyer === r.transaction_id ? 'Generating...' : 'Generate flyer'}
                                </button>
                              )}
                              {r.flyer && (
                                <a
                                  href={`/agent/flyer/${r.transaction_id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline"
                                >
                                  <ImageIcon size={12} /> Open flyer page <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          )}

                        </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="page-title">COMPLIANCE REQUESTS</h1>
        <button
          onClick={() => (settingsOpen ? setSettingsOpen(false) : openSettings())}
          className="btn btn-secondary text-xs flex items-center gap-1.5"
        >
          <Mail size={13} /> Notification Settings
        </button>
      </div>

      {settingsOpen && (
        <div className="container-card mb-6 space-y-4">
          <div>
            <p className="text-sm font-medium text-luxury-gray-1">Compliance Notification Recipients</p>
            <p className="text-xs text-luxury-gray-3 mt-1">
              These addresses are emailed whenever an agent submits a compliance, resubmission, or retainer form. If the list is empty, no notifications are sent.
            </p>
          </div>

          {notifLoading ? (
            <div className="flex items-center gap-2 text-xs text-luxury-gray-3">
              <Loader2 size={13} className="animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {notifEmails.length === 0 ? (
                  <span className="text-xs text-luxury-gray-3">No recipients yet.</span>
                ) : (
                  notifEmails.map(e => (
                    <span key={e} className="inline-flex items-center gap-1.5 text-xs bg-luxury-gray-5/40 text-luxury-gray-1 px-2.5 py-1 rounded">
                      {e}
                      <button onClick={() => removeEmail(e)} className="text-luxury-gray-3 hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex gap-2 items-center">
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEmail() } }}
                  placeholder="name@collectiverealtyco.com"
                  className="input-luxury text-sm flex-1 max-w-xs"
                />
                <button onClick={addEmail} className="btn btn-secondary text-xs flex items-center gap-1">
                  <Plus size={13} /> Add
                </button>
              </div>

              {notifError && (
                <div className="flex items-center gap-2 text-xs text-red-700">
                  <AlertCircle size={13} className="flex-shrink-0" />{notifError}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-luxury-gray-5/50">
                <button
                  onClick={saveNotifEmails}
                  disabled={notifSaving}
                  className="btn btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {notifSaving ? (
                    <><Loader2 size={13} className="animate-spin" /> Saving...</>
                  ) : notifSaved ? (
                    <><Check size={13} /> Saved</>
                  ) : (
                    'Save Recipients'
                  )}
                </button>
                <button onClick={() => setSettingsOpen(false)} className="btn btn-secondary text-xs">
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {([
          { key: 'all', label: `All (${rows.filter(statusPasses).length})` },
          { key: 'pending_compliance', label: `Pending compliance (${pendingComplianceCount})` },
          { key: 'pending_checklist', label: `Pending checklist (${pendingChecklistCount})` },
          { key: 'needs_cda', label: `Needs CDA (${needsCdaCount})` },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); if (t.key === 'needs_cda') setSortBy('closing') }}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${
              tab === t.key
                ? 'bg-luxury-gray-1 text-white border-luxury-gray-1'
                : 'bg-white text-luxury-gray-2 border-luxury-gray-5 hover:border-luxury-gray-3'
            }`}
          >
            {t.label}
          </button>
        ))}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
          className="select-luxury text-xs py-1.5"
        >
          <option value="active">Active deals</option>
          <option value="all">All statuses</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-luxury-gray-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agent, property, or client"
            className="input-luxury text-xs pl-7 py-1.5 w-full"
          />
        </div>

        <select
          value={linkFilter}
          onChange={e => setLinkFilter(e.target.value as 'all' | 'linked' | 'unlinked')}
          className="select-luxury text-xs py-1.5"
        >
          <option value="all">All rows</option>
          <option value="linked">Linked only</option>
          <option value="unlinked">Unlinked ({unlinkedCount})</option>
        </select>

        <div className="flex items-center gap-1">
          <ArrowUpDown size={13} className="text-luxury-gray-4" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as 'recent' | 'closing' | 'agent' | 'status')}
            className="select-luxury text-xs py-1.5"
          >
            <option value="recent">Most recent</option>
            <option value="closing">Closing date</option>
            <option value="agent">Agent name</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 rounded text-xs text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" />{error}
        </div>
      )}

      {flyerMsg && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-green-50 rounded text-xs text-green-700">
          <Check size={14} className="flex-shrink-0" />{flyerMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-luxury-gray-3" />
        </div>
      ) : visible.length === 0 ? (
        <div className="container-card text-center py-12">
          <p className="text-sm text-luxury-gray-3">
            {tab !== 'all' || statusFilter !== 'active' ? 'Nothing in this view right now.' : 'No compliance submissions yet.'}
          </p>
        </div>
      ) : (
        <>
        <div className="container-card overflow-x-auto p-0 hidden md:block">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-luxury-gray-5">
                <th className="px-2 py-3 w-6"></th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Paid</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Flyer</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Closing</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Compliance</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Post Closing</th>
                {tab === 'needs_cda' && (
                  <>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">CDA Status</th>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Funding Status</th>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Office Gross</th>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Agent Net</th>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Office Net</th>
                    <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Status</th>
                  </>
                )}
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Agent</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Property / Client</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3">Type</th>
                <th className="text-xs font-medium text-luxury-gray-3 px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <Fragment key={r.id}>
                  <tr
                    className="border-b border-luxury-gray-5/50 hover:bg-luxury-gray-5/20 cursor-pointer"
                    onClick={() => openExpand(r)}
                  >
                    <td className="px-2 py-3 w-6">
                      {expandedId === r.id ? <ChevronDown size={14} className="text-luxury-gray-3" /> : <ChevronRight size={14} className="text-luxury-gray-4" />}
                    </td>
                    <td className="px-4 py-3">
                      {r.paid ? <Check size={14} className="text-green-600" /> : <span className="text-luxury-gray-4 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.flyer ? (
                        <span className="inline-flex items-center gap-1 text-xs text-luxury-gray-3">
                          <ImageIcon size={12} className={r.flyer.has_photo ? 'text-green-600' : 'text-luxury-gray-4'} />
                          {r.flyer.downloaded
                            ? 'Downloaded'
                            : r.flyer.has_photo
                            ? 'Ready'
                            : r.flyer.sent
                            ? 'Photo requested'
                            : 'No photo'}
                        </span>
                      ) : (
                        <span className="text-luxury-gray-4 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-luxury-gray-1 whitespace-nowrap">{fmtDate(r.closing_date) || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {statusBadge(r.compliance_status)}
                        {r.missing_items.length > 0 && r.compliance_status !== 'complete' && (
                          <span className="text-xs text-red-600">{r.missing_items.length} missing</span>
                        )}
                        {r.recheck_requested && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                            <RefreshCw size={10} /> Recheck
                          </span>
                        )}
                        {r.cda_sent && <span className="text-xs text-luxury-gray-3">CDA sent</span>}
                        {!r.cda_sent && r.cda_status === 'pending_approval' && <span className="text-xs text-amber-700">CDA pending approval</span>}
                        {!r.cda_sent && r.cda_status === 'approved' && <span className="text-xs text-green-600">CDA approved</span>}
                        <span className={`text-xs ${r.checklist_complete ? 'text-green-600' : 'text-luxury-gray-3'}`}>
                          {r.checklist_complete ? 'Checklist done' : 'Checklist pending'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 items-start">
                        {statusBadge(r.post_closing_status || 'not_started')}
                        {r.post_closing_completed_at && r.post_closing_status === 'complete' && (
                          <span className="text-xs text-luxury-gray-3">{fmtDate(r.post_closing_completed_at)}</span>
                        )}
                      </div>
                    </td>
                    {tab === 'needs_cda' && (
                      <>
                        <td className="px-4 py-3 text-xs text-luxury-gray-2 whitespace-nowrap capitalize">
                          {r.cda_status ? r.cda_status.replace(/_/g, ' ') : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-luxury-gray-2 whitespace-nowrap capitalize">
                          {r.funding_status ? r.funding_status.replace(/_/g, ' ') : '-'}
                        </td>
                        <td className="px-4 py-3 text-xs text-luxury-gray-1 whitespace-nowrap">{r.office_gross != null ? fmtMoney(r.office_gross) : '-'}</td>
                        <td className="px-4 py-3 text-xs text-luxury-gray-1 whitespace-nowrap">{r.agent_net != null ? fmtMoney(r.agent_net) : '-'}</td>
                        <td className="px-4 py-3 text-xs text-luxury-gray-1 whitespace-nowrap">{r.office_net != null ? fmtMoney(r.office_net) : '-'}</td>
                        <td className="px-4 py-3 text-xs text-luxury-gray-2 whitespace-nowrap capitalize">
                          {r.transaction_status || '-'}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 text-xs text-luxury-gray-1 whitespace-nowrap">
                      {r.agent_name}
                      {r.side && <span className="block text-luxury-gray-3 capitalize">{r.side}</span>}
                      <span className="block text-luxury-gray-3">Submitted {fmtDateTime(r.submitted_at)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-luxury-gray-1">
                      <span className="block">{r.property_address || '-'}</span>
                      {r.client_name && <span className="block text-luxury-gray-3">{r.client_name}</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-luxury-gray-2 whitespace-nowrap">
                      {r.transaction_type ? r.transaction_type.replace(/_v2$/, '').replace(/_/g, ' ') : '-'}
                      {r.is_locked && <Lock size={11} className="inline-block ml-1.5 text-amber-600" />}
                    </td>
                    <td className="px-4 py-3">
                      {r.transaction_id ? (
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <a
                            href={`/admin/transactions/${r.transaction_id}?tab=${workTab}`}
                            onClick={e => { e.stopPropagation(); e.preventDefault(); router.push(`/admin/transactions/${r.transaction_id}?tab=${workTab}`) }}
                            className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline"
                          >
                            Work Deal <ExternalLink size={11} />
                          </a>
                          <button
                            onClick={e => { e.stopPropagation(); openLinkPanel(r.id) }}
                            className="inline-flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1"
                            title="Link this submission to a different transaction"
                          >
                            <Link2 size={11} /> Re-link
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); openLinkPanel(r.id) }}
                          className="inline-flex items-center gap-1 text-xs text-luxury-gray-2 hover:text-luxury-gray-1 whitespace-nowrap"
                        >
                          <Link2 size={11} /> Link
                        </button>
                      )}
                    </td>
                  </tr>

                  {linkPanelId === r.id && (
                    <tr className="border-b border-luxury-gray-5/50 bg-luxury-gray-5/10">
                      <td colSpan={tab === 'needs_cda' ? 16 : 10} className="px-5 py-4">
                        {renderLinkPanel(r)}
                      </td>
                    </tr>
                  )}

                  {expandedId === r.id && (
                    <tr className="border-b border-luxury-gray-5/50 bg-luxury-gray-5/10">
                      <td colSpan={tab === 'needs_cda' ? 16 : 10} className="px-5 py-4">
                        {renderExpandedDetail(r)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {tab === 'needs_cda' && visible.length > 0 && (
                <tr className="border-t border-luxury-gray-5 bg-luxury-gray-5/10">
                  <td colSpan={8} className="px-4 py-3 text-xs font-semibold text-luxury-gray-1">Overall total ({visible.length})</td>
                  <td className="px-4 py-3 text-xs font-semibold text-luxury-gray-1 whitespace-nowrap">
                    {fmtMoney(visible.reduce((s, r) => s + (parseFloat(String(r.office_gross ?? 0)) || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-luxury-gray-1 whitespace-nowrap">
                    {fmtMoney(visible.reduce((s, r) => s + (parseFloat(String(r.agent_net ?? 0)) || 0), 0))}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-luxury-gray-1 whitespace-nowrap">
                    {fmtMoney(visible.reduce((s, r) => s + (parseFloat(String(r.office_net ?? 0)) || 0), 0))}
                  </td>
                  <td colSpan={5}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {visible.map(r => (
            <div key={r.id} className="container-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-sm text-luxury-gray-1 font-medium">{r.agent_name || '-'}</span>
                  {r.side && <span className="block text-xs text-luxury-gray-3 capitalize">{r.side}</span>}
                  <span className="block text-xs text-luxury-gray-3">Submitted {fmtDateTime(r.submitted_at)}</span>
                </div>
                <div className="flex-shrink-0">{statusBadge(r.compliance_status)}</div>
              </div>
              <div className="mt-2 text-xs text-luxury-gray-1">
                <span className="block">{r.property_address || '-'}</span>
                {r.client_name && <span className="block text-luxury-gray-3">{r.client_name}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-luxury-gray-2">
                <span>{r.transaction_type ? r.transaction_type.replace(/_v2$/, '').replace(/_/g, ' ') : '-'}</span>
                {r.is_locked && <Lock size={11} className="text-amber-600" />}
                <span>Closing: {fmtDate(r.closing_date) || '-'}</span>
                {r.paid && <span className="inline-flex items-center gap-1 text-green-600"><Check size={12} /> Paid</span>}
                <span className={r.checklist_complete ? 'text-green-600' : 'text-luxury-gray-3'}>
                  {r.checklist_complete ? 'Checklist done' : 'Checklist pending'}
                </span>
                {r.cda_sent && <span className="text-luxury-gray-3">CDA sent</span>}
                {!r.cda_sent && r.cda_status === 'pending_approval' && <span className="text-amber-700">CDA pending approval</span>}
                {!r.cda_sent && r.cda_status === 'approved' && <span className="text-green-600">CDA approved</span>}
              </div>
              {tab === 'needs_cda' && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-luxury-gray-1">
                  {r.cda_status && <span className="text-luxury-gray-2 capitalize">CDA: {r.cda_status.replace(/_/g, ' ')}</span>}
                  {r.funding_status && <span className="text-luxury-gray-2 capitalize">Funding: {r.funding_status.replace(/_/g, ' ')}</span>}
                  <span>Office Gross: {r.office_gross != null ? fmtMoney(r.office_gross) : '-'}</span>
                  <span>Agent Net: {r.agent_net != null ? fmtMoney(r.agent_net) : '-'}</span>
                  <span>Office Net: {r.office_net != null ? fmtMoney(r.office_net) : '-'}</span>
                  {r.transaction_status && <span className="text-luxury-gray-2 capitalize">Status: {r.transaction_status}</span>}
                </div>
              )}
              {r.missing_items.length > 0 && r.compliance_status !== 'complete' && (
                <div className="mt-1 text-xs text-red-600">{r.missing_items.length} missing</div>
              )}
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                {r.transaction_id ? (
                  <>
                    <a
                      href={`/admin/transactions/${r.transaction_id}?tab=${workTab}`}
                      onClick={e => { e.preventDefault(); router.push(`/admin/transactions/${r.transaction_id}?tab=${workTab}`) }}
                      className="inline-flex items-center gap-1 text-xs text-luxury-accent hover:underline"
                    >
                      Work Deal <ExternalLink size={11} />
                    </a>
                    <button
                      onClick={() => openLinkPanel(r.id)}
                      className="inline-flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1"
                    >
                      <Link2 size={11} /> Re-link
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openLinkPanel(r.id)}
                    className="inline-flex items-center gap-1 text-xs text-luxury-gray-2 hover:text-luxury-gray-1"
                  >
                    <Link2 size={11} /> Link
                  </button>
                )}
                <button
                  onClick={() => openExpand(r)}
                  className="inline-flex items-center gap-1 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 ml-auto"
                >
                  {expandedId === r.id ? <>Hide <ChevronDown size={12} /></> : <>Details <ChevronRight size={12} /></>}
                </button>
              </div>
              {linkPanelId === r.id && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">{renderLinkPanel(r)}</div>
              )}
              {expandedId === r.id && (
                <div className="mt-3 pt-3 border-t border-luxury-gray-5/50">{renderExpandedDetail(r)}</div>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  )
}
