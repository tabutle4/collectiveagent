'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  AGENT_ROLE_OPTIONS as AGENT_ROLES,
  BROKERAGE_ROLE_OPTIONS as BROKERAGE_ROLES,
} from '@/lib/transactions/constants'

interface PayoutModalProps {
  transactionId: string
  agents: any[]
  onClose: () => void
  onSaved: () => void
}

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function fmt$(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

function PaymentFields({
  status, date, method, reference,
  onChange,
}: {
  status: string; date: string; method: string; reference: string
  onChange: (field: string, value: string) => void
}) {
  return (
    <>
      <Field label="Payment Status">
        <select className="select-luxury text-xs" value={status} onChange={e => onChange('payment_status', e.target.value)}>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="not_applicable">N/A</option>
        </select>
      </Field>
      {status === 'paid' && (
        <>
          <Field label="Payment Date">
            <input type="date" className="input-luxury text-xs" value={date} onChange={e => onChange('payment_date', e.target.value)} />
          </Field>
          <Field label="Payment Method">
            <select className="select-luxury text-xs" value={method} onChange={e => onChange('payment_method', e.target.value)}>
              <option value="">Select...</option>
              <option value="check">Check</option>
              <option value="zelle">Zelle</option>
              <option value="ach">ACH</option>
              <option value="wire">Wire</option>
              <option value="payload">Payload</option>
            </select>
          </Field>
          <Field label="Reference">
            <input type="text" className="input-luxury text-xs" value={reference} placeholder="Check #, ref, etc." onChange={e => onChange('payment_reference', e.target.value)} />
          </Field>
        </>
      )}
    </>
  )
}

function initAgentForm(a: any) {
  return {
    agent_id:          a.agent_id || '',
    agent_role:        a.agent_role || 'primary_agent',
    payment_status:    a.payment_status   || 'pending',
    payment_date:      a.payment_date?.substring(0, 10) || '',
    payment_method:    a.payment_method   || '',
    payment_reference: a.payment_reference || '',
  }
}

function initBrokerageForm(b: any) {
  return {
    brokerage_name:    b.brokerage_name    || '',
    brokerage_role:    b.brokerage_role    || '',
    agent_name:        b.agent_name        || '',
    commission_amount: b.commission_amount != null ? String(b.commission_amount) : '',
    payment_status:    b.payment_status    || 'pending',
    payment_date:      b.payment_date?.substring(0, 10) || '',
    payment_method:    b.payment_method    || '',
    payment_reference: b.payment_reference || '',
    // Brokerage details
    brokerage_address: b.brokerage_address || '',
    brokerage_city:    b.brokerage_city    || '',
    brokerage_state:   b.brokerage_state   || '',
    brokerage_zip:     b.brokerage_zip     || '',
    broker_name:       b.broker_name       || '',
    broker_phone:      b.broker_phone      || '',
    broker_email:      b.broker_email      || '',
    side:              b.side              || '',
    // Agent contact
    agent_phone:       b.agent_phone       || '',
    agent_email:       b.agent_email       || '',
    // 1099 / W-9
    amount_1099_reportable: b.amount_1099_reportable != null ? String(b.amount_1099_reportable) : '',
    w9_on_file:        b.w9_on_file === true,
    federal_id_type:   b.federal_id_type   || '',
    federal_id_number: b.federal_id_number || '',
    notes:             b.notes             || '',
  }
}

function emptyNewAgent() {
  return {
    _id: uid(), agent_id: '', agent_role: 'primary_agent',
    payment_status: 'pending',
    payment_date: '', payment_method: '', payment_reference: '',
  }
}

function emptyNewBrokerage() {
  return {
    _id: uid(), brokerage_name: '', brokerage_role: '', agent_name: '',
    commission_amount: '', payment_status: 'pending',
    payment_date: '', payment_method: '', payment_reference: '',
    // Brokerage details
    brokerage_address: '', brokerage_city: '', brokerage_state: '', brokerage_zip: '',
    broker_name: '', broker_phone: '', broker_email: '', side: '',
    // Agent contact
    agent_phone: '', agent_email: '',
    // 1099 / W-9
    amount_1099_reportable: '', w9_on_file: false,
    federal_id_type: '', federal_id_number: '', notes: '',
  }
}

function MoreBrokerageDetails({
  values,
  onChange,
}: {
  values: Record<string, any>
  onChange: (field: string, value: any) => void
}) {
  const [openSections, setOpenSections] = useState<{ details: boolean; agent: boolean; tax: boolean }>({
    details: false,
    agent: false,
    tax: false,
  })
  const toggle = (k: 'details' | 'agent' | 'tax') =>
    setOpenSections(p => ({ ...p, [k]: !p[k] }))

  return (
    <div className="col-span-2 mt-1 space-y-2">
      {/* Brokerage details */}
      <div className="border-t border-luxury-gray-5 pt-2">
        <button
          type="button"
          onClick={() => toggle('details')}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Brokerage details</span>
          {openSections.details ? <ChevronUp size={13} className="text-luxury-gray-3" /> : <ChevronDown size={13} className="text-luxury-gray-3" />}
        </button>
        {openSections.details && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Side">
              <select
                className="select-luxury text-xs"
                value={values.side || ''}
                onChange={e => onChange('side', e.target.value)}
              >
                <option value="">Select...</option>
                <option value="buyer">Buyer</option>
                <option value="seller">Seller</option>
                <option value="tenant">Tenant</option>
                <option value="landlord">Landlord</option>
              </select>
            </Field>
            <Field label="Broker Name">
              <input type="text" className="input-luxury text-xs" value={values.broker_name || ''} onChange={e => onChange('broker_name', e.target.value)} />
            </Field>
            <Field label="Broker Phone">
              <input type="tel" className="input-luxury text-xs" value={values.broker_phone || ''} onChange={e => onChange('broker_phone', e.target.value)} />
            </Field>
            <Field label="Broker Email">
              <input type="email" className="input-luxury text-xs" value={values.broker_email || ''} onChange={e => onChange('broker_email', e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Address">
                <input type="text" className="input-luxury text-xs" value={values.brokerage_address || ''} onChange={e => onChange('brokerage_address', e.target.value)} />
              </Field>
            </div>
            <Field label="City">
              <input type="text" className="input-luxury text-xs" value={values.brokerage_city || ''} onChange={e => onChange('brokerage_city', e.target.value)} />
            </Field>
            <Field label="State">
              <input type="text" className="input-luxury text-xs" value={values.brokerage_state || ''} onChange={e => onChange('brokerage_state', e.target.value)} placeholder="TX" />
            </Field>
            <Field label="ZIP">
              <input type="text" className="input-luxury text-xs" value={values.brokerage_zip || ''} onChange={e => onChange('brokerage_zip', e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {/* Agent contact */}
      <div className="border-t border-luxury-gray-5 pt-2">
        <button
          type="button"
          onClick={() => toggle('agent')}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Agent contact</span>
          {openSections.agent ? <ChevronUp size={13} className="text-luxury-gray-3" /> : <ChevronDown size={13} className="text-luxury-gray-3" />}
        </button>
        {openSections.agent && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Agent Phone">
              <input type="tel" className="input-luxury text-xs" value={values.agent_phone || ''} onChange={e => onChange('agent_phone', e.target.value)} />
            </Field>
            <Field label="Agent Email">
              <input type="email" className="input-luxury text-xs" value={values.agent_email || ''} onChange={e => onChange('agent_email', e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      {/* 1099 / W-9 */}
      <div className="border-t border-luxury-gray-5 pt-2">
        <button
          type="button"
          onClick={() => toggle('tax')}
          className="w-full flex items-center justify-between py-1"
        >
          <span className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">1099 and W-9</span>
          {openSections.tax ? <ChevronUp size={13} className="text-luxury-gray-3" /> : <ChevronDown size={13} className="text-luxury-gray-3" />}
        </button>
        {openSections.tax && (
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="1099 Reportable">
              <input
                type="number"
                step="0.01"
                className="input-luxury text-xs"
                value={values.amount_1099_reportable || ''}
                onChange={e => onChange('amount_1099_reportable', e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Field label="W-9 on File">
              <select
                className="select-luxury text-xs"
                value={values.w9_on_file === true ? 'yes' : 'no'}
                onChange={e => onChange('w9_on_file', e.target.value === 'yes')}
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </Field>
            <Field label="Federal ID Type">
              <select
                className="select-luxury text-xs"
                value={values.federal_id_type || ''}
                onChange={e => onChange('federal_id_type', e.target.value)}
              >
                <option value="">Select...</option>
                <option value="SSN">SSN</option>
                <option value="EIN">EIN</option>
              </select>
            </Field>
            <Field label="Federal ID Number">
              <input type="text" className="input-luxury text-xs" value={values.federal_id_number || ''} onChange={e => onChange('federal_id_number', e.target.value)} />
            </Field>
            <div className="col-span-2">
              <Field label="Notes">
                <textarea
                  className="input-luxury text-xs"
                  rows={2}
                  value={values.notes || ''}
                  onChange={e => onChange('notes', e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function PayoutModal({ transactionId, agents, onClose, onSaved }: PayoutModalProps) {
  const [allUsers, setAllUsers]                   = useState<any[]>([])
  const [brokerages, setBrokerages]               = useState<any[]>([])
  const [loading, setLoading]                     = useState(true)
  const [saving, setSaving]                       = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  const [agentForms, setAgentForms]               = useState<Record<string, any>>({})
  const [brokerageForms, setBrokerageForms]       = useState<Record<string, any>>({})
  const [newAgentRows, setNewAgentRows]           = useState<any[]>([])
  const [newBrokerageRows, setNewBrokerageRows]   = useState<any[]>([])

  // Search state for both existing and new agent rows
  const [agentSearch, setAgentSearch]             = useState<Record<string, string>>({})
  const [agentDropdownOpen, setAgentDropdownOpen] = useState<Record<string, boolean>>({})

  const [agentsOpen, setAgentsOpen]               = useState(true)
  const [brokeragesOpen, setBrokeragesOpen]       = useState(true)

  useEffect(() => {
    const initAgents: Record<string, any> = {}
    for (const a of agents) initAgents[a.id] = initAgentForm(a)
    setAgentForms(initAgents)

    const load = async () => {
      try {
        const [extRes, usersRes] = await Promise.all([
          fetch(`/api/admin/transactions/${transactionId}?section=external_brokerages`),
          fetch('/api/users/list'),
        ])
        if (extRes.ok) {
          const d = await extRes.json()
          const list = d.external_brokerages || []
          setBrokerages(list)
          const init: Record<string, any> = {}
          for (const b of list) init[b.id] = initBrokerageForm(b)
          setBrokerageForms(init)
        }
        if (usersRes.ok) {
          const d = await usersRes.json()
          const active = (d.users || [])
            .filter((u: any) => u.is_active && u.status === 'active')
            .sort((a: any, b: any) => {
              const na = `${a.preferred_first_name || a.first_name} ${a.preferred_last_name || a.last_name}`.toLowerCase()
              const nb = `${b.preferred_first_name || b.first_name} ${b.preferred_last_name || b.last_name}`.toLowerCase()
              return na.localeCompare(nb)
            })
          setAllUsers(active)
          // Pre-fill agent search display names for existing rows using loaded users
          const searchInit: Record<string, string> = {}
          for (const a of agents) {
            const u = active.find((u: any) => u.id === (a.agent_id))
            if (u) searchInit[a.id] = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`
            else if (a.user) searchInit[a.id] = `${a.user.preferred_first_name || a.user.first_name} ${a.user.preferred_last_name || a.user.last_name}`
          }
          setAgentSearch(searchInit)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [transactionId])

  const setAgentF     = (id: string, field: string, value: any) => setAgentForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))

  // Auto-sync rule: when commission_amount changes, mirror the new value into
  // amount_1099_reportable, but ONLY if the user hasn't manually edited it
  // (i.e. it's currently empty or still equal to the prior commission_amount).
  // Once the user types a deviating 1099 value, we never overwrite it.
  const syncCommissionTo1099 = (prev: any, field: string, value: any) => {
    const next = { ...prev, [field]: value }
    if (field === 'commission_amount') {
      const prevCommission = String(prev?.commission_amount ?? '')
      const prev1099 = String(prev?.amount_1099_reportable ?? '')
      if (prev1099 === '' || prev1099 === prevCommission) {
        next.amount_1099_reportable = value
      }
    }
    return next
  }

  const setBrokerageF = (id: string, field: string, value: any) =>
    setBrokerageForms(p => ({ ...p, [id]: syncCommissionTo1099(p[id], field, value) }))
  const setNewAgentF  = (rowId: string, field: string, value: any) => setNewAgentRows(p => p.map(r => r._id === rowId ? { ...r, [field]: value } : r))
  const setNewBrokerageF = (rowId: string, field: string, value: any) =>
    setNewBrokerageRows(p => p.map(r => r._id === rowId ? syncCommissionTo1099(r, field, value) : r))

  const filteredUsers = (rowId: string) => {
    const q = (agentSearch[rowId] || '').toLowerCase()
    if (!q) return allUsers
    return allUsers.filter(u => {
      const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
      return name.includes(q)
    })
  }

  const handleSelectUser = (rowId: string, userId: string, isExisting = false) => {
    const u = allUsers.find(u => u.id === userId)
    const name = u ? `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}` : ''
    if (isExisting) {
      setAgentF(rowId, 'agent_id', userId)
    } else {
      setNewAgentRows(p => p.map(r => r._id === rowId ? { ...r, agent_id: userId } : r))
    }
    setAgentSearch(p => ({ ...p, [rowId]: name }))
    setAgentDropdownOpen(p => ({ ...p, [rowId]: false }))
  }

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
    return res.json()
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const ops: Promise<any>[] = []

      for (const a of agents) {
        const f = agentForms[a.id]
        if (!f) continue
        ops.push(callAction('update_internal_agent', {
          internal_agent_id: a.id,
          updates: {
            agent_id:          f.agent_id || a.agent_id,
            agent_role:        f.agent_role,
            payment_status:    f.payment_status,
            payment_date:      f.payment_date || null,
            payment_method:    f.payment_method || null,
            payment_reference: f.payment_reference || null,
          },
        }))
      }

      for (const b of brokerages) {
        const f = brokerageForms[b.id]
        if (!f) continue
        ops.push(callAction('update_external_brokerage', {
          brokerage_id: b.id,
          updates: {
            brokerage_name:    f.brokerage_name,
            brokerage_role:    f.brokerage_role,
            agent_name:        f.agent_name,
            commission_amount: f.commission_amount !== '' ? parseFloat(f.commission_amount) : null,
            payment_status:    f.payment_status,
            payment_date:      f.payment_date || null,
            payment_method:    f.payment_method || null,
            payment_reference: f.payment_reference || null,
            brokerage_address: f.brokerage_address || null,
            brokerage_city:    f.brokerage_city    || null,
            brokerage_state:   f.brokerage_state   || null,
            brokerage_zip:     f.brokerage_zip     || null,
            broker_name:       f.broker_name       || null,
            broker_phone:      f.broker_phone      || null,
            broker_email:      f.broker_email      || null,
            side:              f.side              || null,
            agent_phone:       f.agent_phone       || null,
            agent_email:       f.agent_email       || null,
            amount_1099_reportable: f.amount_1099_reportable !== '' ? parseFloat(f.amount_1099_reportable) : null,
            w9_on_file:        f.w9_on_file === true,
            federal_id_type:   f.federal_id_type   || null,
            federal_id_number: f.federal_id_number || null,
            notes:             f.notes             || null,
          },
        }))
      }

      for (const r of newAgentRows) {
        if (!r.agent_id) continue
        ops.push(callAction('add_internal_agent', {
          agent: {
            agent_id:          r.agent_id,
            agent_role:        r.agent_role,
            payment_status:    r.payment_status,
            payment_date:      r.payment_date || null,
            payment_method:    r.payment_method || null,
            payment_reference: r.payment_reference || null,
          },
        }))
      }

      for (const r of newBrokerageRows) {
        if (!r.brokerage_name) continue
        ops.push(callAction('add_external_brokerage', {
          brokerage: {
            brokerage_name:    r.brokerage_name,
            brokerage_role:    r.brokerage_role,
            agent_name:        r.agent_name,
            commission_amount: r.commission_amount !== '' ? parseFloat(r.commission_amount) : null,
            payment_status:    r.payment_status,
            payment_date:      r.payment_date || null,
            payment_method:    r.payment_method || null,
            payment_reference: r.payment_reference || null,
            brokerage_address: r.brokerage_address,
            brokerage_city:    r.brokerage_city,
            brokerage_state:   r.brokerage_state,
            brokerage_zip:     r.brokerage_zip,
            broker_name:       r.broker_name,
            broker_phone:      r.broker_phone,
            broker_email:      r.broker_email,
            side:              r.side,
            agent_phone:       r.agent_phone,
            agent_email:       r.agent_email,
            amount_1099_reportable: r.amount_1099_reportable !== '' ? parseFloat(r.amount_1099_reportable) : null,
            w9_on_file:        r.w9_on_file === true ? true : null,
            federal_id_type:   r.federal_id_type,
            federal_id_number: r.federal_id_number,
            notes:             r.notes,
          },
        }))
      }

      await Promise.all(ops)
      onSaved()
    } catch (err: any) {
      setError(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // Agent search field - used for both existing rows (to reassign) and new rows
  function AgentSearchField({ rowId, isExisting = false }: { rowId: string; isExisting?: boolean }) {
    return (
      <Field label="Agent">
        <div className="relative">
          <input
            type="text"
            className="input-luxury text-xs"
            placeholder="Search agent..."
            value={agentSearch[rowId] || ''}
            onChange={e => {
              setAgentSearch(p => ({ ...p, [rowId]: e.target.value }))
              setAgentDropdownOpen(p => ({ ...p, [rowId]: true }))
            }}
            onFocus={() => {
              setAgentSearch(p => ({ ...p, [rowId]: '' }))
              setAgentDropdownOpen(p => ({ ...p, [rowId]: true }))
            }}
            onBlur={() => setTimeout(() => setAgentDropdownOpen(p => ({ ...p, [rowId]: false })), 150)}
          />
          {agentDropdownOpen[rowId] && filteredUsers(rowId).length > 0 && (
            <div className="absolute z-20 w-full bg-white border border-luxury-gray-5 rounded-lg shadow-lg mt-1 max-h-52 overflow-y-auto">
              {filteredUsers(rowId).map(u => (
                <button
                  key={u.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-luxury-light text-luxury-gray-1"
                  onMouseDown={() => handleSelectUser(rowId, u.id, isExisting)}
                >
                  {u.preferred_first_name || u.first_name} {u.preferred_last_name || u.last_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </Field>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-6">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-luxury-gray-5">
          <h2 className="text-sm font-semibold text-luxury-gray-1">Agent and Brokerage Payouts</h2>
          <button type="button" onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-6">

          {/* Internal Agents */}
          <div>
            <button
              type="button"
              onClick={() => setAgentsOpen(p => !p)}
              className="w-full flex items-center justify-between py-2 border-b border-luxury-gray-5 mb-3"
            >
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">Internal Agents</p>
              {agentsOpen ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
            </button>

            {agentsOpen && (
              <div className="space-y-4">

                {agents.map(a => {
                  const f = agentForms[a.id]
                  if (!f) return null
                  return (
                    <div key={a.id} className="inner-card space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-luxury-gray-1">
                          {agentSearch[a.id] || 'Unknown Agent'}
                        </p>
                        {a.agent_net != null && (
                          <span className="text-xs text-luxury-gray-3">{fmt$(parseFloat(a.agent_net || 0))}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <AgentSearchField rowId={a.id} isExisting={true} />
                        <Field label="Role">
                          <select
                            className="select-luxury text-xs"
                            value={f.agent_role}
                            onChange={e => setAgentF(a.id, 'agent_role', e.target.value)}
                          >
                            {AGENT_ROLES.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </Field>
                        <PaymentFields
                          status={f.payment_status} date={f.payment_date}
                          method={f.payment_method} reference={f.payment_reference}
                          onChange={(field, val) => setAgentF(a.id, field, val)}
                        />
                      </div>
                    </div>
                  )
                })}

                {newAgentRows.map(row => (
                  <div key={row._id} className="inner-card space-y-3 border border-luxury-accent/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-luxury-gray-1">New Agent</p>
                      <button type="button" onClick={() => setNewAgentRows(p => p.filter(r => r._id !== row._id))} className="text-luxury-gray-4 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AgentSearchField rowId={row._id} />
                      <Field label="Role">
                        <select className="select-luxury text-xs" value={row.agent_role} onChange={e => setNewAgentF(row._id, 'agent_role', e.target.value)}>
                          {AGENT_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </Field>
                      <PaymentFields
                        status={row.payment_status} date={row.payment_date}
                        method={row.payment_method} reference={row.payment_reference}
                        onChange={(field, val) => setNewAgentF(row._id, field, val)}
                      />
                    </div>
                  </div>
                ))}

                <button type="button" onClick={() => setNewAgentRows(p => [...p, emptyNewAgent()])} className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1">
                  <Plus size={13} /> Add Agent
                </button>
              </div>
            )}
          </div>

          {/* External Brokerages */}
          <div>
            <button
              type="button"
              onClick={() => setBrokeragesOpen(p => !p)}
              className="w-full flex items-center justify-between py-2 border-b border-luxury-gray-5 mb-3"
            >
              <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest">External Brokerages</p>
              {brokeragesOpen ? <ChevronUp size={14} className="text-luxury-gray-3" /> : <ChevronDown size={14} className="text-luxury-gray-3" />}
            </button>

            {brokeragesOpen && (
              <div className="space-y-4">
                {loading && <p className="text-xs text-luxury-gray-3 text-center py-2">Loading...</p>}

                {brokerages.map(b => {
                  const f = brokerageForms[b.id]
                  if (!f) return null
                  return (
                    <div key={b.id} className="inner-card space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-luxury-gray-1">{b.brokerage_name}</p>
                        {b.commission_amount != null && (
                          <span className="text-xs text-luxury-gray-3">{fmt$(parseFloat(b.commission_amount || 0))}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Brokerage Name">
                          <input type="text" className="input-luxury text-xs" value={f.brokerage_name} onChange={e => setBrokerageF(b.id, 'brokerage_name', e.target.value)} />
                        </Field>
                        <Field label="Role">
                          <select className="select-luxury text-xs" value={f.brokerage_role} onChange={e => setBrokerageF(b.id, 'brokerage_role', e.target.value)}>
                            <option value="">Select...</option>
                            {BROKERAGE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </Field>
                        <Field label="Agent Name">
                          <input type="text" className="input-luxury text-xs" value={f.agent_name} onChange={e => setBrokerageF(b.id, 'agent_name', e.target.value)} />
                        </Field>
                        <Field label="Commission Amount">
                          <input type="number" step="0.01" className="input-luxury text-xs" value={f.commission_amount} onChange={e => setBrokerageF(b.id, 'commission_amount', e.target.value)} placeholder="0.00" />
                        </Field>
                        <PaymentFields
                          status={f.payment_status} date={f.payment_date}
                          method={f.payment_method} reference={f.payment_reference}
                          onChange={(field, val) => setBrokerageF(b.id, field, val)}
                        />
                        <MoreBrokerageDetails
                          values={f}
                          onChange={(field, val) => setBrokerageF(b.id, field, val)}
                        />
                      </div>
                    </div>
                  )
                })}

                {newBrokerageRows.map(row => (
                  <div key={row._id} className="inner-card space-y-3 border border-luxury-accent/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-luxury-gray-1">New Brokerage</p>
                      <button type="button" onClick={() => setNewBrokerageRows(p => p.filter(r => r._id !== row._id))} className="text-luxury-gray-4 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Brokerage Name">
                        <input type="text" className="input-luxury text-xs" value={row.brokerage_name} onChange={e => setNewBrokerageF(row._id, 'brokerage_name', e.target.value)} placeholder="Brokerage name" />
                      </Field>
                      <Field label="Role">
                        <select className="select-luxury text-xs" value={row.brokerage_role} onChange={e => setNewBrokerageF(row._id, 'brokerage_role', e.target.value)}>
                          <option value="">Select...</option>
                          {BROKERAGE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Agent Name">
                        <input type="text" className="input-luxury text-xs" value={row.agent_name} onChange={e => setNewBrokerageF(row._id, 'agent_name', e.target.value)} placeholder="Agent name" />
                      </Field>
                      <Field label="Commission Amount">
                        <input type="number" step="0.01" className="input-luxury text-xs" value={row.commission_amount} onChange={e => setNewBrokerageF(row._id, 'commission_amount', e.target.value)} placeholder="0.00" />
                      </Field>
                      <PaymentFields
                        status={row.payment_status} date={row.payment_date}
                        method={row.payment_method} reference={row.payment_reference}
                        onChange={(field, val) => setNewBrokerageF(row._id, field, val)}
                      />
                      <MoreBrokerageDetails
                        values={row}
                        onChange={(field, val) => setNewBrokerageF(row._id, field, val)}
                      />
                    </div>
                  </div>
                ))}

                {!loading && (
                  <button type="button" onClick={() => setNewBrokerageRows(p => [...p, emptyNewBrokerage()])} className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1">
                    <Plus size={13} /> Add Brokerage
                  </button>
                )}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-luxury-gray-5 px-5 py-4 flex gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs flex-1" disabled={saving}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary text-xs flex-1">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  )
}