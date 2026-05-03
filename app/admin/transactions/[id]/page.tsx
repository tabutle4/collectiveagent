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
import { intermediaryBadgeProps, sideLabel } from '@/lib/transactions/sides'
import StatusBadge from '@/components/transactions/StatusBadge'
import CloseTransactionModal from "@/components/transactions/CloseDialog"
import PayoutModal from '@/components/transactions/PayoutModal'
import LowCommissionFlagPanel from '@/components/transactions/LowCommissionFlagPanel'
import AddAgentModal from '@/components/transactions/AddAgentModal'
import { AGENT_ROLE_OPTIONS, SIDE_OPTIONS } from '@/lib/transactions/constants'

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
  if (!type) return '--'
  const typeMap: Record<string, string> = {
    'buyer_v2': 'Buyer',
    'seller_v2': 'Seller',
    'tenant_apt_v2': 'Tenant (apartment)',
    'tenant_other_v2': 'Tenant (not apartment)',
    'tenant_simplyhome_v2': 'Tenant (SimplyHome Rental)',
    'tenant_commercial_v2': 'Tenant (commercial lease)',
    'landlord_v2': 'Landlord',
    'new_construction_buyer_v2': 'New Construction Buyer',
    'land_lot_buyer_v2': 'Land/Lot Buyer',
    'commercial_buyer_v2': 'Commercial Buyer',
    'land_lot_seller_v2': 'Land/Lot Seller',
    'referred_out_v2': 'Referred Out',
  }
  return typeMap[type] || type
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
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const [showAddAgentModal, setShowAddAgentModal] = useState(false)
  const [payoutBrokerages, setPayoutBrokerages] = useState<any[]>([])
  const [emailDraft, setEmailDraft] = useState({ to: '', subject: '', body: '' })
  const [sendingEmail, setSendingEmail] = useState(false)
  const [checklistExpanded, setChecklistExpanded] = useState(true)

  // Mark Paid modal state
  const [markPaidModal, setMarkPaidModal] = useState<{
    open: boolean
    agent: any
    debts: any[]
    loadingDebts: boolean
    selectedDebts: Record<string, number>  // debt_id -> amount to apply
    paymentDate: string
    paymentMethod: string
    paymentReference: string
    fundingSource: string
    countsTowardProgress: boolean
  }>({
    open: false,
    agent: null,
    debts: [],
    loadingDebts: false,
    selectedDebts: {},
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'ACH',
    paymentReference: '',
    fundingSource: 'crc',
    countsTowardProgress: true,
  })

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

  // Smart calc state (Commissions tab)
  const [smartCalcData, setSmartCalcData] = useState<{
    commission_plans: any[]
    processing_fee_types: any[]
  } | null>(null)
  const [agentCalcData, setAgentCalcData] = useState<Record<string, any>>({}) // agent_id -> calc result
  const [agentLeadSources, setAgentLeadSources] = useState<Record<string, string>>({}) // agent_id -> lead_source
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [autoCalcApplied, setAutoCalcApplied] = useState<Set<string>>(new Set()) // Track which agents have had auto-calc applied

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
    } catch {
      alert('Failed to load transaction')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user) loadData()
  }, [user, loadData])

  useEffect(() => {
    if (activeTab !== 'check_payouts' || !id) return
    fetch(`/api/admin/transactions/${id}?section=external_brokerages`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { external_brokerages: [] })
      .then(d => setPayoutBrokerages(d.external_brokerages || []))
      .catch(() => {})
  }, [activeTab, id])

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

  // Fetch smart calc reference data on mount
  useEffect(() => {
    fetch('/api/admin/transactions/smart-calc')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) setSmartCalcData({ commission_plans: d.commission_plans, processing_fee_types: d.processing_fee_types })
      })
      .catch(() => {})
  }, [])

  // Auto-calculate and auto-apply agent splits when data loads and office_gross exists
  useEffect(() => {
    if (!data?.transaction?.office_gross || !data?.agents?.length) return
    const agentsList = data.agents || []
    const txn = data.transaction
    const officeGross = parseFloat(txn.office_gross || 0)
    if (officeGross <= 0) return

    // Calculate and apply for each agent that doesn't have values yet
    agentsList.forEach(async (a: any) => {
      // Skip if already applied or has values saved
      if (autoCalcApplied.has(a.id) || parseFloat(a.agent_gross || 0) > 0) return
      // Skip if already paid
      if (a.payment_status === 'paid') return

      try {
        const res = await fetch('/api/admin/transactions/smart-calc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: a.agent_id,
            office_gross: officeGross,
            transaction_type: txn.transaction_type,
            lead_source: agentLeadSources[a.agent_id] || 'own',
            is_lease: isLease(txn.transaction_type),
          }),
        })
        if (res.ok) {
          const result = await res.json()
          setAgentCalcData(prev => ({ ...prev, [a.agent_id]: result }))
          
          // Auto-apply the values to the database
          await fetch(`/api/admin/transactions/${id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update_internal_agent',
              internal_agent_id: a.id,
              updates: {
                agent_gross: result.agent_gross,
                brokerage_split: result.brokerage_split,
                processing_fee: result.processing_fee,
                coaching_fee: result.coaching_fee,
                team_lead_commission: result.team_lead_payout || 0,
                agent_net: result.agent_net,
                split_percentage: result.agent_split_pct,
              },
            }),
          })
          setAutoCalcApplied(prev => new Set([...prev, a.id]))
        }
      } catch {}
    })
  }, [data?.transaction?.office_gross, data?.agents, agentLeadSources, id, autoCalcApplied])

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

  // Phase 2.2: recalculate via apply_primary_split which uses the canonical
  // formula and re-stamps linked TL/MP rows. Called by per-row Recalculate
  // button AND by the lead-source picker (which passes leadSourceOverride).
  const [recalcRowId, setRecalcRowId] = useState<string | null>(null)
  const recalculateRow = async (a: any, leadSourceOverride?: string) => {
    const leadSource = leadSourceOverride ?? a.lead_source ?? 'own'
    if (!a.agent_basis || !a.commission_plan) {
      alert('Set basis and commission plan before recalculating.')
      return
    }
    setRecalcRowId(a.id)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_primary_split',
          internal_agent_id: a.id,
          commission_amount: parseFloat(a.agent_basis || 0),
          lead_source: leadSource,
          referred_agent_id: a.referred_agent_id || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Recalculate failed')
      } else {
        loadData()
      }
    } finally {
      setRecalcRowId(null)
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

  const updateInternalAgent = async (internalAgentId: string, updates: any) => {
    setSaving(true)
    try {
      await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_internal_agent', internal_agent_id: internalAgentId, updates }),
      })
      setData((prev: any) => ({
        ...prev,
        agents: prev.agents.map((a: any) =>
          a.id === internalAgentId ? { ...a, ...updates } : a
        ),
      }))
    } finally {
      setSaving(false)
    }
  }

  // ── Mark Paid Modal Functions ────────────────────────────────────────────────

  const openMarkPaidModal = async (agent: any) => {
    // Determine default for countsTowardProgress based on plan and transaction type
    const plan = (agent.user?.commission_plan || '').toLowerCase()
    const isNewAgentPlan = plan.includes('new') || plan.includes('70/30')
    const txnType = data?.transaction_type || ''
    const txnIsLease = isLease(txnType)
    
    // For New Agent Plan: sales count, leases don't by default
    const defaultCountsToward = isNewAgentPlan ? !txnIsLease : true

    setMarkPaidModal(prev => ({
      ...prev,
      open: true,
      agent,
      loadingDebts: true,
      debts: [],
      selectedDebts: {},
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'ACH',
      paymentReference: '',
      fundingSource: 'crc',
      countsTowardProgress: defaultCountsToward,
    }))

    // Load outstanding debts for this agent
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_agent_debts', agent_id: agent.agent_id }),
      })
      const json = await res.json()
      setMarkPaidModal(prev => ({
        ...prev,
        loadingDebts: false,
        debts: json.debts || [],
      }))
    } catch {
      setMarkPaidModal(prev => ({ ...prev, loadingDebts: false }))
    }
  }

  const closeMarkPaidModal = () => {
    setMarkPaidModal(prev => ({ ...prev, open: false, agent: null }))
  }

  const submitMarkPaid = async () => {
    const { agent, selectedDebts, paymentDate, paymentMethod, paymentReference, fundingSource, countsTowardProgress } = markPaidModal
    if (!agent) return

    setSaving(true)
    try {
      // Convert selectedDebts to array format
      const debtsToApply = Object.entries(selectedDebts)
        .filter(([, amount]) => (amount as number) > 0)
        .map(([debtId, amount]) => ({ debt_id: debtId, amount }))

      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid',
          internal_agent_id: agent.id,
          transaction_type: txn?.transaction_type || null,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          payment_reference: paymentReference,
          funding_source: fundingSource,
          debts_to_apply: debtsToApply,
          counts_toward_progress: countsTowardProgress,
        }),
      })
      
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to mark paid')
      }

      const result = await res.json()

      // Update local state
      setData((prev: any) => ({
        ...prev,
        agents: prev.agents.map((a: any) =>
          a.id === agent.id
            ? { 
                ...a, 
                payment_status: 'paid',
                payment_date: paymentDate,
                payment_method: paymentMethod,
                payment_reference: paymentReference,
                funding_source: fundingSource,
                amount_1099_reportable: result.updates?.amount_1099_reportable,
                debts_deducted: result.updates?.debts_deducted,
                agent_net: result.updates?.agent_net,
              }
            : a
        ),
        // Clear agent_billing since debts may have been applied
        agent_billing: null,
      }))

      closeMarkPaidModal()
      // Reload to get fresh data including updated billing
      loadData()
    } catch (err: any) {
      alert(err.message || 'Failed to mark paid')
    } finally {
      setSaving(false)
    }
  }

  const toggleDebt = (debtId: string, maxAmount: number) => {
    setMarkPaidModal(prev => {
      const current = prev.selectedDebts[debtId]
      if (current) {
        // Remove it
        const { [debtId]: _, ...rest } = prev.selectedDebts
        return { ...prev, selectedDebts: rest }
      } else {
        // Add it with full amount
        return { ...prev, selectedDebts: { ...prev.selectedDebts, [debtId]: maxAmount } }
      }
    })
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
                  onClick={() => setShowCloseModal(true)}
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
              {(() => {
                const ib = intermediaryBadgeProps(txn)
                return ib.show ? <span className={ib.className}>{ib.label}</span> : null
              })()}
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
                    options={[
                      { value: 'buyer_v2', label: 'Buyer' },
                      { value: 'seller_v2', label: 'Seller' },
                      { value: 'nc_buyer_v2', label: 'New Construction Buyer' },
                      { value: 'land_buyer_v2', label: 'Land Buyer' },
                      { value: 'land_seller_v2', label: 'Land Seller' },
                      { value: 'commercial_buyer_v2', label: 'Commercial Buyer' },
                      { value: 'tenant_apt_v2', label: 'Tenant (Apartment)' },
                      { value: 'tenant_non_apt_v2', label: 'Tenant (Non-Apartment)' },
                      { value: 'tenant_simplyhome_v2', label: 'Tenant (SimplyHome)' },
                      { value: 'tenant_commercial_v2', label: 'Tenant (Commercial)' },
                      { value: 'landlord_v2', label: 'Landlord' },
                      { value: 'referred_out_v2', label: 'Referred Out' },
                    ]}
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

                  {/* Intermediary toggle (Phase 2) */}
                  <div className="flex justify-between items-center gap-4 py-1.5 border-b border-luxury-gray-5/30">
                    <span className="field-label shrink-0">Intermediary</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!txn.is_intermediary}
                        onChange={e => updateTransaction({
                          is_intermediary: e.target.checked,
                          // Clear other_side_transaction_type when toggling off
                          ...(e.target.checked ? {} : { other_side_transaction_type: null }),
                        })}
                        className="cursor-pointer"
                      />
                      <span className="text-xs text-luxury-gray-2">
                        {txn.is_intermediary ? 'CRC represents both sides' : 'Single-sided deal'}
                      </span>
                    </label>
                  </div>

                  {/* Other-side type (only shown when intermediary) */}
                  {txn.is_intermediary && (
                    <EditableFieldRow
                      label="Other-Side Type"
                      value={txn.other_side_transaction_type}
                      field="other_side_transaction_type"
                      type="select"
                      options={[
                        { value: '', label: 'Select...' },
                        { value: 'buyer_v2', label: 'Buyer' },
                        { value: 'tenant_v2', label: 'Tenant' },
                        { value: 'tenant_apt_v2', label: 'Tenant (Apartment)' },
                        { value: 'tenant_non_apt_v2', label: 'Tenant (Non-Apartment)' },
                        { value: 'seller_v2', label: 'Seller' },
                        { value: 'landlord_v2', label: 'Landlord' },
                      ]}
                      onSave={(f, v) => updateTransaction({ [f]: v || null })}
                    />
                  )}

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
                  <LowCommissionFlagPanel
                    transaction={txn}
                    internalAgents={agents}
                    onRefresh={loadData}
                    canEdit={true}
                  />
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
              <div className="flex items-center justify-between">
                <h1 className="page-title">COMMISSIONS</h1>
                <button
                  onClick={() => setShowAddAgentModal(true)}
                  className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
                >
                  + Add Agent
                </button>
              </div>

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

                {agents.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3 text-center py-4">
                    No agents on this transaction. Click "Add Agent" to add one.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {agents.map((a: any) => {
                      const isPaid = a.payment_status === 'paid'
                      const calc = agentCalcData[a.agent_id]
                      const agentGross = parseFloat(a.agent_gross || calc?.agent_gross || 0)
                      const processingFee = parseFloat(a.processing_fee || calc?.processing_fee || 0)
                      const coachingFee = parseFloat(a.coaching_fee || calc?.coaching_fee || 0)
                      const otherFees = parseFloat(a.other_fees || 0)
                      const brokerageSplit = parseFloat(a.brokerage_split || calc?.brokerage_split || 0)
                      const teamLeadComm = parseFloat(a.team_lead_commission || calc?.team_lead_payout || 0)
                      const debtsDeducted = parseFloat(a.debts_deducted || 0)
                      const salesVolume = parseFloat(a.sales_volume || 0)
                      const agentNet = parseFloat(a.agent_net || calc?.agent_net || 0)
                      const amount1099 = a.amount_1099_reportable || (agentGross - processingFee - coachingFee - otherFees)
                      const isDeleting = deleteConfirm === a.id

                      return (
                        <div key={a.id} className="inner-card">
                          {/* Header with actions */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              {a.user?.headshot_url && (
                                <img
                                  src={a.user.headshot_url}
                                  alt=""
                                  className="w-10 h-10 rounded-full object-cover object-top border border-luxury-gray-5"
                                />
                              )}
                              <div>
                                <p className="text-sm font-semibold text-luxury-gray-1">
                                  {fmtName(a.user)}
                                </p>
                                <p className="text-xs text-luxury-gray-3">
                                  {a.agent_role?.replace(/_/g, ' ')}
                                  {a.side ? ` · ${sideLabel(a.side)} side` : ''}
                                  {' · '}{a.user?.commission_plan || a.commission_plan || '--'}
                                </p>
                                {!isPaid && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <select
                                      value={a.agent_role || 'co_agent'}
                                      onChange={e => {
                                        const newRole = e.target.value
                                        if (newRole === a.agent_role) return
                                        if (!confirm(`Change role from ${(a.agent_role || '').replace(/_/g, ' ')} to ${newRole.replace(/_/g, ' ')}?\n\nThis may affect commission math and linked rows.`)) return
                                        updateInternalAgent(a.id, { agent_role: newRole })
                                      }}
                                      className="text-xs bg-transparent border border-luxury-gray-5 rounded px-1.5 py-0.5 text-luxury-gray-1"
                                    >
                                      {AGENT_ROLE_OPTIONS.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                      ))}
                                    </select>
                                    <select
                                      value={a.side || ''}
                                      onChange={e => updateInternalAgent(a.id, { side: e.target.value || null })}
                                      className="text-xs bg-transparent border border-luxury-gray-5 rounded px-1.5 py-0.5 text-luxury-gray-1"
                                    >
                                      {SIDE_OPTIONS.map(s => (
                                        <option key={s.value} value={s.value}>{s.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {/* Recalculate */}
                              {!isPaid && ['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role) && (
                                <button
                                  onClick={() => recalculateRow(a)}
                                  disabled={recalcRowId === a.id}
                                  className="btn btn-secondary text-xs px-2 py-1"
                                  title="Recompute split + linked rows from current basis, plan, and lead source"
                                >
                                  {recalcRowId === a.id ? 'Recalculating...' : 'Recalculate'}
                                </button>
                              )}
                              {/* Delete button */}
                              {!isPaid && (
                                <button
                                  onClick={() => setDeleteConfirm(a.id)}
                                  className="p-1.5 rounded border border-luxury-gray-5 hover:border-red-300 hover:bg-red-50 transition-colors"
                                  title="Remove agent"
                                >
                                  <Trash2 size={14} className="text-luxury-gray-3 hover:text-red-500" />
                                </button>
                              )}
                              {/* Payment status */}
                              {isPaid ? (
                                <span className="badge badge-success">
                                  Paid
                                </span>
                              ) : (
                                <button
                                  onClick={() => openMarkPaidModal(a)}
                                  className="btn-primary text-xs px-3 py-1"
                                >
                                  Mark Paid
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Delete confirmation */}
                          {isDeleting && (
                            <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                              <p className="text-xs text-red-700 mb-2">
                                Remove {fmtName(a.user)} from this transaction?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => deleteInternalAgent(a.id)}
                                  disabled={saving}
                                  className="btn text-xs px-3 py-1 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {saving ? 'Removing...' : 'Remove'}
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="btn btn-secondary text-xs px-3 py-1"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Team member lead source picker */}
                          {calc?.is_team_member && !isPaid && (
                            <div className="mb-3 p-3 bg-purple-50/50 border border-purple-200 rounded-lg">
                              <p className="text-xs text-purple-700 mb-2">
                                {fmtName(a.user)} is on {calc.team_lead_name ? `${calc.team_lead_name}'s team` : 'a team'}. Who sourced this lead?
                              </p>
                              <div className="flex gap-2">
                                {['team_lead', 'own', 'firm'].map(src => (
                                  <button
                                    key={src}
                                    onClick={() => {
                                      setAgentLeadSources(p => ({ ...p, [a.agent_id]: src }))
                                      // Recalculate immediately with the new lead source
                                      recalculateRow(a, src)
                                    }}
                                    className={`flex-1 text-xs px-3 py-1.5 rounded border transition-colors ${
                                      (agentLeadSources[a.agent_id] || 'own') === src
                                        ? 'bg-purple-600 text-white border-purple-600'
                                        : 'border-purple-300 text-purple-700 hover:bg-purple-100'
                                    }`}
                                  >
                                    {src === 'team_lead' ? 'Team Lead' : src === 'own' ? "Agent's Own" : 'Firm Lead'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Momentum partner display */}
                          {calc?.momentum_partner_name && calc.momentum_partner_payout > 0 && (
                            <div className="mb-3 p-3 bg-green-50/50 border border-green-200 rounded-lg">
                              <p className="text-xs text-green-700">
                                <span className="font-semibold">{calc.momentum_partner_name}</span> earns {calc.momentum_partner_pct}% momentum partner fee: {fmt$(calc.momentum_partner_payout)}
                                <span className="text-green-600 ml-1">(from brokerage side)</span>
                              </p>
                            </div>
                          )}

                          {/* Financial breakdown */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <FieldRow label="Sales Volume" value={salesVolume > 0 ? fmt$(salesVolume) : null} />
                            <FieldRow label="Office Gross (100%)" value={fmt$(txn.office_gross)} />
                            <FieldRow label="Split" value={a.split_percentage ? `${a.split_percentage}%` : (calc?.agent_split_pct ? `${calc.agent_split_pct}%` : null)} />
                            <FieldRow label="Agent Gross" value={fmt$(agentGross)} />
                            <FieldRow label="Brokerage Split" value={brokerageSplit > 0 ? fmt$(brokerageSplit) : null} />
                            <FieldRow label="Processing Fee" value={processingFee > 0 ? `-${fmt$(processingFee)}` : null} />
                            <FieldRow label="Coaching Fee" value={coachingFee > 0 ? `-${fmt$(coachingFee)}` : null} />
                            {teamLeadComm > 0 && (
                              <FieldRow label="Team Lead Comm" value={`-${fmt$(teamLeadComm)}`} />
                            )}
                            <FieldRow label="Other Fees" value={otherFees > 0 ? `-${fmt$(otherFees)}` : null} />
                            <FieldRow label="Rebate" value={a.rebate_amount > 0 ? fmt$(a.rebate_amount) : null} />
                            <FieldRow label="BTSA" value={a.btsa_amount > 0 ? fmt$(a.btsa_amount) : null} />
                          </div>

                          {/* Totals */}
                          <div className="border-t border-luxury-gray-5/50 mt-2 pt-2 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-luxury-gray-3">1099 Amount</span>
                              <span className="text-xs text-luxury-gray-2">{fmt$(amount1099)}</span>
                            </div>
                            {debtsDeducted > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-xs text-luxury-gray-3">Debts Deducted</span>
                                <span className="text-xs text-red-500">-{fmt$(debtsDeducted)}</span>
                              </div>
                            )}
                            <div className="flex justify-between items-center pt-1 border-t border-luxury-gray-5/30">
                              <span className="text-xs font-semibold text-luxury-gray-2">Agent Net</span>
                              <span className="text-sm font-bold text-luxury-accent">{fmt$(agentNet)}</span>
                            </div>
                          </div>

                          {/* Payment details (if paid) */}
                          {isPaid && (
                            <div className="mt-2 pt-2 border-t border-luxury-gray-5/30 text-xs text-luxury-gray-3 space-y-0.5">
                              {a.payment_date && <p>Paid: {fmtDate(a.payment_date)}</p>}
                              {a.payment_method && <p>Method: {a.payment_method}</p>}
                              {a.payment_reference && <p>Reference: {a.payment_reference}</p>}
                              {a.funding_source && a.funding_source !== 'crc' && (
                                <p>Funding: {a.funding_source === 'title_direct' ? 'Title paid directly' : a.funding_source}</p>
                              )}
                              <button
                                onClick={() => window.open(`/api/statements/${a.id}`, '_blank')}
                                className="mt-2 flex items-center gap-1.5 text-xs text-luxury-accent hover:text-luxury-accent/80 font-medium"
                              >
                                <FileText size={12} />
                                Generate Statement
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

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
                    {payoutBrokerages.length > 0 && (
                      <div className="space-y-2 mb-2">
                        {payoutBrokerages.map((b: any) => (
                          <div key={b.id} className="inner-card flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-luxury-gray-1">{b.brokerage_name}</p>
                              <p className="text-xs text-luxury-gray-3">
                                {b.brokerage_role?.replace(/_/g, ' ')} · {b.payment_status || 'pending'}
                              </p>
                              {b.payment_date && (
                                <p className="text-xs text-luxury-gray-3">{fmtDate(b.payment_date)}</p>
                              )}
                            </div>
                            <span className="text-xs font-semibold text-luxury-gray-1">
                              {fmt$(parseFloat(b.commission_amount || 0))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

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

                    <button
                      onClick={() => setShowPayoutModal(true)}
                      className="w-full text-xs text-luxury-accent hover:underline text-center py-1"
                    >
                      + Add Payout
                    </button>
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
                          <FieldRow label="Qualifying Txns" value={`${u.qualifying_transaction_count} / ${u.qualifying_transaction_target ?? 5}`} />
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

      {/* ── Mark Paid Modal ─────────────────────────────────────────────────── */}
      {markPaidModal.open && markPaidModal.agent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-luxury-gray-5">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Mark Paid</h2>
              <p className="text-xs text-luxury-gray-3">{fmtName(markPaidModal.agent.user)}</p>
            </div>

            <div className="p-4 space-y-4">
              {/* Financial Summary */}
              <div className="inner-card">
                <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Payment Summary</p>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-luxury-gray-3">Agent Gross</span>
                    <span>{fmt$(markPaidModal.agent.agent_gross)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-luxury-gray-3">- Fees</span>
                    <span className="text-red-500">
                      -{fmt$(
                        parseFloat(markPaidModal.agent.processing_fee || 0) +
                        parseFloat(markPaidModal.agent.coaching_fee || 0) +
                        parseFloat(markPaidModal.agent.other_fees || 0)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-luxury-gray-5/30">
                    <span className="font-semibold">1099 Amount</span>
                    <span className="font-semibold">
                      {fmt$(
                        parseFloat(markPaidModal.agent.agent_gross || 0) -
                        parseFloat(markPaidModal.agent.processing_fee || 0) -
                        parseFloat(markPaidModal.agent.coaching_fee || 0) -
                        parseFloat(markPaidModal.agent.other_fees || 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Outstanding Debts */}
              {markPaidModal.loadingDebts ? (
                <p className="text-xs text-luxury-gray-3 text-center py-2">Loading debts...</p>
              ) : markPaidModal.debts.length > 0 ? (
                <div className="inner-card">
                  <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Apply Outstanding Debts</p>
                  <div className="space-y-2">
                    {markPaidModal.debts.map((debt: any) => {
                      const remaining = parseFloat(debt.amount_remaining || debt.amount_owed || 0)
                      const isSelected = markPaidModal.selectedDebts[debt.id] != null
                      return (
                        <label
                          key={debt.id}
                          className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors ${
                            isSelected
                              ? 'border-luxury-accent bg-luxury-accent/5'
                              : 'border-luxury-gray-5 hover:border-luxury-gray-4'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleDebt(debt.id, remaining)}
                              className="rounded"
                            />
                            <div>
                              <p className="text-xs font-medium text-luxury-gray-1">
                                {debt.debt_type?.replace(/_/g, ' ')}
                              </p>
                              <p className="text-xs text-luxury-gray-3">
                                {debt.description || fmtDate(debt.date_incurred)}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-semibold text-red-500">{fmt$(remaining)}</span>
                        </label>
                      )
                    })}
                  </div>
                  {Object.keys(markPaidModal.selectedDebts).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-luxury-gray-5/30 flex justify-between text-xs">
                      <span className="text-luxury-gray-3">Total Deductions</span>
                      <span className="font-semibold text-red-500">
                        -{fmt$(Object.values(markPaidModal.selectedDebts).reduce((s: number, a: any) => s + a, 0))}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Final Amount */}
              <div className="inner-card bg-luxury-accent/5 border-luxury-accent">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-luxury-gray-2">Agent Will Receive</span>
                  <span className="text-lg font-bold text-luxury-accent">
                    {fmt$(
                    parseFloat(markPaidModal.agent.agent_gross || 0) -
                    parseFloat(markPaidModal.agent.processing_fee || 0) -
                    parseFloat(markPaidModal.agent.coaching_fee || 0) -
                    parseFloat(markPaidModal.agent.other_fees || 0) -
                    parseFloat(markPaidModal.agent.debts_deducted || 0) -
                    Object.values(markPaidModal.selectedDebts).reduce((s: number, a: any) => s + a, 0)
                  )}
                  </span>
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Payment Date</label>
                  <input
                    type="date"
                    value={markPaidModal.paymentDate}
                    onChange={e =>
                      setMarkPaidModal(prev => ({ ...prev, paymentDate: e.target.value }))
                    }
                    className="input-luxury text-xs w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Method</label>
                  <select
                    value={markPaidModal.paymentMethod}
                    onChange={e =>
                      setMarkPaidModal(prev => ({ ...prev, paymentMethod: e.target.value }))
                    }
                    className="input-luxury text-xs w-full"
                  >
                    <option value="ACH">ACH</option>
                    <option value="check">Check</option>
                    <option value="Zelle">Zelle</option>
                    <option value="wire">Wire</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Reference / Check #</label>
                  <input
                    type="text"
                    value={markPaidModal.paymentReference}
                    onChange={e =>
                      setMarkPaidModal(prev => ({ ...prev, paymentReference: e.target.value }))
                    }
                    placeholder="Optional"
                    className="input-luxury text-xs w-full"
                  />
                </div>
                <div>
                  <label className="field-label">Funding Source</label>
                  <select
                    value={markPaidModal.fundingSource}
                    onChange={e =>
                      setMarkPaidModal(prev => ({ ...prev, fundingSource: e.target.value }))
                    }
                    className="input-luxury text-xs w-full"
                  >
                    <option value="crc">CRC Paid Agent</option>
                    <option value="title_direct">Title Paid Directly</option>
                  </select>
                </div>
              </div>

              {/* Plan Progress Toggle - only show for relevant plans */}
              {(() => {
                const plan = (markPaidModal.agent?.user?.commission_plan || '').toLowerCase()
                const isNewAgentPlan = plan.includes('new') || plan.includes('70/30')
                const isCapPlan = plan.includes('85') || plan.includes('100') || plan.includes('capped')
                const txnType = data?.transaction_type || ''
                const txnIsLease = isLease(txnType)
                const qualifyingTarget = markPaidModal.agent?.user?.qualifying_transaction_target ?? 5

                if (!isNewAgentPlan && !isCapPlan) return null

                return (
                  <div className="inner-card bg-luxury-light">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={markPaidModal.countsTowardProgress}
                        onChange={e =>
                          setMarkPaidModal(prev => ({ ...prev, countsTowardProgress: e.target.checked }))
                        }
                        className="mt-0.5 rounded"
                      />
                      <div>
                        <p className="text-xs font-medium text-luxury-gray-1">
                          {isNewAgentPlan 
                            ? `Count toward ${qualifyingTarget} qualifying sales`
                            : 'Count toward cap'
                          }
                        </p>
                        <p className="text-xs text-luxury-gray-3 mt-0.5">
                          {isNewAgentPlan ? (
                            txnIsLease 
                              ? `Leases do not count toward the ${qualifyingTarget} sales needed to upgrade to 85/15`
                              : `This sale will count toward the ${qualifyingTarget} needed to upgrade to 85/15`
                          ) : (
                            `The $${parseFloat(markPaidModal.agent?.brokerage_split || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} brokerage split will be added to cap progress`
                          )}
                        </p>
                      </div>
                    </label>
                  </div>
                )
              })()}
            </div>

            <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
              <button
                onClick={submitMarkPaid}
                disabled={saving}
                className="btn-primary text-xs flex-1 disabled:opacity-50"
              >
                {saving ? 'Processing...' : 'Confirm Payment'}
              </button>
              <button
                onClick={closeMarkPaidModal}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Transaction Modal ─────────────────────────────────────────── */}
      {showCloseModal && (
        <CloseTransactionModal
          transactionId={id}
          transaction={data.transaction}
          agents={data.agents || []}
          userId={user?.id || ''}
          onClose={() => setShowCloseModal(false)}
          onClosed={() => { setShowCloseModal(false); loadData() }}
        />
      )}

      {showPayoutModal && (
        <PayoutModal
          transactionId={id}
          agents={data.agents || []}
          onClose={() => setShowPayoutModal(false)}
          onSaved={() => {
            setShowPayoutModal(false)
            loadData()
            fetch(`/api/admin/transactions/${id}?section=external_brokerages`)
              .then(r => r.ok ? r.json() : { external_brokerages: [] })
              .then(d => setPayoutBrokerages(d.external_brokerages || []))
              .catch(() => {})
          }}
        />
      )}

      {showAddAgentModal && (
        <AddAgentModal
          transactionId={id}
          transaction={data.transaction}
          existingAgents={data.agents || []}
          onClose={() => setShowAddAgentModal(false)}
          onAdded={() => { setShowAddAgentModal(false); loadData() }}
        />
      )}
    </div>
  )
}
