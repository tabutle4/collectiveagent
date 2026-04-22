'use client'

import { useState, useEffect } from 'react'
import { X, AlertTriangle, CheckCircle } from 'lucide-react'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

const fmt$ = (n: number | null | undefined) => {
  if (n == null || (typeof n === 'number' && isNaN(n))) return '--'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(n))
}

const num = (v: any): number => parseFloat(v ?? 0) || 0

// Alias local usage to the central helper (preserves existing call sites)
const isLeaseType = isLeaseTransactionType

export default function CloseDialog({
  transactionId, transaction, agents, onClose, onClosed, userId,
}: {
  transactionId: string
  transaction: any
  agents: any[]
  onClose: () => void
  onClosed: () => void
  userId: string | null
}) {
  const [closedDate, setClosedDate] = useState(
    transaction?.closed_date || new Date().toISOString().slice(0, 10)
  )
  const [brokerages, setBrokerages] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingTebs, setLoadingTebs] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/transactions/${transactionId}?section=external_brokerages`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { external_brokerages: [] })
      .then(d => setBrokerages(d.external_brokerages || []))
      .catch(() => {})
      .finally(() => setLoadingTebs(false))
  }, [transactionId])

  // Compile warnings (warn-only; Close button is never blocked)
  const txnWarnings: string[] = []
  const agentWarnings: { agent: any; issues: string[] }[] = []
  const tebWarnings: { teb: any; issues: string[] }[] = []

  const isLease = isLeaseType(transaction?.transaction_type)

  if (!closedDate) txnWarnings.push('Closed date is not set')
  if (!isLease && !transaction?.sales_price) txnWarnings.push('Sales price is not set')
  if (isLease && !transaction?.monthly_rent) txnWarnings.push('Monthly rent is not set')
  if (!transaction?.gross_commission && !transaction?.office_gross) {
    txnWarnings.push('Gross commission / office gross is not set')
  }

  for (const a of agents || []) {
    const issues: string[] = []
    if (!a.commission_plan) issues.push('no commission plan')
    if (!a.agent_role) issues.push('no role')
    if (num(a.agent_net) === 0) issues.push('agent_net is $0')
    if (num(a.amount_1099_reportable) === 0 && a.agent_role !== 'team_lead' && a.agent_role !== 'momentum_partner') {
      issues.push('1099 reportable is $0')
    }
    // counts_toward_progress rule: should be true for primary/listing on non-lease
    const shouldCount = (a.agent_role === 'primary_agent' || a.agent_role === 'listing_agent') && !isLease
    if (shouldCount && !a.counts_toward_progress) {
      issues.push('counts_toward_progress is off (expected on for primary/listing on sales)')
    }
    if (issues.length > 0) agentWarnings.push({ agent: a, issues })
  }

  for (const teb of brokerages) {
    const issues: string[] = []
    if (!teb.brokerage_role) issues.push('no role')
    const commission = num(teb.commission_amount)
    if (commission >= 600) {
      if (!teb.w9_on_file) issues.push('W-9 not on file (1099 threshold reached)')
      if (!teb.federal_id_number) issues.push('Federal ID missing (1099 threshold reached)')
    }
    if (commission > 0 && num(teb.amount_1099_reportable) === 0) {
      issues.push('1099 reportable not set')
    }
    if (issues.length > 0) tebWarnings.push({ teb, issues })
  }

  const totalIssueCount = txnWarnings.length + agentWarnings.reduce((s, a) => s + a.issues.length, 0) + tebWarnings.reduce((s, t) => s + t.issues.length, 0)

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transactionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'close_transaction',
          closed_date: closedDate,
          userId: userId,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Close failed')
      }
      onClosed()
    } catch (e: any) {
      setError(e.message || 'Close failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-luxury-gray-5 px-4 py-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-luxury-gray-1">Close Transaction</h3>
          <button onClick={onClose} className="text-luxury-gray-3 hover:text-luxury-gray-1">
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="mb-4 p-3 bg-luxury-gray-5/30 rounded">
            <p className="text-xs text-luxury-gray-3 mb-2">This sets the transaction status to closed. Commissions and payments are not affected.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Closed date</label>
                <input
                  type="date"
                  value={closedDate}
                  onChange={e => setClosedDate(e.target.value)}
                  className="input-luxury text-xs w-full"
                />
              </div>
              <div>
                <label className="field-label">
                  {isLease ? 'Monthly rent' : 'Sales price'}
                </label>
                <p className="text-xs text-luxury-gray-1 py-1.5">
                  {isLease ? fmt$(transaction?.monthly_rent) : fmt$(transaction?.sales_price)}
                </p>
              </div>
              <div>
                <label className="field-label">Gross commission</label>
                <p className="text-xs text-luxury-gray-1 py-1.5">{fmt$(transaction?.gross_commission)}</p>
              </div>
              <div>
                <label className="field-label">Office gross</label>
                <p className="text-xs text-luxury-gray-1 py-1.5">{fmt$(transaction?.office_gross)}</p>
              </div>
            </div>
          </div>

          {loadingTebs && (
            <p className="text-xs text-luxury-gray-3 text-center py-2">Checking brokerages...</p>
          )}

          {!loadingTebs && totalIssueCount === 0 && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded mb-4">
              <CheckCircle size={14} className="text-green-700" />
              <p className="text-xs text-green-800">No warnings. Ready to close.</p>
            </div>
          )}

          {!loadingTebs && totalIssueCount > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded mb-2">
                <AlertTriangle size={14} className="text-amber-700" />
                <p className="text-xs text-amber-900 font-semibold">
                  {totalIssueCount} warning{totalIssueCount !== 1 ? 's' : ''} - you can still close
                </p>
              </div>

              {txnWarnings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Transaction</p>
                  <ul className="text-xs text-luxury-gray-2 space-y-0.5 list-disc list-inside">
                    {txnWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {agentWarnings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-luxury-gray-2 mb-1">Agents</p>
                  {agentWarnings.map(({ agent, issues }) => {
                    const name = agent.user
                      ? `${agent.user.preferred_first_name || agent.user.first_name || ''} ${agent.user.preferred_last_name || agent.user.last_name || ''}`.trim()
                      : '(no agent)'
                    return (
                      <div key={agent.id} className="mb-1.5">
                        <p className="text-xs text-luxury-gray-1">{name} ({agent.agent_role?.replace(/_/g, ' ')})</p>
                        <ul className="text-xs text-luxury-gray-3 ml-3 list-disc list-inside">
                          {issues.map((iss, i) => <li key={i}>{iss}</li>)}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}

              {tebWarnings.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-semibold text-luxury-gray-2 mb-1">External brokerages</p>
                  {tebWarnings.map(({ teb, issues }) => (
                    <div key={teb.id} className="mb-1.5">
                      <p className="text-xs text-luxury-gray-1">{teb.brokerage_name}</p>
                      <ul className="text-xs text-luxury-gray-3 ml-3 list-disc list-inside">
                        {issues.map((iss, i) => <li key={i}>{iss}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-luxury-gray-5 px-4 py-3 flex justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn btn-secondary text-xs px-3 py-1.5">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || loadingTebs} className="btn btn-primary text-xs px-3 py-1.5">
            {saving ? 'Closing...' : 'Close Transaction'}
          </button>
        </div>
      </div>
    </div>
  )
}
