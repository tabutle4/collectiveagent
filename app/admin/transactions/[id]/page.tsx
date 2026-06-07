'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
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
  Upload,
  CheckCircle,
} from 'lucide-react'
import { TransactionStatus, STATUS_LABELS, STATUS_COLORS } from '@/lib/transactions/types'
import { intermediaryBadgeProps, sideLabel } from '@/lib/transactions/sides'
import { computeCommission } from '@/lib/transactions/math'
import StatusBadge from '@/components/transactions/StatusBadge'
import CloseTransactionModal from "@/components/transactions/CloseDialog"
import PayoutModal from '@/components/transactions/PayoutModal'
import LowCommissionFlagPanel from '@/components/transactions/LowCommissionFlagPanel'
import AddAgentModal from '@/components/transactions/AddAgentModal'
import AgentBillingPanel from '@/components/transactions/AgentBillingPanel'
import AgentCardFinancials, { OverridableField } from '@/components/transactions/AgentCardFinancials'
import { AGENT_ROLE_OPTIONS, SIDE_OPTIONS } from '@/lib/transactions/constants'
import { getTransactionTypeLabel } from '@/lib/transactions/transactionTypes'

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
  return getTransactionTypeLabel(type)
}

// Title-case label for an agent_role code. Falls back to a snake-case
// stripped version of the code if unknown.
const formatAgentRole = (role: string | null | undefined): string => {
  if (!role) return 'Agent'
  const map: Record<string, string> = {
    primary_agent: 'Primary Agent',
    co_agent: 'Co-Agent',
    listing_agent: 'Listing Agent',
    team_lead: 'Team Lead',
    momentum_partner: 'Momentum Partner',
    referral_agent: 'Referral Agent',
  }
  if (map[role]) return map[role]
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
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
  transactionId,
  onUploaded,
  onExtracted,
}: {
  checkId?: string
  existingUrl?: string | null
  transactionId?: string | null
  onUploaded: (url: string) => void
  onExtracted?: (fields: {
    check_amount?: number | null
    check_from?: string | null
    check_number?: string | null
    check_date?: string | null
    cleared_date?: string | null
    payment_method?: string
    funds_status?: string | null
    notes?: string | null
    confidence?: string
  }) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingUrl || null)
  const [extracted, setExtracted] = useState<any | null>(null)
  const [extractError, setExtractError] = useState<string | null>(null)

  // Compress image to under maxBytes using Canvas. PDFs returned unchanged.
  const compressImage = (file: File, maxBytes: number): Promise<File> => {
    return new Promise((resolve) => {
      if (file.type === 'application/pdf' || !file.type.startsWith('image/')) { resolve(file); return }
      if (file.size <= maxBytes) { resolve(file); return }
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const canvas = document.createElement('canvas')
        const MAX_DIM = 2400
        let { width, height } = img
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM }
          else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM }
        }
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        const tryQuality = (q: number) => {
          canvas.toBlob((blob) => {
            if (!blob) { resolve(file); return }
            if (blob.size <= maxBytes || q <= 0.3) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
            } else { tryQuality(Math.max(q - 0.15, 0.3)) }
          }, 'image/jpeg', q)
        }
        tryQuality(0.85)
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
      img.src = url
    })
  }

  // Direct upload to OneDrive bypassing Vercel's 4.5MB body limit.
  // Used for PDFs and large files — file bytes never pass through Vercel.
  const directUploadToOneDrive = async (file: File, txnId: string): Promise<string> => {
    const sessionRes = await fetch('/api/uploads/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, file_size: file.size, content_type: file.type, transaction_id: txnId }),
    })
    const sessionData = await sessionRes.json()
    if (!sessionRes.ok) throw new Error(sessionData.error || 'Failed to create upload session')
    const uploadRes = await fetch(sessionData.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type, 'Content-Range': `bytes 0-${file.size - 1}/${file.size}`, 'Content-Length': String(file.size) },
      body: file,
    })
    if (!uploadRes.ok) throw new Error(`OneDrive upload failed: ${uploadRes.status}`)
    const item = await uploadRes.json()
    return item.webUrl
  }

  const handleFile = async (rawFile: File) => {
    // Compress images over 4MB; PDFs go direct to OneDrive (no Vercel size limit)
    const isPdf = rawFile.type === 'application/pdf'
    const compressed = isPdf ? rawFile : await compressImage(rawFile, 4 * 1024 * 1024)
    const file = compressed
    const useDirect = isPdf || file.size > 4 * 1024 * 1024

    setUploading(true)
    setExtracted(null)
    setExtractError(null)
    setPreviewUrl(URL.createObjectURL(file))
    try {
      let fileUrl: string
      if (useDirect && transactionId) {
        fileUrl = await directUploadToOneDrive(file, transactionId)
      } else {
        const fd = new FormData()
        fd.append('file', file)
        if (checkId) fd.append('check_id', checkId)
        if (transactionId) fd.append('transaction_id', transactionId)
        const res = await fetch('/api/checks/upload-image', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        fileUrl = data.url
      }
      setPreviewUrl(fileUrl)
      onUploaded(fileUrl)
      setUploading(false)

      // AI extraction (best-effort, never blocks upload)
      setExtracting(true)
      const extractFd = new FormData()
      extractFd.append('file', file)
      try {
        const extractRes = await fetch('/api/admin/transactions/ai-check-extract', { method: 'POST', body: extractFd })
        const extractData = await extractRes.json().catch(() => null)
        if (!extractRes.ok || !extractData) {
          setExtractError(extractData?.error || 'AI extraction failed')
        } else {
          setExtracted(extractData.extracted)
        }
      } catch {
        setExtractError('AI extraction unavailable for this file')
      }
    } catch (err: any) {
      setPreviewUrl(existingUrl || null)
      alert(err.message || 'Upload failed')
    } finally {
      setUploading(false)
      setExtracting(false)
    }
  }

  const confidenceColor = extracted?.confidence === 'high'
    ? 'text-green-700 bg-green-50 border-green-200'
    : extracted?.confidence === 'medium'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-red-700 bg-red-50 border-red-200'

  return (
    <div>
      <label className="field-label">Check / Payment Photo or PDF</label>
      {previewUrl ? (
        <div className="relative mt-1">
          {previewUrl.endsWith('.pdf') || previewUrl.includes('pdf') ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-luxury-accent hover:underline text-xs py-3 px-3 border border-luxury-gray-5 rounded-lg"
            >
              <FileText size={14} /> View PDF
            </a>
          ) : (
            <a href={previewUrl} target="_blank" rel="noopener noreferrer">
              <img
                src={previewUrl}
                alt="Check"
                className="w-full max-h-40 object-cover rounded-lg border border-luxury-gray-5"
              />
            </a>
          )}
          <label
            className={`absolute bottom-2 right-2 bg-white/90 border border-luxury-gray-5 rounded-lg px-2 py-1 flex items-center gap-1 text-xs font-medium text-luxury-gray-2 cursor-pointer shadow-sm hover:bg-white ${uploading || extracting ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Camera size={11} />
            {uploading ? 'Uploading...' : 'Replace'}
            <input
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
      ) : (
        <label
          className={`mt-1 flex flex-col items-center justify-center gap-1.5 w-full py-5 border-2 border-dashed border-luxury-gray-5 rounded-lg cursor-pointer hover:border-luxury-accent transition-colors bg-luxury-light ${uploading || extracting ? 'opacity-50 pointer-events-none' : ''}`}
        >
          {uploading ? (
            <p className="text-xs text-luxury-gray-3">Uploading...</p>
          ) : (
            <>
              <Camera size={18} className="text-luxury-gray-3" />
              <p className="text-xs text-luxury-gray-3">Upload check, Zelle screenshot, or PDF</p>
              <p className="text-[10px] text-luxury-gray-4">JPG, PNG, WEBP, or PDF up to 10MB</p>
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {/* AI extraction status */}
      {extracting && (
        <div className="mt-2 text-xs text-luxury-gray-3 flex items-center gap-1.5 animate-pulse">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-luxury-accent" />
          Reading payment details...
        </div>
      )}

      {extractError && (
        <p className="mt-2 text-xs text-red-500">{extractError}</p>
      )}

      {/* AI extracted fields panel */}
      {extracted && onExtracted && (
        <div className={`mt-2 p-3 border rounded-lg text-xs ${confidenceColor}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold">AI Detected</p>
            <span className="text-[10px] opacity-70">{extracted.confidence} confidence</span>
          </div>
          <div className="space-y-1 mb-3">
            {extracted.check_amount != null && (
              <div className="flex justify-between">
                <span className="opacity-70">Amount</span>
                <span className="font-semibold">${Number(extracted.check_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {extracted.check_from && (
              <div className="flex justify-between">
                <span className="opacity-70">From</span>
                <span className="font-semibold">{extracted.check_from}</span>
              </div>
            )}
            {extracted.check_number && (
              <div className="flex justify-between">
                <span className="opacity-70">Check / Ref #</span>
                <span className="font-semibold">{extracted.check_number}</span>
              </div>
            )}
            {extracted.check_date && (
              <div className="flex justify-between">
                <span className="opacity-70">Check Date</span>
                <span className="font-semibold">{extracted.check_date}</span>
              </div>
            )}
            {extracted.cleared_date && (
              <div className="flex justify-between">
                <span className="opacity-70">Cleared</span>
                <span className="font-semibold">{extracted.cleared_date}</span>
              </div>
            )}
            {extracted.funds_status && (
              <div className="flex justify-between">
                <span className="opacity-70">Funds Status</span>
                <span className="font-semibold">{extracted.funds_status}</span>
              </div>
            )}
            {extracted.payment_method && (
              <div className="flex justify-between">
                <span className="opacity-70">Type</span>
                <span className="font-semibold capitalize">{extracted.payment_method}</span>
              </div>
            )}
            {extracted.notes && (
              <div className="pt-1 border-t border-current/10 opacity-70 italic">
                {extracted.notes}
              </div>
            )}
          </div>
          <button
            onClick={() => onExtracted(extracted)}
            className="w-full text-center font-semibold py-1.5 rounded border border-current/30 hover:bg-current/10 transition-colors"
          >
            Fill Fields from AI
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type NavTab = 'overview' | 'commissions' | 'check_payouts' | 'contacts' | 'documents'

// ─── Compliance Documents Tab ─────────────────────────────────────────────────

function ComplianceDocumentsTab({
  transactionId,
  transactionAddress,
  oneDriveFolderUrl,
  onFillTransactionFields,
}: {
  transactionId: string
  transactionAddress: string
  oneDriveFolderUrl?: string | null
  onFillTransactionFields?: (fields: Record<string, any>) => void
}) {
  const [docsData, setDocsData] = useState<{
    required_docs: any[]
    uploaded_docs: any[]
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<string | null>(null)
  const [markingComplete, setMarkingComplete] = useState(false)

  const handleMarkComplete = async () => {
    setMarkingComplete(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_complete' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSendResult('File marked complete. Compliance date set on all cleared checks.')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setMarkingComplete(false)
    }
  }
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [assigningDocId, setAssigningDocId] = useState<string | null>(null)
  const [assignSelected, setAssignSelected] = useState<string[]>([])
  const [txFieldsPreview, setTxFieldsPreview] = useState<Record<string, any> | null>(null)
  const [viewingDocId, setViewingDocId] = useState<string | null>(null)
  const [applyingFields, setApplyingFields] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/documents`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setDocsData(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [transactionId])

  const postAction = async (action: string, extra: Record<string, any> = {}) => {
    const res = await fetch(`/api/admin/transactions/${transactionId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    return data
  }

  const handleApprove = async (docId: string) => {
    setActionLoading(docId + '_approve')
    try {
      await postAction('approve', { document_id: docId })
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (docId: string) => {
    if (!rejectReason.trim()) { setError('Please enter a rejection reason'); return }
    setActionLoading(docId + '_reject')
    try {
      await postAction('reject', { document_id: docId, compliance_notes: rejectReason })
      setRejectingId(null)
      setRejectReason('')
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleReset = async (docId: string) => {
    setActionLoading(docId + '_reset')
    try {
      await postAction('reset', { document_id: docId })
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleFileUpload = async (file: File, requiredDocId: string | null, slotName?: string) => {
    setUploadingSlotId(requiredDocId || 'unlinked')
    try {
      // Prepend slot label to filename so OneDrive shows "Invoice - 2026-06-02.pdf"
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const date = new Date().toISOString().slice(0, 10)
      const labelPart = slotName ? slotName.replace(/[/\\?%*:|"<>]/g, '-').trim() : null
      const namedFile = labelPart
        ? new File([file], `${labelPart} - ${date}.${ext}`, { type: file.type })
        : file

      const fd = new FormData()
      fd.append('file', namedFile)
      fd.append('transaction_id', transactionId)
      const uploadRes = await fetch('/api/checks/upload-image', { method: 'POST', body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed')
      const oneDriveUrl = uploadData.url

      // AI doc read: get summary + suggested required-doc slot assignments
      let aiSummary: string | null = null
      let suggestedSlots: string[] = []
      try {
        const extractFd = new FormData()
        extractFd.append('file', namedFile)
        extractFd.append('transaction_id', transactionId)
        const extractRes = await fetch('/api/admin/transactions/ai-doc-read', { method: 'POST', body: extractFd })
        if (extractRes.ok) {
          const extractData = await extractRes.json()
          const summary = extractData.summary || null
          const pageContents = extractData.page_contents || []
          // Store as JSON so both summary and page breakdown are preserved in compliance_notes
          aiSummary = summary
            ? JSON.stringify({ summary, page_contents: pageContents })
            : null
          suggestedSlots = extractData.suggested_slots || []
          // If Claude found transaction fields in the doc, offer to fill them
          if (extractData.transaction_fields && Object.keys(extractData.transaction_fields).length > 0) {
            setTxFieldsPreview(extractData.transaction_fields)
          }
        }
      } catch { /* best-effort */ }

      // If caller specified a slot use it; otherwise use AI suggestions (one record per slot)
      const targetSlots: (string | null)[] = requiredDocId
        ? [requiredDocId]
        : suggestedSlots.length > 0 ? suggestedSlots : [null]

      for (const slotId of targetSlots) {
        await postAction('add_document', {
          file_name: namedFile.name,
          file_url: oneDriveUrl,
          onedrive_file_url: oneDriveUrl,
          file_size: file.size,
          file_type: file.type,
          required_document_id: slotId || null,
          ai_summary: aiSummary,
        })
      }
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadingSlotId(null)
    }
  }

  const handleReplace = async (file: File, oldDocId: string, requiredDocId: string | null, slotName?: string) => {
    setUploadingSlotId(oldDocId)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
      const date = new Date().toISOString().slice(0, 10)
      const labelPart = slotName ? slotName.replace(/[/\\?%*:|"<>]/g, '-').trim() : null
      const namedFile = labelPart
        ? new File([file], `${labelPart} - ${date}.${ext}`, { type: file.type })
        : file

      const fd = new FormData()
      fd.append('file', namedFile)
      fd.append('transaction_id', transactionId)
      const uploadRes = await fetch('/api/checks/upload-image', { method: 'POST', body: fd })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Upload failed')
      const oneDriveUrl = uploadData.url

      let aiSummary: string | null = null
      try {
        const extractFd = new FormData()
        extractFd.append('file', namedFile)
        extractFd.append('transaction_id', transactionId)
        const extractRes = await fetch('/api/admin/transactions/ai-doc-read', { method: 'POST', body: extractFd })
        if (extractRes.ok) {
          const extractData = await extractRes.json()
          const summary = extractData.summary || null
          const pageContents = extractData.page_contents || []
          aiSummary = summary
            ? JSON.stringify({ summary, page_contents: pageContents })
            : null
        }
      } catch { /* best-effort */ }

      await postAction('replace', {
        old_document_id: oldDocId,
        file_name: namedFile.name,
        file_url: oneDriveUrl,
        onedrive_file_url: oneDriveUrl,
        file_size: namedFile.size,
        file_type: namedFile.type,
        required_document_id: requiredDocId || null,
        ai_summary: aiSummary,
      })
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploadingSlotId(null)
    }
  }

  const handleAssign = async (docId: string, requiredDocIds: string[]) => {
    try {
      for (const slotId of requiredDocIds) {
        await postAction('assign', { document_id: docId, required_document_id: slotId })
      }
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const [emailPreview, setEmailPreview] = useState<{
    to: string; cc: string; subject: string; html: string;
    approved_count: number; rejected_count: number
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [editableSubject, setEditableSubject] = useState('')
  const [editableHtml, setEditableHtml] = useState('')

  const openEmailPreview = async () => {
    const reviewed = docsData?.uploaded_docs.filter(
      d => d.compliance_status === 'approved' || d.compliance_status === 'rejected'
    )
    if (!reviewed?.length) {
      setError('Approve or reject at least one document before sending the review email.')
      return
    }
    setPreviewLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/compliance-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEmailPreview(data)
      setEditableSubject(data.subject)
      setEditableHtml(data.html)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const sendComplianceEmail = async () => {
    if (!emailPreview) return
    setSending(true)
    setSendResult(null)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}/compliance-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', subject: editableSubject, html: editableHtml }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEmailPreview(null)
      setSendResult(`Email sent to ${data.sent_to}. ${data.approved_count} approved, ${data.rejected_count} rejected.`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">DOCUMENTS</h1>
        <p className="text-xs text-luxury-gray-3">Loading...</p>
      </div>
    )
  }

  const requiredDocs = docsData?.required_docs || []
  const uploadedDocs = docsData?.uploaded_docs || []
  const approvedCount = uploadedDocs.filter(d => d.compliance_status === 'approved').length
  const rejectedCount = uploadedDocs.filter(d => d.compliance_status === 'rejected').length
  const pendingCount = uploadedDocs.filter(d => d.compliance_status === 'pending').length

  const statusBadge = (status: string) => {
    if (status === 'approved') return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        <Check size={9} /> Approved
      </span>
    )
    if (status === 'rejected') return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
        <X size={9} /> Rejected
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
        Pending
      </span>
    )
  }

  const fmtDocName = (u: any) => {
    if (!u) return ''
    return `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
  }

  return (
    <div className="space-y-4">
      <h1 className="page-title">DOCUMENTS</h1>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle size={13} className="text-red-600 mt-0.5 shrink-0" />
          <p className="text-xs text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)}><X size={11} className="text-red-400" /></button>
        </div>
      )}

      {sendResult && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <CheckCircle size={13} className="text-green-600 shrink-0" />
          <p className="text-xs text-green-700">{sendResult}</p>
        </div>
      )}

      {/* Transaction fields extracted from contract — offer to fill */}
      {txFieldsPreview && (
        <div className="container-card border border-luxury-accent/30 bg-amber-50">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-xs font-semibold text-luxury-gray-1 flex items-center gap-1.5">
                <span className="text-base leading-none">&#10024;</span>
                Claude found transaction details in this document
              </p>
              <p className="text-[11px] text-luxury-gray-3 mt-0.5">
                Review the fields below before applying. Nothing is saved until you confirm.
              </p>
            </div>
            <button onClick={() => setTxFieldsPreview(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1 shrink-0">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1.5 mb-3">
            {(() => {
              const CONTACT_FIELDS = ['tenant_name', 'agent_name', 'payer_name', 'payer_email', 'seller_name', 'seller_email']
              const FIELD_LABELS: Record<string, string> = {
                commission_amount: 'Commission Amount → Office Gross',
                listing_price: 'Listing Price → Monthly Rent',
                property_address: 'Property Address',
                sales_price: 'Sales Price',
                monthly_rent: 'Monthly Rent',
                closing_date: 'Closing Date',
                move_in_date: 'Move-In Date',
                lease_term: 'Lease Term (months)',
                title_company: 'Title Company',
              }
              const txnEntries = Object.entries(txFieldsPreview).filter(([k]) => !CONTACT_FIELDS.includes(k))
              const contactEntries = Object.entries(txFieldsPreview).filter(([k]) => CONTACT_FIELDS.includes(k) && txFieldsPreview[k])
              return (
                <>
                  {txnEntries.map(([key, val]) => (
                    <div key={key} className="flex items-center gap-2 text-[11px]">
                      <span className="text-luxury-gray-3 w-44 shrink-0">{FIELD_LABELS[key] || key.replace(/_/g, ' ')}</span>
                      <span className="font-semibold text-luxury-gray-1">{String(val)}</span>
                    </div>
                  ))}
                  {contactEntries.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-luxury-gray-5">
                      <p className="text-[10px] text-luxury-gray-3 mb-1">Also found (save via Contacts tab):</p>
                      {contactEntries.map(([k, v]) => (
                        <div key={k} className="flex items-center gap-2 text-[11px]">
                          <span className="text-luxury-gray-3 w-44 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                          <span className="font-semibold text-luxury-gray-1">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!onFillTransactionFields) return
                setApplyingFields(true)
                try {
                  await onFillTransactionFields(txFieldsPreview)
                  setTxFieldsPreview(null)
                } finally {
                  setApplyingFields(false)
                }
              }}
              disabled={applyingFields || !onFillTransactionFields}
              className="text-[11px] font-semibold px-3 py-1.5 bg-luxury-accent text-white rounded hover:bg-luxury-accent/90 disabled:opacity-50"
            >
              {applyingFields ? 'Applying...' : 'Apply to Transaction'}
            </button>
            <button
              onClick={() => setTxFieldsPreview(null)}
              className="text-[11px] px-3 py-1.5 border border-luxury-gray-5 rounded text-luxury-gray-3 hover:bg-luxury-light"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {oneDriveFolderUrl && (
        <div className="container-card py-2.5">
          <a href={oneDriveFolderUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-luxury-accent hover:underline text-xs">
            <ExternalLink size={12} /> Open OneDrive Folder
          </a>
        </div>
      )}

      {/* How agents submit docs */}
      <div className="container-card">
        <p className="section-title mb-3">How to Submit Documents</p>
        <div className="space-y-3">
          <div className="p-3 bg-luxury-light rounded-lg border border-luxury-gray-5">
            <div className="flex items-center gap-2 mb-1">
              <Mail size={12} className="text-luxury-accent shrink-0" />
              <p className="text-xs font-semibold text-luxury-gray-1">Email Documents</p>
            </div>
            <p className="text-[11px] text-luxury-gray-3 mb-2">
              Email docs as attachments, or paste Dotloop/ZipForms share links in the body.
            </p>
            <div className="flex items-center gap-2">
              <code className="text-[11px] bg-white border border-luxury-gray-5 px-2 py-1 rounded font-mono text-luxury-gray-1 flex-1 truncate">
                txndoc+{transactionId}@coachingbrokeragetools.com
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(`txndoc+${transactionId}@coachingbrokeragetools.com`)}
                className="text-[10px] text-luxury-accent hover:underline shrink-0"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="p-3 bg-luxury-light rounded-lg border border-luxury-gray-5">
            <div className="flex items-center gap-2 mb-1">
              <ExternalLink size={12} className="text-luxury-accent shrink-0" />
              <p className="text-xs font-semibold text-luxury-gray-1">Share from Dotloop or ZipForms</p>
            </div>
            <p className="text-[11px] text-luxury-gray-3">
              In Dotloop: open the document, click Share, copy the link. In ZipForms: open the form, click Share or Email, copy the link. Paste the link in an email to the address above and it will appear here automatically.
            </p>
          </div>
        </div>
      </div>

      {/* Compliance review controls */}
      <div className="container-card">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Compliance Review</p>
          <div className="flex items-center gap-3 text-[10px]">
            {approvedCount > 0 && <span className="text-green-700 font-semibold">{approvedCount} approved</span>}
            {rejectedCount > 0 && <span className="text-red-700 font-semibold">{rejectedCount} rejected</span>}
            {pendingCount > 0 && <span className="text-amber-700 font-semibold">{pendingCount} pending</span>}
          </div>
        </div>
        <button
          onClick={openEmailPreview}
          disabled={previewLoading || uploadedDocs.filter(d => d.compliance_status !== 'pending').length === 0}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-luxury-accent text-white text-xs font-semibold hover:bg-luxury-accent/90 transition-colors disabled:opacity-50 mb-3"
        >
          <Send size={13} />
          {previewLoading ? 'Building preview...' : 'Review and Send Compliance Email'}
        </button>
        <p className="text-[10px] text-luxury-gray-3 text-center">
          Opens a preview so you can edit before sending. Always shows as from Leah Parpan.
        </p>
        <div className="border-t border-luxury-gray-5 mt-3 pt-3">
          <button
            onClick={handleMarkComplete}
            disabled={markingComplete}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-green-600 text-green-700 text-xs font-semibold hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            <CheckCircle size={13} />
            {markingComplete ? 'Marking...' : 'Mark File Complete'}
          </button>
          <p className="text-[10px] text-luxury-gray-3 text-center mt-1.5">
            Sets compliance status to Complete and stamps today as the compliance date on all cleared checks.
          </p>
        </div>
      </div>

      {/* Email preview/edit modal */}
      {emailPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
              <div>
                <p className="font-semibold text-sm text-luxury-gray-1">Review Compliance Email</p>
                <p className="text-[11px] text-luxury-gray-3 mt-0.5">
                  To: {emailPreview.to} | CC: {emailPreview.cc}
                </p>
              </div>
              <button onClick={() => setEmailPreview(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="field-label">Subject</label>
                <input
                  type="text"
                  value={editableSubject}
                  onChange={e => setEditableSubject(e.target.value)}
                  className="input-luxury w-full text-sm mt-1"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="field-label">Email Body (HTML)</label>
                  <span className="text-[10px] text-luxury-gray-3">
                    {emailPreview.approved_count} approved, {emailPreview.rejected_count} rejected
                  </span>
                </div>
                <textarea
                  value={editableHtml}
                  onChange={e => setEditableHtml(e.target.value)}
                  className="input-luxury w-full text-xs font-mono resize-none"
                  rows={14}
                />
                <p className="text-[10px] text-luxury-gray-3 mt-1">
                  Edit the text within HTML tags to change what the agent sees.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-luxury-gray-5">
              <button onClick={() => setEmailPreview(null)} className="btn btn-secondary text-xs px-4 py-2">
                Cancel
              </button>
              <button
                onClick={sendComplianceEmail}
                disabled={sending || !editableSubject || !editableHtml}
                className="btn btn-primary text-xs px-5 py-2 flex items-center gap-2 disabled:opacity-50"
              >
                <Send size={12} />
                {sending ? 'Sending...' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Required document slots */}
      {requiredDocs.length > 0 && (
        <div className="container-card">
          <p className="section-title mb-3">Required Documents</p>
          <div className="space-y-3">
            {requiredDocs.map(rd => {
              const linked = uploadedDocs.filter(d => d.required_document_id === rd.id)
              const latest = linked[0]
              return (
                <div key={rd.id} className="border border-luxury-gray-5 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-xs font-semibold text-luxury-gray-1">{rd.name}</p>
                      {rd.description && <p className="text-[10px] text-luxury-gray-3 mt-0.5">{rd.description}</p>}
                      {!rd.is_required && <span className="text-[10px] text-luxury-gray-4 italic">optional</span>}
                    </div>
                    {latest && statusBadge(latest.compliance_status)}
                  </div>

                  {latest ? (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => setViewingDocId(viewingDocId === latest.id ? null : latest.id)}
                          className="flex items-center gap-1.5 text-[11px] text-luxury-accent hover:underline flex-1 min-w-0 text-left"
                        >
                          <FileText size={11} className="shrink-0" />
                          <span className="truncate">{latest.file_name}</span>
                        </button>
                        <a href={latest.onedrive_file_url || latest.file_url} target="_blank" rel="noopener noreferrer"
                          className="text-[10px] text-luxury-gray-3 hover:text-luxury-accent shrink-0">
                          <ExternalLink size={9} />
                        </a>
                      </div>
                      {viewingDocId === latest.id && (
                        <div className="mb-2 rounded border border-luxury-gray-5 overflow-hidden bg-luxury-light">
                          {(latest.file_type || '').startsWith('image/') ? (
                            <img
                              src={`/api/uploads/view?url=${encodeURIComponent(latest.onedrive_file_url || latest.file_url)}`}
                              alt={latest.file_name}
                              className="w-full max-h-96 object-contain"
                            />
                          ) : (
                            <iframe
                              src={`/api/uploads/view?url=${encodeURIComponent(latest.onedrive_file_url || latest.file_url)}`}
                              className="w-full h-96 border-0"
                              title={latest.file_name}
                            />
                          )}
                        </div>
                      )}
                      {latest.uploader && (
                        <p className="text-[10px] text-luxury-gray-3 mb-2">Uploaded by {fmtDocName(latest.uploader)}</p>
                      )}
                      {/* AI summary shown while pending */}
                      {latest.compliance_status === 'pending' && latest.compliance_notes && (() => {
                        let parsed: { summary?: string; page_contents?: any[] } | null = null
                        try { parsed = JSON.parse(latest.compliance_notes) } catch { /* plain text */ }
                        const summaryText = parsed?.summary || latest.compliance_notes
                        const pages = parsed?.page_contents || []
                        return (
                          <div className="mb-2 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-800">
                            <p className="font-semibold mb-1 flex items-center gap-1">
                              <span className="text-sm leading-none">&#10024;</span> AI Read
                            </p>
                            <p className="whitespace-pre-wrap mb-1">{summaryText}</p>
                            {pages.length > 0 && (
                              <div className="mt-1.5 pt-1.5 border-t border-amber-200">
                                <p className="font-semibold mb-1">Document contents:</p>
                                {pages.map((p: any, i: number) => (
                                  <div key={i} className="flex gap-1.5 mb-0.5">
                                    <span className="shrink-0 text-amber-600 font-semibold w-12">p.{p.page}</span>
                                    <span>{p.document_name}{p.notes ? ` — ${p.notes}` : ''}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {/* Rejection reason */}
                      {latest.compliance_status === 'rejected' && latest.compliance_notes && (
                        <div className="mb-2 p-2 bg-red-50 border border-red-100 rounded text-[11px] text-red-700">
                          {latest.compliance_notes}
                        </div>
                      )}
                      {/* Inline reject form */}
                      {rejectingId === latest.id && (
                        <div className="mb-2">
                          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                            placeholder="Explain what needs to be corrected..."
                            className="input-luxury w-full text-xs resize-none mb-2" rows={3} autoFocus />
                          <div className="flex gap-2">
                            <button onClick={() => handleReject(latest.id)} disabled={!!actionLoading}
                              className="btn text-xs px-3 py-1 bg-red-600 text-white hover:bg-red-700 rounded flex items-center gap-1">
                              <X size={11} /> Reject
                            </button>
                            <button onClick={() => { setRejectingId(null); setRejectReason('') }}
                              className="btn btn-secondary text-xs px-3 py-1">Cancel</button>
                          </div>
                        </div>
                      )}
                      {rejectingId !== latest.id && (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {latest.compliance_status !== 'approved' && (
                            <button onClick={() => handleApprove(latest.id)} disabled={!!actionLoading}
                              className="text-[11px] font-semibold px-2.5 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-1">
                              <Check size={11} /> Approve
                            </button>
                          )}
                          {latest.compliance_status !== 'rejected' && (
                            <button onClick={() => { setRejectingId(latest.id); setRejectReason('') }}
                              className="text-[11px] font-semibold px-2.5 py-1 bg-red-100 text-red-700 border border-red-200 rounded hover:bg-red-200 transition-colors flex items-center gap-1">
                              <X size={11} /> Reject
                            </button>
                          )}
                          {latest.compliance_status !== 'pending' && (
                            <button onClick={() => handleReset(latest.id)} disabled={!!actionLoading}
                              className="text-[11px] px-2.5 py-1 text-luxury-gray-3 border border-luxury-gray-5 rounded hover:bg-luxury-light transition-colors">
                              Reset
                            </button>
                          )}
                          <label className={`text-[11px] px-2.5 py-1 text-luxury-accent border border-luxury-accent/30 rounded hover:bg-luxury-accent/5 cursor-pointer flex items-center gap-1 ${uploadingSlotId === latest.id ? 'opacity-50 pointer-events-none' : ''}`}>
                            <Upload size={10} />
                            {uploadingSlotId === latest.id ? 'Uploading...' : 'Replace'}
                            <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                              onChange={e => e.target.files?.[0] && handleReplace(e.target.files[0], latest.id, rd.id, rd.name)} />
                          </label>
                        </div>
                      )}
                    </div>
                  ) : (
                    <label className={`flex items-center gap-2 text-[11px] text-luxury-gray-3 cursor-pointer border border-dashed border-luxury-gray-5 rounded px-3 py-2 hover:border-luxury-accent transition-colors ${uploadingSlotId === rd.id ? 'opacity-50 pointer-events-none' : ''}`}>
                      <Upload size={11} />
                      {uploadingSlotId === rd.id ? 'Uploading...' : 'Upload document'}
                      <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                        onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], rd.id, rd.name)} />
                    </label>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Additional / unlinked docs */}
      {(() => {
        const unlinked = uploadedDocs.filter(d => !d.required_document_id)
        return (
          <div className="container-card">
            <div className="flex items-center justify-between mb-3">
              <p className="section-title">Additional Documents</p>
              <label className={`flex items-center gap-1.5 text-[11px] text-luxury-accent cursor-pointer hover:underline ${uploadingSlotId === 'unlinked' ? 'opacity-50 pointer-events-none' : ''}`}>
                <Upload size={11} />
                {uploadingSlotId === 'unlinked' ? 'Uploading...' : 'Upload'}
                <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                  onChange={e => e.target.files?.[0] && handleFileUpload(e.target.files[0], null)} />
              </label>
            </div>
            {unlinked.length === 0 ? (
              <p className="text-[11px] text-luxury-gray-3 text-center py-3">No additional documents uploaded.</p>
            ) : (
              <div className="space-y-2">
                {unlinked.map(doc => (
                  <div key={doc.id} className="p-2.5 border border-luxury-gray-5 rounded-lg">
                    <div className="flex items-start gap-2">
                      <FileText size={12} className="text-luxury-gray-3 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => setViewingDocId(viewingDocId === doc.id ? null : doc.id)}
                            className="text-[11px] text-luxury-accent hover:underline truncate text-left"
                          >{doc.file_name}</button>
                          {viewingDocId === doc.id && (
                            <div className="mt-1 rounded border border-luxury-gray-5 overflow-hidden bg-luxury-light">
                              {(doc.file_type || '').startsWith('image/') ? (
                                <img
                                  src={`/api/uploads/view?url=${encodeURIComponent(doc.onedrive_file_url || doc.file_url)}`}
                                  alt={doc.file_name}
                                  className="w-full max-h-96 object-contain"
                                />
                              ) : (
                                <iframe
                                  src={`/api/uploads/view?url=${encodeURIComponent(doc.onedrive_file_url || doc.file_url)}`}
                                  className="w-full h-96 border-0"
                                  title={doc.file_name}
                                />
                              )}
                            </div>
                          )}
                          {doc.version > 1 && (
                            <span className="text-[9px] bg-luxury-gray-5 text-luxury-gray-2 px-1.5 py-0.5 rounded-full font-semibold shrink-0">v{doc.version}</span>
                          )}
                        </div>
                        {doc.uploader && <p className="text-[10px] text-luxury-gray-3">by {fmtDocName(doc.uploader)}</p>}
                        {doc.compliance_status === 'pending' && doc.compliance_notes && (
                          <div className="mt-1 p-1.5 bg-amber-50 border border-amber-200 rounded text-[10px] text-amber-800">
                            <span className="font-semibold">AI: </span>{doc.compliance_notes}
                          </div>
                        )}
                        {doc.compliance_notes && doc.compliance_status === 'rejected' && (
                          <p className="text-[10px] text-red-600 mt-0.5">{doc.compliance_notes}</p>
                        )}
                        {assigningDocId === doc.id ? (
                          <div className="mt-1.5 border border-luxury-gray-5 rounded p-2 bg-luxury-light">
                            <p className="text-[10px] text-luxury-gray-3 mb-1.5 font-semibold">Assign to slot(s):</p>
                            <div className="space-y-1 mb-2 max-h-32 overflow-y-auto">
                              {requiredDocs.map(rd => (
                                <label key={rd.id} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={assignSelected.includes(rd.id)}
                                    onChange={e => setAssignSelected(prev =>
                                      e.target.checked ? [...prev, rd.id] : prev.filter(id => id !== rd.id)
                                    )}
                                    className="accent-luxury-accent"
                                  />
                                  <span className="text-[10px] text-luxury-gray-1">{rd.name}</span>
                                </label>
                              ))}
                            </div>
                            <div className="flex gap-1.5">
                              <button
                                disabled={assignSelected.length === 0 || !!actionLoading}
                                onClick={async () => {
                                  await handleAssign(doc.id, assignSelected)
                                  setAssigningDocId(null)
                                  setAssignSelected([])
                                }}
                                className="text-[10px] px-2 py-1 bg-luxury-accent text-white rounded disabled:opacity-50 hover:bg-luxury-accent/90"
                              >
                                Assign{assignSelected.length > 0 ? ` (${assignSelected.length})` : ''}
                              </button>
                              <button
                                onClick={() => { setAssigningDocId(null); setAssignSelected([]) }}
                                className="text-[10px] px-2 py-1 border border-luxury-gray-5 rounded text-luxury-gray-3 hover:bg-white"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAssigningDocId(doc.id); setAssignSelected([]) }}
                            className="mt-1.5 text-[10px] text-luxury-gray-3 border border-luxury-gray-5 rounded px-1.5 py-0.5 bg-white w-full text-left hover:border-luxury-accent hover:text-luxury-accent transition-colors"
                          >
                            Assign to required slot...
                          </button>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {statusBadge(doc.compliance_status)}
                        <div className="flex gap-1 mt-1">
                          {doc.compliance_status !== 'approved' && (
                            <button onClick={() => handleApprove(doc.id)} disabled={!!actionLoading}
                              className="text-[10px] px-2 py-0.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                              <Check size={10} />
                            </button>
                          )}
                          {doc.compliance_status !== 'rejected' && rejectingId !== doc.id && (
                            <button onClick={() => { setRejectingId(doc.id); setRejectReason('') }}
                              className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200">
                              <X size={10} />
                            </button>
                          )}
                          <label className="text-[10px] px-2 py-0.5 text-luxury-accent border border-luxury-accent/30 rounded cursor-pointer hover:bg-luxury-accent/5 flex items-center">
                            <Upload size={9} />
                            <input type="file" accept=".pdf,.doc,.docx,image/*" className="hidden"
                              onChange={e => e.target.files?.[0] && handleReplace(e.target.files[0], doc.id, doc.required_document_id)} />
                          </label>
                        </div>
                        {rejectingId === doc.id && (
                          <div className="w-36 mt-1">
                            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                              placeholder="Rejection reason..." className="input-luxury w-full text-[10px] resize-none mb-1" rows={2} autoFocus />
                            <div className="flex gap-1">
                              <button onClick={() => handleReject(doc.id)} className="text-[10px] px-2 py-0.5 bg-red-600 text-white rounded">Send</button>
                              <button onClick={() => { setRejectingId(null); setRejectReason('') }} className="text-[10px] px-2 py-0.5 border border-luxury-gray-5 rounded">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}

export default function AdminTransactionDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [user, setUser] = useState<any>(null)
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const searchParams = useSearchParams()
  const [activeTab, setActiveTabState] = useState<NavTab>(
    (searchParams.get('tab') as NavTab) || 'overview'
  )
  const setActiveTab = (newTab: NavTab) => {
    setActiveTabState(newTab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

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
  const [aiReview, setAiReview] = useState<{
    overall: string
    ready_to_pay: boolean
    items: { label: string; status: string; note: string }[]
    flags: string[]
  } | null>(null)
  const [aiReviewLoading, setAiReviewLoading] = useState(false)
  const [aiReviewError, setAiReviewError] = useState<string | null>(null)
  // Display-only: unpaid monthly fee balance per agent on this transaction.
  // Keyed by user id (a.agent_id). Populated on data load. Read-only - this
  // does not affect commission, agent_net, or debts_deducted.
  const [monthlyFeeBalances, setMonthlyFeeBalances] = useState<
    Record<string, { count: number; total: number; invoices: any[] }>
  >({})

  // Retainer modal state - opens from the agent card's "+ Add Retainer" button.
  // Creates a new TIA row with installment_kind='retainer' for this agent on
  // this transaction. Retainer rows have simple math: basis - retainer_fee.
  // No team lead, no momentum partner, no BTSA, no rebate.
  const [retainerModal, setRetainerModal] = useState<{
    open: boolean
    forAgent: any | null
    retainerAmount: string
    retainerFee: string
    saving: boolean
    error: string | null
  }>({
    open: false,
    forAgent: null,
    retainerAmount: '',
    retainerFee: '',
    saving: false,
    error: null,
  })

  // Mark Paid modal state
  // Debt/credit selection lives on the per-card billing panel (billingApplied
  // state). The modal only collects payment metadata.
  const [markPaidModal, setMarkPaidModal] = useState<{
    open: boolean
    agent: any
    paymentDate: string
    paymentMethod: string
    paymentReference: string
    fundingSource: string
    countsTowardProgress: boolean
  }>({
    open: false,
    agent: null,
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
  const [extractingContacts, setExtractingContacts] = useState(false)
  const [contactSuggestions, setContactSuggestions] = useState<any[]>([])

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

  // Fetch each agent's unpaid monthly fee balance for sidebar display only.
  // Deduplicated by user id - the same agent can appear on more than one TIA
  // (e.g., listing + primary split), and we only need one fetch per person.
  useEffect(() => {
    const tias = data?.agents || []
    if (tias.length === 0) return
    const userIds = Array.from(new Set(tias.map((a: any) => a.agent_id).filter(Boolean)))
    if (userIds.length === 0) return
    let cancelled = false
    ;(async () => {
      const results = await Promise.all(
        userIds.map(async uid => {
          try {
            const r = await fetch(`/api/payload/agent-monthly-fees?user_id=${uid}`, {
              cache: 'no-store',
            })
            if (!r.ok) return [uid, { count: 0, total: 0, invoices: [] }] as const
            const j = await r.json()
            return [
              uid,
              { count: j.count || 0, total: j.total || 0, invoices: j.invoices || [] },
            ] as const
          } catch {
            return [uid, { count: 0, total: 0, invoices: [] }] as const
          }
        })
      )
      if (cancelled) return
      const next: Record<string, { count: number; total: number; invoices: any[] }> = {}
      for (const [uid, balance] of results) next[uid as string] = balance
      setMonthlyFeeBalances(next)
    })()
    return () => {
      cancelled = true
    }
  }, [data?.agents])

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

  // Auto-calculate and auto-apply agent splits when data loads and office_gross exists.
  // The calc ALWAYS runs for primary contract-bearing roles so that agentCalcData is
  // populated (which drives the team lead-source picker visibility). Auto-apply only
  // happens when agent_gross has not yet been saved.
  useEffect(() => {
    if (!data?.transaction?.office_gross || !data?.agents?.length) return
    const agentsList = data.agents || []
    const txn = data.transaction
    const officeGross = parseFloat(txn.office_gross || 0)
    if (officeGross <= 0) return

    agentsList.forEach(async (a: any) => {
      // Auto-calc only makes sense for agents whose commission drives the deal.
      // Linked / carve-out rows (referral_agent, team_lead, momentum_partner)
      // are entered manually. Auto-applying smart-calc results to them would
      // overwrite their hand-entered basis and split. (Phase 2.7 fix.)
      if (!['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role)) return

      const hasValues = parseFloat(a.agent_gross || 0) > 0
      const alreadyApplied = autoCalcApplied.has(a.id)

      // Always fetch calc to populate agentCalcData (needed for team lead-source
      // picker). Skip the fetch entirely only when already paid AND values exist,
      // since there's nothing useful to show in that case.
      if (a.payment_status === 'paid' && hasValues) return

      // Skip re-fetching if we already have calc data for this agent
      // (avoids infinite re-fetch loop caused by setAgentCalcData triggering re-renders).
      if (agentCalcData[a.agent_id]) return

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
          // Always store calc result so UI (lead-source picker, preview) works.
          setAgentCalcData(prev => ({ ...prev, [a.agent_id]: result }))

          // Only auto-apply to DB when values have not yet been saved.
          if (!hasValues && !alreadyApplied) {
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
        }
      } catch {}
    })
  }, [data?.transaction?.office_gross, data?.agents, agentLeadSources, id, autoCalcApplied, agentCalcData])

  // ── Actions ─────────────────────────────────────────────────────────────────

  const deleteInternalAgent = async (internalAgentId: string) => {
    setSaving(true)
    try {
      // Use the cascade variant so any linked team_lead / momentum_partner
      // rows (with source_tia_id pointing at this primary) are removed too.
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_internal_agent_cascade',
          internal_agent_id: internalAgentId,
        }),
      })
      if (res.ok) {
        setDeleteConfirm(null)
        // Cascade may have removed multiple rows. Reload to be safe.
        await loadData()
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error || 'Failed to remove agent')
      }
    } finally {
      setSaving(false)
    }
  }

  // Phase 2.2: recalculate via apply_primary_split which uses the canonical
  // formula and re-stamps linked TL/MP rows. Called by per-row Recalculate
  // button AND by the lead-source picker (which passes leadSourceOverride).
  const [recalcRowId, setRecalcRowId] = useState<string | null>(null)

  // Per-agent applied billing: which debts/credits are checked on each agent
  // card. Local UI state only - applied to agent_debts at Mark Paid.
  // Map of internal_agent_id -> { debts, credits, debt_ids, credit_ids }
  const [billingApplied, setBillingApplied] = useState<Record<string, {
    debts: number; credits: number; debt_ids: string[]; credit_ids: string[]
  }>>({})

  const handleBillingChange = useCallback((tiaId: string) => (
    applied: { debts: number; credits: number; debt_ids: string[]; credit_ids: string[] }
  ) => {
    setBillingApplied(prev => ({ ...prev, [tiaId]: applied }))
  }, [])
  const recalculateRow = async (a: any, leadSourceOverride?: string) => {
    const leadSource = leadSourceOverride ?? a.lead_source ?? 'own'
    const txn = data?.transaction

    // Derive basis: prefer existing agent_basis, then side commission for the
    // agent's side, then office_gross. This lets the lead-source-picker work
    // even on a TIA row that hasn't been initialized yet.
    let basis = parseFloat(a.agent_basis || 0)
    if (!basis) {
      if (a.side === 'seller' || a.side === 'landlord') {
        basis = parseFloat(txn?.listing_side_commission || 0)
      } else if (a.side === 'buyer' || a.side === 'tenant') {
        basis = parseFloat(txn?.buying_side_commission || 0)
      }
    }
    if (!basis) {
      basis = parseFloat(txn?.office_gross || 0)
    }

    if (!basis) {
      alert('Set the office gross or side commission before recalculating.')
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
          commission_amount: basis,
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
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_transaction', updates }),
      })
      if (!res.ok) {
        let msg = 'Save failed.'
        try {
          const d = await res.json()
          if (d?.error) msg = `Save failed: ${d.error}`
        } catch {}
        alert(msg)
        // Reload from DB so the UI shows the actual saved state, not the
        // edit that didn't persist.
        await loadData()
        return
      }
      setData((prev: any) => ({ ...prev, transaction: { ...prev.transaction, ...updates } }))
      // The server may auto-derive fields: sales_volume from monthly_rent ×
      // lease_term on leases, and office_gross + gross_commission from the
      // side commissions (single-sided AND intermediary flows). Reload to
      // pick those server-side broadcasts up so the UI doesn't show stale
      // values until manual refresh.
      const RELOAD_TRIGGERS = [
        'monthly_rent', 'lease_term',
        'listing_side_commission', 'buying_side_commission',
        'gross_commission', 'office_gross',
        'transaction_type', 'is_intermediary',
      ]
      if (RELOAD_TRIGGERS.some(k => k in updates)) {
        await loadData()
      }
    } catch (err: any) {
      alert(err?.message ? `Save failed: ${err.message}` : 'Save failed. Check your connection and try again.')
      await loadData()
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

  // ── Retainer modal handlers ────────────────────────────────────────────────
  const openRetainerModal = (agent: any) => {
    setRetainerModal({
      open: true,
      forAgent: agent,
      retainerAmount: '',
      retainerFee: '',
      saving: false,
      error: null,
    })
  }

  const closeRetainerModal = () => {
    setRetainerModal(prev => ({ ...prev, open: false }))
  }

  const submitRetainer = async () => {
    const a = retainerModal.forAgent
    if (!a) return
    const amount = parseFloat(retainerModal.retainerAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setRetainerModal(prev => ({ ...prev, error: 'Enter a retainer amount.' }))
      return
    }
    const fee = retainerModal.retainerFee === '' ? 0 : parseFloat(retainerModal.retainerFee)
    if (!Number.isFinite(fee) || fee < 0) {
      setRetainerModal(prev => ({ ...prev, error: 'Retainer fee must be 0 or more.' }))
      return
    }

    setRetainerModal(prev => ({ ...prev, saving: true, error: null }))
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_retainer_row',
          retainer: {
            agent_id: a.agent_id,
            agent_role: a.agent_role,
            side: a.side,
            retainer_amount: amount,
            retainer_fee: fee,
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to add retainer row')
      }
      await loadData()
      setRetainerModal({
        open: false,
        forAgent: null,
        retainerAmount: '',
        retainerFee: '',
        saving: false,
        error: null,
      })
    } catch (e: any) {
      setRetainerModal(prev => ({ ...prev, saving: false, error: e.message || 'Save failed' }))
    }
  }

  const updateInternalAgent = async (internalAgentId: string, updates: any) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_internal_agent', internal_agent_id: internalAgentId, updates }),
      })
      if (!res.ok) {
        let msg = 'Save failed.'
        try {
          const d = await res.json()
          if (d?.error) msg = `Save failed: ${d.error}`
        } catch {}
        alert(msg)
        await loadData()
        return
      }
      // Optimistic local merge so the UI updates instantly with the user's edit.
      setData((prev: any) => ({
        ...prev,
        agents: prev.agents.map((a: any) =>
          a.id === internalAgentId ? { ...a, ...updates } : a
        ),
      }))
      // The server may run cascadePrimarySplit (when a DRIVER_FIELD is touched)
      // which rewrites split_percentage / agent_gross / brokerage_split /
      // processing_fee / coaching_fee / team_lead_commission / agent_net /
      // amount_1099_reportable / commission_plan(_id) and may update linked
      // team_lead / momentum_partner rows. The route returns {success: true}
      // only, so reload to pick up those changes.
      await loadData()
    } catch (err: any) {
      alert(err?.message ? `Save failed: ${err.message}` : 'Save failed. Check your connection and try again.')
      await loadData()
    } finally {
      setSaving(false)
    }
  }

  // Save a single editable field on a TIA, ALSO flagging it as manually
  // overridden. The cascade for derived fields (gross/brokerage/etc) is
  // Saves a field's value directly. We don't track overrides - every
  // recalculate freshly overwrites computed fields. So the markOverridden
  // flag is accepted for prop compatibility but ignored.
  const saveOverridableField = async (
    internalAgentId: string,
    field: OverridableField,
    value: number | null,
    _markOverridden: boolean,
  ) => {
    const agent = (data?.agents || []).find((a: any) => a.id === internalAgentId)

    // Linked rows (team_lead, momentum_partner) carry only the carved-out
    // payout for that role - their brokerage_split is always 0 by design.
    // The cascade math below assumes a primary row where
    //   brokerage_split = basis - agent_gross
    // which would be wrong for linked rows. Skipping the brokerage_split
    // write keeps the column at 0, which is what recomputeOfficeNet expects.
    //
    // NOTE: referral_agent is NOT a linked row - it has its own basis (a
    // carve-out of the deal gross) and splits with the brokerage on that
    // basis, so it gets a real brokerage_split.
    const isLinkedRow =
      agent?.agent_role === 'team_lead' || agent?.agent_role === 'momentum_partner'

    // Round a value to 2 decimals. Used everywhere brokerage_split / agent_gross
    // are derived so the two NEVER independently round-up and over-count
    // basis by $0.01.
    const round2 = (n: number) => Math.round(n * 100) / 100

    // For percentage fields that cascade, we save the percentage AND the
    // derived dollars together so the database stays consistent without
    // waiting for cascadePrimarySplit.
    //
    // Rounding rule (Phase 2.7): always round agent_gross FIRST, then derive
    // brokerage_split = basis - rounded(agent_gross). This guarantees
    // agent_gross + brokerage_split === basis (within FP precision) and
    // eliminates the "$0.01 too high" / "10.00011%" display bug that came
    // from independently rounding both values from the raw basis × pct.
    const updates: any = {
      [field]: value,
    }
    if (field === 'split_percentage' && value != null) {
      const basis = parseFloat(agent?.agent_basis || 0)
      const newGross = round2((basis * value) / 100)
      updates.agent_gross = newGross
      if (!isLinkedRow) {
        updates.brokerage_split = round2(basis - newGross)
      }
    }
    if (field === 'brokerage_split_percentage' && value != null) {
      // brokerage_split_percentage is not a real column; translate the user's
      // % edit into a brokerage_split (dollar) write. Cascade updates the
      // agent side accordingly.
      const basis = parseFloat(agent?.agent_basis || 0)
      const newBrokerage = round2((basis * value) / 100)
      updates.brokerage_split = newBrokerage
      updates.agent_gross = round2(basis - newBrokerage)
      updates.split_percentage = round2(100 - value)
      // Drop the synthetic field so it does not get sent to the DB.
      delete (updates as any).brokerage_split_percentage
    }
    if (field === 'agent_basis' && value != null) {
      const sp = parseFloat(agent?.split_percentage || 0)
      const newGross = round2((value * sp) / 100)
      updates.agent_gross = newGross
      if (!isLinkedRow) {
        updates.brokerage_split = round2(value - newGross)
      }
    }
    if (field === 'agent_gross' && value != null) {
      const basis = parseFloat(agent?.agent_basis || 0)
      if (basis > 0) {
        const newPct = (value / basis) * 100
        updates.split_percentage = round2(newPct)
        if (!isLinkedRow) {
          updates.brokerage_split = round2(basis - value)
        }
      }
    }
    if (field === 'brokerage_split' && value != null) {
      const basis = parseFloat(agent?.agent_basis || 0)
      if (basis > 0) {
        const newPct = (value / basis) * 100
        updates.agent_gross = round2(basis - value)
        updates.split_percentage = round2(100 - newPct)
      }
    }
    if (field === 'team_lead_percentage' && value != null) {
      // team_lead_percentage is not a real column; translate to a dollar
      // write on team_lead_commission.
      const basis = parseFloat(agent?.agent_basis || 0)
      updates.team_lead_commission = Math.round((basis * value) / 100 * 100) / 100
      delete (updates as any).team_lead_percentage
    }

    await updateInternalAgent(internalAgentId, updates)
  }

  // We don't track overrides anymore (manual_overrides column doesn't
  // exist). Clearing an override just means triggering a recalculate so
  // the cascade overwrites whatever the user manually entered with the
  // computed value.
  const clearOverrideForField = async (
    internalAgentId: string,
    _field: OverridableField,
  ) => {
    const agent = (data?.agents || []).find((a: any) => a.id === internalAgentId)
    const a = agent
    if (a) {
      try {
        await fetch(`/api/admin/transactions/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'apply_primary_split',
            internal_agent_id: a.id,
            agent_id: a.agent_id,
            commission_amount: parseFloat(a.agent_basis || 0),
            lead_source: a.lead_source || 'own',
            referred_agent_id: a.referred_agent_id || null,
          }),
        })
      } catch {
        // ignore - admin can still Recalculate manually
      }
      await loadData()
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
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'ACH',
      paymentReference: '',
      fundingSource: 'crc',
      countsTowardProgress: defaultCountsToward,
    }))
    // Note: debts/credits selection comes from the per-card billing panel
    // (billingApplied state). Modal does NOT load or display debts.
  }

  const closeMarkPaidModal = () => {
    setMarkPaidModal(prev => ({ ...prev, open: false, agent: null }))
  }

  const submitMarkPaid = async () => {
    const { agent, paymentDate, paymentMethod, paymentReference, fundingSource, countsTowardProgress } = markPaidModal
    if (!agent) return

    setSaving(true)
    try {
      // Pull selections from the per-card billing panel (UI state).
      // Selected debts and credits each come with their full remaining amount.
      const applied = billingApplied[agent.id] || { debts: 0, credits: 0, debt_ids: [], credit_ids: [] }

      // Look up each id's amount from the just-loaded billing data.
      // We re-fetch quickly to make sure amounts are current.
      let billingRecords: any[] = []
      try {
        const r = await fetch(`/api/billing?agent_id=${agent.agent_id}&status=outstanding`, { cache: 'no-store' })
        if (r.ok) {
          const d = await r.json()
          billingRecords = d?.records || []
        }
      } catch {
        // Fall through with empty list - the apply loop will skip ids that don't match
      }

      const debtsToApply = applied.debt_ids
        .map(id => {
          const rec = billingRecords.find((x: any) => x.id === id)
          if (!rec) return null
          return { debt_id: id, amount: rec.amount_remaining ?? rec.amount_owed }
        })
        .filter(Boolean)

      const creditsToApply = applied.credit_ids
        .map(id => {
          const rec = billingRecords.find((x: any) => x.id === id)
          if (!rec) return null
          return { credit_id: id, amount: rec.amount_remaining ?? rec.amount_owed }
        })
        .filter(Boolean)

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
          credits_to_apply: creditsToApply,
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

  const runAiChecklistReview = async () => {
    setAiReviewLoading(true)
    setAiReviewError(null)
    setAiReview(null)
    try {
      const res = await fetch(`/api/admin/transactions/${id}/ai-checklist-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: data?.transaction,
          agents: data?.agents,
          checklist: data?.checklist,
          checks: data?.checks,
          agent_billing: data?.agent_billing,
          payout_brokerages: payoutBrokerages,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Review failed')
      setAiReview(json.review)
    } catch (err: any) {
      setAiReviewError(err.message || 'Review failed')
    } finally {
      setAiReviewLoading(false)
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

  const extractContactsWithAI = async () => {
    if (!data?.transaction) return
    setExtractingContacts(true)
    setContactSuggestions([])
    try {
      const res = await fetch(`/api/admin/transactions/${id}/ai-checklist-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: data.transaction,
          agents: data.agents,
          checklist: [],
          checks: data.checks,
          agent_billing: [],
          payout_brokerages: payoutBrokerages,
          existing_contacts: contacts,
          mode: 'extract_contacts',
        }),
      })
      const json = await res.json()
      if (json.contacts && Array.isArray(json.contacts)) {
        setContactSuggestions(json.contacts)
      }
    } catch { /* best-effort */ }
    finally { setExtractingContacts(false) }
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
  // For each agent, the actual cash payout = agent_net minus staged debts plus
  // staged credits. Staged debts are paid out of brokerage funds (not the
  // agent's pocket), so they reduce what we cut to the agent.
 const totalAgentNets = agents.reduce((s: number, a: any) => {
    const baseNet = parseFloat(a.agent_net || 0)
    // When the TIA is paid, baseNet already reflects any debts_deducted
    // (saved at Mark Paid). Don't apply staged adjustments again or we'd
    // double-count, matching previewedNet logic below.
    if (a.payment_status === 'paid') {
      return s + baseNet
    }
    // Committed staged records (status=paid, offset_transaction_id set)
    const stagedRows = ((a.billing?.staged as any[]) || []).filter(
      (r: any) => r.offset_transaction_agent_id === a.id
    )
    const stagedDebtAmt = stagedRows
      .filter((r: any) => r.record_type !== 'credit')
      .reduce(
        (sum: number, d: any) =>
          sum + (parseFloat(d.amount_owed ?? 0) - parseFloat(d.amount_remaining ?? 0)),
        0
      )
    const stagedCreditAmt = stagedRows
      .filter((r: any) => r.record_type === 'credit')
      .reduce(
        (sum: number, c: any) =>
          sum + (parseFloat(c.amount_owed ?? 0) - parseFloat(c.amount_remaining ?? 0)),
        0
      )
    // UI-selected but not yet committed (billingApplied state from the billing panel)
    // These are amounts the user has checked but not yet clicked Mark Paid for.
    // Compare by ID so we only skip a UI-selected debt/credit if that specific
    // record is already in billing.staged — not just because any staged record exists.
    const uiSelected = billingApplied[a.id] || { debts: 0, credits: 0, debt_ids: [], credit_ids: [] }
    const stagedDebtIds = new Set(stagedRows.filter((r: any) => r.record_type !== 'credit').map((r: any) => r.id))
    const stagedCreditIds = new Set(stagedRows.filter((r: any) => r.record_type === 'credit').map((r: any) => r.id))
    // Sum only the UI-selected debts whose IDs are NOT already committed
    const uiDebtAmt = (a.billing?.debts || [])
      .filter((d: any) => uiSelected.debt_ids.includes(d.id) && !stagedDebtIds.has(d.id))
      .reduce((sum: number, d: any) => sum + parseFloat(d.amount_remaining ?? d.amount_owed ?? 0), 0)
    const uiCreditAmt = (a.billing?.credits || [])
      .filter((c: any) => uiSelected.credit_ids.includes(c.id) && !stagedCreditIds.has(c.id))
      .reduce((sum: number, c: any) => sum + parseFloat(c.amount_remaining ?? c.amount_owed ?? 0), 0)
    return s + (baseNet - stagedDebtAmt - uiDebtAmt + stagedCreditAmt + uiCreditAmt)
  }, 0)
  const totalExternalCommissions = payoutBrokerages.reduce((s: number, b: any) => s + parseFloat(b.commission_amount || 0), 0)

  // Commission math check: fires when any check has a cleared_date set
  // Compares total checks received vs office gross vs sum of agent nets
  const clearedChecks = checks.filter((c: any) => c.cleared_date)
  const clearedCheckTotal = clearedChecks.reduce((s: number, c: any) => s + parseFloat(c.check_amount || 0), 0)
  const officeGross = parseFloat(txn?.office_gross || 0)
  const totalAgentNetsRaw = agents.reduce((s: number, a: any) => s + parseFloat(a.agent_net || 0), 0)
  const MATH_TOLERANCE = 1.00 // $1 rounding tolerance
  const commissionMathFlags: string[] = []
  if (txn && clearedChecks.length > 0) {
    if (Math.abs(clearedCheckTotal - officeGross) > MATH_TOLERANCE) {
      commissionMathFlags.push(
        `Cleared check total ($${clearedCheckTotal.toFixed(2)}) does not match Office Gross ($${officeGross.toFixed(2)})`
      )
    }
    const expectedPayout = officeGross
    const actualPayout = totalAgentNetsRaw + totalExternalCommissions + parseFloat(txn?.office_net || 0)
    if (Math.abs(expectedPayout - actualPayout) > MATH_TOLERANCE) {
      commissionMathFlags.push(
        `Commission split does not add up: Agent Nets + External + Office Net ($${actualPayout.toFixed(2)}) vs Office Gross ($${officeGross.toFixed(2)})`
      )
    }
  }
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
        <div className="flex overflow-x-auto px-3 pb-px gap-0 border-t border-luxury-gray-5/50 touch-pan-x">
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
                        label="Sales Volume"
                        value={txn.sales_volume}
                        field="sales_volume"
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
                        label="Closed Date"
                        value={txn.closed_date}
                        field="closed_date"
                        type="date"
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
                  {/* Office Gross is read-only - auto-derived from sides by
                      the API. The auto-derive runs on single-sided deals
                      (one of listing_side / buying_side is 0); for
                      dual-sided deals admin sets the side commissions
                      directly and office_gross matches their sum. */}
                  <FieldRow
                    label="Office Gross"
                    value={fmt$(txn.office_gross || 0)}
                  />
                  {/* BTSA breakdown - itemized lines per agent appear ABOVE
                      the computed Gross row. BTSA is per-agent (stored on
                      TIA), paid in addition to the contract commission, and
                      only applies to contract roles (primary / listing /
                      co_agent). Linked rows (team_lead, momentum_partner,
                      referral_agent) always have btsa = 0 by design and
                      are filtered here defensively. */}
                  {(() => {
                    const btsaRows = (agents || [])
                      .filter((a: any) =>
                        a.agent_role !== 'team_lead' &&
                        a.agent_role !== 'momentum_partner' &&
                        a.agent_role !== 'referral_agent'
                      )
                      .filter((a: any) => parseFloat(a.btsa_amount || 0) > 0)
                    const btsaTotal = btsaRows.reduce(
                      (s: number, a: any) => s + (parseFloat(a.btsa_amount || 0) || 0),
                      0
                    )
                    const officeGross = parseFloat(txn.office_gross || 0) || 0
                    const grossTotal = officeGross + btsaTotal
                    return (
                      <>
                        {btsaRows.map((a: any) => {
                          const u = a.user
                          const name = u
                            ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
                            : 'Agent'
                          return (
                            <div
                              key={a.id}
                              className="flex justify-between items-center gap-4 py-1.5 pl-4 border-b border-luxury-gray-5/30"
                            >
                              <span className="field-label shrink-0 italic">+ BTSA: {name}</span>
                              <span className="text-xs text-green-600 text-right font-mono">
                                +{fmt$(a.btsa_amount)}
                              </span>
                            </div>
                          )
                        })}
                        <FieldRow
                          label="Gross"
                          value={
                            <span className="font-semibold text-luxury-gray-1">{fmt$(grossTotal)}</span>
                          }
                        />
                      </>
                    )
                  })()}
                  <FieldRow
                    label="Office Net"
                    value={
                      <span className="font-semibold text-green-600">{fmt$(txn.office_net)}</span>
                    }
                  />
                  {txn.bonus_amount > 0 && (
                    <FieldRow label="Bonus" value={fmt$(txn.bonus_amount)} />
                  )}
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
                            {formatAgentRole(a.agent_role)}
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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
                                  {formatAgentRole(a.agent_role)}
                                  {a.side ? ` · ${sideLabel(a.side)} side` : ''}
                                  {' · '}{a.commission_plan_friendly || a.user?.commission_plan || a.commission_plan || '--'}
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
                              {/* Recalculate - excluded for retainer rows, which have their own
                                  fee structure (basis minus retainer_fee = net) and don't use the
                                  commission cascade. Without this guard, clicking Recalculate
                                  on a retainer applies the commission plan split and corrupts
                                  amount_1099_reportable and agent_gross. */}
                              {!isPaid && ['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role) && a.installment_kind !== 'retainer' && (
                                <button
                                  onClick={() => recalculateRow(a)}
                                  disabled={recalcRowId === a.id}
                                  className="btn btn-secondary text-xs px-2 py-1"
                                  title="Recompute split + linked rows from current basis, plan, and lead source"
                                >
                                  {recalcRowId === a.id ? 'Recalculating...' : 'Recalculate'}
                                </button>
                              )}
                              {/* + Add Retainer - only on primary/listing/co rows that aren't themselves retainers */}
                              {['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role) && a.installment_kind !== 'retainer' && (
                                <button
                                  onClick={() => openRetainerModal(a)}
                                  className="btn btn-secondary text-xs px-2 py-1"
                                  title="Record a retainer payment for this agent (separate from the deal commission)"
                                >
                                  + Retainer
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

                          {/* Team member lead source picker - only when team
                              actually has splits configured (otherwise the
                              prompt has no effect on math). Limited to the
                              contract-bearing roles: the lead source only
                              affects the PRIMARY's split, not carve-out rows
                              like referral_agent, team_lead, or
                              momentum_partner. */}
                          {calc?.is_team_member && calc?.has_team_splits && !isPaid &&
                            ['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role) && (
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

                          {/* Momentum partner display - only meaningful on
                              the primary's row, since the momentum payout is
                              derived from the primary's commission. */}
                          {calc?.momentum_partner_name && calc.momentum_partner_payout > 0 &&
                            ['primary_agent', 'listing_agent', 'co_agent'].includes(a.agent_role) && (
                            <div className="mb-3 p-3 bg-green-50/50 border border-green-200 rounded-lg">
                              <p className="text-xs text-green-700">
                                <span className="font-semibold">{calc.momentum_partner_name}</span> earns {calc.momentum_partner_pct}% momentum partner fee: {fmt$(calc.momentum_partner_payout)}
                                <span className="text-green-600 ml-1">(from brokerage side)</span>
                              </p>
                            </div>
                          )}

                          {/* Financial breakdown - sectioned layout with overrides */}
                          {(() => {
                            const applied = billingApplied[a.id] || { debts: 0, credits: 0, debt_ids: [], credit_ids: [] }
                            return (
                              <AgentCardFinancials
                                agent={a}
                                txn={txn}
                                calc={calc}
                                isPaid={isPaid}
                                appliedDebts={applied.debts}
                                appliedCredits={applied.credits}
                                onSaveField={(field, value, markOverridden) =>
                                  saveOverridableField(a.id, field, value, markOverridden)
                                }
                                onClearOverride={(field) => clearOverrideForField(a.id, field)}
                                onSaveTextField={(field, value) =>
                                  updateInternalAgent(a.id, { [field]: value })
                                }
                                onSaveBasisMode={(mode, basisPercentage) =>
                                  updateInternalAgent(a.id, {
                                    basis_input_mode: mode,
                                    basis_percentage: mode === 'percentage' ? basisPercentage : null,
                                  })
                                }
                              />
                            )
                          })()}

                          {/* Billing - debts and credits, between adjustments and totals */}
                          <AgentBillingPanel
                            agentId={a.agent_id}
                            tiaId={a.id}
                            transactionId={id}
                            isPaid={isPaid}
                            onAppliedChange={handleBillingChange(a.id)}
                            onReversedTia={loadData}
                          />

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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
                                <label className="field-label">Check Date</label>
                                <input
                                  type="date"
                                  className="input-luxury text-xs"
                                  value={checkEdit.check_date || ''}
                                  onChange={e => updateCheckField(check.id, 'check_date', e.target.value)}
                                  onBlur={() => updateCheck(check.id, { check_date: checkEdit.check_date })}
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
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
                                transactionId={id}
                                onUploaded={url => updateCheck(check.id, { check_image_url: url })}
                                onExtracted={fields => {
                                  // Merge extracted fields into the local edit state and save
                                  const updates: any = {}
                                  if (fields.check_amount != null) {
                                    updates.check_amount = fields.check_amount
                                  }
                                  if (fields.check_from) {
                                    updates.check_from = fields.check_from
                                  }
                                  if (fields.check_number) {
                                    updates.check_number = fields.check_number
                                  }
                                  if (fields.check_date) {
                                    updates.check_date = fields.check_date
                                  }
                                  if (fields.cleared_date) {
                                    updates.cleared_date = fields.cleared_date
                                    // Received and deposited are the day before cleared:
                                    // staff writes the clear date on the check when depositing,
                                    // so received and deposited both = clear date minus 1 day
                                    const clearD = new Date(fields.cleared_date + 'T12:00:00')
                                    clearD.setDate(clearD.getDate() - 1)
                                    const dayBefore = clearD.toISOString().split('T')[0]
                                    updates.deposited_date = dayBefore
                                    updates.received_date = dayBefore
                                  }
                                  if (fields.payment_method) {
                                    updates.payment_method = fields.payment_method
                                  }
                                  if (fields.funds_status) {
                                    const existing = updates.notes || checkEdit.notes || ''
                                    const statusNote = `Funds status: ${fields.funds_status}`
                                    updates.notes = existing ? `${existing}\n${statusNote}` : statusNote
                                  }
                                  if (fields.notes) {
                                    const existing = checkEdit.notes || ''
                                    updates.notes = existing ? `${existing}\n${fields.notes}` : fields.notes
                                  }
                                  // Update local edit state first so inputs show new values
                                  setEditChecksData(prev => ({
                                    ...prev,
                                    [check.id]: { ...prev[check.id], ...updates },
                                  }))
                                  // Then save to DB
                                  updateCheck(check.id, updates)
                                }}
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

                    {/* Commission math warning — auto-fires when a check clears */}
                    {commissionMathFlags.length > 0 && (
                      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="text-[11px] font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                          <AlertCircle size={12} /> Commission Math
                        </p>
                        {commissionMathFlags.map((flag, i) => (
                          <p key={i} className="text-[11px] text-amber-700">{flag}</p>
                        ))}
                      </div>
                    )}

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
                          // Staged debts/credits for THIS tia (selected on
                          // the commissions tab - debt rows already marked
                          // paid+offset, agent's TIA may still be pending).
                          const stagedAll = ((a.billing?.staged as any[]) || []).filter(
                            (r: any) => r.offset_transaction_agent_id === a.id
                          )
                          const stagedDebts = stagedAll.filter((r: any) => r.record_type !== 'credit')
                          const stagedCredits = stagedAll.filter((r: any) => r.record_type === 'credit')
                          const stagedDebtTotal = stagedDebts.reduce(
                            (s: number, d: any) => s + (parseFloat(d.amount_owed ?? 0) - parseFloat(d.amount_remaining ?? 0)),
                            0
                          )
                          const stagedCreditTotal = stagedCredits.reduce(
                            (s: number, c: any) => s + (parseFloat(c.amount_owed ?? 0) - parseFloat(c.amount_remaining ?? 0)),
                            0
                          )
                          // When the TIA is paid, a.agent_net already reflects
                          // any debts_deducted (saved at Mark Paid). Don't apply
                          // staged adjustments again or we'd double-count.
                          const previewedNet = a.payment_status === 'paid'
                            ? parseFloat(a.agent_net || 0)
                            : parseFloat(a.agent_net || 0) - stagedDebtTotal + stagedCreditTotal
                          return (
                            <div key={a.id} className="inner-card">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-xs font-semibold text-luxury-gray-1">{name}</p>
                                  <p className="text-xs text-luxury-gray-3">
                                    {formatAgentRole(a.agent_role)} · {a.payment_status || 'pending'}
                                  </p>
                                  {a.payment_date && (
                                    <p className="text-xs text-luxury-gray-3">{fmtDate(a.payment_date)}</p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <span className="text-xs font-semibold text-luxury-gray-1">
                                    {fmt$(previewedNet)}
                                  </span>
                                  {(stagedDebtTotal > 0 || stagedCreditTotal > 0) && a.payment_status !== 'paid' && (
                                    <p className="text-[10px] text-luxury-gray-3">
                                      after deductions
                                    </p>
                                  )}
                                </div>
                              </div>
                              {(stagedDebts.length > 0 || stagedCredits.length > 0) && a.payment_status !== 'paid' && (
                                <div className="mt-2 pt-2 border-t border-luxury-gray-5/50 space-y-1">
                                  {stagedDebts.map((d: any) => {
                                    const applied = parseFloat(d.amount_owed ?? 0) - parseFloat(d.amount_remaining ?? 0)
                                    return (
                                      <div key={d.id} className="flex items-center justify-between text-[11px]">
                                        <span className="text-luxury-gray-2">{d.description || d.debt_type || 'Debt'}</span>
                                        <span className="text-red-700">− {fmt$(applied)}</span>
                                      </div>
                                    )
                                  })}
                                  {stagedCredits.map((c: any) => {
                                    const applied = parseFloat(c.amount_owed ?? 0) - parseFloat(c.amount_remaining ?? 0)
                                    return (
                                      <div key={c.id} className="flex items-center justify-between text-[11px]">
                                        <span className="text-luxury-gray-2">{c.description || 'Credit'}</span>
                                        <span className="text-green-700">+ {fmt$(applied)}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
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

                      {/* AI Review panel */}
                      <div className="mb-3">
                        <button
                          onClick={runAiChecklistReview}
                          disabled={aiReviewLoading}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-luxury-accent/40 text-luxury-accent text-xs font-medium hover:bg-luxury-accent/5 transition-colors disabled:opacity-50"
                        >
                          {aiReviewLoading ? (
                            <>
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-luxury-accent animate-pulse" />
                              Reviewing...
                            </>
                          ) : (
                            <>
                              <span className="text-base leading-none">&#10024;</span>
                              Review Checklist with AI
                            </>
                          )}
                        </button>

                        {aiReviewError && (
                          <p className="mt-2 text-xs text-red-500 text-center">{aiReviewError}</p>
                        )}

                        {aiReview && (
                          <div className="mt-3 space-y-2">
                            {/* Overall summary */}
                            <div className={`p-3 rounded-lg border text-xs ${aiReview.ready_to_pay ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold">
                                  {aiReview.ready_to_pay ? 'Looks good to pay' : 'Items need attention'}
                                </span>
                              </div>
                              <p>{aiReview.overall}</p>
                            </div>

                            {/* Critical flags */}
                            {aiReview.flags && aiReview.flags.length > 0 && (
                              <div className="p-3 rounded-lg border bg-red-50 border-red-200 text-red-800 text-xs">
                                <p className="font-semibold mb-1">Flags</p>
                                <ul className="space-y-1">
                                  {aiReview.flags.map((flag: string, i: number) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                      <span className="mt-0.5 shrink-0">&#9679;</span>
                                      <span>{flag}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Per-item notes */}
                            <div className="space-y-1.5">
                              {aiReview.items.map((item: any, i: number) => (
                                <div
                                  key={i}
                                  className={`p-2.5 rounded-lg border text-xs ${
                                    item.status === 'ok'
                                      ? 'bg-green-50/60 border-green-200/60 text-green-800'
                                      : item.status === 'flagged'
                                        ? 'bg-red-50 border-red-200 text-red-800'
                                        : item.status === 'missing'
                                          ? 'bg-orange-50 border-orange-200 text-orange-800'
                                          : 'bg-amber-50/60 border-amber-200/60 text-amber-800'
                                  }`}
                                >
                                  <p className="font-semibold mb-0.5">{item.label}</p>
                                  <p className="opacity-90">{item.note}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

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
                <div className="flex items-center gap-2">
                  <button
                    onClick={extractContactsWithAI}
                    disabled={extractingContacts}
                    className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50"
                  >
                    {extractingContacts ? 'Reading...' : <><span className="text-sm leading-none">&#10024;</span> Find Contacts</>}
                  </button>
                  <button onClick={openAddContact} className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    <Plus size={13} /> Add Contact
                  </button>
                </div>
              </div>

              {contactSuggestions.length > 0 && (
                <div className="container-card border border-luxury-accent/30 bg-amber-50">
                  <p className="text-xs font-semibold text-luxury-gray-1 mb-2 flex items-center gap-1.5">
                    <span className="text-base leading-none">&#10024;</span>
                    Claude found these contacts in the transaction data
                  </p>
                  <div className="space-y-2 mb-3">
                    {contactSuggestions.map((c: any, i: number) => (
                      <div key={i} className="flex items-start justify-between gap-2 p-2 bg-white rounded border border-luxury-gray-5">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-luxury-gray-1">{c.name || 'Unknown'}</p>
                          <p className="text-[10px] text-luxury-gray-3">
                            {c.contact_type?.replace(/_/g, ' ')}
                            {c.email ? ` · ${c.email}` : ''}
                            {c.phone ? ` · ${c.phone}` : ''}
                            {c.company ? ` · ${c.company}` : ''}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setContactForm({
                              contact_type: c.contact_type || '',
                              contact_type_other: '',
                              name: c.name || '',
                              phone: c.phone || '',
                              email: c.email || '',
                              company: c.company || '',
                              notes: c.notes || '',
                            })
                            setContactModal({ open: true, editing: null })
                          }}
                          className="text-[10px] font-semibold px-2 py-1 bg-luxury-accent text-white rounded hover:bg-luxury-accent/90 shrink-0"
                        >
                          Add
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setContactSuggestions([])} className="text-[10px] text-luxury-gray-3 hover:underline">
                    Dismiss
                  </button>
                </div>
              )}

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
            <ComplianceDocumentsTab
              transactionId={id}
              transactionAddress={txn.property_address || ''}
              oneDriveFolderUrl={txn.onedrive_folder_url}
              onFillTransactionFields={async (fields) => {
                // Map extracted fields to transaction columns, skip contact-type fields
                const CONTACT_FIELDS = ['tenant_name', 'agent_name', 'payer_name', 'payer_email', 'seller_name', 'seller_email']
                const txnFields: Record<string, any> = {}
                for (const [k, v] of Object.entries(fields)) {
                  if (CONTACT_FIELDS.includes(k)) continue
                  if (k === 'commission_amount') { txnFields['office_gross'] = v }
                  else if (k === 'listing_price') { txnFields['monthly_rent'] = v }
                  else { txnFields[k] = v }
                }
                if (Object.keys(txnFields).length > 0) await updateTransaction(txnFields)
              }}
            />
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
            return (
              <div key={a.id} className="container-card p-3">
                <button
                  className="flex items-center justify-between w-full mb-2"
                  onClick={() => toggleAgent(a.id)}
                >
                  <span className="section-title flex items-center gap-1.5">
                    <User size={12} /> {formatAgentRole(a.agent_role)}
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
                    {a.agent_id ? (
                      <Link
                        href={`/admin/users/${a.agent_id}`}
                        className="block text-sm font-semibold text-luxury-accent hover:underline mb-0.5"
                      >
                        {u ? fmtName(u) : a.agent_id}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold text-luxury-gray-1 mb-0.5">
                        {u ? fmtName(u) : 'Unknown Agent'}
                      </p>
                    )}
                    <p className="text-xs text-luxury-gray-3 mb-2">
                      {u?.office_email || u?.email || ''}
                    </p>
                    {u && (
                      <div className="space-y-0">
                        <FieldRow label="Office" value={u.office} />
                        <FieldRow label="Commission Plan" value={a.commission_plan_friendly || u.commission_plan} />
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

                    {/* Display-only: unpaid monthly fees for this agent.
                        Does not affect commission, agent_net, or debts_deducted. */}
                    {a.agent_id && monthlyFeeBalances[a.agent_id] && monthlyFeeBalances[a.agent_id].count > 0 && (
                      <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded text-xs">
                        <p className="font-semibold text-red-700 mb-1">
                          Unpaid Monthly Fees: ${monthlyFeeBalances[a.agent_id].total.toFixed(2)}
                          {' '}({monthlyFeeBalances[a.agent_id].count})
                        </p>
                        <div className="space-y-0.5">
                          {monthlyFeeBalances[a.agent_id].invoices.map((inv: any) => (
                            <div key={inv.id} className="flex justify-between text-red-700">
                              <span className="truncate pr-2">{inv.description}</span>
                              <span className="flex-shrink-0">${Number(inv.amount_due).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
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

                    {/* Agent Billing - per-agent debts/credits across all
                        transactions. Renders inside each agent card so every
                        agent on this deal has their own visible billing
                        summary. Reads `a.billing` which the API computes for
                        every TIA, not just the deal's primary. */}
                    {a.billing && (
                      <div className="mt-2 p-2 bg-luxury-light rounded">
                        <p className="text-xs font-semibold text-luxury-gray-2 mb-1 flex items-center gap-1.5">
                          <DollarSign size={11} /> Agent Billing
                        </p>
                        {a.billing.debts.length === 0 && a.billing.credits.length === 0 ? (
                          <p className="text-xs text-luxury-gray-3">No outstanding balances.</p>
                        ) : (
                          <>
                            {a.billing.debts.map((d: any) => (
                              <div key={d.id} className="flex justify-between items-baseline gap-2 py-0.5">
                                <span className="text-xs text-luxury-gray-3 truncate">
                                  {d.description}
                                </span>
                                <span className="text-xs font-semibold text-orange-600 shrink-0">
                                  {fmt$(d.amount_remaining ?? d.amount_owed)}
                                </span>
                              </div>
                            ))}
                            {a.billing.credits.map((c: any) => (
                              <div key={c.id} className="flex justify-between items-baseline gap-2 py-0.5">
                                <span className="text-xs text-luxury-gray-3 truncate">
                                  {c.description}
                                </span>
                                <span className="text-xs font-semibold text-green-600 shrink-0">
                                  -{fmt$(c.amount_remaining ?? c.amount_owed)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between items-center pt-1 mt-1 border-t border-luxury-gray-5/50">
                              <span className="text-xs font-semibold text-luxury-gray-2">
                                Net Balance
                              </span>
                              <span
                                className={`text-xs font-bold ${a.billing.net_balance > 0 ? 'text-orange-600' : 'text-green-600'}`}
                              >
                                {a.billing.net_balance > 0
                                  ? fmt$(a.billing.net_balance)
                                  : `-${fmt$(Math.abs(a.billing.net_balance))}`}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}

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
              {(() => {
                // Use the canonical formula so the Mark Paid modal matches
                // the agent card exactly. Inline math here previously omitted
                // BTSA (additive) and rebate (deduction), which made the 1099
                // shown on the modal disagree with the 1099 on the card.
                const a = markPaidModal.agent
                const live = computeCommission({
                  agent_gross: a.agent_gross,
                  btsa_amount: a.btsa_amount,
                  processing_fee: a.processing_fee,
                  coaching_fee: a.coaching_fee,
                  other_fees: a.other_fees,
                  rebate_amount: a.rebate_amount,
                  credits_applied: 0,
                  debts_deducted: 0,
                })
                const agentGross = parseFloat(a.agent_gross || 0) || 0
                const btsaAmt = parseFloat(a.btsa_amount || 0) || 0
                const processing = parseFloat(a.processing_fee || 0) || 0
                const coaching = parseFloat(a.coaching_fee || 0) || 0
                const otherF = parseFloat(a.other_fees || 0) || 0
                const rebateAmt = parseFloat(a.rebate_amount || 0) || 0
                const feesTotal = processing + coaching + otherF
                return (
                  <div className="inner-card">
                    <p className="text-xs font-semibold text-luxury-gray-2 mb-2">Payment Summary</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-luxury-gray-3">Agent Gross</span>
                        <span>{fmt$(agentGross)}</span>
                      </div>
                      {btsaAmt > 0 && (
                        <div className="flex justify-between">
                          <span className="text-luxury-gray-3">+ BTSA</span>
                          <span className="text-green-600">+{fmt$(btsaAmt)}</span>
                        </div>
                      )}
                      {feesTotal > 0 && (
                        <div className="flex justify-between">
                          <span className="text-luxury-gray-3">- Fees</span>
                          <span className="text-red-500">-{fmt$(feesTotal)}</span>
                        </div>
                      )}
                      {rebateAmt > 0 && (
                        <div className="flex justify-between">
                          <span className="text-luxury-gray-3">- Rebate</span>
                          <span className="text-red-500">-{fmt$(rebateAmt)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 border-t border-luxury-gray-5/30">
                        <span className="font-semibold">1099 Amount</span>
                        <span className="font-semibold">{fmt$(live.amount_1099)}</span>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* Note: Debts and credits are selected on the agent card's
                  Billing panel before opening this modal. The selected items
                  appear in the agent card's Net (preview). When you confirm
                  here, those selected items are applied. */}

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {/* Retainer modal */}
      {retainerModal.open && retainerModal.forAgent && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeRetainerModal}
        >
          <div
            className="bg-white rounded-lg max-w-md w-full p-5"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-luxury-gray-1 mb-1">
              Add Retainer Payment
            </h2>
            <p className="text-xs text-luxury-gray-3 mb-4">
              For {retainerModal.forAgent.user?.preferred_first_name || retainerModal.forAgent.user?.first_name || 'this agent'}.
              This creates a separate row from the deal commission. No team lead, no momentum partner, no BTSA.
            </p>

            <div className="space-y-3">
              <div>
                <label className="field-label">Retainer Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-luxury text-sm"
                  value={retainerModal.retainerAmount}
                  onChange={e => setRetainerModal(prev => ({ ...prev, retainerAmount: e.target.value, error: null }))}
                  placeholder="0.00"
                  autoFocus
                />
                <p className="text-[10px] text-luxury-gray-3 mt-0.5">Total amount the brokerage received for this retainer</p>
              </div>
              <div>
                <label className="field-label">Office Retainer Fee</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-luxury text-sm"
                  value={retainerModal.retainerFee}
                  onChange={e => setRetainerModal(prev => ({ ...prev, retainerFee: e.target.value, error: null }))}
                  placeholder="0.00"
                />
                <p className="text-[10px] text-luxury-gray-3 mt-0.5">What the office keeps. Agent gets the rest.</p>
              </div>

              {/* Live preview */}
              {(() => {
                const amt = parseFloat(retainerModal.retainerAmount || '0') || 0
                const fee = parseFloat(retainerModal.retainerFee || '0') || 0
                const net = amt - fee
                if (amt > 0) {
                  return (
                    <div className="inner-card text-xs">
                      <div className="flex justify-between"><span className="text-luxury-gray-3">Retainer</span><span>{fmt$(amt)}</span></div>
                      <div className="flex justify-between"><span className="text-luxury-gray-3">- Office fee</span><span className="text-red-500">-{fmt$(fee)}</span></div>
                      <div className="flex justify-between font-semibold pt-1 border-t border-luxury-gray-5/30 mt-1">
                        <span>Agent gets</span>
                        <span className="text-luxury-accent">{fmt$(net)}</span>
                      </div>
                    </div>
                  )
                }
                return null
              })()}

              {retainerModal.error && (
                <p className="text-xs text-red-600">{retainerModal.error}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={closeRetainerModal}
                disabled={retainerModal.saving}
                className="btn btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                onClick={submitRetainer}
                disabled={retainerModal.saving || !retainerModal.retainerAmount}
                className="btn btn-primary text-xs"
              >
                {retainerModal.saving ? 'Saving...' : 'Add Retainer Row'}
              </button>
            </div>
          </div>
        </div>
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

