'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Camera,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Building2,
  User,
  DollarSign,
  FileText,
  ClipboardList,
  Send,
  Trash2,
  Phone,
  Mail,
  Edit,
  Plus,
  Pencil,
} from 'lucide-react'
import { TransactionStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/transactions/types'
import StatusBadge from '@/components/transactions/StatusBadge'
import CloseDialog from '@/components/transactions/CloseDialog'
import AgentsSection from '@/components/transactions/AgentsSection'
import BrokeragesSection from '@/components/transactions/BrokeragesSection'
import {
  getTransactionTypeLabel,
  TRANSACTION_TYPE_OPTIONS,
} from '@/lib/transactions/transactionTypes'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt$ = (n: number | null | undefined) => {
  if (n == null) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n))
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '--'
  // Add noon time to date-only strings to prevent timezone shift
  const dateStr = d.length === 10 ? d + 'T12:00:00' : d
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const fmtName = (u: any) =>
  u
    ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
    : ''

const CONTACT_TYPES = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'title_company', label: 'Title Company' },
  { value: 'lender', label: 'Lender' },
  { value: 'attorney', label: 'Attorney' },
  { value: 'inspector', label: 'Inspector' },
  { value: 'appraiser', label: 'Appraiser' },
  { value: 'hoa', label: 'HOA' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'coop_agent', label: 'Co-op Agent' },
  { value: 'other', label: 'Other' },
]

const isLease = (txnType: string | null) => {
  if (!txnType) return false
  const t = txnType.toLowerCase()
  return t.includes('lease') || t.includes('apartment') || t.includes('rent') || t.includes('tenant') || t.includes('landlord')
}

const formatTransactionType = (type: string | null) => {
  return getTransactionTypeLabel(type)
}

const STATUS_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const getDaysUntil = (dateStr: string | null) => {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// Count business days (M-F) between now and target date
const getBusinessDaysUntil = (dateStr: string | null) => {
  if (!dateStr) return null
  const target = new Date(dateStr)
  const now = new Date()
  // Reset to start of day for accurate counting
  now.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  
  if (target <= now) return 0
  
  let count = 0
  const current = new Date(now)
  while (current < target) {
    current.setDate(current.getDate() + 1)
    const dow = current.getDay()
    if (dow !== 0 && dow !== 6) count++
  }
  return count
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

function EditableFieldRow({
  label,
  value,
  field,
  type = 'text',
  options,
  onSave,
}: {
  label: string
  value: string | number | null | undefined
  field: string
  type?: 'text' | 'date' | 'select' | 'number'
  options?: { value: string; label: string }[]
  onSave: (field: string, value: string | number | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [localValue, setLocalValue] = useState(value ?? '')

  const handleSave = () => {
    const newValue = type === 'number' ? (localValue ? parseFloat(String(localValue)) : null) : (localValue || null)
    onSave(field, newValue)
    setEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') {
      setLocalValue(value ?? '')
      setEditing(false)
    }
  }

  const displayValue = type === 'date' && value
    ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : type === 'select' && options
      ? options.find(o => o.value === value)?.label || value
      : value

  return (
    <div className="flex justify-between items-center gap-4 py-1.5 border-b border-luxury-gray-5/30 last:border-0 group">
      <span className="field-label shrink-0">{label}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          {type === 'select' && options ? (
            <select
              value={String(localValue)}
              onChange={e => setLocalValue(e.target.value)}
              onBlur={handleSave}
              autoFocus
              className="text-xs bg-white border border-luxury-gray-4 rounded px-2 py-1 text-luxury-gray-1"
            >
              <option value="">Select...</option>
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              type={type}
              value={String(localValue)}
              onChange={e => setLocalValue(e.target.value)}
              onBlur={handleSave}
              onKeyDown={handleKeyDown}
              autoFocus
              className="text-xs bg-white border border-luxury-gray-4 rounded px-2 py-1 text-luxury-gray-1 w-40 text-right"
            />
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-luxury-gray-1 text-right">{displayValue || '--'}</span>
          <button
            onClick={() => { setLocalValue(value ?? ''); setEditing(true) }}
            className="opacity-0 group-hover:opacity-100 text-luxury-gray-4 hover:text-luxury-accent transition-opacity"
            title="Edit"
          >
            <Pencil size={11} />
          </button>
        </div>
      )}
    </div>
  )
}

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
            <img
              src={previewUrl}
              alt="Check"
              className="w-full max-h-40 object-cover rounded-lg border border-luxury-gray-5"
            />
          </a>
          <label
            className={`absolute bottom-2 right-2 bg-white/90 border border-luxury-gray-5 rounded-lg px-2 py-1 flex items-center gap-1 text-xs font-medium text-luxury-gray-2 cursor-pointer shadow-sm hover:bg-white ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Camera size={11} />
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
        <label
          className={`mt-1 flex flex-col items-center justify-center gap-1.5 w-full py-5 border-2 border-dashed border-luxury-gray-5 rounded-lg cursor-pointer hover:border-luxury-accent transition-colors bg-luxury-light ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <p className="text-xs text-luxury-gray-3">Uploading...</p>
          ) : (
            <>
              <Camera size={18} className="text-luxury-gray-3" />
              <p className="text-xs text-luxury-gray-3">Upload check photo</p>
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
  const [editChecksData, setEditChecksData] = useState<Record<string, any>>({}) // checkId -> edit state
  const [expandedChecks, setExpandedChecks] = useState<Record<string, boolean>>({}) // checkId -> expanded
  const [addingCheck, setAddingCheck] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [showCloseDialog, setShowCloseDialog] = useState(false)
  const [emailDraft, setEmailDraft] = useState({ to: '', subject: '', body: '' })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [checklistExpanded, setChecklistExpanded] = useState(true)

  // External brokerages — fetched at page level for the payout reconciliation
  // calc (totalExternalCommissions). BrokeragesSection on the Check tab fetches
  // its own copy for rendering; minor duplication is OK.
  const [payoutBrokerages, setPayoutBrokerages] = useState<any[]>([])

  // Right panel section toggles
  const [expandedSections, setExpandedSections] = useState({
    transaction: true,
    agent: true,
    billing: true,
    team: true,
    referrals: true,
  })
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const toggleAgent = (id: string) => setExpandedAgents(p => ({ ...p, [id]: !p[id] }))

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Contacts state
  const [contacts, setContacts] = useState<any[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [contactModal, setContactModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null })
  const [contactForm, setContactForm] = useState({
    contact_type: '',
    contact_type_other: '',
    name: '',
    phone: '',
    email: '',
    company: '',
    notes: '',
  })
  const [savingContact, setSavingContact] = useState(false)

  // Auth
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => setUser(d.user))
      .catch(() => router.push('/auth/login'))
  }, [router])

  // Load data
  const loadData = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Failed to load')
      const json = await res.json()
      setData(json)
      // Init check edit state for all checks
      if (json.checks?.length > 0) {
        const editStates: Record<string, any> = {}
        const expandStates: Record<string, boolean> = {}
        json.checks.forEach((c: any, i: number) => {
          editStates[c.id] = { ...c }
          expandStates[c.id] = i === 0 // First check expanded by default
        })
        setEditChecksData(editStates)
        setExpandedChecks(expandStates)
      }
      // Fetch external brokerages for payoutBalance reconciliation calc
      fetch(`/api/admin/transactions/${id}?section=external_brokerages`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : { external_brokerages: [] })
        .then(d => setPayoutBrokerages(d.external_brokerages || []))
        .catch(() => setPayoutBrokerages([]))
    } catch {
      alert('Failed to load transaction')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  // Load contacts when switching to contacts tab
  useEffect(() => {
    if (activeTab !== 'contacts' || !id) return
    setLoadingContacts(true)
    fetch(`/api/admin/transactions/${id}?section=contacts`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { contacts: [] })
      .then(d => setContacts(d.contacts || []))
      .catch(() => {})
      .finally(() => setLoadingContacts(false))
  }, [activeTab, id])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const deleteInternalAgent = async (internalAgentId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_internal_agent', internal_agent_id: internalAgentId }),
      })
      if (res.ok) {
        setData((prev: any) => ({
          ...prev,
          agents: prev.agents.filter((a: any) => a.id !== internalAgentId),
        }))
        setDeleteConfirm(null)
      }
    } finally {
      setSaving(false)
    }
  }

  const updateTransaction = async (updates: any) => {
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_transaction', updates }),
      })
      setData((prev: any) => ({ ...prev, transaction: { ...prev.transaction, ...updates } }))
    } finally {
      setSaving(false)
    }
  }

  const updateCheck = async (checkId: string, updates: any) => {
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_check', check_id: checkId, updates }),
      })
      setData((prev: any) => ({
        ...prev,
        checks: (prev.checks || []).map((c: any) => c.id === checkId ? { ...c, ...updates } : c),
      }))
      setEditChecksData((prev) => ({
        ...prev,
        [checkId]: { ...prev[checkId], ...updates },
      }))
    } finally {
      setSaving(false)
    }
  }

  const addCheck = async () => {
    setAddingCheck(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_check',
          check: {
            transaction_id: id,
            check_amount: 0,
            payment_method: 'check',
            status: 'received',
            received_date: new Date().toISOString().split('T')[0],
            crc_transferred: false,
            agents_paid: false,
          },
        }),
      })
      if (res.ok) {
        const { check: newCheck } = await res.json()
        setData((prev: any) => ({
          ...prev,
          checks: [...(prev.checks || []), newCheck],
        }))
        setEditChecksData((prev) => ({
          ...prev,
          [newCheck.id]: { ...newCheck },
        }))
        setExpandedChecks((prev) => ({
          ...prev,
          [newCheck.id]: true, // Expand the new check
        }))
      }
    } finally {
      setAddingCheck(false)
    }
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
            ? {
                ...item,
                completion: !currentlyComplete
                  ? { completed_by: user?.id, completed_at: new Date().toISOString() }
                  : null,
              }
            : item
        ),
      }))
    } finally {
      setSaving(false)
    }
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
      // Find and update the check that contains this payout
      setData((prev: any) => ({
        ...prev,
        checks: (prev.checks || []).map((c: any) => ({
          ...c,
          check_payouts: (c.check_payouts || []).filter((p: any) => p.id !== payoutId),
        })),
      }))
    } finally {
      setSaving(false)
    }
  }

  const sendEmailAgent = async () => {
    setSendingEmail(true)
    try {
      // Use first check for email (or could be enhanced to select specific check)
      const firstCheck = data?.checks?.[0]
      const res = await fetch('/api/checks/notify-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_id: firstCheck?.id, ...emailDraft }),
      })
      if (!res.ok) throw new Error()
      setShowEmailModal(false)
      alert('Email sent.')
    } catch {
      alert('Failed to send email.')
    } finally {
      setSendingEmail(false)
    }
  }

  // ── Contact functions ─────────────────────────────────────────────────────────

  const openAddContact = () => {
    setContactForm({
      contact_type: '',
      contact_type_other: '',
      name: '',
      phone: '',
      email: '',
      company: '',
      notes: '',
    })
    setContactModal({ open: true, editing: null })
  }

  const openEditContact = (contact: any) => {
    setContactForm({
      contact_type: contact.contact_type || '',
      contact_type_other: contact.contact_type_other || '',
      name: contact.name || '',
      phone: Array.isArray(contact.phone) ? contact.phone.join(', ') : (contact.phone || ''),
      email: Array.isArray(contact.email) ? contact.email.join(', ') : (contact.email || ''),
      company: contact.company || '',
      notes: contact.notes || '',
    })
    setContactModal({ open: true, editing: contact })
  }

  const saveContact = async () => {
    if (!contactForm.contact_type) {
      alert('Please select a contact type.')
      return
    }
    setSavingContact(true)
    try {
      const phoneArr = contactForm.phone ? contactForm.phone.split(',').map(p => p.trim()).filter(Boolean) : null
      const emailArr = contactForm.email ? contactForm.email.split(',').map(e => e.trim()).filter(Boolean) : null
      
      const payload = {
        contact_type: contactForm.contact_type,
        contact_type_other: contactForm.contact_type === 'other' ? contactForm.contact_type_other : null,
        name: contactForm.name || null,
        phone: phoneArr,
        email: emailArr,
        company: contactForm.company || null,
        notes: contactForm.notes || null,
      }

      if (contactModal.editing) {
        await fetch(`/api/admin/transactions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_contact', contact_id: contactModal.editing.id, updates: payload }),
        })
        setContacts(prev => prev.map(c => c.id === contactModal.editing.id ? { ...c, ...payload } : c))
      } else {
        const res = await fetch(`/api/admin/transactions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create_contact', contact: payload }),
        })
        const result = await res.json()
        if (result.contact) {
          setContacts(prev => [...prev, result.contact])
        }
      }
      setContactModal({ open: false, editing: null })
    } catch {
      alert('Failed to save contact.')
    } finally {
      setSavingContact(false)
    }
  }

  const deleteContact = async (contactId: string) => {
    if (!confirm('Delete this contact?')) return
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_contact', contact_id: contactId }),
      })
      setContacts(prev => prev.filter(c => c.id !== contactId))
    } finally {
      setSaving(false)
    }
  }

  // ── Computed values ──────────────────────────────────────────────────────────

  const txn = data?.transaction
  const primaryAgent = data?.primary_agent
  const agentBilling = data?.agent_billing
  const teamInfo = data?.team_info
  const checks: any[] = data?.checks || []
  const checklist = data?.checklist || []
  const settings = data?.company_settings
  const agents = data?.agents || []

  // Pay-by date calculation - requires BOTH received date and compliance complete date
  const payByDate = (() => {
    if (checks.length === 0) return null
    let latestReceived: Date | null = null
    let latestCompliance: Date | null = null
    for (const c of checks) {
      if (c.received_date) {
        const d = new Date(c.received_date)
        if (!latestReceived || d > latestReceived) latestReceived = d
      }
      if (c.compliance_complete_date) {
        const d = new Date(c.compliance_complete_date)
        if (!latestCompliance || d > latestCompliance) latestCompliance = d
      }
    }
    // Must have BOTH dates to calculate pay-by
    if (!latestReceived || !latestCompliance) return null
    const base = latestCompliance > latestReceived ? latestCompliance : latestReceived
    return addBusinessDays(base, 10)
  })()
  const daysUntilPay = payByDate ? getBusinessDaysUntil(payByDate.toISOString()) : null

  // Sum totals across all checks
  const totalCheckPayouts = checks.reduce(
    (s: number, c: any) => s + (c.check_payouts || []).reduce((ps: number, p: any) => ps + parseFloat(p.amount || 0), 0),
    0
  )
  const totalCheckAmount = checks.reduce((s: number, c: any) => s + parseFloat(c.check_amount || 0), 0)
  const totalBrokerageAmount = checks.reduce((s: number, c: any) => s + parseFloat(c.brokerage_amount || 0), 0)
  const totalAgentNets = agents.reduce((s: number, a: any) => s + parseFloat(a.agent_net || 0), 0)
  const totalExternalCommissions = payoutBrokerages.reduce((s: number, b: any) => s + parseFloat(b.commission_amount || 0), 0)
  const payoutBalance = totalCheckAmount - totalBrokerageAmount - totalAgentNets - totalExternalCommissions - totalCheckPayouts

  const completedCount = checklist.filter((i: any) => i.completion).length

  const leaseTransaction = txn ? isLease(txn.transaction_type) : false

  // Helper functions for multi-check editing
  const getCheckEditData = (checkId: string) => editChecksData[checkId] || {}
  const updateCheckField = (checkId: string, field: string, value: any) => {
    setEditChecksData(prev => ({
      ...prev,
      [checkId]: { ...prev[checkId], [field]: value },
    }))
  }
  const toggleCheckExpanded = (checkId: string) => {
    setExpandedChecks(prev => ({ ...prev, [checkId]: !prev[checkId] }))
  }

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

  if (!user || loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-sm text-luxury-gray-3">Loading...</p>
      </div>
    )

  if (!txn)
    return (
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
    { key: 'check_payouts', label: 'Check & Payouts', show: true },
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
          <button
            onClick={() => router.push('/transactions')}
            className="flex items-center gap-1.5 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> Back to Transactions
          </button>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-luxury-gray-1 leading-tight">{addrStreet}</p>
              {addrCity && <p className="text-xs text-luxury-gray-3">{addrCity}</p>}
            </div>
            <div className="flex items-center gap-2">
              {txn.status !== 'closed' && (
                <button
                  onClick={() => setShowCloseDialog(true)}
                  className="btn btn-primary text-xs px-3 py-1.5"
                >
                  Close Transaction
                </button>
              )}
              <StatusBadge status={txn.status as TransactionStatus} />
            </div>
          </div>
          <div className="flex gap-1 mt-1.5 flex-wrap">
            <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">
              {formatTransactionType(txn.transaction_type)}
            </span>
            {txn.office_location && (
              <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">
                {txn.office_location}
              </span>
            )}
          </div>
        </div>
        <div className="flex overflow-x-auto px-3 pb-0 gap-0 border-t border-luxury-gray-5/50">
          {navTabs
            .filter(t => t.show)
            .map(tab => (
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
          <button
            onClick={() => router.push('/transactions')}
            className="flex items-center gap-1.5 text-xs text-luxury-gray-3 hover:text-luxury-gray-1 mb-5 transition-colors"
          >
            <ArrowLeft size={13} /> Back to Transactions
          </button>

          {/* Property card */}
          <div className="container-card mb-4 p-3">
            <p className="text-sm font-semibold text-luxury-gray-1 leading-tight">{addrStreet}</p>
            {addrCity && (
              <p className="text-xs text-luxury-gray-3 mt-0.5 leading-tight">{addrCity}</p>
            )}
            <div className="mt-2">
              <StatusBadge status={txn.status as TransactionStatus} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-xs bg-luxury-gray-5/40 text-luxury-gray-2 px-1.5 py-0.5 rounded">
                {formatTransactionType(txn.transaction_type) || 'Unknown type'}
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
            {navTabs
              .filter(t => t.show)
              .map(tab => (
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
                  {tab.key === 'check_payouts' && checks.length > 0 && (
                    <span className="ml-1 text-xs opacity-70">
                      ({checks.length} check{checks.length !== 1 ? 's' : ''})
                    </span>
                  )}
                  {tab.key === 'check_payouts' && checks.length === 0 && (
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
                  <EditableFieldRow
                    label="Property"
                    value={txn.property_address}
                    field="property_address"
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <EditableFieldRow
                    label="Type"
                    value={txn.transaction_type}
                    field="transaction_type"
                    type="select"
                    options={TRANSACTION_TYPE_OPTIONS}
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <div className="flex justify-between items-center gap-4 py-1.5 border-b border-luxury-gray-5/30">
                    <span className="field-label shrink-0">Status</span>
                    <select
                      value={txn.status || ''}
                      onChange={e => updateTransaction({ status: e.target.value })}
                      className="text-xs bg-transparent border border-luxury-gray-5 rounded px-2 py-1 text-luxury-gray-1 cursor-pointer"
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b border-luxury-gray-5/30">
                    <span className="field-label shrink-0">Compliance</span>
                    <select
                      value={txn.compliance_status || 'not_submitted'}
                      onChange={e => updateTransaction({ compliance_status: e.target.value })}
                      className={`text-xs px-2 py-0.5 rounded border-0 cursor-pointer ${
                        txn.compliance_status === 'complete'
                          ? 'bg-green-50 text-green-700'
                          : txn.compliance_status === 'incomplete'
                            ? 'bg-red-50 text-red-600'
                            : txn.compliance_status === 'in_review'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-luxury-light text-luxury-gray-3'
                      }`}
                    >
                      <option value="not_submitted">Not requested</option>
                      <option value="in_review">In review</option>
                      <option value="incomplete">Incomplete</option>
                      <option value="complete">Complete</option>
                    </select>
                  </div>
                  <FieldRow
                    label="Representing"
                    value={txn.representation_type?.replace(/_/g, ' ')}
                  />
                  <FieldRow label="Lead Source" value={txn.lead_source?.replace(/_/g, ' ')} />
                  <EditableFieldRow
                    label="Office"
                    value={txn.office_location}
                    field="office_location"
                    type="select"
                    options={[
                      { value: 'Houston', label: 'Houston' },
                      { value: 'Dallas', label: 'Dallas' },
                    ]}
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  {txn.mls_link && (
                    <FieldRow
                      label="MLS Link"
                      value={
                        <a
                          href={txn.mls_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-luxury-accent hover:underline text-xs"
                        >
                          View <ExternalLink size={10} />
                        </a>
                      }
                    />
                  )}
                </div>
              </div>

              {/* Financials */}
              <div className="container-card">
                <SectionHeader>Financials</SectionHeader>
                <div className="space-y-0">
                  {leaseTransaction ? (
                    <>
                      <EditableFieldRow
                        label="Monthly Rent"
                        value={txn.monthly_rent}
                        field="monthly_rent"
                        type="number"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Lease Term"
                        value={txn.lease_term}
                        field="lease_term"
                        type="number"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Move-In Date"
                        value={txn.move_in_date}
                        field="move_in_date"
                        type="date"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Sales Volume"
                        value={txn.sales_volume}
                        field="sales_volume"
                        type="number"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                    </>
                  ) : (
                    <>
                      <EditableFieldRow
                        label="Sales Price"
                        value={txn.sales_price}
                        field="sales_price"
                        type="number"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Sales Volume"
                        value={txn.sales_volume}
                        field="sales_volume"
                        type="number"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Closing Date"
                        value={txn.closing_date}
                        field="closing_date"
                        type="date"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                      <EditableFieldRow
                        label="Closed Date"
                        value={txn.closed_date}
                        field="closed_date"
                        type="date"
                        onSave={(f, v) => updateTransaction({ [f]: v })}
                      />
                    </>
                  )}
                  <EditableFieldRow
                    label="Gross Commission"
                    value={txn.gross_commission}
                    field="gross_commission"
                    type="number"
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <EditableFieldRow
                    label="Listing Side"
                    value={txn.listing_side_commission}
                    field="listing_side_commission"
                    type="number"
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <EditableFieldRow
                    label="Buying Side"
                    value={txn.buying_side_commission}
                    field="buying_side_commission"
                    type="number"
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <EditableFieldRow
                    label="Office Gross"
                    value={txn.office_gross}
                    field="office_gross"
                    type="number"
                    onSave={(f, v) => updateTransaction({ [f]: v })}
                  />
                  <FieldRow
                    label="Office Net"
                    value={
                      <span className="font-semibold text-green-600">{fmt$(txn.office_net)}</span>
                    }
                  />
                  {txn.bonus_amount > 0 && (
                    <FieldRow label="Bonus" value={fmt$(txn.bonus_amount)} />
                  )}
                  {txn.rebate_amount > 0 && (
                    <FieldRow label="Rebate" value={fmt$(txn.rebate_amount)} />
                  )}
                  {txn.has_btsa && <FieldRow label="BTSA" value={fmt$(txn.btsa_amount)} />}
                  {txn.expedite_requested && (
                    <FieldRow label="Expedite Fee" value={fmt$(txn.expedite_fee)} />
                  )}
                  {txn.internal_referral && (
                    <FieldRow
                      label="Internal Referral Fee"
                      value={fmt$(txn.internal_referral_fee)}
                    />
                  )}
                  {txn.external_referral && (
                    <FieldRow
                      label="External Referral Fee"
                      value={fmt$(txn.external_referral_fee)}
                    />
                  )}
                </div>
              </div>

              {/* Key Dates */}
              <div className="container-card">
                <SectionHeader>Key Dates</SectionHeader>
                <div className="space-y-0">
                  <FieldRow label="Created" value={fmtDate(txn.created_at)} />
                  <FieldRow label="Acceptance Date" value={fmtDate(txn.acceptance_date)} />
                  {!leaseTransaction && (
                    <div className="flex justify-between items-center gap-4 py-1.5 border-b border-luxury-gray-5/30">
                      <span className="field-label shrink-0">Closing Date</span>
                      <input
                        type="date"
                        value={txn.closing_date || ''}
                        onChange={e => updateTransaction({ closing_date: e.target.value || null })}
                        className="text-xs bg-transparent border border-luxury-gray-5 rounded px-2 py-1 text-luxury-gray-1 cursor-pointer"
                      />
                    </div>
                  )}
                  {leaseTransaction && (
                    <div className="flex justify-between items-center gap-4 py-1.5 border-b border-luxury-gray-5/30">
                      <span className="field-label shrink-0">Move-In Date</span>
                      <input
                        type="date"
                        value={txn.move_in_date || ''}
                        onChange={e => updateTransaction({ move_in_date: e.target.value || null })}
                        className="text-xs bg-transparent border border-luxury-gray-5 rounded px-2 py-1 text-luxury-gray-1 cursor-pointer"
                      />
                    </div>
                  )}
                  {txn.compliance_submitted_at && (
                    <FieldRow
                      label="Compliance Submitted"
                      value={fmtDate(txn.compliance_submitted_at)}
                    />
                  )}
                  {txn.compliance_approved_at && (
                    <FieldRow
                      label="Compliance Approved"
                      value={fmtDate(txn.compliance_approved_at)}
                    />
                  )}
                  {txn.broker_approved_at && (
                    <FieldRow label="Broker Approved" value={fmtDate(txn.broker_approved_at)} />
                  )}
                  {txn.goal_paydate && (
                    <FieldRow label="Goal Pay Date" value={fmtDate(txn.goal_paydate)} />
                  )}
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
                          <p className="text-xs font-semibold text-luxury-gray-1">
                            {fmtName(a.user)}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            {a.agent_role?.replace(/_/g, ' ')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold text-luxury-gray-1">
                            {fmt$(a.agent_net)}
                          </p>
                          <p
                            className={`text-xs ${a.payment_status === 'paid' ? 'text-green-600' : 'text-orange-500'}`}
                          >
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

              {/* Summary cards */}
              <div className="container-card">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Office Gross</p>
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {fmt$(txn.office_gross)}
                    </p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Total Agent Payouts</p>
                    <p className="text-sm font-semibold text-luxury-gray-1">
                      {fmt$(
                        agents.reduce((s: number, a: any) => s + parseFloat(a.agent_net || 0), 0)
                      )}
                    </p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-xs text-luxury-gray-3 mb-0.5">Brokerage Net</p>
                    <p className="text-sm font-semibold text-green-600">{fmt$(txn.office_net)}</p>
                  </div>
                </div>

                <AgentsSection
                  transactionId={id}
                  transaction={txn}
                  agents={agents}
                  onRefresh={loadData}
                />

                {/* Document generation buttons */}
                {agents.length > 0 && (
                  <div className="flex gap-2 mt-4 pt-4 border-t border-luxury-gray-5/50">
                    <button className="btn btn-secondary text-xs flex items-center gap-1.5">
                      <FileText size={12} />
                      Commission Statement
                    </button>
                    {!leaseTransaction && (
                      <button className="btn btn-secondary text-xs flex items-center gap-1.5">
                        <FileText size={12} />
                        Generate CDA
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── CHECK & PAYOUTS TAB ──────────────────────────────────────── */}
          {activeTab === 'check_payouts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h1 className="page-title">CHECK & PAYOUTS</h1>
                <button
                  onClick={addCheck}
                  disabled={addingCheck}
                  className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                >
                  {addingCheck ? 'Adding...' : '+ Add Check'}
                </button>
              </div>

              {/* No checks yet */}
              {checks.length === 0 && (
                <div className="container-card text-center py-8">
                  <p className="text-sm text-luxury-gray-3 mb-3">
                    No check linked to this transaction yet.
                  </p>
                  <button
                    onClick={addCheck}
                    disabled={addingCheck}
                    className="btn btn-primary text-xs px-4 py-2 disabled:opacity-50"
                  >
                    {addingCheck ? 'Creating...' : '+ Create Check'}
                  </button>
                </div>
              )}

              {/* Checks exist */}
              {checks.length > 0 && (
                <>
                  {/* Pay-by countdown */}
                  {payByDate && (
                    <div
                      className={`inner-card flex items-center gap-3 ${
                        daysUntilPay != null && daysUntilPay <= 2
                          ? 'border border-red-200 bg-red-50/30'
                          : daysUntilPay != null && daysUntilPay <= 5
                            ? 'border border-orange-200 bg-orange-50/30'
                            : 'border border-green-200 bg-green-50/30'
                      }`}
                    >
                      <AlertCircle
                        size={16}
                        className={
                          daysUntilPay != null && daysUntilPay <= 2
                            ? 'text-red-500'
                            : daysUntilPay != null && daysUntilPay <= 5
                              ? 'text-orange-500'
                              : 'text-green-600'
                        }
                      />
                      <div>
                        <p className="text-xs font-semibold text-luxury-gray-1">
                          Pay by{' '}
                          {payByDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                        <p className="text-xs text-luxury-gray-3">
                          {daysUntilPay != null
                            ? daysUntilPay <= 0
                              ? 'Overdue'
                              : `${daysUntilPay} business day${daysUntilPay !== 1 ? 's' : ''} remaining`
                            : '10 business days from received date or compliance complete (whichever is later)'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Check cards */}
                  {checks.map((check, checkIndex) => {
                    const checkEdit = getCheckEditData(check.id)
                    const isExpanded = expandedChecks[check.id] ?? (checkIndex === 0)
                    const checkAmount = parseFloat(check.check_amount || 0)
                    
                    return (
                      <div key={check.id} className="container-card">
                        {/* Collapsible header */}
                        <button
                          onClick={() => toggleCheckExpanded(check.id)}
                          className="flex items-center justify-between w-full mb-3"
                        >
                          <div className="flex items-center gap-3">
                            <SectionHeader>Check {checkIndex + 1}</SectionHeader>
                            <span className="text-sm font-semibold text-luxury-accent">{fmt$(checkAmount)}</span>
                            {check.check_from && (
                              <span className="text-xs text-luxury-gray-3">from {check.check_from}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${
                              check.status === 'cleared' ? 'text-green-600' :
                              check.status === 'deposited' ? 'text-blue-600' : 'text-amber-600'
                            }`}>
                              {check.status || 'received'}
                            </span>
                            {isExpanded ? (
                              <ChevronUp size={14} className="text-luxury-gray-3" />
                            ) : (
                              <ChevronDown size={14} className="text-luxury-gray-3" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                              <div>
                                <label className="field-label">Check Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-luxury text-xs"
                                  value={checkEdit.check_amount || ''}
                                  onChange={e => updateCheckField(check.id, 'check_amount', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { check_amount: checkEdit.check_amount })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Check From</label>
                                <input
                                  type="text"
                                  className="input-luxury text-xs"
                                  value={checkEdit.check_from || ''}
                                  onChange={e => updateCheckField(check.id, 'check_from', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { check_from: checkEdit.check_from })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Check #</label>
                                <input
                                  type="text"
                                  className="input-luxury text-xs"
                                  value={checkEdit.check_number || ''}
                                  onChange={e => updateCheckField(check.id, 'check_number', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { check_number: checkEdit.check_number })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Received</label>
                                <input
                                  type="date"
                                  className="input-luxury text-xs"
                                  value={checkEdit.received_date || ''}
                                  onChange={e => updateCheckField(check.id, 'received_date', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { received_date: checkEdit.received_date })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Deposited</label>
                                <input
                                  type="date"
                                  className="input-luxury text-xs"
                                  value={checkEdit.deposited_date || ''}
                                  onChange={e => updateCheckField(check.id, 'deposited_date', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { deposited_date: checkEdit.deposited_date })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Cleared</label>
                                <input
                                  type="date"
                                  className="input-luxury text-xs"
                                  value={checkEdit.cleared_date || ''}
                                  onChange={e => updateCheckField(check.id, 'cleared_date', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { cleared_date: checkEdit.cleared_date })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Compliance Complete</label>
                                <input
                                  type="date"
                                  className="input-luxury text-xs"
                                  value={checkEdit.compliance_complete_date || ''}
                                  onChange={e => updateCheckField(check.id, 'compliance_complete_date', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { compliance_complete_date: checkEdit.compliance_complete_date })}
                                />
                              </div>
                              <div>
                                <label className="field-label">Brokerage Amount</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  className="input-luxury text-xs"
                                  value={checkEdit.brokerage_amount || ''}
                                  onChange={e => updateCheckField(check.id, 'brokerage_amount', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { brokerage_amount: checkEdit.brokerage_amount })}
                                />
                              </div>
                            </div>

                            {/* Payment Method + Funds Status */}
                            <div className="grid grid-cols-3 gap-3 mb-3">
                              <div>
                                <label className="field-label">Payment Type</label>
                                <select
                                  className="select-luxury text-xs"
                                  value={checkEdit.payment_method || 'check'}
                                  onChange={e => {
                                    updateCheckField(check.id, 'payment_method', e.target.value)
                                    updateCheck(check.id, { payment_method: e.target.value })
                                  }}
                                >
                                  <option value="check">Check</option>
                                  <option value="zelle">Zelle</option>
                                  <option value="payload">Payload</option>
                                  <option value="ecommission">eCommission</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Funds Status</label>
                                <select
                                  className="select-luxury text-xs"
                                  value={checkEdit.status || 'received'}
                                  onChange={e => {
                                    updateCheckField(check.id, 'status', e.target.value)
                                    updateCheck(check.id, { status: e.target.value })
                                  }}
                                >
                                  <option value="received">Received</option>
                                  <option value="deposited">Deposited</option>
                                  <option value="cleared">Cleared</option>
                                </select>
                              </div>
                              <div>
                                <label className="field-label">Compliance Status</label>
                                <select
                                  className="select-luxury text-xs"
                                  value={txn.compliance_status || 'not_submitted'}
                                  onChange={async e => {
                                    const status = e.target.value
                                    await updateTransaction({ compliance_status: status })
                                    const updates: any = {}
                                    if (status === 'complete') {
                                      updates.compliance_complete_date = new Date().toISOString().split('T')[0]
                                    } else if (status === 'not_submitted') {
                                      updates.compliance_complete_date = null
                                    }
                                    if (Object.keys(updates).length > 0) {
                                      await updateCheck(check.id, updates)
                                    }
                                  }}
                                >
                                  <option value="not_submitted">Not Requested</option>
                                  <option value="in_review">In Review</option>
                                  <option value="incomplete">Incomplete</option>
                                  <option value="complete">Complete</option>
                                </select>
                              </div>
                            </div>

                            {/* CRC Transferred toggle */}
                            <div className="flex items-center justify-between inner-card mb-3">
                              <div>
                                <p className="text-xs font-semibold text-luxury-gray-1">CRC Transferred</p>
                                <p className="text-xs text-luxury-gray-3">
                                  Brokerage portion moved to CRC account
                                </p>
                              </div>
                              <button
                                onClick={() => updateCheck(check.id, { crc_transferred: !check.crc_transferred })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${check.crc_transferred ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${check.crc_transferred ? 'translate-x-6' : 'translate-x-1'}`}
                                />
                              </button>
                            </div>

                            {/* Agents Paid toggle */}
                            <div className="flex items-center justify-between inner-card mb-3">
                              <div>
                                <p className="text-xs font-semibold text-luxury-gray-1">Agents Paid</p>
                                <p className="text-xs text-luxury-gray-3">
                                  All agents paid - removes from payouts report
                                </p>
                              </div>
                              <button
                                onClick={() => updateCheck(check.id, { agents_paid: !check.agents_paid })}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${check.agents_paid ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${check.agents_paid ? 'translate-x-6' : 'translate-x-1'}`}
                                />
                              </button>
                            </div>

                            {/* Notes */}
                            <div>
                              <label className="field-label">Notes</label>
                              <textarea
                                className="input-luxury text-xs"
                                rows={2}
                                value={checkEdit.notes || ''}
                                onChange={e => updateCheckField(check.id, 'notes', e.target.value)}
                                onBlur={() => updateCheck(check.id, { notes: checkEdit.notes })}
                              />
                            </div>

                            {/* Check photo */}
                            <div className="mt-3">
                              <CheckImageUpload
                                checkId={check.id}
                                existingUrl={check.check_image_url}
                                transactionFolderPath={txn.onedrive_folder_url}
                                onUploaded={url => updateCheck(check.id, { check_image_url: url })}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}

                  {/* Payouts */}
                  <div className="container-card">
                    <div className="flex items-center justify-between mb-3">
                      <SectionHeader>Payouts</SectionHeader>
                      <div className="text-right">
                        <p className="text-xs text-luxury-gray-3">Balance</p>
                        <p
                          className={`text-sm font-bold ${payoutBalance < 0 ? 'text-red-500' : payoutBalance === 0 ? 'text-green-600' : 'text-luxury-accent'}`}
                        >
                          {fmt$(payoutBalance)}
                        </p>
                      </div>
                    </div>

                    {/* Summary row */}
                    <div className="inner-card flex justify-between items-center mb-3">
                      <span className="text-xs text-luxury-gray-3">Total Check Amount ({checks.length} check{checks.length !== 1 ? 's' : ''})</span>
                      <span className="text-xs font-semibold text-luxury-gray-1">
                        {fmt$(totalCheckAmount)}
                      </span>
                    </div>

                    {totalBrokerageAmount > 0 && (
                      <div className="inner-card flex justify-between items-center mb-2">
                        <div>
                          <p className="text-xs font-semibold text-luxury-gray-1">CRC Brokerage</p>
                          <p className="text-xs text-luxury-gray-3">brokerage split</p>
                        </div>
                        <span className="text-xs font-semibold text-luxury-gray-1">{fmt$(totalBrokerageAmount)}</span>
                      </div>
                    )}

                    {/* Internal agents */}
                    {agents.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {agents.map((a: any) => {
                          const name = a.user
                            ? `${a.user.preferred_first_name || a.user.first_name} ${a.user.preferred_last_name || a.user.last_name}`
                            : a.agent_id || 'Agent'
                          return (
                            <div key={a.id} className="inner-card flex items-center justify-between">
                              <div>
                                <p className="text-xs font-semibold text-luxury-gray-1">{name}</p>
                                <p className="text-xs text-luxury-gray-3">
                                  {a.agent_role?.replace(/_/g, ' ')} · {a.payment_status || 'pending'}
                                </p>
                                {a.payment_date && (
                                  <p className="text-xs text-luxury-gray-3">{fmtDate(a.payment_date)}</p>
                                )}
                              </div>
                              <span className="text-xs font-semibold text-luxury-gray-1">
                                {fmt$(parseFloat(a.agent_net || 0))}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* External brokerages */}
                    <BrokeragesSection
                      transactionId={id}
                      onRefresh={loadData}
                    />

                    {/* Existing manual check_payouts from all checks */}
                    {checks.flatMap(c => c.check_payouts || []).length > 0 && (
                      <div className="space-y-2 mb-2">
                        {checks.flatMap(c => c.check_payouts || []).map((p: any) => (
                          <div
                            key={p.id}
                            className="inner-card flex items-center justify-between group"
                          >
                            <div>
                              <p className="text-xs font-semibold text-luxury-gray-1">
                                {p.payee_name || p.payee_type}
                              </p>
                              <p className="text-xs text-luxury-gray-3">
                                {p.payee_type?.replace(/_/g, ' ')} · {p.payment_status}
                              </p>
                              {p.payment_date && (
                                <p className="text-xs text-luxury-gray-3">
                                  {fmtDate(p.payment_date)}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-luxury-gray-1">
                                {fmt$(p.amount)}
                              </span>
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
                    )}

                    {agents.length === 0 && payoutBrokerages.length === 0 && checks.flatMap(c => c.check_payouts || []).length === 0 && (
                      <p className="text-xs text-luxury-gray-3 text-center py-3">
                        No payouts recorded yet.
                      </p>
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
                        {checklistExpanded ? (
                          <ChevronUp size={14} className="text-luxury-gray-3" />
                        ) : (
                          <ChevronDown size={14} className="text-luxury-gray-3" />
                        )}
                      </button>
                      {checklistExpanded && (
                        <div className="space-y-1.5">
                          {checklist.map((item: any) => (
                            <div
                              key={item.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors ${item.completion ? 'bg-green-50/50' : 'hover:bg-luxury-light'}`}
                              onClick={() => toggleChecklist(item.id, !!item.completion)}
                            >
                              <div
                                className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border transition-colors ${item.completion ? 'bg-green-500 border-green-500' : 'border-luxury-gray-4 bg-white'}`}
                              >
                                {item.completion && <Check size={10} className="text-white" />}
                              </div>
                              <div className="flex-1">
                                <p
                                  className={`text-xs font-medium ${item.completion ? 'line-through text-luxury-gray-3' : 'text-luxury-gray-1'}`}
                                >
                                  {item.label}
                                </p>
                                {item.description && (
                                  <p className="text-xs text-luxury-gray-3 mt-0.5">
                                    {item.description}
                                  </p>
                                )}
                                {item.section && (
                                  <p className="text-xs text-luxury-gray-4 mt-0.5">
                                    {item.section}
                                  </p>
                                )}
                              </div>
                              {item.completion && (
                                <p className="text-xs text-luxury-gray-3 shrink-0">
                                  {fmtDate(item.completion.completed_at)}
                                </p>
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
              <div className="flex items-center justify-between">
                <h1 className="page-title">CONTACTS</h1>
                <button onClick={openAddContact} className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                  <Plus size={13} /> Add Contact
                </button>
              </div>

              {loadingContacts ? (
                <div className="container-card text-center py-6">
                  <p className="text-xs text-luxury-gray-3">Loading contacts...</p>
                </div>
              ) : contacts.length === 0 ? (
                <div className="container-card text-center py-6">
                  <p className="text-xs text-luxury-gray-3 mb-3">No contacts added yet.</p>
                  <button onClick={openAddContact} className="btn btn-primary text-xs px-4 py-2">
                    <Plus size={13} className="inline mr-1" /> Add First Contact
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {contacts.map((contact: any) => (
                    <div key={contact.id} className="container-card">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-luxury-gray-1">
                              {contact.name || 'Unnamed'}
                            </span>
                            <span className="text-xs bg-luxury-gray-5 text-luxury-gray-2 px-2 py-0.5 rounded">
                              {contact.contact_type === 'other' ? contact.contact_type_other : contact.contact_type?.replace(/_/g, ' ')}
                            </span>
                          </div>
                          {contact.company && (
                            <p className="text-xs text-luxury-gray-3 mb-1">{contact.company}</p>
                          )}
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                            {contact.email && (Array.isArray(contact.email) ? contact.email : [contact.email]).map((e: string, i: number) => (
                              <a key={i} href={`mailto:${e}`} className="text-xs text-luxury-accent hover:underline flex items-center gap-1">
                                <Mail size={11} /> {e}
                              </a>
                            ))}
                            {contact.phone && (Array.isArray(contact.phone) ? contact.phone : [contact.phone]).map((p: string, i: number) => (
                              <a key={i} href={`tel:${p}`} className="text-xs text-luxury-accent hover:underline flex items-center gap-1">
                                <Phone size={11} /> {p}
                              </a>
                            ))}
                          </div>
                          {contact.notes && (
                            <p className="text-xs text-luxury-gray-3 mt-2 italic">{contact.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <button
                            onClick={() => openEditContact(contact)}
                            className="text-luxury-gray-3 hover:text-luxury-accent transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="text-luxury-gray-3 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Contact Modal */}
              {contactModal.open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                    <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5">
                      <h2 className="text-sm font-semibold text-luxury-gray-1">
                        {contactModal.editing ? 'Edit Contact' : 'Add Contact'}
                      </h2>
                      <button onClick={() => setContactModal({ open: false, editing: null })} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                        <X size={16} />
                      </button>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <label className="field-label">Contact Type *</label>
                        <select
                          className="select-luxury text-xs"
                          value={contactForm.contact_type}
                          onChange={e => setContactForm(p => ({ ...p, contact_type: e.target.value }))}
                        >
                          <option value="">Select...</option>
                          <option value="buyer">Buyer</option>
                          <option value="seller">Seller</option>
                          <option value="tenant">Tenant</option>
                          <option value="landlord">Landlord</option>
                          <option value="title_company">Title Company</option>
                          <option value="title_officer">Title Officer</option>
                          <option value="lender">Lender</option>
                          <option value="loan_officer">Loan Officer</option>
                          <option value="attorney">Attorney</option>
                          <option value="inspector">Inspector</option>
                          <option value="appraiser">Appraiser</option>
                          <option value="cooperating_agent">Cooperating Agent</option>
                          <option value="property_manager">Property Manager</option>
                          <option value="hoa">HOA</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      {contactForm.contact_type === 'other' && (
                        <div>
                          <label className="field-label">Specify Type</label>
                          <input
                            type="text"
                            className="input-luxury text-xs"
                            value={contactForm.contact_type_other}
                            onChange={e => setContactForm(p => ({ ...p, contact_type_other: e.target.value }))}
                            placeholder="e.g. Surveyor"
                          />
                        </div>
                      )}
                      <div>
                        <label className="field-label">Name</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={contactForm.name}
                          onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Contact name"
                        />
                      </div>
                      <div>
                        <label className="field-label">Company</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={contactForm.company}
                          onChange={e => setContactForm(p => ({ ...p, company: e.target.value }))}
                          placeholder="Company name"
                        />
                      </div>
                      <div>
                        <label className="field-label">Email(s)</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={contactForm.email}
                          onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))}
                          placeholder="email@example.com (comma-separated for multiple)"
                        />
                      </div>
                      <div>
                        <label className="field-label">Phone(s)</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={contactForm.phone}
                          onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}
                          placeholder="(555) 123-4567 (comma-separated for multiple)"
                        />
                      </div>
                      <div>
                        <label className="field-label">Notes</label>
                        <textarea
                          className="input-luxury text-xs"
                          rows={2}
                          value={contactForm.notes}
                          onChange={e => setContactForm(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Additional notes..."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
                      <button
                        onClick={saveContact}
                        disabled={savingContact}
                        className="btn btn-primary text-xs flex-1 disabled:opacity-50"
                      >
                        {savingContact ? 'Saving...' : contactModal.editing ? 'Update Contact' : 'Add Contact'}
                      </button>
                      <button
                        onClick={() => setContactModal({ open: false, editing: null })}
                        disabled={savingContact}
                        className="btn btn-secondary text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── DOCUMENTS TAB ────────────────────────────────────────────── */}
          {activeTab === 'documents' && (
            <div className="space-y-4">
              <h1 className="page-title">DOCUMENTS</h1>
              {txn.onedrive_folder_url && (
                <div className="container-card">
                  <a
                    href={txn.onedrive_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-luxury-accent hover:underline text-sm"
                  >
                    <ExternalLink size={14} /> Open OneDrive Folder
                  </a>
                </div>
              )}
              <div className="container-card">
                <p className="text-xs text-luxury-gray-3 text-center py-6">
                  Document management coming soon.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Right Panel ────────────────────────────────────────────────────── */}
        <div className="md:w-72 md:flex-shrink-0 border-t md:border-t-0 md:border-l border-luxury-gray-5 p-4 space-y-3 bg-white">
          {/* Agents - sorted: listing, primary, team lead, referral */}
          {agents.length > 0 && [...agents].sort((a: any, b: any) => {
            const order: Record<string, number> = {
              listing_agent: 0, primary_agent: 1, team_lead: 2,
              referral_agent: 3, co_agent: 4,
            }
            return (order[a.agent_role] ?? 9) - (order[b.agent_role] ?? 9)
          }).map((a: any) => {
            const u = a.user
            const isExpanded = expandedAgents[a.id] !== false
            const agentRoleLabel = (role: string) => {
              const map: Record<string, string> = {
                primary_agent: 'Primary Agent', co_agent: 'Co-Agent',
                listing_agent: 'Listing Agent', team_lead: 'Team Lead',
                referral_agent: 'Referral Agent',
              }
              return map[role] || role?.replace(/_/g, ' ') || 'Agent'
            }
            return (
              <div key={a.id} className="container-card p-3">
                <button
                  className="flex items-center justify-between w-full mb-2"
                  onClick={() => toggleAgent(a.id)}
                >
                  <span className="section-title flex items-center gap-1.5">
                    <User size={12} /> {agentRoleLabel(a.agent_role)}
                  </span>
                  {isExpanded ? (
                    <ChevronUp size={12} className="text-luxury-gray-3" />
                  ) : (
                    <ChevronDown size={12} className="text-luxury-gray-3" />
                  )}
                </button>
                {isExpanded && (
                  <>
                    {u?.headshot_url && (
                      <img
                        src={u.headshot_url}
                        alt=""
                        className="w-12 h-12 rounded-full object-cover object-top mb-2 border border-luxury-gray-5"
                      />
                    )}
                    <p className="text-sm font-semibold text-luxury-gray-1 mb-0.5">
                      {u ? fmtName(u) : (a.agent_id || 'Unknown Agent')}
                    </p>
                    <p className="text-xs text-luxury-gray-3 mb-2">
                      {u?.office_email || u?.email || ''}
                    </p>
                    {u && (
                      <div className="space-y-0">
                        <FieldRow label="Office" value={u.office} />
                        <FieldRow label="Commission Plan" value={u.commission_plan} />
                        <FieldRow label="Division" value={u.division} />
                        <FieldRow label="License #" value={u.license_number} />
                        <FieldRow label="License Exp" value={fmtDate(u.license_expiration)} />
                        <FieldRow label="NRDS ID" value={u.nrds_id} />
                        <FieldRow label="MLS ID" value={u.mls_id} />
                        <FieldRow label="Join Date" value={fmtDate(u.join_date)} />
                        {u.qualifying_transaction_count > 0 && (
                          <FieldRow label="Qualifying Txns" value={`${u.qualifying_transaction_count} / 5`} />
                        )}
                        {(u.waive_buyer_processing_fees || u.waive_seller_processing_fees) && (
                          <FieldRow label="Processing Fees" value="Waived" />
                        )}
                        {u.special_commission_notes && (
                          <div className="mt-2 p-2 bg-orange-50 rounded text-xs text-orange-700">
                            {u.special_commission_notes}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Link to team member agreement */}
                    {a.team_membership?.team?.id && a.team_membership?.id && (
                      <Link
                        href={`/admin/teams/${a.team_membership.team.id}/agreements/${a.team_membership.id}`}
                        className="flex items-center gap-1.5 text-luxury-accent hover:underline text-xs mt-2"
                      >
                        <FileText size={11} />
                        {a.team_membership.team?.team_name
                          ? `${a.team_membership.team.team_name} - Team Agreement`
                          : 'Team Agreement'}
                      </Link>
                    )}

                    {/* Rev share + referred by / referred */}
                    {u && (u.revenue_share === 'yes' || u.referring_agent || (u.referred_agents && u.referred_agents.length > 0)) && (
                      <div className="mt-2 p-2 bg-luxury-light rounded">
                        <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Rev Share & Referrals</p>
                        {u.revenue_share === 'yes' && (
                          <p className="text-xs text-luxury-gray-3">
                            Rev Share: {u.revenue_share_percentage ? `${u.revenue_share_percentage}%` : 'Enrolled'}
                          </p>
                        )}
                        {u.referring_agent && (
                          <p className="text-xs text-luxury-gray-3">Referred by: {u.referring_agent}</p>
                        )}
                        {u.referred_agents && u.referred_agents.length > 0 && (
                          <p className="text-xs text-luxury-gray-3">
                            Referred: {u.referred_agents.join(', ')}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {/* Agent Billing */}
          {agentBilling && (
            <div className="container-card p-3">
              <button
                className="flex items-center justify-between w-full mb-2"
                onClick={() => toggleSection('billing')}
              >
                <span className="section-title flex items-center gap-1.5">
                  <DollarSign size={12} /> Agent Billing
                </span>
                {expandedSections.billing ? (
                  <ChevronUp size={12} className="text-luxury-gray-3" />
                ) : (
                  <ChevronDown size={12} className="text-luxury-gray-3" />
                )}
              </button>
              {expandedSections.billing && (
                <>
                  {agentBilling.debts.length === 0 && agentBilling.credits.length === 0 ? (
                    <p className="text-xs text-luxury-gray-3">No outstanding balances.</p>
                  ) : (
                    <>
                      {agentBilling.debts.map((d: any) => (
                        <div
                          key={d.id}
                          className="inner-card border border-orange-100 bg-orange-50/20 mb-1.5"
                        >
                          <p className="text-xs font-medium text-luxury-gray-1">{d.description}</p>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-xs text-luxury-gray-3">
                              {fmtDate(d.date_incurred)}
                            </span>
                            <span className="text-xs font-semibold text-orange-600">
                              {fmt$(d.amount_remaining ?? d.amount_owed)}
                            </span>
                          </div>
                        </div>
                      ))}
                      {agentBilling.credits.map((c: any) => (
                        <div
                          key={c.id}
                          className="inner-card border border-green-100 bg-green-50/20 mb-1.5"
                        >
                          <p className="text-xs font-medium text-luxury-gray-1">{c.description}</p>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-xs text-luxury-gray-3">
                              {fmtDate(c.date_incurred)}
                            </span>
                            <span className="text-xs font-semibold text-green-600">
                              -{fmt$(c.amount_remaining ?? c.amount_owed)}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-1.5 mt-1 border-t border-luxury-gray-5/50">
                        <span className="text-xs font-semibold text-luxury-gray-2">
                          Net Balance
                        </span>
                        <span
                          className={`text-sm font-bold ${agentBilling.net_balance > 0 ? 'text-orange-600' : 'text-green-600'}`}
                        >
                          {agentBilling.net_balance > 0
                            ? fmt$(agentBilling.net_balance)
                            : `-${fmt$(Math.abs(agentBilling.net_balance))}`}
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
              <button
                className="flex items-center justify-between w-full mb-2"
                onClick={() => toggleSection('team')}
              >
                <span className="section-title flex items-center gap-1.5">
                  <Building2 size={12} /> Team
                </span>
                {expandedSections.team ? (
                  <ChevronUp size={12} className="text-luxury-gray-3" />
                ) : (
                  <ChevronDown size={12} className="text-luxury-gray-3" />
                )}
              </button>
              {expandedSections.team && (
                <>
                  <p className="text-sm font-semibold text-luxury-gray-1 mb-1">
                    {teamInfo.agreement?.team_name}
                  </p>
                  {teamInfo.team_lead_name && (
                    <p className="text-xs text-luxury-gray-3 mb-2">
                      Lead: {teamInfo.team_lead_name}
                    </p>
                  )}
                  <div className="space-y-0">
                    <FieldRow label="Status" value={teamInfo.agreement?.status} />
                    <FieldRow
                      label="Effective"
                      value={fmtDate(teamInfo.agreement?.effective_date)}
                    />
                    {teamInfo.agreement?.min_firm_sale_pct && (
                      <FieldRow
                        label="Min Firm (Sales)"
                        value={`${teamInfo.agreement.min_firm_sale_pct}%`}
                      />
                    )}
                    {teamInfo.agreement?.min_firm_lease_pct && (
                      <FieldRow
                        label="Min Firm (Leases)"
                        value={`${teamInfo.agreement.min_firm_lease_pct}%`}
                      />
                    )}
                  </div>
                  {teamInfo.agreement?.agreement_document_url && (
                    <a
                      href={teamInfo.agreement.agreement_document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-luxury-accent hover:underline text-xs mt-2"
                    >
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
              <button
                className="flex items-center justify-between w-full mb-2"
                onClick={() => toggleSection('referrals')}
              >
                <span className="section-title flex items-center gap-1.5">
                  <ClipboardList size={12} /> Referrals
                </span>
                {expandedSections.referrals ? (
                  <ChevronUp size={12} className="text-luxury-gray-3" />
                ) : (
                  <ChevronDown size={12} className="text-luxury-gray-3" />
                )}
              </button>
              {expandedSections.referrals && (
                <div className="space-y-2">
                  {settings?.referral_tracking_url && (
                    <a
                      href={settings.referral_tracking_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-luxury-accent hover:underline text-xs"
                    >
                      <ExternalLink size={11} /> Referral Tracker (SharePoint)
                    </a>
                  )}
                  {settings?.crm_url && (
                    <a
                      href={settings.crm_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-luxury-accent hover:underline text-xs"
                    >
                      <ExternalLink size={11} /> {settings.crm_name || 'CRM'}
                    </a>
                  )}
                  {txn.has_referral && (
                    <div className="inner-card">
                      <p className="text-xs font-semibold text-luxury-gray-2 mb-1">
                        Referral on This Deal
                      </p>
                      {txn.internal_referral && (
                        <p className="text-xs text-luxury-gray-3">
                          Internal: {fmt$(txn.internal_referral_fee)}
                        </p>
                      )}
                      {txn.external_referral && (
                        <p className="text-xs text-luxury-gray-3">
                          External: {fmt$(txn.external_referral_fee)}
                        </p>
                      )}
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
              <button onClick={() => setShowEmailModal(false)}>
                <X size={16} className="text-luxury-gray-3" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="field-label">To</label>
                <input
                  type="email"
                  className="input-luxury text-xs"
                  value={emailDraft.to}
                  onChange={e => setEmailDraft(p => ({ ...p, to: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Subject</label>
                <input
                  type="text"
                  className="input-luxury text-xs"
                  value={emailDraft.subject}
                  onChange={e => setEmailDraft(p => ({ ...p, subject: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Message</label>
                <textarea
                  className="input-luxury text-xs"
                  rows={6}
                  value={emailDraft.body}
                  onChange={e => setEmailDraft(p => ({ ...p, body: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={sendEmailAgent}
                disabled={sendingEmail}
                className="btn btn-primary text-xs flex-1 disabled:opacity-50"
              >
                {sendingEmail ? 'Sending...' : 'Send Email'}
              </button>
              <button
                onClick={() => setShowEmailModal(false)}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Close Transaction Dialog ────────────────────────────────────────── */}
      {showCloseDialog && (
        <CloseDialog
          transactionId={id}
          transaction={data.transaction}
          agents={data.agents || []}
          userId={user?.id || null}
          onClose={() => setShowCloseDialog(false)}
          onClosed={() => { setShowCloseDialog(false); loadData() }}
        />
      )}
    </div>
  )
}