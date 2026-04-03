'use client'

import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronUp } from 'lucide-react'

interface CloseTransactionModalProps {
  transactionId: string
  transaction: any
  agents: any[]
  check: any | null
  userId: string
  onClose: () => void
  onSaved: () => void
}

const num = (v: any) => parseFloat(v ?? 0) || 0

function computeAgentNet(form: any): number {
  return (
    num(form.agent_gross) -
    num(form.processing_fee) -
    num(form.coaching_fee) -
    num(form.other_fees) -
    num(form.btsa_amount) -
    num(form.debts_deducted) -
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

export default function CloseTransactionModal({ transactionId, transaction: txn, agents, check, userId, onClose, onSaved }: CloseTransactionModalProps) {
  const isLease = ['lease', 'tenant', 'landlord', 'apartment', 'rent'].some(k => txn.transaction_type?.toLowerCase().includes(k))

  const [externalBrokerages, setExternalBrokerages] = useState<any[]>([])
  const [loadingExternal, setLoadingExternal] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [sections, setSections] = useState({ close: true, commission: true, title: true, check: true, adjustments: true, agents: true, external: true })
  const toggle = (k: keyof typeof sections) => setSections(p => ({ ...p, [k]: !p[k] }))

  const [form, setForm] = useState({
    closed_date: txn.closed_date?.substring(0, 10) || new Date().toISOString().split('T')[0],
    funding_status: txn.funding_status || '',
    check_clear_date: txn.check_clear_date?.substring(0, 10) || '',
    goal_paydate: txn.goal_paydate?.substring(0, 10) || '',
    sales_price: txn.sales_price != null ? String(txn.sales_price) : '',
    gross_commission: txn.gross_commission != null ? String(txn.gross_commission) : '',
    gross_commission_type: txn.gross_commission_type || 'amount',
    office_gross: txn.office_gross != null ? String(txn.office_gross) : '',
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

  const [agentForms, setAgentForms] = useState<Record<string, any>>(() => {
    const init: Record<string, any> = {}
    for (const a of agents) {
      init[a.id] = {
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

  const [externalForms, setExternalForms] = useState<Record<string, any>>({})

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/transactions/${transactionId}?section=external_brokerages`)
        if (res.ok) {
          const data = await res.json()
          const brokerages = data.external_brokerages || []
          setExternalBrokerages(brokerages)
          const init: Record<string, any> = {}
          for (const b of brokerages) {
            init[b.id] = {
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
      } finally {
        setLoadingExternal(false)
      }
    }
    load()
  }, [transactionId])

  const setF = (field: string, value: any) => setForm(p => ({ ...p, [field]: value }))
  const setAgentF = (id: string, field: string, value: any) => setAgentForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
  const setExtF = (id: string, field: string, value: any) => setExternalForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
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

  const handleSave = async () => {
    if (!form.closed_date) { setError('Closed date is required.'); return }
    setSaving(true)
    setError(null)
    try {
      const txnUpdates: Record<string, any> = {
        status: 'closed',
        closed_date: form.closed_date,
        closed_at: new Date().toISOString(),
        closed_by: userId,
        funding_status: form.funding_status || null,
        check_clear_date: form.check_clear_date || null,
        goal_paydate: form.goal_paydate || null,
        sales_price: parseNum(form.sales_price),
        gross_commission: parseNum(form.gross_commission),
        gross_commission_type: form.gross_commission_type,
        office_gross: parseNum(form.office_gross),
        title_company: form.title_company || null,
        title_officer_name: form.title_officer_name || null,
        title_company_email: form.title_company_email || null,
      }
      if (txn.has_transaction_coordinator) txnUpdates.transaction_coordinator_fee = parseNum(form.transaction_coordinator_fee)
      if (txn.has_ecommission) txnUpdates.ecommission_amount = parseNum(form.ecommission_amount)
      if (txn.brokerage_referral) txnUpdates.brokerage_referral_fee = parseNum(form.brokerage_referral_fee)
      if (txn.revenue_share_recipient_id) txnUpdates.revenue_share_amount = parseNum(form.revenue_share_amount)

      await callAction('update_transaction', { updates: txnUpdates })

      for (const a of agents) {
        const af = agentForms[a.id]
        if (!af) continue
        const computedNet = computeAgentNet(af)
        const agentNet = af.agent_net !== '' ? parseFloat(af.agent_net) : computedNet
        const amount1099 = af.amount_1099_reportable !== '' ? parseFloat(af.amount_1099_reportable) : agentNet
        await callAction('update_internal_agent', {
          internal_agent_id: a.id,
          updates: {
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

      for (const b of externalBrokerages) {
        const bf = externalForms[b.id]
        if (!bf) continue
        await callAction('update_external_brokerage', {
          brokerage_id: b.id,
          updates: {
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

        {/* Body */}
        <div className="p-4 space-y-6">

          {/* Close Details */}
          <div>
            <SectionHeader title="Close Details" expanded={sections.close} onToggle={() => toggle('close')} />
            {sections.close && (
              <div className="grid grid-cols-2 gap-3">
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

          {/* Final Commission */}
          <div>
            <SectionHeader title="Final Commission" expanded={sections.commission} onToggle={() => toggle('commission')} />
            {sections.commission && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={isLease ? 'Monthly Rent' : 'Sales Price'}>
                  <input type="number" className="input-luxury text-xs" value={form.sales_price} onChange={e => setF('sales_price', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
                <Field label="Gross Commission">
                  <div className="flex gap-2">
                    <input type="number" className="input-luxury text-xs flex-1" value={form.gross_commission} onChange={e => setF('gross_commission', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                    <select className="select-luxury text-xs w-16" value={form.gross_commission_type} onChange={e => setF('gross_commission_type', e.target.value)}>
                      <option value="amount">$</option>
                      <option value="percent">%</option>
                    </select>
                  </div>
                </Field>
                <Field label="Office Gross">
                  <input type="number" className="input-luxury text-xs" value={form.office_gross} onChange={e => setF('office_gross', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                </Field>
              </div>
            )}
          </div>

          {/* Title / Settlement */}
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

          {/* Check Receipt */}
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

          {/* Adjustments */}
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

          {/* Internal Agents */}
          <div>
            <SectionHeader title={`Internal Agents (${agents.length})`} expanded={sections.agents} onToggle={() => toggle('agents')} />
            {sections.agents && (
              <div className="space-y-4">
                {agents.map(a => {
                  const af = agentForms[a.id] || {}
                  const computedNet = computeAgentNet(af)
                  const agentName = `${a.user?.preferred_first_name || a.user?.first_name || ''} ${a.user?.preferred_last_name || a.user?.last_name || ''}`.trim() || 'Agent'
                  const isOnTeam = a.user?.is_on_team || num(a.team_lead_commission) > 0
                  return (
                    <div key={a.id} className="inner-card space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-luxury-gray-1">{agentName}</p>
                        <p className="text-xs text-luxury-gray-3">
                          {a.agent_role?.replace(/_/g, ' ')}{a.user?.commission_plan ? ` · ${a.user.commission_plan}` : ''}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Agent Gross">
                          <input type="number" className="input-luxury text-xs" value={af.agent_gross} onChange={e => setAgentF(a.id, 'agent_gross', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        <Field label="Brokerage Split">
                          <input type="number" className="input-luxury text-xs" value={af.brokerage_split} onChange={e => setAgentF(a.id, 'brokerage_split', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        <Field label="Processing Fee">
                          <input type="number" className="input-luxury text-xs" value={af.processing_fee} onChange={e => setAgentF(a.id, 'processing_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        <Field label="Coaching Fee">
                          <input type="number" className="input-luxury text-xs" value={af.coaching_fee} onChange={e => setAgentF(a.id, 'coaching_fee', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        <Field label="Other Fees">
                          <input type="number" className="input-luxury text-xs" value={af.other_fees} onChange={e => setAgentF(a.id, 'other_fees', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        <Field label="Other Fees Description">
                          <input className="input-luxury text-xs" value={af.other_fees_description} onChange={e => setAgentF(a.id, 'other_fees_description', e.target.value)} placeholder="e.g. E&O fee" />
                        </Field>
                        {txn.has_btsa && (
                          <Field label="BTSA Amount">
                            <input type="number" className="input-luxury text-xs" value={af.btsa_amount} onChange={e => setAgentF(a.id, 'btsa_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                          </Field>
                        )}
                        <Field label="Debts Deducted">
                          <input type="number" className="input-luxury text-xs" value={af.debts_deducted} onChange={e => setAgentF(a.id, 'debts_deducted', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                        </Field>
                        {isOnTeam && (
                          <Field label="Team Lead Commission">
                            <input type="number" className="input-luxury text-xs" value={af.team_lead_commission} onChange={e => setAgentF(a.id, 'team_lead_commission', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                          </Field>
                        )}
                      </div>
                      <div className="pt-3 border-t border-luxury-gray-5/50 space-y-3">
                        <div className="flex items-center justify-between bg-luxury-gray-5/30 rounded px-3 py-2">
                          <span className="text-xs text-luxury-gray-3">Computed Agent Net</span>
                          <span className="text-sm font-semibold text-luxury-accent">{fmt$(computedNet)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Agent Net (override)">
                            <input type="number" className="input-luxury text-xs" value={af.agent_net} onChange={e => setAgentF(a.id, 'agent_net', e.target.value)} placeholder={computedNet.toFixed(2)} step="0.01" />
                          </Field>
                          <Field label="Amount 1099 Reportable">
                            <input type="number" className="input-luxury text-xs" value={af.amount_1099_reportable} onChange={e => setAgentF(a.id, 'amount_1099_reportable', e.target.value)} placeholder={af.agent_net !== '' ? af.agent_net : computedNet.toFixed(2)} step="0.01" />
                          </Field>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* External Brokerages */}
          <div>
            <SectionHeader title={`External Brokerages (${externalBrokerages.length})`} expanded={sections.external} onToggle={() => toggle('external')} />
            {sections.external && (
              <div>
                {loadingExternal ? (
                  <p className="text-xs text-luxury-gray-3">Loading...</p>
                ) : externalBrokerages.length === 0 ? (
                  <p className="text-xs text-luxury-gray-3">No external brokerages on this transaction.</p>
                ) : (
                  <div className="space-y-4">
                    {externalBrokerages.map(b => {
                      const bf = externalForms[b.id] || {}
                      return (
                        <div key={b.id} className="inner-card space-y-3">
                          <div>
                            <p className="text-sm font-semibold text-luxury-gray-1">{b.brokerage_name}</p>
                            <p className="text-xs text-luxury-gray-3">
                              {b.brokerage_role?.replace(/_/g, ' ')}{b.agent_name ? ` · ${b.agent_name}` : ''}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <Field label="Commission Amount">
                              <input type="number" className="input-luxury text-xs" value={bf.commission_amount} onChange={e => setExtF(b.id, 'commission_amount', e.target.value)} placeholder="0.00" step="0.01" min="0" />
                            </Field>
                            <Field label="Amount 1099 Reportable">
                              <input type="number" className="input-luxury text-xs" value={bf.amount_1099_reportable} onChange={e => setExtF(b.id, 'amount_1099_reportable', e.target.value)} placeholder={bf.commission_amount || '0.00'} step="0.01" min="0" />
                            </Field>
                            <Field label="Payment Status">
                              <select className="select-luxury text-xs" value={bf.payment_status} onChange={e => setExtF(b.id, 'payment_status', e.target.value)}>
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="not_applicable">N/A</option>
                              </select>
                            </Field>
                            <Field label="W-9 on File">
                              <div className="flex items-center h-[38px] gap-2">
                                <button type="button" onClick={() => setExtF(b.id, 'w9_on_file', !bf.w9_on_file)} className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${bf.w9_on_file ? 'bg-luxury-accent' : 'bg-luxury-gray-4'}`}>
                                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bf.w9_on_file ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                                <span className="text-xs text-luxury-gray-2">{bf.w9_on_file ? 'Yes' : 'No'}</span>
                              </div>
                            </Field>
                            {bf.payment_status === 'paid' && (
                              <>
                                <Field label="Payment Date">
                                  <input type="date" className="input-luxury text-xs" value={bf.payment_date} onChange={e => setExtF(b.id, 'payment_date', e.target.value)} />
                                </Field>
                                <Field label="Payment Method">
                                  <select className="select-luxury text-xs" value={bf.payment_method} onChange={e => setExtF(b.id, 'payment_method', e.target.value)}>
                                    <option value="">Select...</option>
                                    <option value="check">Check</option>
                                    <option value="wire">Wire</option>
                                    <option value="ACH">ACH</option>
                                    <option value="Zelle">Zelle</option>
                                  </select>
                                </Field>
                                <div className="col-span-2">
                                  <Field label="Payment Reference">
                                    <input className="input-luxury text-xs" value={bf.payment_reference} onChange={e => setExtF(b.id, 'payment_reference', e.target.value)} placeholder="Check #, wire ref, etc." />
                                  </Field>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
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