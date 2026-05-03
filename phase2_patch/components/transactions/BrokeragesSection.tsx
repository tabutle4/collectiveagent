'use client'

import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import BrokerageCard from './BrokerageCard'

const BROKERAGE_ROLE_OPTIONS = [
  { value: 'buyers_agent',  label: "Buyer's Agent" },
  { value: 'sellers_agent', label: "Seller's Agent" },
  { value: 'referral',      label: 'Referral' },
]

const SIDE_OPTIONS = [
  { value: '',         label: 'Select...' },
  { value: 'buyer',    label: 'Buyer' },
  { value: 'seller',   label: 'Seller' },
  { value: 'tenant',   label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
]

export default function BrokeragesSection({
  transactionId, onRefresh,
}: {
  transactionId: string
  onRefresh: () => void
}) {
  const [brokerages, setBrokerages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({
    brokerage_name: '',
    brokerage_role: 'buyers_agent',
    side: '' as string,
    broker_name: '',
    agent_name: '',
    agent_email: '',
    agent_phone: '',
    commission_amount: '',
  })
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBrokerages = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}?section=external_brokerages`, { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setBrokerages(d.external_brokerages || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBrokerages()
  }, [transactionId])

  const handleRefresh = () => {
    loadBrokerages()
    onRefresh()
  }

  const resetAdd = () => {
    setForm({
      brokerage_name: '',
      brokerage_role: 'buyers_agent',
      side: '',
      broker_name: '',
      agent_name: '',
      agent_email: '',
      agent_phone: '',
      commission_amount: '',
    })
    setShowAdd(false)
    setError(null)
  }

  const addBrokerage = async () => {
    if (!form.brokerage_name) { setError('Brokerage name required'); return }
    setAdding(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_external_brokerage',
          brokerage: {
            ...form,
            side: form.side || null,
            commission_amount: form.commission_amount ? parseFloat(form.commission_amount) : null,
            amount_1099_reportable: form.commission_amount ? parseFloat(form.commission_amount) : null,
            payment_status: 'pending',
            w9_on_file: false,
          },
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Add brokerage failed')
      }
      resetAdd()
      handleRefresh()
    } catch (e: any) {
      setError(e.message || 'Failed to add brokerage')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title">External Brokerages</h2>
        {!showAdd && (
          <button
            onClick={() => setShowAdd(true)}
            className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
          >
            <Plus size={12} /> Add Brokerage
          </button>
        )}
      </div>

      {showAdd && (
        <div className="container-card mb-3 p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-luxury-gray-1">Add external brokerage</p>
            <button onClick={resetAdd} className="text-luxury-gray-3 hover:text-luxury-gray-1">
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="col-span-2">
              <label className="field-label">Brokerage name *</label>
              <input value={form.brokerage_name} onChange={e => setForm(f => ({ ...f, brokerage_name: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
            <div>
              <label className="field-label">Role</label>
              <select value={form.brokerage_role} onChange={e => setForm(f => ({ ...f, brokerage_role: e.target.value }))} className="select-luxury text-xs w-full">
                {BROKERAGE_ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Side</label>
              <select value={form.side} onChange={e => setForm(f => ({ ...f, side: e.target.value }))} className="select-luxury text-xs w-full">
                {SIDE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Commission amount</label>
              <input type="number" step="0.01" value={form.commission_amount} onChange={e => setForm(f => ({ ...f, commission_amount: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
            <div>
              <label className="field-label">Broker name</label>
              <input value={form.broker_name} onChange={e => setForm(f => ({ ...f, broker_name: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
            <div>
              <label className="field-label">Agent name</label>
              <input value={form.agent_name} onChange={e => setForm(f => ({ ...f, agent_name: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
            <div>
              <label className="field-label">Agent email</label>
              <input type="email" value={form.agent_email} onChange={e => setForm(f => ({ ...f, agent_email: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
            <div>
              <label className="field-label">Agent phone</label>
              <input value={form.agent_phone} onChange={e => setForm(f => ({ ...f, agent_phone: e.target.value }))} className="input-luxury text-xs w-full" />
            </div>
          </div>

          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          <div className="flex justify-end gap-2">
            <button onClick={resetAdd} disabled={adding} className="btn btn-secondary text-xs px-3 py-1.5">Cancel</button>
            <button onClick={addBrokerage} disabled={adding} className="btn btn-primary text-xs px-3 py-1.5">
              {adding ? 'Adding...' : 'Add Brokerage'}
            </button>
          </div>

          <p className="text-xs text-luxury-gray-3 mt-2">
            W-9, federal ID, and additional details can be added on the card after it's created.
          </p>
        </div>
      )}

      {loading && <p className="text-xs text-luxury-gray-3 text-center py-3">Loading...</p>}

      {!loading && brokerages.length === 0 && !showAdd && (
        <div className="container-card text-center py-6">
          <p className="text-xs text-luxury-gray-3">No external brokerages on this transaction.</p>
        </div>
      )}

      {brokerages.map(teb => (
        <BrokerageCard
          key={teb.id}
          teb={teb}
          transactionId={transactionId}
          onRefresh={handleRefresh}
        />
      ))}
    </div>
  )
}
