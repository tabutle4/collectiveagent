'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Send, DollarSign, Home, FileText, Users, X, Mail, Loader2, ClipboardCheck, ExternalLink, Edit2, CheckCircle, Upload } from 'lucide-react'
import Link from 'next/link'
import HeldInTrustWidget from '@/components/pm/HeldInTrustWidget'

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
  pm_agreements?: {
    id: string
    status: string
    crc_collects_rent: boolean
    crc_holds_deposit: boolean
    crc_invoices_mgmt_fee: boolean
  }[]
}

interface Property {
  id: string
  property_address: string
  unit: string | null
  city: string
  state: string
  zip: string
  status: string
  pm_agreement_id: string | null
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
  deposit_amount: number
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
  auto_renews: boolean
  management_fee_pct: number
  management_fee_flat: number | null
  management_fee_minimum: number | null
  mgmt_fee_basis: 'collected' | 'charged' | null
  crc_collects_rent: boolean
  crc_holds_deposit: boolean
  crc_invoices_mgmt_fee: boolean
  leasing_fee_pct: number | null
  leasing_fee_flat: number | null
  maintenance_coord_fee_pct: number | null
  renewal_fee_pct: number | null
  renewal_fee_flat: number | null
  eviction_fee: number | null
  repair_limit_without_approval: number | null
  reserve_per_unit: number | null
  coop_broker_fee_pct: number | null
  lease_term_min_months: number | null
  lease_term_max_months: number | null
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
  onUploaded,
}: {
  agreement: Agreement
  agents: Agent[]
  saving: boolean
  onSave: (updates: Record<string, any>) => void
  onUploaded: () => void
}) {
  // Form state
  const [form, setForm] = useState({
    status: agreement.status || 'active',
    commencement_date: agreement.commencement_date || '',
    expiration_date: agreement.expiration_date || '',
    auto_renews: agreement.auto_renews ?? true,
    management_fee_pct: agreement.management_fee_pct || 10,
    management_fee_flat: agreement.management_fee_flat ?? '',
    mgmt_fee_basis: agreement.mgmt_fee_basis || 'charged',
    crc_collects_rent: agreement.crc_collects_rent ?? true,
    crc_holds_deposit: agreement.crc_holds_deposit ?? true,
    crc_invoices_mgmt_fee: agreement.crc_invoices_mgmt_fee ?? true,
    leasing_fee_pct: agreement.leasing_fee_pct ?? '',
    leasing_fee_flat: agreement.leasing_fee_flat ?? '',
    maintenance_coord_fee_pct: agreement.maintenance_coord_fee_pct || '',
    renewal_fee_pct: agreement.renewal_fee_pct || '',
    renewal_fee_flat: agreement.renewal_fee_flat || '',
    eviction_fee: agreement.eviction_fee || '',
    repair_limit_without_approval: agreement.repair_limit_without_approval || '',
    reserve_per_unit: agreement.reserve_per_unit ?? '',
    coop_broker_fee_pct: agreement.coop_broker_fee_pct ?? '',
    lease_term_min_months: agreement.lease_term_min_months ?? '',
    lease_term_max_months: agreement.lease_term_max_months ?? '',
    notes: agreement.notes || '',
    referring_agent_id: agreement.referring_agent_id || '',
    agent_fee_pct: agreement.agent_fee_pct || 0,
  })
  const [hasChanges, setHasChanges] = useState(false)
  // Upload state for the PM agreement PDF. The upload route writes
  // agreement_pdf_url directly to the row, bypassing this form's save flow,
  // so we don't keep agreement_pdf_url in `form` anymore.
  const [uploadingAgreement, setUploadingAgreement] = useState(false)
  const [uploadError, setUploadError] = useState('')

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
      auto_renews: form.auto_renews,
      management_fee_pct: parseFloat(String(form.management_fee_pct)) || 0,
      management_fee_flat: form.management_fee_flat !== '' && form.management_fee_flat !== null
        ? parseFloat(String(form.management_fee_flat))
        : null,
      mgmt_fee_basis: form.mgmt_fee_basis || 'charged',
      crc_collects_rent: form.crc_collects_rent,
      crc_holds_deposit: form.crc_holds_deposit,
      crc_invoices_mgmt_fee: form.crc_invoices_mgmt_fee,
      leasing_fee_pct: form.leasing_fee_pct !== '' && form.leasing_fee_pct !== null
        ? parseFloat(String(form.leasing_fee_pct))
        : null,
      leasing_fee_flat: form.leasing_fee_flat !== '' && form.leasing_fee_flat !== null
        ? parseFloat(String(form.leasing_fee_flat))
        : null,
      maintenance_coord_fee_pct: form.maintenance_coord_fee_pct ? parseFloat(String(form.maintenance_coord_fee_pct)) : null,
      renewal_fee_pct: form.renewal_fee_pct ? parseFloat(String(form.renewal_fee_pct)) : null,
      renewal_fee_flat: form.renewal_fee_flat ? parseFloat(String(form.renewal_fee_flat)) : null,
      eviction_fee: form.eviction_fee ? parseFloat(String(form.eviction_fee)) : null,
      repair_limit_without_approval: form.repair_limit_without_approval ? parseFloat(String(form.repair_limit_without_approval)) : null,
      reserve_per_unit: form.reserve_per_unit !== '' && form.reserve_per_unit !== null
        ? parseFloat(String(form.reserve_per_unit))
        : null,
      coop_broker_fee_pct: form.coop_broker_fee_pct !== '' && form.coop_broker_fee_pct !== null
        ? parseFloat(String(form.coop_broker_fee_pct))
        : null,
      lease_term_min_months: form.lease_term_min_months !== '' && form.lease_term_min_months !== null
        ? parseInt(String(form.lease_term_min_months), 10)
        : null,
      lease_term_max_months: form.lease_term_max_months !== '' && form.lease_term_max_months !== null
        ? parseInt(String(form.lease_term_max_months), 10)
        : null,
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

      {/* Auto Renews toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.auto_renews}
          onChange={e => updateField('auto_renews', e.target.checked)}
          className="rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
        />
        <span className="text-sm text-luxury-gray-2">
          Automatically renews on a month-to-month basis after expiration
        </span>
      </label>

      {/* Collection Model Toggles */}
      <div>
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
          Collection Model
        </h3>
        <div className="inner-card space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.crc_collects_rent}
              onChange={e => updateField('crc_collects_rent', e.target.checked)}
              className="mt-0.5 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
            />
            <div>
              <span className="text-sm font-medium text-luxury-gray-1">CRC Collects Rent</span>
              <p className="text-xs text-luxury-gray-3 mt-0.5">Tenant invoices are created and rent flows through CRC. Uncheck if landlord collects rent directly from tenant.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.crc_holds_deposit}
              onChange={e => updateField('crc_holds_deposit', e.target.checked)}
              className="mt-0.5 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
            />
            <div>
              <span className="text-sm font-medium text-luxury-gray-1">CRC Holds Deposit</span>
              <p className="text-xs text-luxury-gray-3 mt-0.5">Security deposit is collected and held in CRC trust account. Uncheck if landlord holds the deposit directly.</p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.crc_invoices_mgmt_fee}
              onChange={e => updateField('crc_invoices_mgmt_fee', e.target.checked)}
              className="mt-0.5 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
            />
            <div>
              <span className="text-sm font-medium text-luxury-gray-1">CRC Invoices Mgmt Fee</span>
              <p className="text-xs text-luxury-gray-3 mt-0.5">Management fee is invoiced to landlord via Payload. When CRC collects rent this is deducted automatically. Uncheck only if fee is collected another way.</p>
            </div>
          </label>
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
            <label className="field-label">Fee Basis</label>
            <select
              className="select-luxury"
              value={form.mgmt_fee_basis}
              onChange={e => updateField('mgmt_fee_basis', e.target.value)}
            >
              <option value="charged">Charged (per agreement)</option>
              <option value="collected">Collected (only on paid rent)</option>
            </select>
            <p className="text-xs text-luxury-gray-3 mt-1">
              {form.mgmt_fee_basis === 'charged'
                ? 'Fee owed every month even if tenant skips. Per TXR-2201 Para 6(A).'
                : 'Fee only taken from rent actually received.'}
            </p>
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
        <div className="grid md:grid-cols-4 gap-4 mt-4">
          <div>
            <label className="field-label">Management Fee Flat</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.management_fee_flat}
                onChange={e => updateField('management_fee_flat', e.target.value)}
                min="0"
                step="25"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Leasing Fee %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury"
                value={form.leasing_fee_pct}
                onChange={e => updateField('leasing_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
          <div>
            <label className="field-label">Leasing Fee Flat</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.leasing_fee_flat}
                onChange={e => updateField('leasing_fee_flat', e.target.value)}
                min="0"
                step="25"
                placeholder="0"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Coop Broker Fee %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className="input-luxury"
                value={form.coop_broker_fee_pct}
                onChange={e => updateField('coop_broker_fee_pct', e.target.value)}
                min="0"
                max="100"
                step="0.5"
                placeholder="0"
              />
              <span className="text-sm text-luxury-gray-3">%</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-luxury-gray-3 mt-3">
          When Management Fee Flat is set, it overrides Management Fee %. Same for Leasing Fee Flat vs Leasing Fee %.
        </p>
      </div>

      {/* Reserve & Lease Term */}
      <div>
        <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
          Reserve &amp; Lease Term
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <label className="field-label">Reserve Per Unit</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-luxury-gray-3">$</span>
              <input
                type="number"
                className="input-luxury"
                value={form.reserve_per_unit}
                onChange={e => updateField('reserve_per_unit', e.target.value)}
                min="0"
                step="50"
                placeholder="500"
              />
            </div>
          </div>
          <div>
            <label className="field-label">Lease Term Min (months)</label>
            <input
              type="number"
              className="input-luxury"
              value={form.lease_term_min_months}
              onChange={e => updateField('lease_term_min_months', e.target.value)}
              min="0"
              step="1"
              placeholder="12"
            />
          </div>
          <div>
            <label className="field-label">Lease Term Max (months)</label>
            <input
              type="number"
              className="input-luxury"
              value={form.lease_term_max_months}
              onChange={e => updateField('lease_term_max_months', e.target.value)}
              min="0"
              step="1"
              placeholder="24"
            />
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

      {/* Row 5: Agreement PDF + Notes */}
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="field-label">PM Agreement</label>
          <div className="flex items-center gap-2">
            {agreement.agreement_pdf_url ? (
              <a
                href={agreement.agreement_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-luxury-accent hover:underline flex items-center gap-1 flex-1 min-w-0"
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">View current PM agreement</span>
                <ExternalLink size={11} className="shrink-0" />
              </a>
            ) : (
              <span className="text-sm text-luxury-gray-3 flex-1">No PM agreement uploaded</span>
            )}
            <label className="btn btn-secondary text-xs py-1 px-3 cursor-pointer flex items-center gap-1 shrink-0">
              <Upload size={12} />
              {uploadingAgreement ? 'Uploading...' : agreement.agreement_pdf_url ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                disabled={uploadingAgreement}
                onChange={async e => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  setUploadingAgreement(true)
                  setUploadError('')
                  try {
                    const fd = new FormData()
                    fd.append('file', f)
                    const res = await fetch(`/api/pm/agreements/${agreement.id}/upload`, {
                      method: 'POST',
                      body: fd,
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error || 'Failed to upload PM agreement')
                    onUploaded()
                  } catch (err: any) {
                    setUploadError(err.message)
                  } finally {
                    setUploadingAgreement(false)
                  }
                }}
              />
            </label>
          </div>
          {uploadError && (
            <p className="text-xs text-red-600 mt-1">{uploadError}</p>
          )}
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

  const searchParams = useSearchParams()
  const [activeTab, setActiveTabState] = useState<TabType>(
    (searchParams.get('tab') as TabType) || 'overview'
  )
  const setActiveTab = (newTab: TabType) => {
    setActiveTabState(newTab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', newTab)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }
  const [loading, setLoading] = useState(true)
  const [landlord, setLandlord] = useState<Landlord | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [leases, setLeases] = useState<Lease[]>([])
  const [disbursements, setDisbursements] = useState<Disbursement[]>([])
  const [allTenants, setAllTenants] = useState<Tenant[]>([])
  const [agreements, setAgreements] = useState<Agreement[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [sendingInvite, setSendingInvite] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Pending deductions sub-section on the Disbursements tab.
  // pendingDeductions: rows where disbursement_id IS NULL (waiting to be
  // applied to a future disbursement). Scoped landlord-wide; the property
  // column tells admin which property each deduction belongs to.
  const [pendingDeductions, setPendingDeductions] = useState<any[]>([])
  const [recurringDeductions, setRecurringDeductions] = useState<any[]>([])
  const [loadingRecurring, setLoadingRecurring] = useState(false)
  const [showAddRecurringModal, setShowAddRecurringModal] = useState(false)
  const [recurringForm, setRecurringForm] = useState({
    property_id: '',
    label: '',
    amount: '',
    recurring_start_date: '',
    recurring_end_date: '',
  })
  const [loadingDeductions, setLoadingDeductions] = useState(false)
  const [showAddDeductionModal, setShowAddDeductionModal] = useState(false)
  const [deductionForm, setDeductionForm] = useState({
    property_id: '',
    label: '',
    amount: '',
    description: '',
    incurred_date: '',
  })
  const [savingDeduction, setSavingDeduction] = useState(false)

  // Statements sub-section on Disbursements tab. Same loading pattern as
  // pending deductions - lazy load only when tab is opened.
  const [statements, setStatements] = useState<any[]>([])
  const [loadingStatements, setLoadingStatements] = useState(false)
  const [sendingStatementId, setSendingStatementId] = useState<string | null>(null)

  // Modal states
  const [showPropertyModal, setShowPropertyModal] = useState(false)
  const [showLeaseModal, setShowLeaseModal] = useState(false)
  const [showTenantModal, setShowTenantModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingAgreement, setSavingAgreement] = useState(false)

  // Overview editing
  const [editingOverview, setEditingOverview] = useState(false)
  const [savingOverview, setSavingOverview] = useState(false)
  const [overviewForm, setOverviewForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    mailing_address: '',
    mailing_city: '',
    mailing_state: 'TX',
    mailing_zip: '',
    status: 'onboarding',
  })

  // Mark Paid modal for disbursements
  const [markPaidModal, setMarkPaidModal] = useState<Disbursement | null>(null)
  const [markPaidDate, setMarkPaidDate] = useState('')
  const [markPaidMethod, setMarkPaidMethod] = useState('ach')
  const [markingPaid, setMarkingPaid] = useState(false)

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

  // Load pending deductions + statements only when the Disbursements
  // tab is active so we don't fetch for landlords whose admin never
  // opens that tab.
  useEffect(() => {
    if (activeTab === 'disbursements') {
      loadPendingDeductions()
      loadStatements()
      loadRecurringDeductions()
    }
  }, [activeTab, landlordId])

  const loadStatements = async () => {
    setLoadingStatements(true)
    try {
      const res = await fetch(`/api/pm/statements?landlord_id=${landlordId}`)
      if (res.ok) {
        const data = await res.json()
        setStatements(data.statements || [])
      }
    } catch (err) {
      console.error('Error loading statements:', err)
    } finally {
      setLoadingStatements(false)
    }
  }

  const handleSendStatement = async (statementId: string) => {
    if (!confirm('Send this statement to the landlord? Office will be BCC\'d.')) return
    setSendingStatementId(statementId)
    try {
      const res = await fetch(`/api/pm/statements/${statementId}/send`, {
        method: 'POST',
      })
      const data = await res.json()
      if (res.ok) {
        alert(`Sent to ${data.sentTo}`)
        loadStatements()
      } else {
        alert(data.error || 'Send failed')
      }
    } catch (err: any) {
      alert(err.message || 'Send failed')
    } finally {
      setSendingStatementId(null)
    }
  }

  const loadPendingDeductions = async () => {
    setLoadingDeductions(true)
    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions?landlord_id=${landlordId}&pending=true`
      )
      if (res.ok) {
        const data = await res.json()
        setPendingDeductions((data.deductions || []).filter((d: any) => !d.is_recurring))
      }
    } catch (err) {
      console.error('Error loading pending deductions:', err)
    } finally {
      setLoadingDeductions(false)
    }
  }

  const loadRecurringDeductions = async () => {
    setLoadingRecurring(true)
    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions?landlord_id=${landlordId}&recurring=true`
      )
      if (res.ok) {
        const data = await res.json()
        setRecurringDeductions(data.deductions || [])
      }
    } catch (err) {
      console.error('Error loading recurring deductions:', err)
    } finally {
      setLoadingRecurring(false)
    }
  }

  const addRecurringDeduction = async () => {
    if (!recurringForm.property_id || !recurringForm.label || !recurringForm.amount) {
      alert('Property, label, and amount are required')
      return
    }
    try {
      const res = await fetch('/api/pm/landlord-disbursement-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlord_id: landlordId,
          property_id: recurringForm.property_id,
          label: recurringForm.label,
          amount: parseFloat(recurringForm.amount),
          is_recurring: true,
          recurring_start_date: recurringForm.recurring_start_date || null,
          recurring_end_date: recurringForm.recurring_end_date || null,
          sort_order: 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'Failed to add'); return }
      setShowAddRecurringModal(false)
      setRecurringForm({ property_id: '', label: '', amount: '', recurring_start_date: '', recurring_end_date: '' })
      loadRecurringDeductions()
    } catch (err: any) {
      alert(err.message || 'Failed to add')
    }
  }

  const deleteRecurringDeduction = async (id: string) => {
    if (!confirm('Delete this recurring deduction? It will no longer be applied to future disbursements.')) return
    try {
      const res = await fetch(`/api/pm/landlord-disbursement-deductions?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Failed to delete')
        return
      }
      loadRecurringDeductions()
    } catch (err: any) {
      alert(err.message || 'Failed to delete')
    }
  }

  const openAddDeductionModal = () => {
    setDeductionForm({
      property_id: properties.length === 1 ? properties[0].id : '',
      label: '',
      amount: '',
      description: '',
      incurred_date: '',
    })
    setShowAddDeductionModal(true)
  }

  const saveDeduction = async () => {
    if (!deductionForm.property_id || !deductionForm.label || !deductionForm.amount) {
      alert('Property, label, and amount are required')
      return
    }
    if (parseFloat(deductionForm.amount) <= 0) {
      alert('Amount must be greater than zero')
      return
    }

    setSavingDeduction(true)
    try {
      const res = await fetch('/api/pm/landlord-disbursement-deductions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          landlord_id: landlordId,
          property_id: deductionForm.property_id,
          label: deductionForm.label,
          amount: parseFloat(deductionForm.amount),
          description: deductionForm.description || null,
          incurred_date: deductionForm.incurred_date || null,
        }),
      })

      if (res.ok) {
        setShowAddDeductionModal(false)
        loadPendingDeductions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to save deduction')
      }
    } catch (err) {
      console.error('Error saving deduction:', err)
      alert('Failed to save deduction')
    } finally {
      setSavingDeduction(false)
    }
  }

  const deleteDeduction = async (deductionId: string) => {
    if (!confirm('Delete this pending deduction?')) return

    try {
      const res = await fetch(
        `/api/pm/landlord-disbursement-deductions/${deductionId}`,
        { method: 'DELETE' }
      )
      if (res.ok) {
        loadPendingDeductions()
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete deduction')
      }
    } catch (err) {
      console.error('Error deleting deduction:', err)
      alert('Failed to delete deduction')
    }
  }

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
        // Keep all agreements, sorted newest first by commencement_date
        const allAgreements: Agreement[] = data.landlord.pm_agreements || []
        const sorted = [...allAgreements].sort((a, b) => {
          const aDate = a.commencement_date || ''
          const bDate = b.commencement_date || ''
          return bDate.localeCompare(aDate)
        })
        setAgreements(sorted)
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

  const startEditingOverview = () => {
    if (!landlord) return
    setOverviewForm({
      first_name: landlord.first_name || '',
      last_name: landlord.last_name || '',
      email: landlord.email || '',
      phone: landlord.phone || '',
      mailing_address: landlord.mailing_address || '',
      mailing_city: landlord.mailing_city || '',
      mailing_state: landlord.mailing_state || 'TX',
      mailing_zip: landlord.mailing_zip || '',
      status: landlord.status || 'onboarding',
    })
    setEditingOverview(true)
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

  const handleSaveOverview = async () => {
    if (!landlord) return
    setSavingOverview(true)
    setErrorMessage('')
    try {
      const res = await fetch(`/api/pm/landlords/${landlordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(overviewForm),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      setSuccessMessage('Landlord updated')
      setTimeout(() => setSuccessMessage(''), 3000)
      setEditingOverview(false)
      loadLandlordData()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save landlord')
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setSavingOverview(false)
    }
  }

  const handleMarkPaid = async () => {
    if (!markPaidModal || !markPaidDate) return
    setMarkingPaid(true)
    try {
      const res = await fetch(`/api/pm/disbursements/${markPaidModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_status: 'paid',
          payment_date: markPaidDate,
          payment_method: markPaidMethod,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to mark as paid')
      }
      setSuccessMessage('Disbursement marked as paid')
      setTimeout(() => setSuccessMessage(''), 3000)
      setMarkPaidModal(null)
      loadLandlordData()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to mark as paid')
      setTimeout(() => setErrorMessage(''), 5000)
    } finally {
      setMarkingPaid(false)
    }
  }

  const handleSaveAgreement = async (agreementId: string, updates: Record<string, any>) => {
    setSavingAgreement(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const res = await fetch(`/api/pm/agreements/${agreementId}`, {
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
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => router.push('/admin/pm/landlords')}
            className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors flex-shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="page-title truncate">{landlord.first_name} {landlord.last_name}</h1>
            <p className="text-sm text-luxury-gray-3 truncate">{landlord.email}</p>
          </div>
          <span className={`text-xs font-medium flex-shrink-0 ${
            landlord.status === 'active' ? 'text-green-600' : 'text-amber-600'
          }`}>
            {landlord.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 ml-9">
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
          <Link
            href={`/pm/landlord/dashboard?preview=${landlordId}`}
            target="_blank"
            className="btn btn-secondary flex items-center gap-2"
          >
            <ExternalLink size={14} />
            Preview Portal
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && <div className="alert-error mb-4">{errorMessage}</div>}
      {successMessage && <div className="alert-success mb-4">{successMessage}</div>}

      {/* Tabs */}
      <div className="container-card mb-6">
        <div className="flex overflow-x-auto touch-pan-x gap-0 border-b border-luxury-gray-5/50 pb-px">
          {TABS.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
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
            <div>
              {/* Held-in-Trust widget - landlord-wide aggregate (no property filter).
                  Sits at the top so trust balance is the first thing you see. */}
              <div className="mb-6">
                <HeldInTrustWidget landlordId={landlordId} />
              </div>

              {/* Edit/Save buttons */}
              <div className="flex justify-end mb-4">
                {editingOverview ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingOverview(false)}
                      className="btn btn-secondary text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveOverview}
                      disabled={savingOverview}
                      className="btn btn-primary text-sm flex items-center gap-2"
                    >
                      {savingOverview ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      {savingOverview ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={startEditingOverview}
                    className="btn btn-secondary text-sm flex items-center gap-2"
                  >
                    <Edit2 size={14} /> Edit Landlord
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                    Contact Information
                  </h3>
                  {editingOverview ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="field-label">First Name</label>
                          <input
                            type="text"
                            value={overviewForm.first_name}
                            onChange={(e) => setOverviewForm(f => ({ ...f, first_name: e.target.value }))}
                            className="input-luxury w-full"
                          />
                        </div>
                        <div>
                          <label className="field-label">Last Name</label>
                          <input
                            type="text"
                            value={overviewForm.last_name}
                            onChange={(e) => setOverviewForm(f => ({ ...f, last_name: e.target.value }))}
                            className="input-luxury w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">Email</label>
                        <input
                          type="email"
                          value={overviewForm.email}
                          onChange={(e) => setOverviewForm(f => ({ ...f, email: e.target.value }))}
                          className="input-luxury w-full"
                        />
                      </div>
                      <div>
                        <label className="field-label">Phone</label>
                        <input
                          type="tel"
                          value={overviewForm.phone}
                          onChange={(e) => setOverviewForm(f => ({ ...f, phone: e.target.value }))}
                          className="input-luxury w-full"
                        />
                      </div>
                      <div>
                        <label className="field-label">Mailing Address</label>
                        <input
                          type="text"
                          value={overviewForm.mailing_address}
                          onChange={(e) => setOverviewForm(f => ({ ...f, mailing_address: e.target.value }))}
                          className="input-luxury w-full"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="field-label">City</label>
                          <input
                            type="text"
                            value={overviewForm.mailing_city}
                            onChange={(e) => setOverviewForm(f => ({ ...f, mailing_city: e.target.value }))}
                            className="input-luxury w-full"
                          />
                        </div>
                        <div>
                          <label className="field-label">State</label>
                          <input
                            type="text"
                            value={overviewForm.mailing_state}
                            onChange={(e) => setOverviewForm(f => ({ ...f, mailing_state: e.target.value }))}
                            className="input-luxury w-full"
                          />
                        </div>
                        <div>
                          <label className="field-label">ZIP</label>
                          <input
                            type="text"
                            value={overviewForm.mailing_zip}
                            onChange={(e) => setOverviewForm(f => ({ ...f, mailing_zip: e.target.value }))}
                            className="input-luxury w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="field-label">Status</label>
                        <select
                          value={overviewForm.status}
                          onChange={(e) => setOverviewForm(f => ({ ...f, status: e.target.value }))}
                          className="select-luxury w-full"
                        >
                          <option value="onboarding">Onboarding</option>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                  ) : (
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
                  )}
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

                {/* Setup Checklist */}
                <div className="md:col-span-2">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                    Setup Checklist
                  </h3>
                  <div className="inner-card space-y-2">
                    {[
                      {
                        label: 'Agreement',
                        done: agreements.length > 0,
                        action: () => setActiveTab('agreement'),
                        actionLabel: 'Create Agreement',
                        note: 'Required before adding a property',
                      },
                      {
                        label: 'Property',
                        done: properties.length > 0,
                        href: `/admin/pm/properties/new`,
                        actionLabel: 'Add Property',
                        note: agreements.length === 0 ? 'Create an agreement first' : undefined,
                        disabled: agreements.length === 0,
                      },
                      {
                        label: 'Tenant',
                        done: leases.length > 0,
                        href: `/admin/pm/tenants/new`,
                        actionLabel: 'Add Tenant',
                        note: undefined,
                        disabled: false,
                      },
                      {
                        label: 'Lease',
                        done: leases.filter(l => l.status === 'active').length > 0,
                        href: properties.length > 0 ? `/admin/pm/leases/new` : undefined,
                        actionLabel: 'Create Lease',
                        note: properties.length === 0 ? 'Add a property first' : agreements.length === 0 ? 'Create an agreement first' : undefined,
                        disabled: properties.length === 0 || agreements.length === 0,
                      },
                    ].map((step) => (
                      <div key={step.label} className="flex items-center justify-between py-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? 'bg-green-100' : 'bg-luxury-gray-5'}`}>
                            {step.done
                              ? <CheckCircle size={14} className="text-green-600" />
                              : <div className="w-2 h-2 rounded-full bg-luxury-gray-3" />
                            }
                          </div>
                          <div>
                            <span className={`text-sm ${step.done ? 'text-luxury-gray-3 line-through' : 'text-luxury-gray-1 font-medium'}`}>
                              {step.label}
                            </span>
                            {step.note && !step.done && (
                              <p className="text-xs text-amber-600">{step.note}</p>
                            )}
                          </div>
                        </div>
                        {!step.done && (
                          step.action ? (
                            <button
                              onClick={step.action}
                              disabled={step.disabled}
                              className="text-xs text-luxury-accent hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                            >
                              {step.actionLabel}
                            </button>
                          ) : step.href && !step.disabled ? (
                            <Link href={step.href} className="text-xs text-luxury-accent hover:underline">
                              {step.actionLabel}
                            </Link>
                          ) : (
                            <span className="text-xs text-luxury-gray-4">{step.actionLabel}</span>
                          )
                        )}
                      </div>
                    ))}
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
            </div>
          )}

          {/* Agreement Tab */}
          {activeTab === 'agreement' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-luxury-gray-3">
                  {agreements.length === 0
                    ? 'No agreements yet'
                    : `${agreements.length} agreement${agreements.length === 1 ? '' : 's'} on file`}
                </p>
                <button
                  onClick={handleCreateAgreement}
                  disabled={savingAgreement}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  <Plus size={14} />
                  {savingAgreement ? 'Creating...' : agreements.length === 0 ? 'Create Agreement' : 'Add Another Agreement'}
                </button>
              </div>

              {agreements.length === 0 ? (
                <p className="text-sm text-luxury-gray-3 text-center py-8">
                  Click the button above to create an agreement for this landlord.
                </p>
              ) : (
                <div className="space-y-6">
                  {agreements.map(ag => {
                    // Each agreement is linked from one or more properties via
                    // managed_properties.pm_agreement_id. List them under the
                    // header so admins can tell which property's terms this is.
                    const linkedProperties = properties.filter(p => p.pm_agreement_id === ag.id)
                    return (
                    <div key={ag.id} className="inner-card">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-luxury-gray-5">
                        <div>
                          <p className="text-sm font-semibold text-luxury-gray-1">
                            {formatDate(ag.commencement_date)} {ag.expiration_date ? `to ${formatDate(ag.expiration_date)}` : '(no end date)'}
                          </p>
                          {linkedProperties.length > 0 ? (
                            <p className="text-xs text-luxury-gray-2 mt-0.5">
                              {linkedProperties.map(p =>
                                `${p.property_address}${p.unit ? ` ${p.unit}` : ''}`
                              ).join(' · ')}
                            </p>
                          ) : (
                            <p className="text-xs text-luxury-gray-3 italic mt-0.5">
                              Not linked to any property yet
                            </p>
                          )}
                          <p className="text-xs text-luxury-gray-3">ID: {ag.id.slice(0, 8)}</p>
                        </div>
                        <span className={`text-xs font-medium ${
                          ag.status === 'active' ? 'text-green-600' : 'text-luxury-gray-3'
                        }`}>
                          {ag.status}
                        </span>
                      </div>
                      <AgreementEditor
                        agreement={ag}
                        agents={agents}
                        saving={savingAgreement}
                        onSave={(updates) => handleSaveAgreement(ag.id, updates)}
                        onUploaded={loadLandlordData}
                      />
                    </div>
                    )
                  })}
                </div>
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
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-luxury-gray-1">
                              {property.property_address}{property.unit && ` ${property.unit}`}
                            </p>
                            {(() => {
                              const ag = landlord.pm_agreements?.find((a: any) => a.id === property.pm_agreement_id)
                              return ag && ag.crc_collects_rent === false ? (
                                <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-medium">Self-Collect</span>
                              ) : null
                            })()}
                          </div>
                          <p className="text-xs text-luxury-gray-3">
                            {property.city}, {property.state} {property.zip}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium ${
                            property.status === 'active' ? 'text-green-600' : 'text-luxury-gray-3'
                          }`}>
                            {property.status}
                          </span>
                          <Link
                            href={`/admin/pm/properties/${property.id}`}
                            className="text-luxury-gray-3 hover:text-luxury-accent"
                            title="Edit Property"
                          >
                            <Edit2 size={14} />
                          </Link>
                          <button
                            onClick={() => handleDeleteProperty(property.id)}
                            className="text-red-500 hover:text-red-700"
                            title="Delete Property"
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
                          <Link
                            href={`/admin/pm/leases/${lease.id}`}
                            className="text-luxury-gray-3 hover:text-luxury-accent"
                            title="Edit Lease"
                          >
                            <Edit2 size={14} />
                          </Link>
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
              {/* Recurring Deductions section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
                    Recurring Deductions
                  </h3>
                  <button
                    onClick={() => setShowAddRecurringModal(true)}
                    className="btn btn-secondary text-xs flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Recurring
                  </button>
                </div>

                {loadingRecurring ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">Loading...</p>
                ) : recurringDeductions.length === 0 ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">
                    No recurring deductions. Add one to auto-apply it to every future disbursement.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {recurringDeductions.map((d: any) => (
                      <div key={d.id} className="inner-card">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                                {d.label}
                              </p>
                              <span className="text-xs text-luxury-accent shrink-0">Monthly</span>
                            </div>
                            {d.managed_properties && (
                              <p className="text-xs text-luxury-gray-2 truncate">
                                {d.managed_properties.property_address}
                                {d.managed_properties.unit ? ` ${d.managed_properties.unit}` : ''}
                              </p>
                            )}
                            <p className="text-xs text-luxury-gray-3">
                              {d.recurring_start_date ? `From ${formatDate(d.recurring_start_date)}` : 'No start date'}
                              {d.recurring_end_date ? ` · Until ${formatDate(d.recurring_end_date)}` : ' · Ongoing'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-semibold text-luxury-gray-1">
                              {formatCurrency(Number(d.amount))}
                            </span>
                            <button
                              onClick={() => deleteRecurringDeduction(d.id)}
                              className="text-luxury-gray-3 hover:text-red-600"
                              title="Delete recurring deduction"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {/* Pending Deductions sub-section. Sits below the
                  disbursements list. Pending = disbursement_id IS NULL,
                  i.e. waiting to be attached to a future disbursement. */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">
                    Pending Deductions
                  </h3>
                  <button
                    onClick={openAddDeductionModal}
                    className="btn btn-secondary text-xs flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Deduction
                  </button>
                </div>

                {loadingDeductions ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">
                    Loading deductions...
                  </p>
                ) : pendingDeductions.length === 0 ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">
                    No pending deductions. Add one to apply against a future disbursement.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {pendingDeductions.map((d: any) => (
                      <div key={d.id} className="inner-card">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold text-luxury-gray-1 truncate">
                                {d.label}
                              </p>
                              {d.source_repair_id && (
                                <span className="text-xs text-luxury-gray-3 shrink-0">
                                  (from repair)
                                </span>
                              )}
                              {d.source_invoice_id && (
                                <span className="text-xs text-luxury-gray-3 shrink-0">
                                  (from unpaid invoice)
                                </span>
                              )}
                            </div>
                            {d.managed_properties && (
                              <p className="text-xs text-luxury-gray-2 truncate">
                                {d.managed_properties.property_address}
                                {d.managed_properties.unit ? ` ${d.managed_properties.unit}` : ''}
                              </p>
                            )}
                            {d.description && (
                              <p className="text-xs text-luxury-gray-3 truncate">
                                {d.description}
                              </p>
                            )}
                            {d.incurred_date && (
                              <p className="text-xs text-luxury-gray-3">
                                Incurred {formatDate(d.incurred_date)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-sm font-semibold text-luxury-gray-1">
                              {formatCurrency(Number(d.amount))}
                            </span>
                            <button
                              onClick={() => deleteDeduction(d.id)}
                              className="text-luxury-gray-3 hover:text-red-600"
                              title="Delete deduction"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Disbursements */}
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Disbursements
                </h3>
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
                          {disb.managed_properties && (
                            <p className="text-xs text-luxury-gray-2">
                              {disb.managed_properties.property_address}
                              {disb.managed_properties.unit ? ` ${disb.managed_properties.unit}` : ''}
                            </p>
                          )}
                          <p className="text-xs text-luxury-gray-3">
                            {disb.gross_rent > 0
                              ? `Gross: ${formatCurrency(disb.gross_rent)} · Fee: ${formatCurrency(disb.management_fee)}`
                              : disb.deposit_amount > 0
                                ? `Deposit: ${formatCurrency(disb.deposit_amount)}`
                                : `Net: ${formatCurrency(disb.net_amount)}`}
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
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleProcessDisbursement(disb.id)}
                                className="btn btn-primary text-xs flex items-center gap-1"
                                disabled={landlord.bank_status !== 'connected'}
                                title={landlord.bank_status !== 'connected' ? 'Bank not connected' : 'Process via ACH'}
                              >
                                <Send size={12} /> Process
                              </button>
                              <button
                                onClick={() => {
                                  setMarkPaidModal(disb)
                                  setMarkPaidDate(new Date().toISOString().split('T')[0])
                                  setMarkPaidMethod('ach')
                                }}
                                className="btn btn-secondary text-xs flex items-center gap-1"
                                title="Mark as manually paid"
                              >
                                <CheckCircle size={12} /> Mark Paid
                              </button>
                            </div>
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

              {/* Statements sub-section */}
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Statements
                </h3>
                {loadingStatements ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">Loading statements...</p>
                ) : statements.length === 0 ? (
                  <p className="text-sm text-luxury-gray-3 text-center py-4">
                    No statements yet. Use Create Statement on the Disbursements page.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {statements.map((s: any) => {
                      const periodLabel = s.period_type === 'annual'
                        ? `${s.period_year}`
                        : `${new Date(2000, (s.period_month || 1) - 1).toLocaleString('default', { month: 'long' })} ${s.period_year}`
                      const propertyAddr = s.managed_properties
                        ? `${s.managed_properties.property_address}${s.managed_properties.unit ? ` ${s.managed_properties.unit}` : ''}`
                        : ''
                      return (
                        <div key={s.id} className="inner-card">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-luxury-gray-1">{periodLabel}</p>
                              {propertyAddr && (
                                <p className="text-xs text-luxury-gray-2 truncate">{propertyAddr}</p>
                              )}
                              <p className="text-xs text-luxury-gray-3">
                                Net disbursed: {formatCurrency(Number(s.total_net_disbursed || 0))}
                                {s.sent_at && (
                                  <> · Sent {new Date(s.sent_at).toLocaleDateString()}</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Link
                                href={`/admin/pm/statements/${s.id}`}
                                className="btn btn-secondary text-xs py-1 px-3"
                              >
                                View
                              </Link>
                              {!s.sent_at && (
                                <button
                                  onClick={() => handleSendStatement(s.id)}
                                  disabled={sendingStatementId === s.id}
                                  className="btn btn-primary text-xs py-1 px-3"
                                >
                                  {sendingStatementId === s.id ? 'Sending...' : 'Send'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

      {/* Mark Paid Modal */}
      {markPaidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Mark Disbursement as Paid</h2>
              <button onClick={() => setMarkPaidModal(null)} className="text-luxury-gray-3 hover:text-luxury-gray-1">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="inner-card">
                <p className="text-sm font-medium text-luxury-gray-1">
                  {getMonthName(markPaidModal.period_month)} {markPaidModal.period_year}
                </p>
                <p className="text-lg font-semibold text-green-700">{formatCurrency(markPaidModal.net_amount)}</p>
              </div>
              <div>
                <label className="field-label">Payment Date</label>
                <input
                  type="date"
                  className="input-luxury w-full"
                  value={markPaidDate}
                  onChange={e => setMarkPaidDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-label">Payment Method</label>
                <select
                  className="select-luxury w-full"
                  value={markPaidMethod}
                  onChange={e => setMarkPaidMethod(e.target.value)}
                >
                  <option value="ach">ACH</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="zelle">Zelle</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setMarkPaidModal(null)} className="flex-1 btn btn-secondary">
                  Cancel
                </button>
                <button 
                  onClick={handleMarkPaid} 
                  disabled={markingPaid || !markPaidDate}
                  className="flex-1 btn btn-primary flex items-center justify-center gap-2"
                >
                  {markingPaid ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {markingPaid ? 'Saving...' : 'Mark as Paid'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Pending Deduction Modal */}
      {showAddDeductionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Pending Deduction</h2>
              <button
                onClick={() => setShowAddDeductionModal(false)}
                className="text-luxury-gray-3 hover:text-luxury-gray-1"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Property</label>
                <select
                  value={deductionForm.property_id}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, property_id: e.target.value }))}
                  className="select-luxury w-full"
                >
                  <option value="">Select property...</option>
                  {properties.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.property_address}{p.unit ? ` ${p.unit}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label">Label</label>
                <input
                  type="text"
                  value={deductionForm.label}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, label: e.target.value }))}
                  className="input-luxury w-full"
                  placeholder="e.g., HOA fee, lawn care, commission"
                />
              </div>

              <div>
                <label className="field-label">Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={deductionForm.amount}
                    onChange={(e) => setDeductionForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="input-luxury w-full pl-7"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">Incurred Date (optional)</label>
                <input
                  type="date"
                  value={deductionForm.incurred_date}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, incurred_date: e.target.value }))}
                  className="input-luxury w-full"
                />
              </div>

              <div>
                <label className="field-label">Description (optional)</label>
                <textarea
                  value={deductionForm.description}
                  onChange={(e) => setDeductionForm(prev => ({ ...prev, description: e.target.value }))}
                  className="input-luxury w-full"
                  rows={2}
                  placeholder="Additional context"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowAddDeductionModal(false)}
                  className="btn btn-secondary"
                  disabled={savingDeduction}
                >
                  Cancel
                </button>
                <button
                  onClick={saveDeduction}
                  className="btn btn-primary"
                  disabled={savingDeduction}
                >
                  {savingDeduction ? 'Saving...' : 'Add Deduction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddRecurringModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="container-card max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-luxury-gray-1">Add Recurring Deduction</h2>
              <button onClick={() => setShowAddRecurringModal(false)}>
                <X size={16} className="text-luxury-gray-3" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="field-label">Property</label>
                <select
                  className="input-luxury w-full"
                  value={recurringForm.property_id}
                  onChange={e => setRecurringForm(prev => ({ ...prev, property_id: e.target.value }))}
                >
                  <option value="">Select property</option>
                  {properties.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.property_address}{p.unit ? ` ${p.unit}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Label</label>
                <input
                  type="text"
                  className="input-luxury w-full"
                  placeholder="e.g. Lawn Care"
                  value={recurringForm.label}
                  onChange={e => setRecurringForm(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>
              <div>
                <label className="field-label">Monthly Amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-luxury-gray-3">$</span>
                  <input
                    type="number"
                    step="0.01"
                    className="input-luxury w-full pl-7"
                    placeholder="0.00"
                    value={recurringForm.amount}
                    onChange={e => setRecurringForm(prev => ({ ...prev, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Start Date</label>
                  <input
                    type="date"
                    className="input-luxury w-full"
                    value={recurringForm.recurring_start_date}
                    onChange={e => setRecurringForm(prev => ({ ...prev, recurring_start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="field-label">End Date <span className="font-normal text-luxury-gray-3">(optional)</span></label>
                  <input
                    type="date"
                    className="input-luxury w-full"
                    value={recurringForm.recurring_end_date}
                    onChange={e => setRecurringForm(prev => ({ ...prev, recurring_end_date: e.target.value }))}
                  />
                </div>
              </div>
              <p className="text-xs text-luxury-gray-3">
                This deduction will be automatically applied to every rent disbursement within the date range.
              </p>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowAddRecurringModal(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={addRecurringDeduction}
                className="btn btn-primary"
              >
                Add Recurring Deduction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
