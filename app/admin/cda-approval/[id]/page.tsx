'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const FIELDS: { key: string; label: string }[] = [
  { key: 'team_or_office', label: 'Team / office' },
  { key: 'representing', label: 'Representing' },
  { key: 'client_name', label: 'Client' },
  { key: 'lead_source', label: 'Lead source' },
  { key: 'closing_or_movein_date', label: 'Closing / move-in' },
  { key: 'commission_basis_price', label: 'Commission basis price' },
  { key: 'total_sales_rent_price', label: 'Total sales / rent price' },
  { key: 'commission_rate', label: 'Commission rate' },
  { key: 'bonus_btsa_amount', label: 'BTSA' },
  { key: 'rebate_amount', label: 'Rebate' },
  { key: 'internal_referral_fee', label: 'Internal referral fee' },
  { key: 'external_referral_fee', label: 'External referral fee' },
  { key: 'brokerage_referral_fee', label: 'Brokerage referral fee' },
  { key: 'title_company', label: 'Title company' },
  { key: 'title_officer_name', label: 'Title officer' },
  { key: 'additional_notes', label: 'Notes' },
]

export default function CdaApprovalPage() {
  const params = useParams()
  const id = String(params?.id || '')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approving, setApproving] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/cda-approval/${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setData(json)
    } catch (e: any) {
      setError(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { if (id) load() }, [id])

  async function approve() {
    if (!confirm('Approve this CDA? This applies the broker signature and releases it for sending.')) return
    setApproving(true)
    try {
      const res = await fetch(`/api/admin/transactions/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_cda' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Approval failed')
      await load()
    } catch (e: any) {
      alert(e.message || 'Approval failed')
    } finally {
      setApproving(false)
    }
  }

  if (loading) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-luxury-gray-3">Loading…</div>
  if (error) return <div className="min-h-screen bg-luxury-cream flex items-center justify-center text-red-600">{error}</div>

  const txn = data.transaction
  const isApproved = txn.cda_status === 'approved' || txn.cda_status === 'sent' || !!txn.broker_approved_at
  const compliance = data.compliance || {}

  return (
    <div className="min-h-screen bg-luxury-cream p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="container-card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="page-title">CDA Approval</h1>
              <p className="text-sm text-luxury-gray-3">{txn.property_address || 'Transaction'}</p>
            </div>
            {isApproved ? (
              <span className="text-sm font-semibold text-green-600">CDA approved</span>
            ) : (
              <button onClick={approve} disabled={approving} className="btn btn-primary text-sm disabled:opacity-50">
                {approving ? 'Approving…' : 'Approve CDA'}
              </button>
            )}
          </div>
        </div>

        <div className="container-card">
          <h2 className="section-title mb-3">Compliance Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {FIELDS.filter(f => compliance[f.key] !== undefined && compliance[f.key] !== null && compliance[f.key] !== '').map(f => (
              <div key={f.key} className="flex justify-between gap-3 py-1 border-b border-luxury-gray-5/30">
                <span className="text-xs text-luxury-gray-3">{f.label}</span>
                <span className="text-xs font-medium text-luxury-gray-1 text-right">{String(compliance[f.key])}</span>
              </div>
            ))}
          </div>
        </div>

        {data.agents.map((a: any) => (
          <div key={a.id} className="container-card">
            <h2 className="section-title mb-3">CDA — {a.name} ({a.role})</h2>
            <iframe
              src={`/api/admin/transactions/${id}/cda/${a.id}`}
              className="w-full rounded border border-luxury-gray-5/40"
              style={{ height: '640px' }}
              title={`CDA ${a.name}`}
            />
          </div>
        ))}

        {!isApproved && (
          <div className="container-card flex justify-end">
            <button onClick={approve} disabled={approving} className="btn btn-primary disabled:opacity-50">
              {approving ? 'Approving…' : 'Approve CDA'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
