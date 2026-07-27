'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

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

const n = (v: any) => parseFloat(String(v ?? 0)) || 0
const f$ = (v: any) => `$${n(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const line = (label: string, value: string, cls = '') => (
  <div className={`flex justify-between gap-4 py-1 border-b border-luxury-gray-5/30 text-xs ${cls}`}>
    <span className="text-luxury-gray-3">{label}</span>
    <span className="text-luxury-gray-1 whitespace-nowrap">{value}</span>
  </div>
)

// One agent's money column. Used for producing agents and, with the
// eCommission note suppressed, for the linked roles paid inside the
// Collective Realty Co. amount -- an advance belongs to the producing agent,
// not to a team lead or referral agent riding on the same deal.
function AgentMoneyColumn({ a, txn, showEcommission }: { a: any; txn: any; showEcommission: boolean }) {
  const ecAmount = n(txn.ecommission_amount)
  const ecCovered = (a.staged || []).some((d: any) => String(d.description || '').toLowerCase().includes('ecommission'))
  return (
    <div>
      <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-2">
        {a.agent_id ? (
          <Link href={`/admin/users/${a.agent_id}`} className="text-luxury-accent hover:underline">
            {a.name}
          </Link>
        ) : a.name}
        {' '}({a.role})
      </p>
      {n(txn.sales_price) > 0 && line('Sales price', f$(txn.sales_price))}
      {n(txn.monthly_rent) > 0 && line('Monthly rent', f$(txn.monthly_rent))}
      {a.side && line('Side', String(a.side))}
      {line('Agent basis', f$(a.agent_basis))}
      {line(`Agent split (${n(a.split_percentage) || '-'}%)`, f$(a.agent_gross))}
      {line('Brokerage split', f$(a.brokerage_split))}
      {n(a.btsa_amount) > 0 && line('+ BTSA (no split)', f$(a.btsa_amount))}
      {n(a.processing_fee) > 0 && line('- Processing fee', `-${f$(a.processing_fee)}`)}
      {n(a.coaching_fee) > 0 && line('- Coaching fee', `-${f$(a.coaching_fee)}`)}
      {n(a.other_fees) > 0 && line(`- Other fees${a.other_fees_description ? ` (${a.other_fees_description})` : ''}`, `-${f$(a.other_fees)}`)}
      {n(a.rebate_amount) > 0 && line('- Rebate', `-${f$(a.rebate_amount)}`)}
      {a.is_additional_comp && line('Additional compensation', f$(a.agent_net), 'font-semibold')}
      {!a.is_additional_comp && line('1099 amount', f$(a.amount_1099_reportable), 'font-semibold')}
      {(a.staged || []).map((d: any, i: number) => (
        <div key={i}>{line(`- ${d.description || 'Debt'}`, `-${f$(d.amount_paid)}`, 'text-amber-700')}</div>
      ))}
      {line('Net to agent', f$(a.net_to_agent), 'font-semibold')}
      {(a.open_invoices || []).length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">
            Open invoices not collected on this deal ({a.open_invoices.length}) - {f$(a.open_invoices_total)}
          </p>
          {a.open_invoices.map((d: any, i: number) => (
            <div key={i}>
              {line(
                d.date_incurred ? `${d.description} (${d.date_incurred})` : d.description,
                f$(d.amount_remaining),
                'text-amber-700'
              )}
            </div>
          ))}
        </div>
      )}
      {showEcommission && ecAmount > 0 && (
        ecCovered
          ? <p className="text-xs text-amber-700 mt-2">eCommission Advance {f$(ecAmount)} - repayment is applied above.</p>
          : <p className="text-xs text-red-600 mt-2 font-semibold">eCommission Advance {f$(ecAmount)} reported on this deal but NO repayment is applied to this payout.</p>
      )}
      {a.adjustment_notes && (
        <p className="text-xs text-luxury-gray-3 mt-2">{a.adjustment_notes}</p>
      )}
    </div>
  )
}

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
  const checklist = data.checklist || []
  const checklistDone = checklist.filter((c: any) => c.completed).length
  const linkedAgents = data.linked_agents || []

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

        {checklist.length > 0 && (
          <div className="container-card">
            <h2 className="section-title mb-3">
              Checklist Status ({checklistDone} of {checklist.length} complete)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {checklist.map((c: any) => (
                <div key={c.id} className="flex justify-between gap-3 py-1 border-b border-luxury-gray-5/30">
                  <span className="text-xs text-luxury-gray-3">{c.label}</span>
                  <span className={`text-xs font-medium text-right whitespace-nowrap ${c.completed ? 'text-green-600' : 'text-amber-700'}`}>
                    {c.completed ? 'Complete' : 'Not complete'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(data.agents.length > 0 || linkedAgents.length > 0) && (
          <div className="container-card">
            <h2 className="section-title mb-3">Money on this Deal</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {data.agents.map((a: any) => (
                <AgentMoneyColumn key={a.id} a={a} txn={txn} showEcommission />
              ))}
            </div>
            {linkedAgents.length > 0 && (
              <div className="mt-5 pt-4 border-t border-luxury-gray-5/40">
                <p className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-3">
                  Paid inside the Collective Realty Co. amount
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {linkedAgents.map((a: any) => (
                    <AgentMoneyColumn key={a.id} a={a} txn={txn} showEcommission={false} />
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 pt-3 border-t border-luxury-gray-5/40">
              {line('Office net (deal)', f$(txn.office_net), 'font-semibold')}
            </div>
          </div>
        )}

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
