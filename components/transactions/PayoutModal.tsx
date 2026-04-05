'use client'

import { useState, useEffect } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface PayoutModalProps {
  transactionId: string
  agents: any[]
  onClose: () => void
  onSaved: () => void
}

const AGENT_ROLES = [
  { value: 'primary_agent',   label: 'Primary Agent' },
  { value: 'co_agent',        label: 'Co-Agent' },
  { value: 'listing_agent',   label: 'Listing Agent' },
  { value: 'team_lead',       label: 'Team Lead' },
  { value: 'referral_agent',  label: 'Referral Agent' },
]

const BROKERAGE_ROLES = [
  { value: 'buyers_agent',      label: "Buyer's Agent" },
  { value: 'sellers_agent',     label: "Seller's Agent" },
  { value: 'listing_agent',     label: 'Listing Agent' },
  { value: 'cooperating_agent', label: 'Cooperating Agent' },
  { value: 'referral',          label: 'Referral' },
  { value: 'other',             label: 'Other' },
]

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
  status,
  date,
  method,
  reference,
  onChange,
}: {
  status: string
  date: string
  method: string
  reference: string
  onChange: (field: string, value: string) => void
}) {
  return (
    <>
      <Field label="Payment Status">
        <select
          className="select-luxury text-xs"
          value={status}
          onChange={e => onChange('payment_status', e.target.value)}
        >
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="not_applicable">N/A</option>
        </select>
      </Field>
      {status === 'paid' && (
        <>
          <Field label="Payment Date">
            <input
              type="date"
              className="input-luxury text-xs"
              value={date}
              onChange={e => onChange('payment_date', e.target.value)}
            />
          </Field>
          <Field label="Payment Method">
            <select
              className="select-luxury text-xs"
              value={method}
              onChange={e => onChange('payment_method', e.target.value)}
            >
              <option value="">Select...</option>
              <option value="check">Check</option>
              <option value="zelle">Zelle</option>
              <option value="ach">ACH</option>
              <option value="wire">Wire</option>
              <option value="payload">Payload</option>
            </select>
          </Field>
          <Field label="Reference">
            <input
              type="text"
              className="input-luxury text-xs"
              value={reference}
              placeholder="Check #, ref, etc."
              onChange={e => onChange('payment_reference', e.target.value)}
            />
          </Field>
        </>
      )}
    </>
  )
}

function initAgentForm(a: any) {
  return {
    agent_net:         a.agent_net        != null ? String(a.agent_net)        : '',
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
  }
}

function emptyNewAgent() {
  return {
    _id:               uid(),
    agent_id:          '',
    agent_role:        'primary_agent',
    agent_net:         '',
    payment_status:    'pending',
    payment_date:      '',
    payment_method:    '',
    payment_reference: '',
  }
}

function emptyNewBrokerage() {
  return {
    _id:               uid(),
    brokerage_name:    '',
    brokerage_role:    '',
    agent_name:        '',
    commission_amount: '',
    payment_status:    'pending',
    payment_date:      '',
    payment_method:    '',
    payment_reference: '',
  }
}

export default function PayoutModal({
  transactionId,
  agents,
  onClose,
  onSaved,
}: PayoutModalProps) {
  const [allUsers, setAllUsers]                   = useState<any[]>([])
  const [brokerages, setBrokerages]               = useState<any[]>([])
  const [loading, setLoading]                     = useState(true)
  const [saving, setSaving]                       = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  const [agentForms, setAgentForms]               = useState<Record<string, any>>({})
  const [brokerageForms, setBrokerageForms]       = useState<Record<string, any>>({})

  const [newAgentRows, setNewAgentRows]           = useState<any[]>([])
  const [newBrokerageRows, setNewBrokerageRows]   = useState<any[]>([])

  const [agentSearch, setAgentSearch]             = useState<Record<string, string>>({})
  const [agentDropdownOpen, setAgentDropdownOpen] = useState<Record<string, boolean>>({})

  const [agentsOpen, setAgentsOpen]               = useState(true)
  const [brokeragesOpen, setBrokeragesOpen]       = useState(true)

  useEffect(() => {
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
        }
      } finally {
        setLoading(false)
      }
    }

    const initAgents: Record<string, any> = {}
    for (const a of agents) initAgents[a.id] = initAgentForm(a)
    setAgentForms(initAgents)

    load()
  }, [transactionId, agents])

  const setAgentF    = (id: string, field: string, value: any) =>
    setAgentForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
  const setBrokerageF = (id: string, field: string, value: any) =>
    setBrokerageForms(p => ({ ...p, [id]: { ...p[id], [field]: value } }))
  const setNewAgentF = (rowId: string, field: string, value: any) =>
    setNewAgentRows(p => p.map(r => r._id === rowId ? { ...r, [field]: value } : r))
  const setNewBrokerageF = (rowId: string, field: string, value: any) =>
    setNewBrokerageRows(p => p.map(r => r._id === rowId ? { ...r, [field]: value } : r))

  const filteredUsers = (rowId: string) => {
    const q = (agentSearch[rowId] || '').toLowerCase()
    if (!q) return allUsers
    return allUsers.filter(u => {
      const name = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.toLowerCase()
      return name.includes(q)
    })
  }

  const handleSelectUser = (rowId: string, userId: string) => {
    const u = allUsers.find(u => u.id === userId)
    const name = u ? `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}` : ''
    setNewAgentRows(p => p.map(r => r._id === rowId ? { ...r, agent_id: userId } : r))
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

      // Update existing internal agents
      for (const a of agents) {
        const f = agentForms[a.id]
        if (!f) continue
        ops.push(callAction('update_internal_agent', {
          internal_agent_id: a.id,
          updates: {
            agent_net:         f.agent_net !== '' ? parseFloat(f.agent_net) : null,
            payment_status:    f.payment_status,
            payment_date:      f.payment_date || null,
            payment_method:    f.payment_method || null,
            payment_reference: f.payment_reference || null,
          },
        }))
      }

      // Update existing external brokerages
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
          },
        }))
      }

      // Add new internal agent rows
      for (const r of newAgentRows) {
        if (!r.agent_id) continue
        ops.push(callAction('add_internal_agent', {
          agent: {
            agent_id:          r.agent_id,
            agent_role:        r.agent_role,
            agent_net:         r.agent_net !== '' ? parseFloat(r.agent_net) : 0,
            payment_status:    r.payment_status,
            payment_date:      r.payment_date || null,
            payment_method:    r.payment_method || null,
            payment_reference: r.payment_reference || null,
          },
        }))
      }

      // Add new external brokerage rows
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

  const agentName = (a: any) => {
    if (a.user) {
      return `${a.user.preferred_first_name || a.user.first_name} ${a.user.preferred_last_name || a.user.last_name}`
    }
    return a.agent_id || 'Unknown Agent'
  }

  const roleLabel = (role: string) =>
    AGENT_ROLES.find(r => r.value === role)?.label || role?.replace(/_/g, ' ') || ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-luxury-bg w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-luxury-bg z-10 flex items-center justify-between px-5 py-4 border-b border-luxury-gray-5">
          <h2 className="text-sm font-semibold text-luxury-gray-1">Agent and Brokerage Payouts</h2>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1">
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

                {/* Existing agents */}
                {agents.map(a => {
                  const f = agentForms[a.id]
                  if (!f) return null
                  return (
                    <div key={a.id} className="inner-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-luxury-gray-1">{agentName(a)}</p>
                          <p className="text-xs text-luxury-gray-3">{roleLabel(a.agent_role)}</p>
                        </div>
                        {a.agent_net != null && (
                          <span className="text-xs text-luxury-gray-3">{fmt$(parseFloat(a.agent_net || 0))}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Agent Net">
                          <input
                            type="number"
                            step="0.01"
                            className="input-luxury text-xs"
                            value={f.agent_net}
                            onChange={e => setAgentF(a.id, 'agent_net', e.target.value)}
                            placeholder="0.00"
                          />
                        </Field>
                        <PaymentFields
                          status={f.payment_status}
                          date={f.payment_date}
                          method={f.payment_method}
                          reference={f.payment_reference}
                          onChange={(field, val) => setAgentF(a.id, field, val)}
                        />
                      </div>
                    </div>
                  )
                })}

                {/* New agent rows */}
                {newAgentRows.map(row => (
                  <div key={row._id} className="inner-card space-y-3 border border-luxury-accent/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-luxury-gray-1">New Agent</p>
                      <button
                        type="button"
                        onClick={() => setNewAgentRows(p => p.filter(r => r._id !== row._id))}
                        className="text-luxury-gray-4 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {/* Agent search */}
                    <Field label="Agent">
                      <div className="relative">
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          placeholder="Search agent..."
                          value={agentSearch[row._id] || ''}
                          onChange={e => {
                            setAgentSearch(p => ({ ...p, [row._id]: e.target.value }))
                            setAgentDropdownOpen(p => ({ ...p, [row._id]: true }))
                          }}
                          onFocus={() => setAgentDropdownOpen(p => ({ ...p, [row._id]: true }))}
                        />
                        {agentDropdownOpen[row._id] && filteredUsers(row._id).length > 0 && (
                          <div className="absolute z-20 w-full bg-luxury-bg border border-luxury-gray-5 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                            {filteredUsers(row._id).slice(0, 15).map(u => (
                              <button
                                key={u.id}
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-luxury-gray-5/50 text-luxury-gray-1"
                                onClick={() => handleSelectUser(row._id, u.id)}
                              >
                                {u.preferred_first_name || u.first_name} {u.preferred_last_name || u.last_name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Role">
                        <select
                          className="select-luxury text-xs"
                          value={row.agent_role}
                          onChange={e => setNewAgentF(row._id, 'agent_role', e.target.value)}
                        >
                          {AGENT_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Agent Net">
                        <input
                          type="number"
                          step="0.01"
                          className="input-luxury text-xs"
                          value={row.agent_net}
                          onChange={e => setNewAgentF(row._id, 'agent_net', e.target.value)}
                          placeholder="0.00"
                        />
                      </Field>
                      <PaymentFields
                        status={row.payment_status}
                        date={row.payment_date}
                        method={row.payment_method}
                        reference={row.payment_reference}
                        onChange={(field, val) => setNewAgentF(row._id, field, val)}
                      />
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setNewAgentRows(p => [...p, emptyNewAgent()])}
                  className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1"
                >
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

                {loading && (
                  <p className="text-xs text-luxury-gray-3 text-center py-2">Loading...</p>
                )}

                {/* Existing brokerages */}
                {brokerages.map(b => {
                  const f = brokerageForms[b.id]
                  if (!f) return null
                  return (
                    <div key={b.id} className="inner-card space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-luxury-gray-1">{b.brokerage_name}</p>
                          <p className="text-xs text-luxury-gray-3">{b.brokerage_role?.replace(/_/g, ' ')}</p>
                        </div>
                        {b.commission_amount != null && (
                          <span className="text-xs text-luxury-gray-3">{fmt$(parseFloat(b.commission_amount || 0))}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Brokerage Name">
                          <input
                            type="text"
                            className="input-luxury text-xs"
                            value={f.brokerage_name}
                            onChange={e => setBrokerageF(b.id, 'brokerage_name', e.target.value)}
                          />
                        </Field>
                        <Field label="Role">
                          <select
                            className="select-luxury text-xs"
                            value={f.brokerage_role}
                            onChange={e => setBrokerageF(b.id, 'brokerage_role', e.target.value)}
                          >
                            <option value="">Select...</option>
                            {BROKERAGE_ROLES.map(r => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Agent Name">
                          <input
                            type="text"
                            className="input-luxury text-xs"
                            value={f.agent_name}
                            onChange={e => setBrokerageF(b.id, 'agent_name', e.target.value)}
                          />
                        </Field>
                        <Field label="Commission Amount">
                          <input
                            type="number"
                            step="0.01"
                            className="input-luxury text-xs"
                            value={f.commission_amount}
                            onChange={e => setBrokerageF(b.id, 'commission_amount', e.target.value)}
                            placeholder="0.00"
                          />
                        </Field>
                        <PaymentFields
                          status={f.payment_status}
                          date={f.payment_date}
                          method={f.payment_method}
                          reference={f.payment_reference}
                          onChange={(field, val) => setBrokerageF(b.id, field, val)}
                        />
                      </div>
                    </div>
                  )
                })}

                {/* New brokerage rows */}
                {newBrokerageRows.map(row => (
                  <div key={row._id} className="inner-card space-y-3 border border-luxury-accent/30">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-luxury-gray-1">New Brokerage</p>
                      <button
                        type="button"
                        onClick={() => setNewBrokerageRows(p => p.filter(r => r._id !== row._id))}
                        className="text-luxury-gray-4 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Brokerage Name">
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={row.brokerage_name}
                          onChange={e => setNewBrokerageF(row._id, 'brokerage_name', e.target.value)}
                          placeholder="Brokerage name"
                        />
                      </Field>
                      <Field label="Role">
                        <select
                          className="select-luxury text-xs"
                          value={row.brokerage_role}
                          onChange={e => setNewBrokerageF(row._id, 'brokerage_role', e.target.value)}
                        >
                          <option value="">Select...</option>
                          {BROKERAGE_ROLES.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Agent Name">
                        <input
                          type="text"
                          className="input-luxury text-xs"
                          value={row.agent_name}
                          onChange={e => setNewBrokerageF(row._id, 'agent_name', e.target.value)}
                          placeholder="Agent name"
                        />
                      </Field>
                      <Field label="Commission Amount">
                        <input
                          type="number"
                          step="0.01"
                          className="input-luxury text-xs"
                          value={row.commission_amount}
                          onChange={e => setNewBrokerageF(row._id, 'commission_amount', e.target.value)}
                          placeholder="0.00"
                        />
                      </Field>
                      <PaymentFields
                        status={row.payment_status}
                        date={row.payment_date}
                        method={row.payment_method}
                        reference={row.payment_reference}
                        onChange={(field, val) => setNewBrokerageF(row._id, field, val)}
                      />
                    </div>
                  </div>
                ))}

                {!loading && (
                  <button
                    type="button"
                    onClick={() => setNewBrokerageRows(p => [...p, emptyNewBrokerage()])}
                    className="btn btn-secondary text-xs w-full flex items-center justify-center gap-1"
                  >
                    <Plus size={13} /> Add Brokerage
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-luxury-bg border-t border-luxury-gray-5 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary text-xs flex-1"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary text-xs flex-1"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

      </div>
    </div>
  )
}