'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import {
  computeLowCommissionFlags,
  type SideFlag,
} from '@/lib/transactions/lowCommissionFlag'

interface LowCommissionFlagPanelProps {
  transaction: any           // full txn record (needs type/sales_price/monthly_rent/listing+buying side commission)
  internalAgents: any[]      // TIA rows (need side, btsa_amount, id)
  onRefresh: () => void      // called after successful redistribute / undo
  canEdit: boolean           // gate the action buttons
}

export default function LowCommissionFlagPanel({
  transaction,
  internalAgents,
  onRefresh,
  canEdit,
}: LowCommissionFlagPanelProps) {
  const [settings, setSettings] = useState<{ btsa_min_sale_pct: number | null; btsa_min_lease_pct: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionFor, setActionFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/admin/settings', { credentials: 'include' })
        if (!res.ok) {
          // Use defaults silently if settings endpoint isn't accessible
          if (!cancelled) setSettings({ btsa_min_sale_pct: 3, btsa_min_lease_pct: 40 })
          return
        }
        const data = await res.json()
        if (cancelled) return
        const s = data?.settings
        setSettings({
          btsa_min_sale_pct: s?.btsa_min_sale_pct ?? 3,
          btsa_min_lease_pct: s?.btsa_min_lease_pct ?? 40,
        })
      } catch {
        if (!cancelled) setSettings({ btsa_min_sale_pct: 3, btsa_min_lease_pct: 40 })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const flags: SideFlag[] = settings
    ? computeLowCommissionFlags({
        transaction,
        internalAgents,
        settings,
      })
    : []

  // Only render flagged sides
  const flaggedOnly = flags.filter(f => f.flagged)

  const redistribute = useCallback(async (side: 'listing' | 'buying') => {
    if (!confirm(`Redistribute BTSA on the ${side} side?\n\nThis will update the transaction's ${side} side commission and reduce BTSA on the agent's row. Action will be recorded in transaction notes.`)) {
      return
    }
    setActionFor(side)
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transaction.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redistribute_btsa', side }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Redistribution failed')
      }
      const data = await res.json()
      if (data.warning) alert(data.warning)
      onRefresh()
    } catch (e: any) {
      setError(e.message || 'Redistribution failed')
    } finally {
      setActionFor(null)
    }
  }, [transaction.id, onRefresh])

  const undoRedistribution = useCallback(async (side: 'listing' | 'buying') => {
    // Prompt for the moved amount + tia id (simple inputs since
    // we don't have a structured audit log yet — note string is the source).
    const movedStr = prompt(`Undo: enter the moved amount that was previously redistributed on the ${side} side.`)
    if (!movedStr) return
    const moved = parseFloat(movedStr)
    if (!Number.isFinite(moved) || moved <= 0) {
      alert('Invalid amount')
      return
    }
    const tiaId = prompt('Enter the TIA row id that previously had BTSA reduced.')
    if (!tiaId) return
    if (!confirm(`Undo redistribution of $${moved.toFixed(2)} on the ${side} side?\n\nThis will reduce the side commission and add the amount back to BTSA. Action will be recorded in transaction notes.`)) {
      return
    }
    setActionFor(side + ':undo')
    setError(null)
    try {
      const res = await fetch(`/api/admin/transactions/${transaction.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'undo_redistribute_btsa',
          side,
          moved_amount: moved,
          tia_id: tiaId.trim(),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Undo failed')
      }
      onRefresh()
    } catch (e: any) {
      setError(e.message || 'Undo failed')
    } finally {
      setActionFor(null)
    }
  }, [transaction.id, onRefresh])

  if (loading || flaggedOnly.length === 0) return null

  return (
    <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 mb-3">
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle size={16} className="text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-900">Low commission flagged</p>
          <p className="text-xs text-amber-800 mt-0.5">
            {flaggedOnly.length === 1
              ? 'One side is below the configured threshold.'
              : 'Both sides are below the configured threshold.'}
          </p>
        </div>
      </div>

      {flaggedOnly.map(f => (
        <div key={f.side} className="mt-2 pl-6 text-xs">
          <p className="text-luxury-gray-1">{f.reason}</p>
          {canEdit && f.can_redistribute && (
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => redistribute(f.side)}
                disabled={actionFor === f.side}
                className="btn btn-secondary text-xs flex items-center gap-1"
              >
                <RefreshCw size={11} className={actionFor === f.side ? 'animate-spin' : ''} />
                {actionFor === f.side ? 'Redistributing...' : 'Apply redistribution'}
              </button>
              <button
                onClick={() => undoRedistribution(f.side)}
                disabled={actionFor === f.side + ':undo'}
                className="btn btn-secondary text-xs"
              >
                Undo prior redistribution
              </button>
            </div>
          )}
        </div>
      ))}

      {error && <p className="text-xs text-red-600 mt-2 pl-6">{error}</p>}
    </div>
  )
}
