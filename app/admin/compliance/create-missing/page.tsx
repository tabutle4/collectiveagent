'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/context/AuthContext'
import { Loader2, Check, AlertCircle, RefreshCw, Home, Building2 } from 'lucide-react'

interface UnlinkedItem {
  submission_id: string
  agent_id: string | null
  submitted_at: string
  agent_name: string | null
  property_address: string | null
  client_name: string | null
  transaction_type: string | null
  is_lease: boolean
  monthly_rent: number | null
  lease_term: number | null
  sales_price: number | null
  sales_volume: number | null
  date: string | null
  commission_rate: string | null
}

interface EditState {
  sales_volume: string
  monthly_rent: string
  lease_term: string
  sales_price: string
  date: string
  client_name: string
}

export default function CreateMissingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState<UnlinkedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [edits, setEdits] = useState<Record<string, EditState>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_unlinked' }),
      })
      const data = await res.json()
      const list: UnlinkedItem[] = data.items || []
      setItems(list)
      const seed: Record<string, EditState> = {}
      for (const it of list) {
        seed[it.submission_id] = {
          sales_volume: it.sales_volume != null ? String(it.sales_volume) : '',
          monthly_rent: it.monthly_rent != null ? String(it.monthly_rent) : '',
          lease_term: it.lease_term != null ? String(it.lease_term) : '',
          sales_price: it.sales_price != null ? String(it.sales_price) : '',
          date: it.date || '',
          client_name: it.client_name || '',
        }
      }
      setEdits(seed)
    } catch {
      // leave list empty; user can refresh
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user) load()
  }, [authLoading, user, load])

  const setField = (id: string, field: keyof EditState, value: string) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const createOne = async (it: UnlinkedItem) => {
    setBusy(prev => ({ ...prev, [it.submission_id]: true }))
    setErrors(prev => ({ ...prev, [it.submission_id]: '' }))
    const e = edits[it.submission_id]
    const overview: Record<string, any> = {
      client_name: e.client_name || null,
      date: e.date || null,
    }
    if (it.is_lease) {
      overview.monthly_rent = e.monthly_rent || null
      overview.lease_term = e.lease_term || null
      overview.sales_volume = e.sales_volume || null
    } else {
      overview.sales_price = e.sales_price || null
      overview.sales_volume = e.sales_volume || null
    }
    try {
      const res = await fetch('/api/admin/compliance/link-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', submission_id: it.submission_id, overview }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(prev => ({ ...prev, [it.submission_id]: data.error || 'Failed' }))
      } else {
        setDone(prev => ({ ...prev, [it.submission_id]: data.transaction_id }))
        setItems(prev => prev.filter(x => x.submission_id !== it.submission_id))
      }
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [it.submission_id]: err.message || 'Network error' }))
    } finally {
      setBusy(prev => ({ ...prev, [it.submission_id]: false }))
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-luxury-gray-3" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Create Missing Transactions</h1>
          <p className="text-sm text-luxury-gray-3 mt-1">
            {items.length} unlinked compliance submission{items.length === 1 ? '' : 's'} with no transaction.
            Review the values, then create. Each create writes the transaction, adds the agent, links the
            submission, and recalculates commission.
          </p>
        </div>
        <button onClick={load} className="btn flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {items.length === 0 && (
        <div className="container-card text-center py-12 text-luxury-gray-3">
          Nothing left to create. All compliance submissions are linked.
        </div>
      )}

      <div className="space-y-4">
        {items.map(it => {
          const e = edits[it.submission_id]
          if (!e) return null
          const isBusy = busy[it.submission_id]
          const err = errors[it.submission_id]
          return (
            <div key={it.submission_id} className="container-card">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-start gap-2">
                  {it.is_lease
                    ? <Home className="w-4 h-4 text-luxury-accent mt-0.5" />
                    : <Building2 className="w-4 h-4 text-luxury-accent mt-0.5" />}
                  <div>
                    <div className="font-medium text-luxury-gray-1">
                      {it.property_address || 'No address'}
                    </div>
                    <div className="text-xs text-luxury-gray-3">
                      {it.agent_name || 'Unknown agent'} &middot; {it.transaction_type || 'Unknown type'}
                      {it.commission_rate ? ` \u00b7 rate ${it.commission_rate}` : ''}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => createOne(it)}
                  disabled={isBusy}
                  className="btn btn-primary flex items-center gap-2 text-sm whitespace-nowrap"
                >
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Create
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="field-label">Client</label>
                  <input className="input-luxury text-sm" value={e.client_name}
                    onChange={ev => setField(it.submission_id, 'client_name', ev.target.value)} />
                </div>
                <div>
                  <label className="field-label">{it.is_lease ? 'Move-in date' : 'Closing date'}</label>
                  <input type="date" className="input-luxury text-sm" value={e.date}
                    onChange={ev => setField(it.submission_id, 'date', ev.target.value)} />
                </div>
                {it.is_lease ? (
                  <>
                    <div>
                      <label className="field-label">Monthly rent</label>
                      <input className="input-luxury text-sm" value={e.monthly_rent}
                        onChange={ev => setField(it.submission_id, 'monthly_rent', ev.target.value)} />
                    </div>
                    <div>
                      <label className="field-label">Lease term (months)</label>
                      <input className="input-luxury text-sm" value={e.lease_term}
                        onChange={ev => setField(it.submission_id, 'lease_term', ev.target.value)} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="field-label">Sales price</label>
                    <input className="input-luxury text-sm" value={e.sales_price}
                      onChange={ev => setField(it.submission_id, 'sales_price', ev.target.value)} />
                  </div>
                )}
                <div>
                  <label className="field-label">Sales volume</label>
                  <input className="input-luxury text-sm" value={e.sales_volume}
                    onChange={ev => setField(it.submission_id, 'sales_volume', ev.target.value)} />
                </div>
              </div>

              {err && (
                <div className="flex items-center gap-2 mt-3 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" /> {err}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {Object.keys(done).length > 0 && (
        <div className="container-card mt-6">
          <div className="text-sm font-medium text-luxury-gray-1 mb-2">
            Created this session: {Object.keys(done).length}
          </div>
          <div className="text-xs text-luxury-gray-3">
            Each created transaction had its commission recalculated automatically. Open any deal to verify.
          </div>
        </div>
      )}
    </div>
  )
}
