'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'

interface CloseTransactionModalProps {
  transactionId: string
  transaction: any
  agents: any[]
  check: any | null
  userId: string
  onClose: () => void
  onSaved: () => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AGENT_ROLES = [
  { value: 'primary_agent',       label: 'Primary Agent' },
  { value: 'co_agent',            label: 'Co-Agent' },
  { value: 'listing_agent',       label: 'Listing Agent' },
  { value: 'team_lead',           label: 'Team Lead' },
  { value: 'referral_agent',      label: 'Referral Agent' },
  { value: 'momentum_partner',    label: 'Momentum Partner' },
]

const COMMISSION_PLANS = [
  { value: 'new_agent', label: 'New Agent 70/30' },
  { value: 'cap',       label: 'Cap Plan 70/30' },
  { value: 'no_cap',    label: 'No Cap 85/15' },
  { value: 'leases',    label: 'Lease Plan' },
  { value: 'custom',    label: 'Custom' },
]

const BROKERAGE_ROLES = [
  { value: 'buyers_agent',       label: "Buyer's Agent" },
  { value: 'sellers_agent',      label: "Seller's Agent" },
  { value: 'listing_agent',      label: 'Listing Agent' },
  { value: 'cooperating_agent',  label: 'Cooperating Agent' },
  { value: 'referral',           label: 'Referral' },
  { value: 'other',              label: 'Other' },
]

const FEDERAL_ID_TYPES = [
  { value: 'ein', label: 'EIN' },
  { value: 'ssn', label: 'SSN' },
]

// Map user commission_plan → transaction commission_plan
function defaultCommissionPlan(userPlan: string): string {
  if (!userPlan) return ''
  const p = userPlan.toLowerCase()
  if (p === 'new_agent' || p.includes('new')) return 'new_agent'
  if (p.includes('lease')) return 'leases'
  if (p === 'no_cap' || p.includes('85') || p.includes('no cap')) return 'no_cap'
  if (p === 'cap') return 'cap'
  return ''
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const num = (v: any) => parseFloat(v ?? 0) || 0
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function computeAgentNet(form: any): number {
  return (
    num(form.agent_gross) +
    num(form.btsa_amount) -
    num(form.processing_fee) -
    num(form.coaching_fee) -
    num(form.other_fees) -
    num(form.debts_deducted) -
    num(form.team_lead_commission)
  )
}

function compute1099(form: any): number {
  // 1099 does not deduct debts - debt repayment is not a reduction in taxable income
  return (
    num(form.agent_gross) +
    num(form.btsa_amount) -
    num(form.processing_fee) -
    num(form.coaching_fee) -
    num(form.other_fees) -
    num(form.team_lead_commission)
  )
}

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function SectionHeader({ title, expanded, onToggle }: { title: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="w-full flex items-center justify-between py-2 border-b border-luxury-gray-5 mb-3">
      <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">{title}</p>
      {expanded ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

// ── Empty form factories ──────────────────────────────────────────────────────

function emptyAgentForm(agentUser?: any) {
  return {
    _id: uid(),
    agent_id: '',
    agent_role: 'co_agent',
    commission_plan: agentUser ? defaultCommissionPlan(agentUser.commission_plan || '') : '',
    agent_gross: '',
    brokerage_split: '',
    processing_fee: '',
    coaching_fee: '',
    other_fees: '',
    other_fees_description: '',
    btsa_amount: '',
    debts_deducted: '',
    team_lead_commission: '',
    agent_net: '',
    amount_1099_reportable: '',
  }
}

function emptyBrokerageForm() {
  return {
    _id: uid(),
    brokerage_name: '',
    brokerage_role: '',
    agent_name: '',
    agent_email: '',
    agent_phone: '',
    broker_name: '',
    brokerage_ein: '',
    federal_id_type: '',
    federal_id_number: '',
    commission_amount: '',
    amount_1099_reportable: '',
    w9_on_file: false,
    payment_status: 'pending',
    payment_date: '',
    payment_method: '',
    payment_reference: '',
  }
}

// ── Agent Financial Fields (reused for existing and new rows) ─────────────────

function AgentFinancialFields({
  form,
  setField,
  hasBtsa,
}: {
  form: any
  setField: (field: string, value: any) => void
  hasBtsa: boolean
}) {
  const computedNet = computeAgentNet(form)
  const computed1099 = compute1099(form)
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Agent Gross">
          <input type="number" className="input-luxury text-xs" value={form.agent_gross} onChange={e => setField('agent_gross', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Brokerage Split">
          <input type="number" className="input-luxury text-xs" value={form.brokerage_split} onChange={e => setField('brokerage_split', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Processing Fee">
          <input type="number" className="input-luxury text-xs" value={form.processing_fee} onChange={e => setField('processing_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Coaching Fee">
          <input type="number" className="input-luxury text-xs" value={form.coaching_fee} onChange={e => setField('coaching_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Other Fees">
          <input type="number" className="input-luxury text-xs" value={form.other_fees} onChange={e => setField('other_fees', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Other Fees Description">
          <input className="input-luxury text-xs" value={form.other_fees_description} onChange={e => setField('other_fees_description', e.target.value)} placeholder="e.g. E&O fee" />
        </Field>
        {hasBtsa && (
          <Field label="BTSA Amount">
            <input type="number" className="input-luxury text-xs" value={form.btsa_amount} onChange={e => setField('btsa_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
          </Field>
        )}
        <Field label="Debts Deducted">
          <input type="number" className="input-luxury text-xs" value={form.debts_deducted} onChange={e => setField('debts_deducted', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
        <Field label="Team Lead Commission">
          <input type="number" className="input-luxury text-xs" value={form.team_lead_commission} onChange={e => setField('team_lead_commission', e.target.value)} placeholder="0.00" step="0.01" min="0" />
        </Field>
      </div>
      <div className="pt-3 border-t border-luxury-gray-5/50 space-y-3">
        <div className="flex items-center justify-between bg-luxury-gray-5/30 rounded px-3 py-2">
          <span className="text-xs text-luxury-gray-3">Computed Agent Net</span>
          <span className="text-sm font-semibold text-luxury-accent">{fmt$(computedNet)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Agent Net (override)">
            <input type="number" className="input-luxury text-xs" value={form.agent_net} onChange={e => setField('agent_net', e.target.value)} placeholder={computedNet.toFixed(2)} step="0.01" />
          </Field>
          <Field label="Amount 1099 Reportable">
            <input type="number" className="input-luxury text-xs" value={form.amount_1099_reportable} onChange={e => setField('amount_1099_reportable', e.target.value)} placeholder={form.amount_1099_reportable !== '' ? form.amount_1099_reportable : computed1099.toFixed(2)} step="0.01" />
          </Field>
        </div>
      </div>
    </>
  )
}

// ── External Brokerage Financial + ID Fields ──────────────────────────────────

function BrokerageFields({ form, setField }: { form: any; setField: (field: string, value: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Brokerage EIN">
        <input className="input-luxury text-xs" value={form.brokerage_ein} onChange={e => setField('brokerage_ein', e.target.value)} placeholder="XX-XXXXXXX" />
      </Field>
      <Field label="Federal ID Type">
        <select className="select-luxury text-xs" value={form.federal_id_type} onChange={e => setField('federal_id_type', e.target.value)}>
          <option value="">Select...</option>
          {FEDERAL_ID_TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <div className="col-span-2">
        <Field label="Federal ID Number">
          <input className="input-luxury text-xs" value={form.federal_id_number} onChange={e => setField('federal_id_number', e.target.value)} placeholder="XXX-XX-XXXX or XX-XXXXXXX" />
        </Field>
      </div>
      <Field label="Commission Amount">
        <input type="number" className="input-luxury text-xs" value={form.commission_amount} onChange={e => setField('commission_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
      </Field>
      <Field label="Amount 1099 Reportable">
        <input type="number" className="input-luxury text-xs" value={form.amount_1099_reportable} onChange={e => setField('amount_1099_reportable', e.target.value)} placeholder={form.commission_amount || '0.00'} step="0.01" min="0" />
      </Field>
      <Field label="Payment Status">
        <select className="select-luxury text-xs" value={form.payment_status} onChange={e => setField('payment_status', e.target.value)}>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="not_applicable">N/A</option>
        </select>
      </Field>
      <Field label="W-9 on File">
        <div className="flex items-center h-[38px] gap-2">
          <button type="button" onClick={() => setField('w9_on_file', !form.w9_on_file)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${form.w9_on_file ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.w9_on_file ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-xs text-luxury-gray-2">{form.w9_on_file ? 'Yes' : 'No'}</span>
        </div>
      </Field>
      {form.payment_status === 'paid' && (
        <>
          <Field label="Payment Date">
            <input type="date" className="input-luxury text-xs" value={form.payment_date} onChange={e => setField('payment_date', e.target.value)} />
          </Field>
          <Field label="Payment Method">
            <select className="select-luxury text-xs" value={form.payment_method} onChange={e => setField('payment_method', e.target.value)}>
              <option value="">Select...</option>
              <option value="check">Check</option>
              <option value="wire">Wire</option>
              <option value="ACH">ACH</option>
              <option value="Zelle">Zelle</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="Payment Reference">
              <input className="input-luxury text-xs" value={form.payment_reference} onChange={e => setField('payment_reference', e.target.value)} placeholder="Check #, wire ref, etc." />
            </Field>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CloseTransactionModal({
  transactionId,
  transaction: txn,
  agents,
  check,
  userId,
  onClose,
  onSaved,
}: CloseTransactionModalProps) {
  const isLease = ['lease', 'tenant', 'landlord', 'apartment', 'rent'].some(k =>
    txn.transaction_type?.toLowerCase().includes(k)
  )

  const [allAgents, setAllAgents] = useState<any[]>([])
  const [externalBrokerages, setExternalBrokerages] = useState<any[]>([])
  const [loadingExternal, setLoadingExternal] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sections, setSections] = useState({ close: true, commission: true, title: true, check: true, adjustments: true, agents: true, external: true })
  const toggle = (k: keyof typeof sections) => setSections(p => ({ ...p, [k]: !p[k] }))

  // ── Transaction form ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    transaction_type: txn.transaction_type || '',
    office_location: txn.office_location || '',
    closed_date: txn.closed_date?.substring(0, 10) || new Date().toISOString().split('T')[0],
    funding_status: txn.funding_status || '',
    check_clear_date: txn.check_clear_date?.substring(0, 10) || '',
    goal_paydate: txn.goal_paydate?.substring(0, 10) || '',
    sales_price: txn.sales_price != null ? String(txn.sales_price) : '',
    monthly_rent: txn.monthly_rent != null ? String(txn.monthly_rent) : '',
    sales_volume: txn.sales_volume != null ? String(txn.sales_volume) : '',
    gross_commission: txn.gross_commission != null ? String(txn.gross_commission) : '',
    gross_commission_type: txn.gross_commission_type || 'amount',
    office_gross: txn.office_gross != null ? String(txn.office_gross) : '',
    office_net: txn.office_net != null ? String(txn.office_net) : '',
    title_company: txn.title_company || '',
    title_officer_name: txn.title_officer_name || '',
    title_company_email: txn.title_company_email || '',
    check_amount: '',
    check_from: txn.title_company || '',
    check_number: '',
    received_date: new Date().toISOString().split('T')[0],
    transaction_coordinator_fee: txn.transaction_coordinator_fee != null ? String(txn.transaction_coordinator_fee) : '',
    ecommission_amount: txn.ecommission_amount != null ? String(txn.ecommission_amount) : '',
    brokerage_referral_fee: txn.brokerage_referral_fee != null ? String(txn.brokerage_referral_fee) : '',
    revenue_share_amount: txn.revenue_share_amount != null ? String(txn.revenue_share_amount) : '',
  })

  // ── Existing agent forms ──────────────────────────────────────────────────
  const [agentForms, setAgentForms] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    for (const a of agents) {
      init[a.id] = {
        agent_id: a.agent_id || '',
        agent_role: a.agent_role || '',
        commission_plan: a.commission_plan || defaultCommissionPlan(a.user?.commission_plan || ''),
        agent_gross: a.agent_gross != null ? String(a.agent_gross) : '',
        brokerage_split: a.brokerage_split != null ? String(a.brokerage_split) : '',
        processing_fee: a.processing_fee != null ? String(a.processing_fee) : '',
        coaching_fee: a.coaching_fee != null ? String(a.coaching_fee) : '',
        other_fees: a.other_fees != null ? String(a.other_fees) : '',
        other_fees_description: a.other_fees_description || '',
        btsa_amount: a.btsa_amount != null ? String(a.btsa_amount) : '',
        debts_deducted: a.debts_deducted != null ? String(a.debts_deducted) : '',
        team_lead_commission: a.team_lead_commission != null ? String(a.team_lead_commission) : '',
        agent_net: a.agent_net != null ? String(a.agent_net) : '',
        amount_1099_reportable: a.amount_1099_reportable != null ? String(a.amount_1099_reportable) : '',
      }
    }
    return init
  })

  // ── New agent rows ────────────────────────────────────────────────────────
  const [newAgentRows, setNewAgentRows] = useState<any[]>([])
  const [agentSearch, setAgentSearch] = useState<Record<string, string>>({})
  const [agentDropdownOpen, setAgentDropdownOpen] = useState<Record<string, boolean>>({})

  // ── Existing external brokerage forms ─────────────────────────────────────
  const [externalForms, setExternalForms] = useState<Record<string, any>>({})

  // ── New external brokerage rows ───────────────────────────────────────────
  const [newBrokerageRows, setNewBrokerageRows] = useState<any[]>([])

  // ── Load data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [extRes, agentsRes] = await Promise.all([
          fetch(`/api/admin/transactions/${transactionId}?section=external_brokerages`),
          fetch('/api/users/list'),
        ])
        if (extRes.ok) {
          const data = await extRes.json()
          const brokerages = data.external_brokerages || []
          setExternalBrokerages(brokerages)
          const init: Record<string, any> = {}
          for (const b of brokerages) {
            init[b.id] = {
              brokerage_name: b.brokerage_name || '',
              brokerage_role: b.brokerage_role || '',
              agent_name: b.agent_name || '',
              agent_email: b.agent_email || '',
              agent_phone: b.agent_phone || '',
              broker_name: b.broker_name || '',
              brokerage_ein: b.brokerage_ein || '',
              federal_id_type: b.federal_id_type || '',
              federal_id_number: b.federal_id_number || '',
              commission_amount: b.commission_amount != null ? String(b.commission_amount) : '',
              amount_1099_reportable: b.amount_1099_reportable != null ? String(b.amount_1099_reportable) : '',
              w9_on_file: b.w9_on_file || false,
              payment_status: b.payment_status || 'pending',
              payment_date: b.payment_date?.substring(0, 10) || '',
              payment_method: b.payment_method || '',
              payment_reference: b.payment_reference || '',
            }
          }
          setExternalForms(init)
        }
        if (agentsRes.ok) {
          const data = await agentsRes.json()
          const active = (data.users || [])
            .filter((u: any) => u.is_active && u.status === 'active' && u.role?.toLowerCase() === 'agent')
            .sort((a: any, b: any) => {
              const nameA = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
              const nameB = `${b.preferred_first_name || b.first_name} ${b.preferred_last_name || b.last_name}`.toLowerCase()
              return nameA.localeCompare(nameB)
            })
          setAllAgents(active)
        }
      } finally {
        setLoadingExternal(false)
      }
    }
    load()
  }, [transactionId])

  // Smart calc state
  const [agentCalcData, setAgentCalcData] = useState<Record<string, any>>({})
  const [agentLeadSources, setAgentLeadSources] = useState<Record<string, string>>({})
  const [autoCalcApplied, setAutoCalcApplied] = useState<Set<string>>(new Set())

  // On-close options
  const [closeOptions, setCloseOptions] = useState({
    generateStatements: true,
    generateCda: false,
    sendEmails: false,
  })

  // Auto-calculate and auto-fill agent splits when office_gross changes
  useEffect(() => {
    const officeGross = parseFloat(form.office_gross || '0')
    if (officeGross <= 0) return

    // Calculate for each existing agent that doesn't have values yet
    agents.forEach(async (a: any) => {
      // Skip if already auto-filled or has values
      if (autoCalcApplied.has(a.id)) return
      const af = agentForms[a.id]
      if (af && parseFloat(af.agent_gross || '0') > 0) return

      try {
        const res = await fetch('/api/admin/transactions/smart-calc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: a.agent_id,
            office_gross: officeGross,
            transaction_type: form.transaction_type,
            lead_source: agentLeadSources[a.agent_id] || 'own',
            is_lease: isLease,
          }),
        })
        if (res.ok) {
          const result = await res.json()
          setAgentCalcData(prev => ({ ...prev, [a.agent_id]: result }))
          
          // Auto-fill the form
          setAgentForms(prev => ({
            ...prev,
            [a.id]: {
              ...prev[a.id],
              agent_gross: String(result.agent_gross?.toFixed(2) || ''),
              brokerage_split: String(result.brokerage_split?.toFixed(2) || ''),
              processing_fee: String(result.processing_fee?.toFixed(2) || ''),
              coaching_fee: String(result.coaching_fee?.toFixed(2) || ''),
              team_lead_commission: String(result.team_lead_payout?.toFixed(2) || ''),
              agent_net: String(result.agent_net?.toFixed(2) || ''),
            }
          }))
          setAutoCalcApplied(prev => new Set([...prev, a.id]))
        }
      } catch {}
    })
  }, [form.office_gross, form.transaction_type, agents, agentForms, agentLeadSources, isLease, autoCalcApplied])

  // Recalculate when lead source changes
  const recalculateForAgent = async (agentId: string, internalAgentId: string, leadSource: string) => {
    const officeGross = parseFloat(form.office_gross || '0')
    if (officeGross <= 0) return

    try {
      const res = await fetch('/api/admin/transactions/smart-calc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          office_gross: officeGross,
          transaction_type: form.transaction_type,
          lead_source: leadSource,
          is_lease: isLease,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        setAgentCalcData(prev => ({ ...prev, [agentId]: result }))
        
        // Update the form
        setAgentForms(prev => ({
          ...prev,
          [internalAgentId]: {
            ...prev[internalAgentId],
            agent_gross: String(result.agent_gross?.toFixed(2) || ''),
            brokerage_split: String(result.brokerage_split?.toFixed(2) || ''),
            processing_fee: String(result.processing_fee?.toFixed(2) || ''),
            coaching_fee: String(result.coaching_fee?.toFixed(2) || ''),
            team_lead_commission: String(result.team_lead_payout?.toFixed(2) || ''),
            agent_net: String(result.agent_net?.toFixed(2) || ''),
          }
        }))
      }
    } catch {}
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const setF = (field: string, value: any) => setForm(p => ({ ...p, [field]: value }))
  const setAgentF = (id: string, field: string, value: any) => setAgentForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
  const setExtF = (id: string, field: string, value: any) => setExternalForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))

  const setNewAgentF = (rowId: string, field: string, value: any) =>
    setNewAgentRows(p => p.map(r => r._id === rowId ? { ...r, [field]: value } : r))

  const setNewBrokerageF = (rowId: string, field: string, value: any) =>
    setNewBrokerageRows(p => p.map(r => r._id === rowId ? { ...r, [field]: value } : r))

  const parseNum = (v: string) => (v.trim() === '' ? null : parseFloat(v))

  const callAction = async (action: string, extra: object) => {
    const res = await fetch(`/api/admin/transactions/${transactionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || `${action} failed`)
    }
  }

  // When selecting an agent for a new row, auto-fill commission plan
  const handleNewAgentSelect = (rowId: string, agentId: string) => {
    const selectedUser = allAgents.find(u => u.id === agentId)
    const name = selectedUser
      ? `${selectedUser.preferred_first_name || selectedUser.first_name} ${selectedUser.preferred_last_name || selectedUser.last_name}`
      : ''
    setNewAgentRows(p => p.map(r =>
      r._id === rowId
        ? { ...r, agent_id: agentId, commission_plan: defaultCommissionPlan(selectedUser?.commission_plan || '') }
        : r
    ))
    setAgentSearch(p => ({ ...p, [rowId]: name }))
    setAgentDropdownOpen(p => ({ ...p, [rowId]: false }))
  }

  const filteredAgentsForRow = (rowId: string) => {
    const q = (agentSearch[rowId] || '').toLowerCase()
    if (!q) return allAgents
    return allAgents.filter(u => {
      const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
      return name.includes(q)
    })
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.closed_date) { setError('Closed date is required.'); return }
    setSaving(true)
    setError(null)
    try {
      // 1 - Update transaction
      const txnUpdates: Record<string, any> = {
        status: 'closed',
        transaction_type: form.transaction_type || null,
        office_location: form.office_location || null,
        closed_date: form.closed_date,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        funding_status: form.funding_status || null,
        check_clear_date: form.check_clear_date || null,
        goal_paydate: form.goal_paydate || null,
        sales_price: parseNum(form.sales_price),
        monthly_rent: parseNum(form.monthly_rent),
        sales_volume: parseNum(form.sales_volume),
        gross_commission: parseNum(form.gross_commission),
        gross_commission_type: 'amount',
        office_gross: parseNum(form.office_gross),
        office_net: parseNum(form.office_net),
        title_company: form.title_company || null,
        title_officer_name: form.title_officer_name || null,
        title_company_email: form.title_company_email || null,
      }
      if (txn.has_transaction_coordinator) txnUpdates.transaction_coordinator_fee = parseNum(form.transaction_coordinator_fee)
      if (txn.has_ecommission) txnUpdates.ecommission_amount = parseNum(form.ecommission_amount)
      if (txn.brokerage_referral) txnUpdates.brokerage_referral_fee = parseNum(form.brokerage_referral_fee)
      if (txn.revenue_share_recipient_id) txnUpdates.revenue_share_amount = parseNum(form.revenue_share_amount)
      await callAction('update_transaction', { updates: txnUpdates })

      // 2 - Update existing internal agents
      for (const a of agents) {
        const af = agentForms[a.id]
        if (!af) continue
        const computedNet = computeAgentNet(af)
        const agentNet = af.agent_net !== '' ? parseFloat(af.agent_net) : computedNet
        const amount1099 = af.amount_1099_reportable !== '' ? parseFloat(af.amount_1099_reportable) : compute1099(af)
        await callAction('update_internal_agent', {
          internal_agent_id: a.id,
          updates: {
            agent_role: af.agent_role || a.agent_role || 'co_agent',
            commission_plan: af.commission_plan || null,
            agent_gross: parseNum(af.agent_gross),
            brokerage_split: parseNum(af.brokerage_split),
            processing_fee: parseNum(af.processing_fee),
            coaching_fee: parseNum(af.coaching_fee),
            other_fees: parseNum(af.other_fees),
            other_fees_description: af.other_fees_description || null,
            btsa_amount: parseNum(af.btsa_amount),
            debts_deducted: parseNum(af.debts_deducted),
            team_lead_commission: parseNum(af.team_lead_commission),
            agent_net: agentNet,
            amount_1099_reportable: amount1099,
          },
        })
      }

      // 3 - Add new internal agent rows
      for (const row of newAgentRows) {
        if (!row.agent_id) continue
        const computedNet = computeAgentNet(row)
        const agentNet = row.agent_net !== '' ? parseFloat(row.agent_net) : computedNet
        const amount1099 = row.amount_1099_reportable !== '' ? parseFloat(row.amount_1099_reportable) : compute1099(row)
        await callAction('add_internal_agent', {
          agent: {
            agent_id: row.agent_id,
            agent_role: row.agent_role || 'co_agent',
            commission_plan: row.commission_plan || null,
            agent_gross: parseNum(row.agent_gross),
            brokerage_split: parseNum(row.brokerage_split),
            processing_fee: parseNum(row.processing_fee),
            coaching_fee: parseNum(row.coaching_fee),
            other_fees: parseNum(row.other_fees),
            other_fees_description: row.other_fees_description || null,
            btsa_amount: parseNum(row.btsa_amount),
            debts_deducted: parseNum(row.debts_deducted),
            team_lead_commission: parseNum(row.team_lead_commission),
            agent_net: agentNet,
            amount_1099_reportable: amount1099,
            payment_status: 'pending',
          },
        })
      }

      // 4 - Update existing external brokerages
      for (const b of externalBrokerages) {
        const bf = externalForms[b.id]
        if (!bf) continue
        await callAction('update_external_brokerage', {
          brokerage_id: b.id,
          updates: {
            brokerage_name: bf.brokerage_name || b.brokerage_name,
            brokerage_role: bf.brokerage_role || b.brokerage_role || 'other',
            agent_name: bf.agent_name || null,
            agent_email: bf.agent_email || null,
            agent_phone: bf.agent_phone || null,
            broker_name: bf.broker_name || null,
            brokerage_ein: bf.brokerage_ein || null,
            federal_id_type: bf.federal_id_type || null,
            federal_id_number: bf.federal_id_number || null,
            commission_amount: parseNum(bf.commission_amount),
            amount_1099_reportable: parseNum(bf.amount_1099_reportable),
            w9_on_file: bf.w9_on_file,
            payment_status: bf.payment_status || 'pending',
            payment_date: bf.payment_date || null,
            payment_method: bf.payment_method || null,
            payment_reference: bf.payment_reference || null,
          },
        })
      }

      // 5 - Add new external brokerage rows
      for (const row of newBrokerageRows) {
        if (!row.brokerage_name) continue
        await callAction('add_external_brokerage', {
          brokerage: {
            brokerage_name: row.brokerage_name,
            brokerage_role: row.brokerage_role || 'other', // NOT NULL in schema
            agent_name: row.agent_name || null,
            agent_email: row.agent_email || null,
            agent_phone: row.agent_phone || null,
            broker_name: row.broker_name || null,
            brokerage_ein: row.brokerage_ein || null,
            federal_id_type: row.federal_id_type || null,
            federal_id_number: row.federal_id_number || null,
            commission_amount: parseNum(row.commission_amount),
            amount_1099_reportable: parseNum(row.amount_1099_reportable),
            w9_on_file: row.w9_on_file,
            payment_status: row.payment_status || 'pending',
            payment_date: row.payment_date || null,
            payment_method: row.payment_method || null,
            payment_reference: row.payment_reference || null,
          },
        })
      }

      // 6 - Create check if needed
      if (!check && form.check_amount && form.received_date) {
        await callAction('create_check', {
          check: {
            agent_id: txn.submitted_by || null,
            property_address: txn.property_address || null,
            check_amount: parseFloat(form.check_amount),
            check_from: form.check_from || null,
            check_number: form.check_number || null,
            received_date: form.received_date,
          },
        })
      }

      onSaved()
    } catch (e: any) {
      setError(e.message || 'Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const showAdjustments = txn.has_transaction_coordinator || txn.has_ecommission || txn.brokerage_referral || txn.revenue_share_recipient_id
  const agentName = (a: any) => {
    const u = a.user || allAgents.find(u => u.id === a.agent_id)
    if (!u) return `Agent (${a.agent_id?.substring(0, 8) || '?'})`
    return `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim()
  }
  const agentRoleLabel = (role: string) => AGENT_ROLES.find(r => r.value === role)?.label || role?.replace(/_/g, ' ') || '--'
  const planLabel = (plan: string) => COMMISSION_PLANS.find(p => p.value === plan)?.label || plan || '--'

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5">
          <div>
            <h2 className="text-sm font-semibold text-luxury-gray-1">Close Transaction</h2>
            <p className="text-xs text-luxury-gray-3 mt-0.5">{txn.property_address}</p>
          </div>
          <button type="button" onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-6">

          {/* ── Close Details ─────────────────────────────────────────── */}
          <div>
            <SectionHeader title="Close Details" expanded={sections.close} onToggle={() => toggle('close')} />
            {sections.close && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select className="select-luxury text-xs" value={form.transaction_type} onChange={e => setF('transaction_type', e.target.value)}>
                    <option value="">Select...</option>
                    <option value="buyer_v2">Buyer</option>
                    <option value="seller_v2">Seller</option>
                    <option value="tenant_apt_v2">Tenant (apartment)</option>
                    <option value="tenant_other_v2">Tenant (not apartment)</option>
                    <option value="tenant_simplyhome_v2">Tenant (SimplyHome)</option>
                    <option value="tenant_commercial_v2">Tenant (commercial)</option>
                    <option value="landlord_v2">Landlord</option>
                    <option value="new_construction_buyer_v2">New Construction Buyer</option>
                    <option value="referred_out_v2">Referred Out</option>
                  </select>
                </Field>
                <Field label="Office">
                  <select className="select-luxury text-xs" value={form.office_location} onChange={e => setF('office_location', e.target.value)}>
                    <option value="">Select...</option>
                    <option value="Houston">Houston</option>
                    <option value="Dallas">Dallas</option>
                  </select>
                </Field>
                <Field label="Closed Date *">
                  <input type="date" className="input-luxury text-xs" value={form.closed_date} onChange={e => setF('closed_date', e.target.value)} />
                </Field>
                <Field label="Funding Status">
                  <select className="select-luxury text-xs" value={form.funding_status} onChange={e => setF('funding_status', e.target.value)}>
                    <option value="">Select...</option>
                    <option value="check">Check</option>
                    <option value="wire">Wire</option>
                    <option value="ecommission">eCommission</option>
                    <option value="pending">Pending</option>
                  </select>
                </Field>
                <Field label="Check Clear Date">
                  <input type="date" className="input-luxury text-xs" value={form.check_clear_date} onChange={e => setF('check_clear_date', e.target.value)} />
                </Field>
                <Field label="Goal Pay Date">
                  <input type="date" className="input-luxury text-xs" value={form.goal_paydate} onChange={e => setF('goal_paydate', e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          {/* ── Final Commission ──────────────────────────────────────── */}
          <div>
            <SectionHeader title="Final Commission" expanded={sections.commission} onToggle={() => toggle('commission')} />
            {sections.commission && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sales Price">
                  <input type="number" className="input-luxury text-xs" value={form.sales_price} onChange={e => setF('sales_price', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
                {isLease && (
                  <Field label="Monthly Rent">
                    <input type="number" className="input-luxury text-xs" value={form.monthly_rent} onChange={e => setF('monthly_rent', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                  </Field>
                )}
                <Field label="Sales Volume">
                  <input type="number" className="input-luxury text-xs" value={form.sales_volume} onChange={e => setF('sales_volume', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
                <Field label="Gross Commission">
                  <input type="number" className="input-luxury text-xs" value={form.gross_commission} onChange={e => setF('gross_commission', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
                <Field label="Office Gross">
                  <input type="number" className="input-luxury text-xs" value={form.office_gross} onChange={e => setF('office_gross', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
                <Field label="Office Net">
                  <input type="number" className="input-luxury text-xs" value={form.office_net} onChange={e => setF('office_net', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
              </div>
            )}
          </div>

          {/* ── Title / Settlement ────────────────────────────────────── */}
          <div>
            <SectionHeader title="Title / Settlement" expanded={sections.title} onToggle={() => toggle('title')} />
            {sections.title && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Title Company">
                  <input className="input-luxury text-xs" value={form.title_company} onChange={e => setF('title_company', e.target.value)} />
                </Field>
                <Field label="Title Officer">
                  <input className="input-luxury text-xs" value={form.title_officer_name} onChange={e => setF('title_officer_name', e.target.value)} />
                </Field>
                <div className="col-span-2">
                  <Field label="Title Email">
                    <input type="email" className="input-luxury text-xs" value={form.title_company_email} onChange={e => setF('title_company_email', e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
          </div>

          {/* ── Check Receipt ─────────────────────────────────────────── */}
          {!check && (
            <div>
              <SectionHeader title="Check Receipt" expanded={sections.check} onToggle={() => toggle('check')} />
              {sections.check && (
                <>
                  <p className="text-xs text-luxury-gray-3 mb-3">No check on record yet. Fill in to create one at close.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Check Amount">
                      <input type="number" className="input-luxury text-xs" value={form.check_amount} onChange={e => setF('check_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                    <Field label="Check From">
                      <input className="input-luxury text-xs" value={form.check_from} onChange={e => setF('check_from', e.target.value)} placeholder="Title company name" />
                    </Field>
                    <Field label="Check Number">
                      <input className="input-luxury text-xs" value={form.check_number} onChange={e => setF('check_number', e.target.value)} />
                    </Field>
                    <Field label="Received Date">
                      <input type="date" className="input-luxury text-xs" value={form.received_date} onChange={e => setF('received_date', e.target.value)} />
                    </Field>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Adjustments ───────────────────────────────────────────── */}
          {showAdjustments && (
            <div>
              <SectionHeader title="Adjustments" expanded={sections.adjustments} onToggle={() => toggle('adjustments')} />
              {sections.adjustments && (
                <div className="grid grid-cols-2 gap-3">
                  {txn.has_transaction_coordinator && (
                    <Field label="TC Fee">
                      <input type="number" className="input-luxury text-xs" value={form.transaction_coordinator_fee} onChange={e => setF('transaction_coordinator_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  )}
                  {txn.has_ecommission && (
                    <Field label="eCommission Amount">
                      <input type="number" className="input-luxury text-xs" value={form.ecommission_amount} onChange={e => setF('ecommission_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  )}
                  {txn.brokerage_referral && (
                    <Field label="Brokerage Referral Fee">
                      <input type="number" className="input-luxury text-xs" value={form.brokerage_referral_fee} onChange={e => setF('brokerage_referral_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  )}
                  {txn.revenue_share_recipient_id && (
                    <Field label="Revenue Share Amount">
                      <input type="number" className="input-luxury text-xs" value={form.revenue_share_amount} onChange={e => setF('revenue_share_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Internal Agents ───────────────────────────────────────── */}
          <div>
            <SectionHeader
              title={`Internal Agents (${agents.length + newAgentRows.length})`}
              expanded={sections.agents}
              onToggle={() => toggle('agents')}
            />
            {sections.agents && (
              <div className="space-y-4">

                {/* Existing agents */}
                {agents.map(a => {
                  const af = agentForms[a.id] || {}
                  return (
                    <div key={a.id} className="inner-card space-y-3">
                      {/* Agent search - change which agent this row is assigned to */}
                      <div className="relative">
                        <label className="field-label">Agent</label>
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={agentSearch[a.id] !== undefined ? agentSearch[a.id] : agentName(a)}
                          onChange={e => {
                            setAgentSearch(p => ({ ...p, [a.id]: e.target.value }))
                            setAgentDropdownOpen(p => ({ ...p, [a.id]: true }))
                          }}
                          onFocus={() => {
                            setAgentSearch(p => ({ ...p, [a.id]: '' }))
                            setAgentDropdownOpen(p => ({ ...p, [a.id]: true }))
                          }}
                          onBlur={() => setTimeout(() => {
                            setAgentDropdownOpen(p => ({ ...p, [a.id]: false }))
                            setAgentSearch(p => ({ ...p, [a.id]: undefined as any }))
                          }, 150)}
                          placeholder="Search agents..."
                        />
                        {agentDropdownOpen[a.id] && (
                          <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-48 overflow-y-auto">
                            {filteredAgentsForRow(a.id).length === 0 ? (
                              <p className="px-3 py-2 text-xs text-luxury-gray-3">No agents found</p>
                            ) : (
                              filteredAgentsForRow(a.id).map(u => (
                                <div
                                  key={u.id}
                                  onMouseDown={() => {
                                    setAgentF(a.id, 'agent_id', u.id)
                                    setAgentSearch(p => ({ ...p, [a.id]: undefined as any }))
                                    setAgentDropdownOpen(p => ({ ...p, [a.id]: false }))
                                  }}
                                  className="px-3 py-2 text-xs text-luxury-gray-1 hover:bg-luxury-light cursor-pointer"
                                >
                                  {`${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>

                      {/* Role + Plan */}
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Role">
                          <select className="select-luxury text-xs" value={af.agent_role} onChange={e => setAgentF(a.id, 'agent_role', e.target.value)}>
                            <option value="">Select...</option>
                            {AGENT_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Commission Plan">
                          <select className="select-luxury text-xs" value={af.commission_plan} onChange={e => setAgentF(a.id, 'commission_plan', e.target.value)}>
                            <option value="">Select...</option>
                            {COMMISSION_PLANS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </Field>
                      </div>

                      {/* Lead Source Picker - for team members */}
                      {agentCalcData[a.agent_id]?.is_team_member && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <p className="text-xs font-semibold text-purple-800 mb-1">Lead Source</p>
                          <p className="text-xs text-purple-600 mb-2">
                            {agentCalcData[a.agent_id]?.team_name || 'Team'} member - who sourced this lead?
                          </p>
                          <div className="flex gap-2">
                            {(['team_lead', 'own', 'firm'] as const).map(src => (
                              <button
                                key={src}
                                type="button"
                                onClick={() => {
                                  setAgentLeadSources(prev => ({ ...prev, [a.agent_id]: src }))
                                  recalculateForAgent(a.agent_id, a.id, src)
                                }}
                                className={`flex-1 text-xs py-2 px-3 rounded-md border transition-colors ${
                                  (agentLeadSources[a.agent_id] || 'own') === src
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-white text-purple-700 border-purple-300 hover:bg-purple-50'
                                }`}
                              >
                                {src === 'team_lead' ? 'Team Lead' : src === 'own' ? "Agent's Own" : 'Firm Lead'}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Momentum Partner - if applicable */}
                      {agentCalcData[a.agent_id]?.momentum_partner_name && agentCalcData[a.agent_id]?.momentum_partner_payout > 0 && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs font-semibold text-green-800">Momentum Partner</p>
                              <p className="text-xs text-green-600">
                                {agentCalcData[a.agent_id].momentum_partner_name} earns {agentCalcData[a.agent_id].momentum_partner_pct}%
                              </p>
                            </div>
                            <p className="text-sm font-semibold text-green-700">
                              {fmt$(agentCalcData[a.agent_id].momentum_partner_payout)}
                            </p>
                          </div>
                          <p className="text-xs text-green-600 mt-1 italic">From brokerage side</p>
                        </div>
                      )}

                      <AgentFinancialFields
                        form={af}
                        setField={(field, value) => setAgentF(a.id, field, value)}
                        hasBtsa={!!txn.has_btsa}
                      />
                    </div>
                  )
                })}

                {/* New agent rows */}
                {newAgentRows.map(row => (
                  <div key={row._id} className="inner-card space-y-3 border-luxury-accent/30 border">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-luxury-accent uppercase tracking-widest">New Agent</p>
                      <button type="button" onClick={() => setNewAgentRows(p => p.filter(r => r._id !== row._id))} className="text-luxury-gray-3 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Field label="Agent *">
                          <div className="relative">
                            <input
                              type="text"
                              className="input-luxury text-xs"
                              value={agentSearch[row._id] || ''}
                              onChange={e => {
                                setAgentSearch(p => ({ ...p, [row._id]: e.target.value }))
                                setAgentDropdownOpen(p => ({ ...p, [row._id]: true }))
                                if (!e.target.value) setNewAgentF(row._id, 'agent_id', '')
                              }}
                              onFocus={() => setAgentDropdownOpen(p => ({ ...p, [row._id]: true }))}
                              onBlur={() => setTimeout(() => setAgentDropdownOpen(p => ({ ...p, [row._id]: false })), 150)}
                              placeholder="Search agents..."
                            />
                            {agentDropdownOpen[row._id] && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-luxury-gray-5 rounded shadow-lg max-h-48 overflow-y-auto">
                                {filteredAgentsForRow(row._id).length === 0 ? (
                                  <p className="px-3 py-2 text-xs text-luxury-gray-3">No agents found</p>
                                ) : (
                                  filteredAgentsForRow(row._id).map(u => (
                                    <div
                                      key={u.id}
                                      onMouseDown={() => handleNewAgentSelect(row._id, u.id)}
                                      className="px-3 py-2 text-xs text-luxury-gray-1 hover:bg-luxury-light cursor-pointer"
                                    >
                                      {`${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`}
                                    </div>
                                  ))
                                )}
                              </div>
                            )}
                          </div>
                        </Field>
                      </div>
                      <Field label="Role">
                        <select className="select-luxury text-xs" value={row.agent_role} onChange={e => setNewAgentF(row._id, 'agent_role', e.target.value)}>
                          {AGENT_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Commission Plan">
                        <select className="select-luxury text-xs" value={row.commission_plan} onChange={e => setNewAgentF(row._id, 'commission_plan', e.target.value)}>
                          <option value="">Select...</option>
                          {COMMISSION_PLANS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </Field>
                    </div>

                    <AgentFinancialFields
                      form={row}
                      setField={(field, value) => setNewAgentF(row._id, field, value)}
                      hasBtsa={!!txn.has_btsa}
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setNewAgentRows(p => [...p, emptyAgentForm()])}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-luxury-accent hover:text-luxury-accent/80 py-2 border border-dashed border-luxury-accent/40 rounded-lg transition-colors"
                >
                  <Plus size={13} /> Add Agent
                </button>
              </div>
            )}
          </div>

          {/* ── External Brokerages ───────────────────────────────────── */}
          <div>
            <SectionHeader
              title={`External Brokerages (${externalBrokerages.length + newBrokerageRows.length})`}
              expanded={sections.external}
              onToggle={() => toggle('external')}
            />
            {sections.external && (
              <div className="space-y-4">
                {loadingExternal ? (
                  <p className="text-xs text-luxury-gray-3">Loading...</p>
                ) : (
                  <>
                    {/* Existing brokerages */}
                    {externalBrokerages.map(b => {
                      const bf = externalForms[b.id] || {}
                      return (
                        <div key={b.id} className="inner-card space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-luxury-gray-1">{b.brokerage_name}</p>
                            <p className="text-xs text-luxury-gray-3">{BROKERAGE_ROLES.find(r => r.value === b.brokerage_role)?.label || b.brokerage_role?.replace(/_/g, ' ') || '--'}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Brokerage Name">
                              <input className="input-luxury text-xs" value={bf.brokerage_name} onChange={e => setExtF(b.id, 'brokerage_name', e.target.value)} />
                            </Field>
                            <Field label="Role">
                              <select className="select-luxury text-xs" value={bf.brokerage_role} onChange={e => setExtF(b.id, 'brokerage_role', e.target.value)}>
                                <option value="">Select...</option>
                                {BROKERAGE_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </Field>
                            <Field label="Agent Name">
                              <input className="input-luxury text-xs" value={bf.agent_name} onChange={e => setExtF(b.id, 'agent_name', e.target.value)} />
                            </Field>
                            <Field label="Agent Email">
                              <input type="email" className="input-luxury text-xs" value={bf.agent_email} onChange={e => setExtF(b.id, 'agent_email', e.target.value)} />
                            </Field>
                            <Field label="Agent Phone">
                              <input className="input-luxury text-xs" value={bf.agent_phone} onChange={e => setExtF(b.id, 'agent_phone', e.target.value)} />
                            </Field>
                            <Field label="Broker Name">
                              <input className="input-luxury text-xs" value={bf.broker_name} onChange={e => setExtF(b.id, 'broker_name', e.target.value)} />
                            </Field>
                          </div>
                          <BrokerageFields form={bf} setField={(field, value) => setExtF(b.id, field, value)} />
                        </div>
                      )
                    })}

                    {/* New brokerage rows */}
                    {newBrokerageRows.map(row => (
                      <div key={row._id} className="inner-card space-y-3 border-luxury-accent/30 border">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-luxury-accent uppercase tracking-widest">New Brokerage</p>
                          <button type="button" onClick={() => setNewBrokerageRows(p => p.filter(r => r._id !== row._id))} className="text-luxury-gray-3 hover:text-red-500 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Brokerage Name *">
                            <input className="input-luxury text-xs" value={row.brokerage_name} onChange={e => setNewBrokerageF(row._id, 'brokerage_name', e.target.value)} placeholder="Brokerage name" />
                          </Field>
                          <Field label="Role">
                            <select className="select-luxury text-xs" value={row.brokerage_role} onChange={e => setNewBrokerageF(row._id, 'brokerage_role', e.target.value)}>
                              <option value="">Select...</option>
                              {BROKERAGE_ROLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </Field>
                          <Field label="Agent Name">
                            <input className="input-luxury text-xs" value={row.agent_name} onChange={e => setNewBrokerageF(row._id, 'agent_name', e.target.value)} />
                          </Field>
                          <Field label="Agent Email">
                            <input type="email" className="input-luxury text-xs" value={row.agent_email} onChange={e => setNewBrokerageF(row._id, 'agent_email', e.target.value)} />
                          </Field>
                          <Field label="Agent Phone">
                            <input className="input-luxury text-xs" value={row.agent_phone} onChange={e => setNewBrokerageF(row._id, 'agent_phone', e.target.value)} />
                          </Field>
                          <Field label="Broker Name">
                            <input className="input-luxury text-xs" value={row.broker_name} onChange={e => setNewBrokerageF(row._id, 'broker_name', e.target.value)} />
                          </Field>
                        </div>
                        <BrokerageFields form={row} setField={(field, value) => setNewBrokerageF(row._id, field, value)} />
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => setNewBrokerageRows(p => [...p, emptyBrokerageForm()])}
                      className="w-full flex items-center justify-center gap-1.5 text-xs text-luxury-accent hover:text-luxury-accent/80 py-2 border border-dashed border-luxury-accent/40 rounded-lg transition-colors"
                    >
                      <Plus size={13} /> Add External Brokerage
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Summary ─────────────────────────────────────────────────────── */}
          {(() => {
            const officeGross = num(form.office_gross)
            const totalAgentPayouts = agents.reduce((sum, a) => {
              const af = agentForms[a.id]
              return sum + (af ? num(af.agent_net) || computeAgentNet(af) : 0)
            }, 0) + newAgentRows.reduce((sum, row) => sum + (num(row.agent_net) || computeAgentNet(row)), 0)
            const totalMomentumPartner = agents.reduce((sum, a) => {
              const calc = agentCalcData[a.agent_id]
              return sum + (calc?.momentum_partner_payout || 0)
            }, 0)
            const totalTeamLead = agents.reduce((sum, a) => {
              const af = agentForms[a.id]
              return sum + num(af?.team_lead_commission)
            }, 0) + newAgentRows.reduce((sum, row) => sum + num(row.team_lead_commission), 0)
            const totalExternalBrokerages = externalBrokerages.reduce((sum, b) => {
              const bf = externalForms[b.id]
              return sum + num(bf?.commission_amount)
            }, 0) + newBrokerageRows.reduce((sum, row) => sum + num(row.commission_amount), 0)
            const brokerageNet = officeGross - totalAgentPayouts - totalMomentumPartner - totalExternalBrokerages

            return (
              <div className="bg-luxury-gray-5/30 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">Summary</p>
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">Office Gross</span>
                  <span className="font-medium text-luxury-gray-1">{fmt$(officeGross)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-luxury-gray-3">Agent Payouts ({agents.length + newAgentRows.length})</span>
                  <span className="text-luxury-gray-1">-{fmt$(totalAgentPayouts)}</span>
                </div>
                {totalTeamLead > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-luxury-gray-3 pl-3">Includes team lead commission</span>
                    <span className="text-luxury-gray-3">{fmt$(totalTeamLead)}</span>
                  </div>
                )}
                {totalMomentumPartner > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-luxury-gray-3">Momentum Partner</span>
                    <span className="text-luxury-gray-1">-{fmt$(totalMomentumPartner)}</span>
                  </div>
                )}
                {totalExternalBrokerages > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-luxury-gray-3">External Brokerages</span>
                    <span className="text-luxury-gray-1">-{fmt$(totalExternalBrokerages)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-luxury-gray-4">
                  <span className="font-semibold text-luxury-gray-1">Brokerage Net</span>
                  <span className={`font-bold ${brokerageNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {fmt$(brokerageNet)}
                  </span>
                </div>
              </div>
            )
          })()}

          {/* ── On Close Options ────────────────────────────────────────────── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">On Close</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={closeOptions.generateStatements}
                onChange={e => setCloseOptions(p => ({ ...p, generateStatements: e.target.checked }))}
                className="w-4 h-4 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
              />
              <span className="text-xs text-luxury-gray-2">Generate commission statements</span>
            </label>
            {!isLease && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={closeOptions.generateCda}
                  onChange={e => setCloseOptions(p => ({ ...p, generateCda: e.target.checked }))}
                  className="w-4 h-4 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
                />
                <span className="text-xs text-luxury-gray-2">Generate CDA</span>
              </label>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={closeOptions.sendEmails}
                onChange={e => setCloseOptions(p => ({ ...p, sendEmails: e.target.checked }))}
                className="w-4 h-4 rounded border-luxury-gray-4 text-luxury-accent focus:ring-luxury-accent"
              />
              <span className="text-xs text-luxury-gray-2">Send commission emails to agents</span>
            </label>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-luxury-gray-5">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary text-xs flex-1 disabled:opacity-50">
            {saving ? 'Saving...' : 'Close Transaction'}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="btn btn-secondary text-xs">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}