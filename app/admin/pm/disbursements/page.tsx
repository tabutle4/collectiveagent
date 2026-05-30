'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Banknote, Search, ArrowLeft, Send, CheckCircle, Clock, AlertCircle, Building2, Plus, X, Pencil } from 'lucide-react'

interface Disbursement {
  id: string
  gross_rent: number
  management_fee: number
  deposit_amount: number
  other_deductions: number
  other_deductions_description: string | null
  net_amount: number
  payment_status: string
  payment_date: string | null
  payment_method: string | null
  payment_reference: string | null
  payload_payout_id: string | null
  period_month: number
  period_year: number
  notes: string | null
  landlord_id: string
  tenant_invoice_id: string
  property_id: string
  landlords?: {
    id: string
    first_name: string
    last_name: string
    email: string
    bank_status: string
    payload_payment_method_id: string | null
  }
  managed_properties?: {
    property_address: string
    unit: string | null
    city: string
  }
  tenant_invoices?: {
    status: string
    paid_at: string | null
  }
}

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  bank_status: string
  managed_properties?: {
    id: string
    property_address: string
    city: string
    status: string
    pm_agreement_id: string | null
  }[]
  pm_agreements?: {
    id: string
    status: string
    management_fee_pct: number
    management_fee_flat: number | null
  }[]
}

interface Stats {
  pending: number
  processing: number
  completed: number
  failed: number
  totalPending: number
}

export default function DisbursementsPage() {
  const router = useRouter()
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    totalPending: 0
  })

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [landlords, setLandlords] = useState<Landlord[]>([])
  const [loadingLandlords, setLoadingLandlords] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    landlord_id: '',
    property_id: '',
    gross_rent: '',
    management_fee: '',
    deposit_amount: '',
    other_deductions: '',
    other_deductions_description: '',
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    notes: '',
  })
  // Disbursement target: landlord (default) or tenant. Tenant mode uses a
  // simpler form because tenant disbursements have no fee splits.
  const [disbursementTarget, setDisbursementTarget] = useState<'landlord' | 'tenant'>('landlord')
  const [tenantForm, setTenantForm] = useState({
    tenant_id: '',
    amount: '',
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    notes: '',
  })
  // Pending deductions for the selected property: admin checks which ones
  // to attach to this disbursement at create time.
  const [pendingDeductions, setPendingDeductions] = useState<any[]>([])
  const [selectedDeductionIds, setSelectedDeductionIds] = useState<string[]>([])
  const [tenantsForLandlord, setTenantsForLandlord] = useState<any[]>([])
  // Held-in-trust balance for the selected property, scoped to the
  // current landlord. Loaded on property change so tenant disbursement
  // mode can warn when the refund amount exceeds available funds.
  const [heldInTrust, setHeldInTrust] = useState<number | null>(null)
  // Counter ref to ignore stale fetches when admin switches property
  // rapidly. Each property change bumps the counter; only fetches whose
  // counter still matches the latest get applied to state.
  const propertyFetchCounter = useRef(0)
  // Edit disbursement modal state. Distinct from create modal so admins
  // can flip between viewing the list and editing a row without losing the
  // half-built create form (and vice versa).
  const [editingDisbursement, setEditingDisbursement] = useState<Disbursement | null>(null)
  const [editForm, setEditForm] = useState({
    gross_rent: '',
    management_fee: '',
    deposit_amount: '',
    other_deductions: '',
    other_deductions_description: '',
    payment_status: 'pending',
    payment_date: '',
    payment_method: '',
    payment_reference: '',
    notes: '',
  })
  const [savingEdit, setSavingEdit] = useState(false)

  // Charged-basis monthly fees modal state. Opens via "Run Monthly
  // Charged Fees" button. Calls preview API first, shows table of unpaid
  // invoices that would be auto-charged, then calls run API on confirm.
  const [showChargedBasisModal, setShowChargedBasisModal] = useState(false)
  const today = new Date()
  // Default to previous month (most common use: day 1-7 of new month,
  // processing prior month's unpaid invoices).
  const defaultPrevMonth = today.getMonth() === 0 ? 12 : today.getMonth()
  const defaultPrevYear = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear()
  const [chargedBasisForm, setChargedBasisForm] = useState({
    month: defaultPrevMonth,
    year: defaultPrevYear,
  })
  const [chargedBasisPreview, setChargedBasisPreview] = useState<any | null>(null)
  const [chargedBasisLoading, setChargedBasisLoading] = useState(false)
  const [chargedBasisRunning, setChargedBasisRunning] = useState(false)

  // Create Statement modal state - small wizard to pick landlord +
  // property + period, then redirects to the statement view.
  const [showCreateStatementModal, setShowCreateStatementModal] = useState(false)
  const [statementForm, setStatementForm] = useState({
    landlord_id: '',
    property_id: '',
    period_type: 'monthly' as 'monthly' | 'annual',
    period_month: defaultPrevMonth,
    period_year: defaultPrevYear,
  })
  const [statementCreating, setStatementCreating] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const res = await fetch('/api/auth/me')
    if (!res.ok) {
      router.push('/auth/login')
      return
    }
    loadDisbursements()
  }

  const loadDisbursements = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)

      const res = await fetch(`/api/pm/disbursements?${params}`)
      if (res.ok) {
        const data = await res.json()
        setDisbursements(data.disbursements || [])
        calculateStats(data.disbursements || [])
      }
    } catch (err) {
      console.error('Failed to load disbursements:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadLandlords = async () => {
    setLoadingLandlords(true)
    try {
      const res = await fetch('/api/pm/landlords')
      if (res.ok) {
        const data = await res.json()
        setLandlords(data.landlords || [])
      }
    } catch (err) {
      console.error('Failed to load landlords:', err)
    } finally {
      setLoadingLandlords(false)
    }
  }

  const calculateStats = (disbursementList: Disbursement[]) => {
    const newStats: Stats = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      totalPending: 0
    }
    
    disbursementList.forEach(d => {
      if (d.payment_status === 'pending') {
        newStats.pending++
        newStats.totalPending += d.net_amount
      }
      else if (d.payment_status === 'processing') newStats.processing++
      // 'paid' is the value written by manual mark-paid; 'completed' is reserved
      // for future ACH automation. Both indicate the disbursement is settled.
      else if (d.payment_status === 'completed' || d.payment_status === 'paid') newStats.completed++
      else if (d.payment_status === 'failed') newStats.failed++
    })
    
    setStats(newStats)
  }

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(loadDisbursements, 300)
      return () => clearTimeout(timer)
    }
  }, [search, statusFilter])

  const openEditDisbursement = (disbursement: Disbursement) => {
    setEditingDisbursement(disbursement)
    setEditForm({
      gross_rent: String(disbursement.gross_rent ?? ''),
      management_fee: String(disbursement.management_fee ?? ''),
      deposit_amount: String(disbursement.deposit_amount ?? ''),
      other_deductions: String(disbursement.other_deductions ?? ''),
      other_deductions_description: disbursement.other_deductions_description || '',
      payment_status: disbursement.payment_status,
      payment_date: disbursement.payment_date || '',
      payment_method: disbursement.payment_method || '',
      payment_reference: disbursement.payment_reference || '',
      notes: disbursement.notes || '',
    })
  }

  const closeEditDisbursement = () => {
    setEditingDisbursement(null)
  }

  const saveEditDisbursement = async () => {
    if (!editingDisbursement) return

    // Guard rails. Net is recomputed server-side from gross + mgmt + deductions,
    // but we surface a client-side preview to avoid wasted round trips.
    if (parseFloat(editForm.gross_rent) < 0) {
      alert('Gross rent cannot be negative')
      return
    }

    setSavingEdit(true)
    try {
      const body: Record<string, any> = {
        gross_rent: parseFloat(editForm.gross_rent) || 0,
        management_fee: parseFloat(editForm.management_fee) || 0,
        deposit_amount: parseFloat(editForm.deposit_amount) || 0,
        other_deductions: parseFloat(editForm.other_deductions) || 0,
        other_deductions_description: editForm.other_deductions_description || null,
        payment_status: editForm.payment_status,
        payment_date: editForm.payment_date || null,
        payment_method: editForm.payment_method || null,
        payment_reference: editForm.payment_reference || null,
        notes: editForm.notes || null,
      }

      const res = await fetch(`/api/pm/disbursements/${editingDisbursement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        closeEditDisbursement()
        loadDisbursements()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save disbursement')
      }
    } catch (err) {
      console.error('Failed to save disbursement:', err)
      alert('Failed to save disbursement')
    } finally {
      setSavingEdit(false)
    }
  }

  // Charged-basis modal handlers
  const openChargedBasisModal = () => {
    setShowChargedBasisModal(true)
    setChargedBasisPreview(null)
    // Auto-load preview for default month on open
    loadChargedBasisPreview(defaultPrevMonth, defaultPrevYear)
  }

  const closeChargedBasisModal = () => {
    setShowChargedBasisModal(false)
    setChargedBasisPreview(null)
  }

  const loadChargedBasisPreview = async (month: number, year: number) => {
    setChargedBasisLoading(true)
    setChargedBasisPreview(null)
    try {
      const res = await fetch('/api/pm/charged-basis-mgmt-fees/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, year }),
      })
      const json = await res.json()
      if (res.ok) {
        setChargedBasisPreview(json)
      } else {
        alert(json.error || 'Failed to load preview')
      }
    } catch (err) {
      console.error('Failed to load charged-basis preview:', err)
      alert('Failed to load preview')
    } finally {
      setChargedBasisLoading(false)
    }
  }

  const runChargedBasis = async () => {
    if (!chargedBasisPreview) return
    if (chargedBasisPreview.pendingCount === 0) {
      alert('Nothing to charge')
      return
    }

    setChargedBasisRunning(true)
    try {
      const res = await fetch('/api/pm/charged-basis-mgmt-fees/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: chargedBasisForm.month,
          year: chargedBasisForm.year,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        const msg = json.created === 1
          ? '1 deduction created'
          : `${json.created} deductions created`
        const skippedMsg = json.skipped > 0 ? ` (${json.skipped} already charged)` : ''
        alert(`Done. ${msg}${skippedMsg}.`)
        closeChargedBasisModal()
      } else {
        alert(json.error || 'Failed to run charged-basis')
      }
    } catch (err) {
      console.error('Failed to run charged-basis:', err)
      alert('Failed to run')
    } finally {
      setChargedBasisRunning(false)
    }
  }

  // Create Statement modal handler - posts to the new statement endpoint
  // and redirects to the statement view on success.
  const createStatement = async () => {
    if (!statementForm.landlord_id || !statementForm.property_id) {
      alert('Pick a landlord and property')
      return
    }

    setStatementCreating(true)
    try {
      const body: Record<string, any> = {
        landlord_id: statementForm.landlord_id,
        property_id: statementForm.property_id,
        period_type: statementForm.period_type,
        period_year: statementForm.period_year,
      }
      if (statementForm.period_type === 'monthly') {
        body.period_month = statementForm.period_month
      }
      const res = await fetch('/api/pm/statements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        // Redirect to statement view (admin side)
        window.location.href = `/admin/pm/statements/${json.statement.id}`
      } else {
        alert(json.error || 'Failed to generate statement')
      }
    } catch (err) {
      console.error('Failed to generate statement:', err)
      alert('Failed to generate statement')
    } finally {
      setStatementCreating(false)
    }
  }

  const formatDate = (date: string) => {
    const dateStr = date.includes('T') ? date : `${date}T12:00:00`
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { bg: string; icon: React.ReactNode }> = {
      pending: { bg: 'bg-amber-50 text-amber-700', icon: <Clock size={12} /> },
      processing: { bg: 'bg-blue-50 text-blue-700', icon: <Send size={12} /> },
      completed: { bg: 'bg-green-50 text-green-700', icon: <CheckCircle size={12} /> },
      // 'paid' shares styling with 'completed' - both are settled terminal states.
      paid: { bg: 'bg-green-50 text-green-700', icon: <CheckCircle size={12} /> },
      failed: { bg: 'bg-red-50 text-red-700', icon: <AlertCircle size={12} /> },
    }
    const style = styles[status] || styles.pending
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${style.bg}`}>
        {style.icon}
        {status}
      </span>
    )
  }

  const processDisbursement = async (disbursementId: string) => {
    if (processingId) return
    
    const disbursement = disbursements.find(d => d.id === disbursementId)
    if (!disbursement) return
    
    // Check if landlord has bank connected
    if (!disbursement.landlords?.payload_payment_method_id) {
      alert('Landlord has not connected their bank account. Send them an activation link first.')
      return
    }
    
    if (!confirm(`Process ACH payout of ${formatMoney(disbursement.net_amount)} to ${disbursement.landlords.first_name} ${disbursement.landlords.last_name}?`)) {
      return
    }
    
    setProcessingId(disbursementId)
    
    try {
      const res = await fetch('/api/pm/disbursements/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disbursement_id: disbursementId })
      })
      
      if (res.ok) {
        loadDisbursements()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to process disbursement')
      }
    } catch (err) {
      console.error('Failed to process disbursement:', err)
      alert('Failed to process disbursement')
    } finally {
      setProcessingId(null)
    }
  }

  const canProcess = (disbursement: Disbursement) => {
    return (
      disbursement.payment_status === 'pending' &&
      disbursement.landlords?.bank_status === 'connected' &&
      disbursement.landlords?.payload_payment_method_id
    )
  }

  const openCreateModal = () => {
    setCreateForm({
      landlord_id: '',
      property_id: '',
      gross_rent: '',
      management_fee: '',
      deposit_amount: '',
      other_deductions: '',
      other_deductions_description: '',
      period_month: new Date().getMonth() + 1,
      period_year: new Date().getFullYear(),
      notes: '',
    })
    setTenantForm({
      tenant_id: '',
      amount: '',
      period_month: new Date().getMonth() + 1,
      period_year: new Date().getFullYear(),
      notes: '',
    })
    setDisbursementTarget('landlord')
    setPendingDeductions([])
    setSelectedDeductionIds([])
    setTenantsForLandlord([])
    setHeldInTrust(null)
    setShowCreateModal(true)
    loadLandlords()
  }

  // Locate the agreement attached to a specific property within the loaded
  // landlord blob. A landlord may have several agreements (one per property);
  // resolving by property is required to avoid picking a wrong fee structure.
  const getAgreementForProperty = (landlordId: string, propertyId: string) => {
    const landlord = landlords.find(l => l.id === landlordId)
    if (!landlord) return null
    const property = landlord.managed_properties?.find(p => p.id === propertyId)
    if (!property?.pm_agreement_id) return null
    return landlord.pm_agreements?.find(a => a.id === property.pm_agreement_id) || null
  }

  const computeMgmtFee = (agreement: { management_fee_pct: number; management_fee_flat: number | null } | null, gross: string): string => {
    if (!agreement || !gross) return ''
    if (agreement.management_fee_flat != null) {
      return Number(agreement.management_fee_flat).toFixed(2)
    }
    return (parseFloat(gross) * agreement.management_fee_pct / 100).toFixed(2)
  }

  const handleLandlordChange = (landlordId: string) => {
    setCreateForm(prev => ({
      ...prev,
      landlord_id: landlordId,
      property_id: '',
      management_fee: '',
    }))
    setPendingDeductions([])
    setSelectedDeductionIds([])
    // Also reset tenant form's tenant select; tenants will load when a
    // property is chosen (under the tenant disbursement path).
    setTenantForm(prev => ({ ...prev, tenant_id: '' }))
    setTenantsForLandlord([])
    setHeldInTrust(null)
  }

  const handlePropertyChange = async (propertyId: string) => {
    // Bump the fetch counter and capture it locally. Any fetch whose
    // counter no longer matches by the time it resolves is stale and
    // its result is discarded - prevents the older fetch from
    // overwriting newer state when admin clicks property A → B → A.
    const myFetch = ++propertyFetchCounter.current

    setCreateForm(prev => ({
      ...prev,
      property_id: propertyId,
      management_fee: '',
    }))
    setSelectedDeductionIds([])

    // Property deselected ("Select property..." chosen). Clear everything
    // that was specific to the previous property.
    if (!propertyId) {
      setPendingDeductions([])
      setTenantsForLandlord([])
      setHeldInTrust(null)
      return
    }

    // Recompute management fee using THIS property's agreement.
    const agreement = getAgreementForProperty(createForm.landlord_id, propertyId)
    setCreateForm(prev => ({
      ...prev,
      property_id: propertyId,
      management_fee: computeMgmtFee(agreement, prev.gross_rent),
    }))

    // Load pending deductions for this property so admin can attach them.
    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions?property_id=${propertyId}&pending=true`
      )
      if (res.ok && myFetch === propertyFetchCounter.current) {
        const data = await res.json()
        setPendingDeductions(data.deductions || [])
      }
    } catch (err) {
      console.error('Failed to load pending deductions:', err)
    }

    // Tenants for this property (for tenant disbursement mode). Includes
    // former tenants - any tenant who ever leased here may still have
    // a refundable deposit.
    try {
      const res = await fetch(`/api/pm/tenants?property_id=${propertyId}`)
      if (res.ok && myFetch === propertyFetchCounter.current) {
        const data = await res.json()
        setTenantsForLandlord(data.tenants || [])
      }
    } catch (err) {
      console.error('Failed to load tenants for property:', err)
    }

    // Held-in-trust balance for this property. Used by the tenant
    // disbursement form to warn when the refund amount exceeds what's
    // actually in trust.
    try {
      const res = await fetch(
        `/api/pm/held-in-trust?landlord_id=${createForm.landlord_id}&property_id=${propertyId}`
      )
      if (res.ok && myFetch === propertyFetchCounter.current) {
        const data = await res.json()
        setHeldInTrust(Number(data.heldInTrust ?? 0))
      }
    } catch (err) {
      console.error('Failed to load held-in-trust balance:', err)
    }
  }

  const handleGrossRentChange = (value: string) => {
    setCreateForm(prev => ({ ...prev, gross_rent: value }))

    // Auto-calculate management fee using the selected property's agreement.
    if (createForm.landlord_id && createForm.property_id) {
      const agreement = getAgreementForProperty(createForm.landlord_id, createForm.property_id)
      setCreateForm(prev => ({
        ...prev,
        gross_rent: value,
        management_fee: computeMgmtFee(agreement, value),
      }))
    }
  }

  const toggleDeduction = (deductionId: string) => {
    setSelectedDeductionIds(prev =>
      prev.includes(deductionId)
        ? prev.filter(id => id !== deductionId)
        : [...prev, deductionId]
    )
  }

  const selectedDeductionsTotal = pendingDeductions
    .filter(d => selectedDeductionIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.amount || 0), 0)

  const calculateNetAmount = () => {
    const gross = parseFloat(createForm.gross_rent) || 0
    const mgmtFee = parseFloat(createForm.management_fee) || 0
    const other = parseFloat(createForm.other_deductions) || 0
    return gross - mgmtFee - other - selectedDeductionsTotal
  }

  const handleCreateDisbursement = async () => {
    // Tenant disbursement path
    if (disbursementTarget === 'tenant') {
      if (!createForm.landlord_id || !createForm.property_id || !tenantForm.tenant_id || !tenantForm.amount) {
        alert('Please fill in landlord, property, tenant, and amount')
        return
      }
      if (parseFloat(tenantForm.amount) <= 0) {
        alert('Amount must be greater than zero')
        return
      }
      setCreating(true)
      try {
        const res = await fetch('/api/pm/tenant-disbursements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: tenantForm.tenant_id,
            landlord_id: createForm.landlord_id,
            property_id: createForm.property_id,
            amount: parseFloat(tenantForm.amount),
            period_month: tenantForm.period_month,
            period_year: tenantForm.period_year,
            notes: tenantForm.notes || null,
          })
        })
        if (res.ok) {
          setShowCreateModal(false)
          loadDisbursements()
        } else {
          const data = await res.json()
          alert(data.error || 'Failed to create tenant disbursement')
        }
      } catch (err) {
        console.error('Failed to create tenant disbursement:', err)
        alert('Failed to create tenant disbursement')
      } finally {
        setCreating(false)
      }
      return
    }

    // Landlord disbursement path
    if (!createForm.landlord_id || !createForm.property_id || !createForm.gross_rent) {
      alert('Please fill in landlord, property, and gross rent')
      return
    }

    if (parseFloat(createForm.gross_rent) <= 0) {
      alert('Cannot disburse on $0 gross rent. Wait for the next month with rent received - pending deductions will carry over.')
      return
    }

    const netAmount = calculateNetAmount()
    if (netAmount < 0) {
      alert('Net amount cannot be negative')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/pm/disbursements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlord_id: createForm.landlord_id,
          property_id: createForm.property_id,
          gross_rent: parseFloat(createForm.gross_rent),
          management_fee: parseFloat(createForm.management_fee) || 0,
          deposit_amount: parseFloat(createForm.deposit_amount) || 0,
          other_deductions: parseFloat(createForm.other_deductions) || 0,
          other_deductions_description: createForm.other_deductions_description || null,
          deduction_ids: selectedDeductionIds,
          period_month: createForm.period_month,
          period_year: createForm.period_year,
          notes: createForm.notes || null,
        })
      })

      if (res.ok) {
        setShowCreateModal(false)
        loadDisbursements()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to create disbursement')
      }
    } catch (err) {
      console.error('Failed to create disbursement:', err)
      alert('Failed to create disbursement')
    } finally {
      setCreating(false)
    }
  }

  const selectedLandlord = landlords.find(l => l.id === createForm.landlord_id)
  const availableProperties = selectedLandlord?.managed_properties?.filter(p => p.status === 'active') || []

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/admin/pm" className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <Banknote size={24} />
              Disbursements
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Create Disbursement
          </button>
          <button
            onClick={() => {
              setShowCreateStatementModal(true)
              // Load landlords if not already (loadLandlords is otherwise
              // only triggered by openCreateModal).
              if (landlords.length === 0) {
                loadLandlords()
              }
            }}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <Plus size={16} />
            Create Statement
          </button>
          <button
            onClick={() => openChargedBasisModal()}
            className="btn btn-secondary inline-flex items-center gap-2"
            title="Auto-charge mgmt fee for charged-basis landlords whose tenant did not pay this period"
          >
            Run Monthly Charged Fees
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Pending</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.processing}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Processing</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Completed</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">Failed</div>
        </div>
        <div className="container-card text-center">
          <div className="text-2xl font-bold text-luxury-accent">{formatMoney(stats.totalPending)}</div>
          <div className="text-xs text-luxury-gray-3 uppercase tracking-wider">To Disburse</div>
        </div>
      </div>

      {/* Filters */}
      <div className="container-card mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-luxury-gray-3" />
            <input
              type="text"
              placeholder="Search by landlord or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-luxury pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="select-luxury w-full sm:w-40"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Disbursements Table */}
      <div className="container-card">
        {loading ? (
          <div className="text-center py-12 text-luxury-gray-3">Loading disbursements...</div>
        ) : disbursements.length === 0 ? (
          <div className="text-center py-12">
            <Banknote size={48} className="mx-auto text-luxury-gray-4 mb-4" />
            <p className="text-luxury-gray-3">No disbursements found</p>
            <p className="text-sm text-luxury-gray-3 mt-1">
              Disbursements are created automatically when tenants pay rent
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="th-luxury">
                  <th className="text-left py-3 px-4">Period</th>
                  <th className="text-left py-3 px-4">Landlord</th>
                  <th className="text-left py-3 px-4">Property</th>
                  <th className="text-right py-3 px-4">Gross Rent</th>
                  <th className="text-right py-3 px-4">Mgmt Fee</th>
                  <th className="text-right py-3 px-4">Net Amount</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {disbursements.map((disbursement) => (
                  <tr
                    key={disbursement.id}
                    className="tr-luxury border-b border-luxury-gray-5 hover:bg-luxury-light/50"
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium text-luxury-gray-1">
                        {getMonthName(disbursement.period_month)} {disbursement.period_year}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {disbursement.landlords ? (
                        <div>
                          <div className="font-medium text-luxury-gray-1">
                            {disbursement.landlords.first_name} {disbursement.landlords.last_name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {disbursement.landlords.bank_status === 'connected' ? (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <CheckCircle size={12} />
                                Bank connected
                              </span>
                            ) : (
                              <span className="text-xs text-amber-600 flex items-center gap-1">
                                <AlertCircle size={12} />
                                Bank not connected
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-luxury-gray-3">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-sm text-luxury-gray-1">
                        {disbursement.managed_properties?.property_address}
                        {disbursement.managed_properties?.unit && ` ${disbursement.managed_properties.unit}`}
                      </div>
                      <div className="text-xs text-luxury-gray-3">
                        {disbursement.managed_properties?.city}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm text-luxury-gray-1">
                        {formatMoney(disbursement.gross_rent)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm text-red-600">
                        -{formatMoney(disbursement.management_fee)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-semibold text-luxury-gray-1">
                        {formatMoney(disbursement.net_amount)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(disbursement.payment_status)}
                      {disbursement.payment_date && (
                        <div className="text-xs text-luxury-gray-3 mt-0.5">
                          {formatDate(disbursement.payment_date)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditDisbursement(disbursement)}
                          className="btn btn-secondary text-xs py-1 px-3 inline-flex items-center gap-1"
                          title="Edit disbursement"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                        {disbursement.payment_status === 'pending' && (
                          <>
                            {canProcess(disbursement) ? (
                              <button
                                onClick={() => processDisbursement(disbursement.id)}
                                disabled={processingId === disbursement.id}
                                className="btn btn-primary text-xs py-1 px-3 inline-flex items-center gap-1"
                              >
                                <Send size={12} />
                                {processingId === disbursement.id ? 'Processing...' : 'Process ACH'}
                              </button>
                            ) : (
                              <Link
                                href={`/admin/pm/landlords/${disbursement.landlord_id}`}
                                className="text-xs text-luxury-accent hover:underline"
                              >
                                Setup Bank First
                              </Link>
                            )}
                          </>
                        )}
                        {(disbursement.payment_status === 'completed' || disbursement.payment_status === 'paid') && (
                          <span className="text-xs text-green-600">
                            {disbursement.payment_status === 'completed' ? 'ACH Complete' : 'Paid'}
                          </span>
                        )}
                        {disbursement.payment_status === 'failed' && (
                          <button
                            onClick={() => processDisbursement(disbursement.id)}
                            disabled={processingId === disbursement.id}
                            className="btn btn-secondary text-xs py-1 px-3"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="container-card mt-6">
        <div className="inner-card">
          <div className="flex items-start gap-3">
            <Building2 size={20} className="text-luxury-accent mt-0.5" />
            <div>
              <h3 className="font-semibold text-luxury-gray-1 mb-1">How Disbursements Work</h3>
              <ul className="text-sm text-luxury-gray-3 space-y-1">
                <li>Disbursements are auto-created when a tenant pays rent</li>
                <li>Management fee is automatically deducted from gross rent</li>
                <li>Landlords must connect their bank before receiving ACH payouts</li>
                <li>Processing typically takes 1-3 business days</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Create Disbursement Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">
                {disbursementTarget === 'tenant' ? 'Create Tenant Disbursement' : 'Create Disbursement'}
              </h2>
              <button onClick={() => setShowCreateModal(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {loadingLandlords ? (
                <div className="text-center py-4 text-luxury-gray-3">Loading landlords...</div>
              ) : (
                <>
                  {/* Target toggle: landlord (rent disbursement) or tenant (deposit refund) */}
                  <div>
                    <label className="field-label">Disburse to</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setDisbursementTarget('landlord')}
                        className={`px-3 py-2 rounded border text-sm ${
                          disbursementTarget === 'landlord'
                            ? 'bg-luxury-accent text-white border-luxury-accent'
                            : 'border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-light'
                        }`}
                      >
                        Landlord (rent)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisbursementTarget('tenant')}
                        className={`px-3 py-2 rounded border text-sm ${
                          disbursementTarget === 'tenant'
                            ? 'bg-luxury-accent text-white border-luxury-accent'
                            : 'border-luxury-gray-5 text-luxury-gray-2 hover:bg-luxury-light'
                        }`}
                      >
                        Tenant (deposit refund)
                      </button>
                    </div>
                  </div>

                  {/* Landlord */}
                  <div>
                    <label className="field-label">Landlord</label>
                    <select
                      value={createForm.landlord_id}
                      onChange={(e) => handleLandlordChange(e.target.value)}
                      className="select-luxury w-full"
                    >
                      <option value="">Select landlord...</option>
                      {landlords.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.first_name} {l.last_name}
                          {l.bank_status !== 'connected' && ' (Bank not connected)'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Property */}
                  <div>
                    <label className="field-label">Property</label>
                    <select
                      value={createForm.property_id}
                      onChange={(e) => handlePropertyChange(e.target.value)}
                      className="select-luxury w-full"
                      disabled={!createForm.landlord_id}
                    >
                      <option value="">Select property...</option>
                      {availableProperties.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.property_address}, {p.city}
                        </option>
                      ))}
                    </select>
                    {createForm.landlord_id && availableProperties.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">No active properties for this landlord</p>
                    )}
                  </div>

                  {/* Period */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Period Month</label>
                      <select
                        value={disbursementTarget === 'tenant' ? tenantForm.period_month : createForm.period_month}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          if (disbursementTarget === 'tenant') {
                            setTenantForm(prev => ({ ...prev, period_month: val }))
                          } else {
                            setCreateForm(prev => ({ ...prev, period_month: val }))
                          }
                        }}
                        className="select-luxury w-full"
                      >
                        {[...Array(12)].map((_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="field-label">Period Year</label>
                      <select
                        value={disbursementTarget === 'tenant' ? tenantForm.period_year : createForm.period_year}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          if (disbursementTarget === 'tenant') {
                            setTenantForm(prev => ({ ...prev, period_year: val }))
                          } else {
                            setCreateForm(prev => ({ ...prev, period_year: val }))
                          }
                        }}
                        className="select-luxury w-full"
                      >
                        {[2024, 2025, 2026, 2027].map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {disbursementTarget === 'landlord' ? (
                    <>
                      {/* Gross Rent */}
                      <div>
                        <label className="field-label">Gross Rent Collected</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={createForm.gross_rent}
                            onChange={(e) => handleGrossRentChange(e.target.value)}
                            className="input-luxury w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                        {createForm.gross_rent !== '' && parseFloat(createForm.gross_rent) === 0 && (
                          <p className="text-xs text-amber-700 mt-1">
                            Cannot disburse on $0 gross rent. Wait for the next month with rent received. Pending deductions will carry over.
                          </p>
                        )}
                      </div>

                      {/* Management Fee */}
                      {(() => {
                        const ag = createForm.property_id
                          ? getAgreementForProperty(createForm.landlord_id, createForm.property_id)
                          : null
                        const feeLabel = ag?.management_fee_flat != null
                          ? `($${Number(ag.management_fee_flat).toFixed(2)} flat per agreement)`
                          : ag?.management_fee_pct
                            ? `(${ag.management_fee_pct}% of rent)`
                            : ''
                        return (
                          <div>
                            <label className="field-label">
                              Management Fee
                              {feeLabel && (
                                <span className="text-luxury-gray-3 font-normal ml-1">{feeLabel}</span>
                              )}
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={createForm.management_fee}
                                onChange={(e) => setCreateForm(prev => ({ ...prev, management_fee: e.target.value }))}
                                className="input-luxury w-full pl-7"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                        )
                      })()}

                      {/* Deposit returned to landlord (rare - usually deposit stays in trust) */}
                      <div>
                        <label className="field-label">
                          Deposit Returned to Landlord (optional)
                          <span className="text-luxury-gray-3 font-normal ml-1">
                            (use when releasing deposit funds to landlord)
                          </span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={createForm.deposit_amount}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                            className="input-luxury w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {/* Pending deductions panel - shown when property is selected */}
                      {createForm.property_id && pendingDeductions.length > 0 && (
                        <div>
                          <label className="field-label">
                            Pending Deductions
                            <span className="text-luxury-gray-3 font-normal ml-1">
                              (check to attach to this disbursement)
                            </span>
                          </label>
                          <div className="space-y-2 border border-luxury-gray-5 rounded p-3">
                            {pendingDeductions.map(d => {
                              const isSelected = selectedDeductionIds.includes(d.id)
                              return (
                                <label
                                  key={d.id}
                                  className="flex items-center justify-between gap-3 cursor-pointer text-sm"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => toggleDeduction(d.id)}
                                    />
                                    <div className="min-w-0">
                                      <p className="font-medium text-luxury-gray-1 truncate">{d.label}</p>
                                      {d.description && (
                                        <p className="text-xs text-luxury-gray-3 truncate">{d.description}</p>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-luxury-gray-1 shrink-0">
                                    {formatMoney(Number(d.amount))}
                                  </span>
                                </label>
                              )
                            })}
                            {selectedDeductionsTotal > 0 && (
                              <div className="pt-2 mt-2 border-t border-luxury-gray-5 flex justify-between text-sm font-medium">
                                <span className="text-luxury-gray-2">Selected total</span>
                                <span className="text-luxury-gray-1">{formatMoney(selectedDeductionsTotal)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Other Deductions (legacy single-field, kept for back-compat) */}
                      <div>
                        <label className="field-label">Other Deductions (optional, single-line)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={createForm.other_deductions}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, other_deductions: e.target.value }))}
                            className="input-luxury w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      {parseFloat(createForm.other_deductions) > 0 && (
                        <div>
                          <label className="field-label">Deduction Description</label>
                          <input
                            type="text"
                            value={createForm.other_deductions_description}
                            onChange={(e) => setCreateForm(prev => ({ ...prev, other_deductions_description: e.target.value }))}
                            className="input-luxury w-full"
                            placeholder="e.g., Repair expense, HOA fee"
                          />
                        </div>
                      )}

                      {/* Net Amount Preview - splits net rent from deposit
                          return so admin sees both numbers clearly. The
                          landlord actually receives net rent + deposit
                          return as one combined check. */}
                      {createForm.gross_rent && parseFloat(createForm.gross_rent) > 0 && (
                        <div className="inner-card">
                          {parseFloat(createForm.deposit_amount) > 0 ? (
                            <>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-luxury-gray-3">Net Rent to Landlord</span>
                                <span className={`text-base font-semibold ${calculateNetAmount() >= 0 ? 'text-luxury-gray-1' : 'text-red-600'}`}>
                                  {formatMoney(calculateNetAmount())}
                                </span>
                              </div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-luxury-gray-3">Deposit Returned to Landlord</span>
                                <span className="text-base font-semibold text-luxury-gray-1">
                                  {formatMoney(parseFloat(createForm.deposit_amount) || 0)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center pt-2 border-t border-luxury-gray-5">
                                <span className="text-sm text-luxury-gray-3">Total to Landlord</span>
                                <span className={`text-xl font-bold ${calculateNetAmount() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatMoney(calculateNetAmount() + (parseFloat(createForm.deposit_amount) || 0))}
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-luxury-gray-3">Net Amount to Landlord</span>
                              <span className={`text-xl font-bold ${calculateNetAmount() >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatMoney(calculateNetAmount())}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label className="field-label">Notes (optional)</label>
                        <textarea
                          value={createForm.notes}
                          onChange={(e) => setCreateForm(prev => ({ ...prev, notes: e.target.value }))}
                          className="input-luxury w-full"
                          rows={2}
                          placeholder="Any additional notes..."
                        />
                      </div>
                    </>
                  ) : (
                    /* Tenant disbursement path */
                    <>
                      <div>
                        <label className="field-label">Tenant</label>
                        <select
                          value={tenantForm.tenant_id}
                          onChange={(e) => setTenantForm(prev => ({ ...prev, tenant_id: e.target.value }))}
                          className="select-luxury w-full"
                          disabled={!createForm.property_id}
                        >
                          <option value="">Select tenant...</option>
                          {tenantsForLandlord.map((t: any) => (
                            <option key={t.id} value={t.id}>
                              {t.first_name} {t.last_name}
                            </option>
                          ))}
                        </select>
                        {createForm.property_id && tenantsForLandlord.length === 0 && (
                          <p className="text-xs text-luxury-gray-3 mt-1">No tenants found for this property</p>
                        )}
                      </div>

                      {/* Held-in-trust balance for this property */}
                      {createForm.property_id && heldInTrust !== null && (
                        <div className="inner-card">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-luxury-gray-3">Deposits held in trust for this property</span>
                            <span className="text-lg font-semibold text-luxury-gray-1">
                              {formatMoney(heldInTrust)}
                            </span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="field-label">
                          Amount
                          <span className="text-luxury-gray-3 font-normal ml-1">
                            (reduces deposits held in trust)
                          </span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={tenantForm.amount}
                            onChange={(e) => setTenantForm(prev => ({ ...prev, amount: e.target.value }))}
                            className="input-luxury w-full pl-7"
                            placeholder="0.00"
                          />
                        </div>
                        {/* Warn (do not block) when the refund exceeds the
                            available trust balance. Admin may still proceed
                            if they know what they are doing - this is
                            advisory, not a hard stop. */}
                        {tenantForm.amount !== '' &&
                          heldInTrust !== null &&
                          parseFloat(tenantForm.amount) > heldInTrust && (
                            <p className="text-xs text-amber-700 mt-1">
                              Warning: this refund exceeds the {formatMoney(heldInTrust)} currently held in trust for this property. Trust balance will go negative if you proceed.
                            </p>
                          )}
                      </div>

                      <div>
                        <label className="field-label">Notes (optional)</label>
                        <textarea
                          value={tenantForm.notes}
                          onChange={(e) => setTenantForm(prev => ({ ...prev, notes: e.target.value }))}
                          className="input-luxury w-full"
                          rows={2}
                          placeholder="Reason: security deposit refund, overpayment refund, etc."
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDisbursement}
                className="btn btn-primary"
                disabled={
                  creating ||
                  !createForm.landlord_id ||
                  !createForm.property_id ||
                  (disbursementTarget === 'landlord'
                    ? !createForm.gross_rent || parseFloat(createForm.gross_rent) <= 0
                    : !tenantForm.tenant_id || !tenantForm.amount || parseFloat(tenantForm.amount) <= 0)
                }
              >
                {creating ? 'Creating...' : disbursementTarget === 'tenant' ? 'Create Tenant Disbursement' : 'Create Disbursement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Disbursement Modal */}
      {editingDisbursement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Edit Disbursement</h2>
              <button
                onClick={closeEditDisbursement}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="inner-card">
                <div className="text-xs text-luxury-gray-3 uppercase tracking-widest mb-1">
                  Disbursement
                </div>
                <div className="text-sm text-luxury-gray-1">
                  {getMonthName(editingDisbursement.period_month)} {editingDisbursement.period_year}
                </div>
                {editingDisbursement.landlords && (
                  <div className="text-xs text-luxury-gray-3 mt-1">
                    {editingDisbursement.landlords.first_name} {editingDisbursement.landlords.last_name}
                  </div>
                )}
                {editingDisbursement.managed_properties && (
                  <div className="text-xs text-luxury-gray-3">
                    {editingDisbursement.managed_properties.property_address}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Gross Rent</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.gross_rent}
                      onChange={(e) => setEditForm(prev => ({ ...prev, gross_rent: e.target.value }))}
                      className="input-luxury w-full pl-7"
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Management Fee</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.management_fee}
                      onChange={(e) => setEditForm(prev => ({ ...prev, management_fee: e.target.value }))}
                      className="input-luxury w-full pl-7"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="field-label">
                  Deposit Returned to Landlord
                  <span className="text-luxury-gray-3 font-normal ml-1">
                    (only when releasing deposit funds to landlord)
                  </span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.deposit_amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                    className="input-luxury w-full pl-7"
                  />
                </div>
              </div>

              {/* Other Deductions: legacy single-line field. Line-item
                  deductions are managed separately via the Pending
                  Deductions panel and are not edited from here. */}
              <div>
                <label className="field-label">Other Deductions (single-line)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.other_deductions}
                    onChange={(e) => setEditForm(prev => ({ ...prev, other_deductions: e.target.value }))}
                    className="input-luxury w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {parseFloat(editForm.other_deductions) > 0 && (
                <div>
                  <label className="field-label">Deduction Description</label>
                  <input
                    type="text"
                    value={editForm.other_deductions_description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, other_deductions_description: e.target.value }))}
                    className="input-luxury w-full"
                    placeholder="e.g., Repair expense, HOA fee"
                  />
                </div>
              )}

              <div>
                <label className="field-label">Payment Status</label>
                <select
                  value={editForm.payment_status}
                  onChange={(e) => setEditForm(prev => ({ ...prev, payment_status: e.target.value }))}
                  className="select-luxury w-full"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="paid">Paid</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              {/* When status is completed/paid, show payment details */}
              {['completed', 'paid'].includes(editForm.payment_status) && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="field-label">Payment Date</label>
                      <input
                        type="date"
                        value={editForm.payment_date}
                        onChange={(e) => setEditForm(prev => ({ ...prev, payment_date: e.target.value }))}
                        className="input-luxury w-full"
                      />
                    </div>
                    <div>
                      <label className="field-label">Method</label>
                      <input
                        type="text"
                        value={editForm.payment_method}
                        onChange={(e) => setEditForm(prev => ({ ...prev, payment_method: e.target.value }))}
                        className="input-luxury w-full"
                        placeholder="ACH, check, Zelle, etc."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="field-label">Reference Number</label>
                    <input
                      type="text"
                      value={editForm.payment_reference}
                      onChange={(e) => setEditForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                      className="input-luxury w-full"
                      placeholder="Check number, confirmation ID, etc."
                    />
                  </div>
                </>
              )}

              <div>
                <label className="field-label">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="input-luxury w-full"
                  rows={2}
                />
              </div>

              {/* Net preview - server will recompute, but show admin what
                  the result will look like. The actual net also subtracts
                  any attached line-item deductions, which are not editable
                  from this modal (use the Pending Deductions panel). */}
              <div className="inner-card">
                <div className="flex justify-between items-center text-sm text-luxury-gray-3">
                  <span>New Net (excluding line-item deductions)</span>
                  <span className="font-semibold text-luxury-gray-1">
                    {formatMoney(
                      (parseFloat(editForm.gross_rent) || 0) -
                      (parseFloat(editForm.management_fee) || 0) -
                      (parseFloat(editForm.other_deductions) || 0)
                    )}
                  </span>
                </div>
                <p className="text-xs text-luxury-gray-3 mt-1">
                  Server will recompute final net including any attached deductions.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={closeEditDisbursement}
                className="btn btn-secondary"
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                onClick={saveEditDisbursement}
                className="btn btn-primary"
                disabled={savingEdit}
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Monthly Charged Fees Modal */}
      {showChargedBasisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-luxury-gray-1">Run Monthly Charged Fees</h2>
                <p className="text-xs text-luxury-gray-3 mt-1">
                  Auto-charges mgmt fee for charged-basis landlords whose tenant did not pay this period.
                </p>
              </div>
              <button
                onClick={closeChargedBasisModal}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Month</label>
                  <select
                    value={chargedBasisForm.month}
                    onChange={(e) => {
                      const m = parseInt(e.target.value, 10)
                      setChargedBasisForm(prev => ({ ...prev, month: m }))
                      loadChargedBasisPreview(m, chargedBasisForm.year)
                    }}
                    className="select-luxury w-full"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Year</label>
                  <select
                    value={chargedBasisForm.year}
                    onChange={(e) => {
                      const y = parseInt(e.target.value, 10)
                      setChargedBasisForm(prev => ({ ...prev, year: y }))
                      loadChargedBasisPreview(chargedBasisForm.month, y)
                    }}
                    className="select-luxury w-full"
                  >
                    {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview area */}
              {chargedBasisLoading ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">Loading preview...</p>
              ) : !chargedBasisPreview ? (
                <p className="text-sm text-luxury-gray-3 text-center py-6">
                  Pick a month to see the preview.
                </p>
              ) : chargedBasisPreview.items.length === 0 ? (
                <div className="inner-card text-center py-8">
                  <p className="text-sm text-luxury-gray-1 font-medium">Nothing to charge</p>
                  <p className="text-xs text-luxury-gray-3 mt-1">
                    No unpaid invoices on charged-basis agreements for this period.
                  </p>
                </div>
              ) : (
                <>
                  <div className="inner-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-luxury-gray-1 font-semibold">
                          {chargedBasisPreview.pendingCount} {chargedBasisPreview.pendingCount === 1 ? 'invoice' : 'invoices'} to charge
                        </p>
                        {chargedBasisPreview.alreadyChargedCount > 0 && (
                          <p className="text-xs text-luxury-gray-3 mt-1">
                            {chargedBasisPreview.alreadyChargedCount} already charged (skipped)
                          </p>
                        )}
                      </div>
                      <p className="text-xl font-bold text-luxury-gray-1">
                        {formatMoney(chargedBasisPreview.totalAmount)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left">
                          <th className="py-2 px-3 text-xs text-luxury-gray-3 uppercase tracking-widest">Landlord</th>
                          <th className="py-2 px-3 text-xs text-luxury-gray-3 uppercase tracking-widest">Property</th>
                          <th className="py-2 px-3 text-xs text-luxury-gray-3 uppercase tracking-widest text-right">Rent</th>
                          <th className="py-2 px-3 text-xs text-luxury-gray-3 uppercase tracking-widest text-right">Fee</th>
                          <th className="py-2 px-3 text-xs text-luxury-gray-3 uppercase tracking-widest">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chargedBasisPreview.items.map((item: any) => (
                          <tr key={item.invoice_id} className="border-b last:border-0">
                            <td className="py-2 px-3 text-luxury-gray-1">{item.landlord_name}</td>
                            <td className="py-2 px-3 text-luxury-gray-2 text-xs">{item.property_address}</td>
                            <td className="py-2 px-3 text-right text-luxury-gray-1">{formatMoney(item.rent_amount)}</td>
                            <td className="py-2 px-3 text-right text-luxury-gray-1 font-semibold">{formatMoney(item.calculated_fee)}</td>
                            <td className="py-2 px-3 text-xs">
                              {item.already_charged ? (
                                <span className="text-luxury-gray-3">Already charged</span>
                              ) : (
                                <span className="text-amber-700">Will charge</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={closeChargedBasisModal}
                className="btn btn-secondary"
                disabled={chargedBasisRunning}
              >
                Cancel
              </button>
              <button
                onClick={runChargedBasis}
                className="btn btn-primary"
                disabled={
                  chargedBasisRunning ||
                  chargedBasisLoading ||
                  !chargedBasisPreview ||
                  chargedBasisPreview.pendingCount === 0
                }
              >
                {chargedBasisRunning
                  ? 'Running...'
                  : chargedBasisPreview
                    ? `Charge ${chargedBasisPreview.pendingCount} ${chargedBasisPreview.pendingCount === 1 ? 'Fee' : 'Fees'}`
                    : 'Charge Fees'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Statement Modal */}
      {showCreateStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-luxury-gray-1">Create Statement</h2>
              <button
                onClick={() => setShowCreateStatementModal(false)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="field-label">Landlord</label>
                <select
                  value={statementForm.landlord_id}
                  onChange={(e) => setStatementForm(prev => ({
                    ...prev,
                    landlord_id: e.target.value,
                    property_id: '', // reset property when landlord changes
                  }))}
                  className="select-luxury w-full"
                >
                  <option value="">Select landlord...</option>
                  {landlords.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {l.first_name} {l.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Property</label>
                <select
                  value={statementForm.property_id}
                  onChange={(e) => setStatementForm(prev => ({ ...prev, property_id: e.target.value }))}
                  className="select-luxury w-full"
                  disabled={!statementForm.landlord_id}
                >
                  <option value="">Select property...</option>
                  {(landlords.find(l => l.id === statementForm.landlord_id)?.managed_properties || [])
                    .filter((p: any) => p.status === 'active')
                    .map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.property_address}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="field-label">Period Type</label>
                <select
                  value={statementForm.period_type}
                  onChange={(e) => setStatementForm(prev => ({ ...prev, period_type: e.target.value as 'monthly' | 'annual' }))}
                  className="select-luxury w-full"
                >
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>

              {statementForm.period_type === 'monthly' && (
                <div>
                  <label className="field-label">Month</label>
                  <select
                    value={statementForm.period_month}
                    onChange={(e) => setStatementForm(prev => ({ ...prev, period_month: parseInt(e.target.value, 10) }))}
                    className="select-luxury w-full"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m}>
                        {new Date(2000, m - 1).toLocaleString('default', { month: 'long' })}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="field-label">Year</label>
                <select
                  value={statementForm.period_year}
                  onChange={(e) => setStatementForm(prev => ({ ...prev, period_year: parseInt(e.target.value, 10) }))}
                  className="select-luxury w-full"
                >
                  {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setShowCreateStatementModal(false)}
                className="btn btn-secondary"
                disabled={statementCreating}
              >
                Cancel
              </button>
              <button
                onClick={createStatement}
                className="btn btn-primary"
                disabled={statementCreating || !statementForm.landlord_id || !statementForm.property_id}
              >
                {statementCreating ? 'Generating...' : 'Generate Statement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
