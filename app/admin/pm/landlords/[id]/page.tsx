'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Send, DollarSign, Home, FileText, Users, X, Mail, Loader2, ClipboardCheck } from 'lucide-react'

interface Landlord {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
  status: string
  w9_status: string
  bank_status: string
  created_at: string
}

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  zip: string
  status: string
}

interface Tenant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  status: string
}

interface Lease {
  id: string
  property_id: string
  tenant_id: string
  lease_start: string
  lease_end: string
  monthly_rent: number
  status: string
  managed_properties?: Property
  tenants?: Tenant
}

interface Disbursement {
  id: string
  gross_rent: number
  management_fee: number
  net_amount: number
  period_month: number
  period_year: number
  payment_status: string
  payment_date: string | null
  managed_properties?: Property
}

interface Agreement {
  id: string
  commencement_date: string | null
  expiration_date: string | null
  management_fee_pct: number
  management_fee_minimum: number | null
  maintenance_coord_fee_pct: number | null
  renewal_fee_pct: number | null
  renewal_fee_flat: number | null
  eviction_fee: number | null
  repair_limit_without_approval: number | null
  agreement_pdf_url: string | null
  notes: string | null
  status: string
  referring_agent_id: string | null
  agent_fee_pct: number
  referring_agent?: {
    id: string
    preferred_first_name: string | null
    first_name: string
    preferred_last_name: string | null
    last_name: string
  } | null
}

interface Agent {
  id: string
  name: string
  displayName: string
}

type TabType = 'overview' | 'properties' | 'leases' | 'disbursements' | 'agreement'

// Agreement Editor Component
function AgreementEditor({
  agreement,
  agents,
  saving,
  onSave,
}: {
  agreement: Agreement
  agents: Agent[]
  saving: boolean
  onSave: (updates: Record<string, any>) => void
}) {
  // Form state
  const [form, setForm] = useState({
    status: agreement.status || 'active',
    commencement_date: agreement.commencement_date || '',
    expiration_date: agreement.expiration_date || '',
    management_fee_pct: agreement.management_fee_pct || 10,
    maintenance_coord_fee_pct: agreement.maintenance_coord_fee_pct || '',
    renewal_fee_pct: agreement.renewal_fee_pct || '',
    renewal_fee_flat: agreement.renewal_fee_flat || '',
    eviction_fee: agreement.eviction_fee || '',
    repair_limit_without_approval: agreement.repair_limit_without_approval || '',
    agreement_pdf_url: agreement.agreement_pdf_url || '',
    notes: agreement.notes || '',
    referring_agent_id: agreement.referring_agent_id || '',
    agent_fee_pct: agreement.agent_fee_pct || 0,
  })
  const [hasChanges, setHasChanges] = useState(false)

  const updateField = (field: string, value: any) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setHasChanges(true)
    // Reset agent fee if no agent selected
    if (field === 'referring_agent_id' && !value) {
      setForm(prev => ({ ...prev, agent_fee_pct: 0 }))
    }
  }

  const handleSave = () => {
    const updates: Record<string, any> = {
      status: form.status,
      commencement_date: form.commencement_date || null,
      expiration_date: form.expiration_date || null,
      management_fee_pct: parseFloat(String(form.management_fee_pct)) || 10,
      maintenance_coord_fee_pct: form.maintenance_coord_fee_pct ? parseFloat(String(form.maintenance_coord_fee_pct)) : null,
      renewal_fee_pct: form.renewal_fee_pct ? parseFloat(String(form.renewal_fee_pct)) : null,
      renewal_fee_flat: form.renewal_fee_flat ? parseFloat(String(form.renewal_fee_flat)) : null,
      eviction_fee: form.eviction_fee ? parseFloat(String(form.eviction_fee)) : null,
      repair_limit_without_approval: form.repair_limit_without_approval ? parseFloat(String(form.repair_limit_without_approval)) : null,
      agreement_pdf_url: form.agreement_pdf_url || null,
      notes: form.notes || null,
      referring_agent_id: form.referring_agent_id || null,
      agent_fee_pct: parseFloat(String(form.agent_fee_pct)) || 0,
    }
    onSave(updates)
    setHasChanges(false)
  }

  const getAgentName = (agent: Agent | Agreement['referring_agent']) => {
    if (!agent) return ''
    if ('name' in agent) return agent.name
    return `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`.trim()
  }

  // Fee split preview
  const mgmtFeePct = parseFloat(String(form.management_fee_pct)) || 0
  const agentFeePct = parseFloat(String(form.agent_fee_pct)) || 0
  const brokerageShare = 100 - agentFeePct

  return (
    <div className="space-y-6">
      {/* Row 1: Status + Dates */}
      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label className="field-label">Status</label>
          <select
            className="select-luxury"
            value={form.status}
            onChange={e => updateField('status', e.target.value)}
          >
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="terminated">Terminated</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="field-label">Commencement Date</label>
          <input
            type="date"
            className="input-luxury"
            value={form.commencement_date}
            onChange={e => updateField('commencement_date', e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Expiration Date</label>
          <input
            type="date"
            className="input-luxury"
            value={form.expiration_date}
            onChange={e => updateField('expiration_date', e.target.value)}
          />
        </div>
      </div>

      {/* Row 2: Fees */}
      <div>
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
          Fee Structure
        </h3>
        <div className="grid md:grid-cols-4 gap-4">
          <div>
            <label className="field-label">Management Fee %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury"
                value={form.management_fee_pct}
                onChange={e => updateField('management_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="0.5"
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
          <div>
            <label className="field-label">Maint. Coord. Fee %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury"
                value={form.maintenance_coord_fee_pct}
                onChange={e => updateField('maintenance_coord_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
          <div>
            <label className="field-label">Renewal Fee %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury"
                value={form.renewal_fee_pct}
                onChange={e => updateField('renewal_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
          <div>
            <label className="field-label">Renewal Fee Flat</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.renewal_fee_flat}
                onChange={e => updateField('renewal_fee_flat', e.target.value)}
                min="0"
                step="25"
                placeholder="0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Limits */}
      <div>
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
          Limits &amp; Other Fees
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Repair Limit (without approval)</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.repair_limit_without_approval}
                onChange={e => updateField('repair_limit_without_approval', e.target.value)}
                min="0"
                step="50"
                placeholder="250"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Eviction Fee</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.eviction_fee}
                onChange={e => updateField('eviction_fee', e.target.value)}
                min="0"
                step="50"
                placeholder="350"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Row 4: Agent Referral */}
      <div>
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
          Agent Referral Fee
        </h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="field-label">Referring Agent</label>
            <select
              className="select-luxury"
              value={form.referring_agent_id}
              onChange={e => updateField('referring_agent_id', e.target.value)}
            >
              <option value="">No agent</option>
              {agents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {getAgentName(agent)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Agent Fee (% of Rent)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury w-24"
                value={form.agent_fee_pct}
                onChange={e => updateField('agent_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="5"
                disabled={!form.referring_agent_id}
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
        </div>
        {form.referring_agent_id && agentFeePct > 0 && (
          <div className="inner-card mt-3">
            <p className="text-xs text-luxury-gray-3">
              On $1,000 rent with {mgmtFeePct}% mgmt fee (${(mgmtFeePct * 10).toFixed(0)}):
              Agent gets <span className="font-medium text-luxury-accent">${(agentFeePct * 10).toFixed(2)}</span>,
              CRC keeps <span className="font-medium text-luxury-gray-1">${((mgmtFeePct * 10) - (agentFeePct * 10)).toFixed(2)}</span>
            </p>
          </div>
        )}
      </div>

      {/* Row 5: Agreement URL + Notes */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">Agreement PDF URL</label>
          <input
            type="url"
            className="input-luxury"
            value={form.agreement_pdf_url}
            onChange={e => updateField('agreement_pdf_url', e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="field-label">Notes</label>
          <input
            type="text"
            className="input-luxury"
            value={form.notes}
            onChange={e => updateField('notes', e.target.value)}
            placeholder="Internal notes..."
          />
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary text-sm"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function LandlordDetailPage() {
  const params = useParams()
  const router = useRouter()
  const landlordId = params.id as string

  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [loading, setLoading] = useState(true)
  const [landlord, setLandlord] = useState<Landlord | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [allTenants, setAllTenants] = useState<Tenant[]>([])
  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [sendingInvite, setSendingInvite] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Modal states
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [showLeaseModal, setShowLeaseModal] = useState(false)
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingAgreement, setSavingAgreement] = useState(false)

  // Form states
  const [propertyForm, setPropertyForm] = useState({
    property_address: '',
    unit: '',
    city: '',
    state: 'TX',
    zip: '',
  })

  const [tenantForm, setTenantForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
  })

  const [leaseForm, setLeaseForm] = useState({
    property_id: '',
    tenant_id: '',
    lease_start: '',
    lease_end: '',
    monthly_rent: '',
  })

  useEffect(() => {
    loadLandlordData()
    loadAllTenants()
    loadAgents()
  }, [landlordId])

  const loadLandlordData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pm/landlords/${landlordId}`)
      const data = await res.json()
      if (data.landlord) {
        setLandlord(data.landlord)
        // Data is nested in landlord object from API
        setProperties(data.landlord.managed_properties || [])
        setDisbursements(data.landlord.landlord_disbursements || [])
        // Get first active agreement (there should only be one)
        const agreements = data.landlord.pm_agreements || []
        const activeAgreement = agreements.find((a: Agreement) => a.status === 'active') || agreements[0] || null
        setAgreement(activeAgreement)
      }

      // Fetch leases separately to get tenant info
      const leasesRes = await fetch(`/api/pm/leases?landlord_id=${landlordId}`)
      const leasesData = await leasesRes.json()
      setLeases(leasesData.leases || [])
    } catch (err) {
      console.error('Error loading landlord:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadAllTenants = async () => {
    try {
      const res = await fetch('/api/pm/tenants')
      const data = await res.json()
      setAllTenants(data.tenants || [])
    } catch (err) {
      console.error('Error loading tenants:', err)
    }
  }

  const loadAgents = async () => {
    try {
      const res = await fetch('/api/agents/list')
      const data = await res.json()
      setAgents(data.agents || [])
    } catch (err) {
      console.error('Error loading agents:', err)
    }
  }

  const updateLandlordStatus = async (field: 'w9_status' | 'bank_status', value: string) => {
    if (!landlord) return
    setUpdatingStatus(true)
    try {
      const res = await fetch(`/api/pm/landlords/${landlordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update')
      }
      setLandlord(prev => prev ? { ...prev, [field]: value } : null)
      setSuccessMessage(`${field === 'w9_status' ? 'W9' : 'Bank'} status updated`)
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update status')
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSaveAgreement = async (updates: Record<string, any>) => {
    if (!agreement) return
    setSavingAgreement(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const res = await fetch(`/api/pm/agreements/${agreement.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save agreement')
      }
      setSuccessMessage('Agreement updated')
      setTimeout(() => setSuccessMessage(''), 3000)
      loadLandlordData()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save agreement')
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setSavingAgreement(false)
    }
  }

  const handleCreateAgreement = async () => {
    setSavingAgreement(true)
    setErrorMessage('')
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/pm/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlord_id: landlordId,
          commencement_date: today,
          management_fee_pct: 10,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create agreement')
      }
      setSuccessMessage('Agreement created')
      setTimeout(() => setSuccessMessage(''), 3000)
      loadLandlordData()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create agreement')
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setSavingAgreement(false)
    }
  }

  const sendInvite = async () => {
    if (!landlord) return
    setErrorMessage('')
    setSuccessMessage('')
    setSendingInvite(true)
    try {
      const res = await fetch(`/api/pm/landlords/${landlordId}/send-invite`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send invite')
      setSuccessMessage(data.message || 'Invite sent successfully')
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send invite')
      setTimeout(() => setErrorMessage(''), 3000)
    } finally {
      setSendingInvite(false)
    }
  }

  const handleSaveProperty = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pm/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...propertyForm, landlord_id: landlordId }),
      })
      if (res.ok) {
        setShowPropertyModal(false)
        setPropertyForm({ property_address: '', unit: '', city: '', state: 'TX', zip: '' })
        loadLandlordData()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save property')
      }
    } catch (err) {
      alert('Failed to save property')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTenant = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pm/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tenantForm),
      })
      if (res.ok) {
        const data = await res.json()
        setShowTenantModal(false)
        setTenantForm({ first_name: '', last_name: '', email: '', phone: '' })
        loadAllTenants()
        if (data.tenant) {
          setLeaseForm(prev => ({ ...prev, tenant_id: data.tenant.id }))
        }
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save tenant')
      }
    } catch (err) {
      alert('Failed to save tenant')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveLease = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pm/leases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...leaseForm,
          landlord_id: landlordId,
          monthly_rent: parseFloat(leaseForm.monthly_rent),
        }),
      })
      if (res.ok) {
        setShowLeaseModal(false)
        setLeaseForm({ property_id: '', tenant_id: '', lease_start: '', lease_end: '', monthly_rent: '' })
        loadLandlordData()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save lease')
      }
    } catch (err) {
      alert('Failed to save lease')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProperty = async (id: string) => {
    if (!confirm('Delete this property? This will also delete any leases and invoices.')) return
    try {
      const res = await fetch(`/api/pm/properties/${id}`, { method: 'DELETE' })
      if (res.ok) {
        loadLandlordData()
      }
    } catch (err) {
      alert('Failed to delete property')
    }
  }

  const handleProcessDisbursement = async (id: string) => {
    if (!confirm('Process this disbursement? This will send payment to the landlord.')) return
    try {
      const res = await fetch('/api/pm/disbursements/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disbursement_id: id }),
      })
      if (res.ok) {
        loadLandlordData()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to process disbursement')
      }
    } catch (err) {
      alert('Failed to process disbursement')
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    const ds = dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`
    return new Date(ds).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getMonthName = (month: number) =>
    new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'long' })

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-3">Loading...</p>
      </div>
    )
  }

  if (!landlord) {
    return (
      <div className="text-center py-12">
        <p className="text-luxury-gray-3 mb-4">Landlord not found</p>
        <button onClick={() => router.push('/admin/pm/landlords')} className="btn btn-secondary">
          Back to Landlords
        </button>
      </div>
    )
  }

  const TABS: { key: TabType; label: string; icon: any }[] = [
    { key: 'overview', label: 'Overview', icon: Users },
    { key: 'agreement', label: 'Agreement', icon: ClipboardCheck },
    { key: 'properties', label: `Properties (${properties.length})`, icon: Home },
    { key: 'leases', label: `Leases (${leases.length})`, icon: FileText },
    { key: 'disbursements', label: `Disbursements (${disbursements.length})`, icon: DollarSign },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <button
          onClick={() => router.push('/admin/pm/landlords')}
          className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="page-title">{landlord.first_name} {landlord.last_name}</h1>
          <p className="text-sm text-luxury-gray-3">{landlord.email}</p>
        </div>
        <button
          onClick={sendInvite}
          disabled={sendingInvite}
          className="btn btn-secondary flex items-center gap-2"
        >
          {sendingInvite ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Mail size={14} />
          )}
          {sendingInvite ? 'Sending...' : 'Send Invite'}
        </button>
        <span className={`text-xs font-medium ${
          landlord.status === 'active' ? 'text-green-600' : 'text-amber-600'
        }`}>
          {landlord.status}
        </span>
      </div>

      {/* Alerts */}
      {errorMessage && <div className="alert-error mb-4">{errorMessage}</div>}
      {successMessage && <div className="alert-success mb-4">{successMessage}</div>}

      {/* Tabs */}
      <div className="container-card mb-6">
        <div className="flex space-x-1 border-b border-luxury-gray-5/50 -mx-5 px-5">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.key
                    ? 'border-luxury-accent text-luxury-gray-1'
                    : 'border-transparent text-luxury-gray-3 hover:text-luxury-gray-1'
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="pt-5">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Contact Information
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-luxury-gray-3">Email</span>
                    <span className="text-luxury-gray-1">{landlord.email}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-luxury-gray-3">Phone</span>
                    <span className="text-luxury-gray-1">{landlord.phone || 'Not provided'}</span>
                  </div>
                  {landlord.mailing_address && (
                    <div className="flex justify-between text-sm">
                      <span className="text-luxury-gray-3">Address</span>
                      <span className="text-luxury-gray-1 text-right">
                        {landlord.mailing_address}<br />
                        {landlord.mailing_city}, {landlord.mailing_state} {landlord.mailing_zip}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Account Status
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-luxury-gray-3">W9 Form</span>
                    <select
                      value={landlord.w9_status || 'pending'}
                      onChange={(e) => updateLandlordStatus('w9_status', e.target.value)}
                      disabled={updatingStatus}
                      className={`text-xs border border-luxury-gray-5 rounded px-2 py-1 bg-white cursor-pointer ${
                        landlord.w9_status === 'completed' ? 'text-green-700' : 'text-amber-600'
                      }`}
                    >
                      <option value="pending">Pending</option>
                      <option value="requested">Requested</option>
                      <option value="completed">Complete</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-luxury-gray-3">Bank Account</span>
                    <select
                      value={landlord.bank_status || 'pending'}
                      onChange={(e) => updateLandlordStatus('bank_status', e.target.value)}
                      disabled={updatingStatus}
                      className={`text-xs border border-luxury-gray-5 rounded px-2 py-1 bg-white cursor-pointer ${
                        landlord.bank_status === 'connected' ? 'text-green-700' : 'text-amber-600'
                      }`}
                    >
                      <option value="pending">Pending</option>
                      <option value="invited">Invited</option>
                      <option value="connected">Connected</option>
                    </select>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-luxury-gray-3">Added</span>
                    <span className="text-luxury-gray-1">{formatDate(landlord.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Summary
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="inner-card text-center">
                    <p className="text-2xl font-semibold text-luxury-accent">{properties.length}</p>
                    <p className="text-xs text-luxury-gray-3">Properties</p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-2xl font-semibold text-luxury-accent">{leases.filter(l => l.status === 'active').length}</p>
                    <p className="text-xs text-luxury-gray-3">Active Leases</p>
                  </div>
                  <div className="inner-card text-center">
                    <p className="text-2xl font-semibold text-luxury-accent">
                      {formatCurrency(disbursements.filter(d => d.payment_status === 'pending').reduce((sum, d) => sum + d.net_amount, 0))}
                    </p>
                    <p className="text-xs text-luxury-gray-3">Pending Disbursements</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Agreement Tab */}
          {activeTab === 'agreement' && (
            <div>
              {!agreement ? (
                <div className="text-center py-8">
                  <p className="text-sm text-luxury-gray-3 mb-4">No agreement found for this landlord</p>
                  <button
                    onClick={handleCreateAgreement}
                    disabled={savingAgreement}
                    className="btn btn-primary text-sm"
                  >
                    {savingAgreement ? 'Creating...' : 'Create Agreement'}
                  </button>
                </div>
              ) : (
                <AgreementEditor
                  agreement={agreement}
                  agents={agents}
                  saving={savingAgreement}
                  onSave={handleSaveAgreement}
                />
              )}
            </div>
          )}

          {/* Properties Tab */}
          {activeTab === 'properties' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => setShowPropertyModal(true)} className="btn btn-primary text-sm flex items-center gap-2">
                  <Plus size={14} /> Add Property
                </button>
              </div>

              {properties.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-8">No properties yet</p>
              ) : (
                <div className="space-y-3">
                  {properties.map(property => (
                    <div key={property.id} className="inner-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-luxury-gray-1">
                            {property.property_address}{property.unit && ` ${property.unit}`}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            {property.city}, {property.state} {property.zip}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${
                            property.status === 'active' ? 'text-green-600' : 'text-luxury-gray-3'
                          }`}>
                            {property.status}
                          </span>
                          <button
                            onClick={() => handleDeleteProperty(property.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leases Tab */}
          {activeTab === 'leases' && (
            <div>
              <div className="flex justify-end mb-4">
                <button 
                  onClick={() => setShowLeaseModal(true)} 
                  className="btn btn-primary text-sm flex items-center gap-2"
                  disabled={properties.length === 0}
                >
                  <Plus size={14} /> Create Lease
                </button>
              </div>

              {properties.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-8">Add a property first before creating leases</p>
              ) : leases.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-8">No leases yet</p>
              ) : (
                <div className="space-y-3">
                  {leases.map(lease => (
                    <div key={lease.id} className="inner-card">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-luxury-gray-1">
                            {lease.managed_properties?.property_address || 'Property'}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            Tenant: {lease.tenants?.first_name} {lease.tenants?.last_name} · 
                            {formatCurrency(lease.monthly_rent)}/mo
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-luxury-gray-3">
                              {formatDate(lease.lease_start)} - {formatDate(lease.lease_end)}
                            </p>
                          </div>
                          <span className={`text-xs font-medium ${
                            lease.status === 'active' ? 'text-green-600' : 'text-luxury-gray-3'
                          }`}>
                            {lease.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Disbursements Tab */}
          {activeTab === 'disbursements' && (
            <div>
              {disbursements.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-8">No disbursements yet</p>
              ) : (
                <div className="space-y-3">
                  {disbursements.map(disb => (
                    <div key={disb.id} className="inner-card">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-luxury-gray-1">
                            {getMonthName(disb.period_month)} {disb.period_year}
                          </p>
                          <p className="text-xs text-luxury-gray-3">
                            Gross: {formatCurrency(disb.gross_rent)} · 
                            Fee: {formatCurrency(disb.management_fee)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-semibold text-green-700">{formatCurrency(disb.net_amount)}</p>
                            {disb.payment_date && (
                              <p className="text-xs text-luxury-gray-3">Paid {formatDate(disb.payment_date)}</p>
                            )}
                          </div>
                          {disb.payment_status === 'pending' ? (
                            <button
                              onClick={() => handleProcessDisbursement(disb.id)}
                              className="btn btn-primary text-xs flex items-center gap-1"
                              disabled={landlord.bank_status !== 'connected'}
                            >
                              <Send size={12} /> Process
                            </button>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">
                              {disb.payment_status}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Property Modal */}
      {showPropertyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Property</h2>
              <button onClick={() => setShowPropertyModal(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Street Address</label>
                <input
                  type="text"
                  className="input-luxury"
                  value={propertyForm.property_address}
                  onChange={e => setPropertyForm({ ...propertyForm, property_address: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Unit/Suite</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={propertyForm.unit}
                    onChange={e => setPropertyForm({ ...propertyForm, unit: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">City</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={propertyForm.city}
                    onChange={e => setPropertyForm({ ...propertyForm, city: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">State</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={propertyForm.state}
                    onChange={e => setPropertyForm({ ...propertyForm, state: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">ZIP</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={propertyForm.zip}
                    onChange={e => setPropertyForm({ ...propertyForm, zip: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPropertyModal(false)} className="flex-1 btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveProperty} disabled={saving} className="flex-1 btn btn-primary">
                  {saving ? 'Saving...' : 'Save Property'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Lease Modal */}
      {showLeaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Create Lease</h2>
              <button onClick={() => setShowLeaseModal(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Property</label>
                <select
                  className="select-luxury"
                  value={leaseForm.property_id}
                  onChange={e => setLeaseForm({ ...leaseForm, property_id: e.target.value })}
                >
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>{p.property_address}{p.unit && ` ${p.unit}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Tenant</label>
                <div className="flex gap-2">
                  <select
                    className="select-luxury flex-1"
                    value={leaseForm.tenant_id}
                    onChange={e => setLeaseForm({ ...leaseForm, tenant_id: e.target.value })}
                  >
                    <option value="">Select tenant...</option>
                    {allTenants.map(t => (
                      <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                    ))}
                  </select>
                  <button onClick={() => setShowTenantModal(true)} className="btn btn-secondary text-sm">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">Lease Start</label>
                  <input
                    type="date"
                    className="input-luxury"
                    value={leaseForm.lease_start}
                    onChange={e => setLeaseForm({ ...leaseForm, lease_start: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Lease End</label>
                  <input
                    type="date"
                    className="input-luxury"
                    value={leaseForm.lease_end}
                    onChange={e => setLeaseForm({ ...leaseForm, lease_end: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Monthly Rent</label>
                <input
                  type="number"
                  className="input-luxury"
                  value={leaseForm.monthly_rent}
                  onChange={e => setLeaseForm({ ...leaseForm, monthly_rent: e.target.value })}
                  placeholder="1500"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowLeaseModal(false)} className="flex-1 btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveLease} disabled={saving} className="flex-1 btn btn-primary">
                  {saving ? 'Saving...' : 'Create Lease'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Tenant</h2>
              <button onClick={() => setShowTenantModal(false)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="field-label">First Name</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={tenantForm.first_name}
                    onChange={e => setTenantForm({ ...tenantForm, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="field-label">Last Name</label>
                  <input
                    type="text"
                    className="input-luxury"
                    value={tenantForm.last_name}
                    onChange={e => setTenantForm({ ...tenantForm, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="field-label">Email</label>
                <input
                  type="email"
                  className="input-luxury"
                  value={tenantForm.email}
                  onChange={e => setTenantForm({ ...tenantForm, email: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input
                  type="tel"
                  className="input-luxury"
                  value={tenantForm.phone}
                  onChange={e => setTenantForm({ ...tenantForm, phone: e.target.value })}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowTenantModal(false)} className="flex-1 btn btn-secondary">
                  Cancel
                </button>
                <button onClick={handleSaveTenant} disabled={saving} className="flex-1 btn btn-primary">
                  {saving ? 'Saving...' : 'Save Tenant'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}