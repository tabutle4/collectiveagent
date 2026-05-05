'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { computeCommission } from '@/lib/transactions/math'

// ──────────────────────────────────────────────────────────────────────────
//  AgentCardFinancials
//
//  Financial breakdown section of an agent card on a transaction. Contains:
//   • THIS SIDE     — Sales Volume (when > 0), Office Gross
//   • SPLIT         — Agent Basis, Agent %, Brokerage %, Team Lead %
//   • ADJUSTMENTS   — BTSA (additive), Processing/Coaching/Other fees, Rebate
//   • TOTALS        — 1099 Amount, debt/credit preview, Agent Net
//
//  9 fields support inline override (click value → edit → blur to save):
//   Agent Basis, Agent Split %, Brokerage Split %, Agent Gross,
//   Brokerage Split $, Team Lead %, Other Fees, Rebate, BTSA
//
//  Override marker: amber * after field that was manually overridden;
//  click * to clear the override (back to computed default).
//
//  Locked fields (NOT editable): Processing Fee, Coaching Fee, Debts.
//  Use processing fee types (Settings) and Billing panel (credits) instead.
//
//  Cascade: editing any input field LIVE recomputes amount_1099 and
//  agent_net via canonical computeCommission(), so the totals are always
//  in sync with what's on screen.
//
//  Recalculate prompt: when overrides exist and admin clicks Recalculate,
//  caller is told (via onRecalculate) and the prompt shows in the parent.
// ──────────────────────────────────────────────────────────────────────────

const OVERRIDABLE_FIELDS = [
  'agent_basis',
  'split_percentage',
  'brokerage_split_percentage',
  'agent_gross',
  'brokerage_split',
  'team_lead_percentage',
  'other_fees',
  'rebate_amount',
  'btsa_amount',
  // Retainer rows only:
  'processing_fee',  // serves as office's retainer fee on retainer rows
] as const
export type OverridableField = typeof OVERRIDABLE_FIELDS[number]

function fmt$(n: number | string | null | undefined): string {
  const v = typeof n === 'number' ? n : (n ? parseFloat(String(n)) : 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(isFinite(v) ? v : 0)
}

function num(v: any): number {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : 0
}

interface OverridesMap { [field: string]: true }

// ──── OverridableMoneyRow ────
// Inline-editable row with override marker. Click value to edit, blur or
// Enter to save. Click amber * to clear an existing override.
function OverridableMoneyRow({
  label,
  pctSuffix,
  value,
  isMoney = true,
  isDeduction = false,
  isAddition = false,
  isOverridden = false,
  isMuted = false,
  isLocked = false,
  isEditable = true,
  onSave,
  onClearOverride,
  showZero = false,
}: {
  label: string
  pctSuffix?: string | null
  value: number | string | null | undefined
  isMoney?: boolean
  isDeduction?: boolean
  isAddition?: boolean
  isOverridden?: boolean
  isMuted?: boolean
  isLocked?: boolean
  isEditable?: boolean
  onSave?: (v: number | null) => void
  onClearOverride?: () => void
  showZero?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const numVal = num(value)
  if (!showZero && numVal === 0 && !isOverridden) return null

  const valueColor = isDeduction
    ? 'text-red-600'
    : isAddition
      ? 'text-green-600'
      : isMuted
        ? 'text-luxury-gray-3'
        : 'text-luxury-gray-1'

  const sign = isDeduction ? '-' : (isAddition ? '+' : '')

  const beginEdit = () => {
    if (!isEditable || isLocked) return
    setDraft(String(num(value)))
    setEditing(true)
  }
  const finishEdit = () => {
    if (onSave) {
      const parsed = draft === '' ? null : parseFloat(draft)
      onSave(parsed != null && Number.isFinite(parsed) ? parsed : null)
    }
    setEditing(false)
  }
  const cancelEdit = () => setEditing(false)

  return (
    <div className="flex justify-between items-center py-1 text-xs">
      <span className="text-luxury-gray-3 flex items-center gap-1.5">
        <span>{label}</span>
        {pctSuffix && <span className="text-luxury-gray-3 text-[11px]">{pctSuffix}</span>}
        {isOverridden && (
          <button
            type="button"
            onClick={onClearOverride}
            title="Manually overridden — click to clear"
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-200 text-amber-900 text-[9px] font-semibold hover:bg-amber-300"
          >*</button>
        )}
        {isLocked && (
          <span className="text-[10px] italic text-luxury-gray-4">(locked)</span>
        )}
      </span>
      {editing && isEditable && !isLocked ? (
        <input
          type="number"
          step="0.01"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={finishEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') finishEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
          className="text-xs font-mono w-24 text-right bg-white border border-luxury-accent rounded px-1.5 py-0.5"
        />
      ) : (
        <span
          onClick={beginEdit}
          className={`${valueColor} font-mono ${isEditable && !isLocked ? 'cursor-pointer hover:bg-luxury-gray-6 px-1 -mx-1 rounded' : ''}`}
          title={isEditable && !isLocked ? 'Click to edit' : undefined}
        >
          {sign}{isMoney ? fmt$(numVal) : numVal}
        </span>
      )}
    </div>
  )
}

function PercentRow({
  label,
  pctValue,
  dollarValue,
  isMuted = false,
  isOverridden = false,
  isEditable = true,
  onSavePct,
  onClearOverride,
}: {
  label: string
  pctValue: number | string | null | undefined
  dollarValue: number
  isMuted?: boolean
  isOverridden?: boolean
  isEditable?: boolean
  onSavePct?: (v: number | null) => void
  onClearOverride?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const pct = num(pctValue)

  const valueColor = isMuted ? 'text-luxury-gray-3' : 'text-luxury-gray-1'
  const beginEdit = () => {
    if (!isEditable) return
    setDraft(String(pct))
    setEditing(true)
  }
  const finishEdit = () => {
    if (onSavePct) {
      const parsed = draft === '' ? null : parseFloat(draft)
      onSavePct(parsed != null && Number.isFinite(parsed) ? parsed : null)
    }
    setEditing(false)
  }
  const cancelEdit = () => setEditing(false)

  return (
    <div className="flex justify-between items-center py-1 text-xs">
      <span className="text-luxury-gray-3 flex items-center gap-1.5">
        <span>{label}</span>
        {editing ? (
          <input
            type="number"
            step="0.01"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={finishEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') finishEdit()
              if (e.key === 'Escape') cancelEdit()
            }}
            className="text-[11px] font-mono w-14 text-right bg-white border border-luxury-accent rounded px-1 py-0"
          />
        ) : (
          <span
            onClick={beginEdit}
            className={`text-[11px] ${isEditable ? 'cursor-pointer hover:bg-luxury-gray-6 px-1 rounded' : ''}`}
            title={isEditable ? 'Click to edit %' : undefined}
          >{pct}%</span>
        )}
        {isOverridden && (
          <button
            type="button"
            onClick={onClearOverride}
            title="Manually overridden — click to clear"
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-200 text-amber-900 text-[9px] font-semibold hover:bg-amber-300"
          >*</button>
        )}
      </span>
      <span className={`${valueColor} font-mono`}>{fmt$(dollarValue)}</span>
    </div>
  )
}

// Compact section header
function SectionH({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider text-luxury-gray-4 font-semibold pb-1 mb-1.5 mt-3 first:mt-0 border-b border-luxury-gray-5/40">
      {children}
    </div>
  )
}

interface AgentCardFinancialsProps {
  agent: any              // TIA row
  txn: any                // transaction
  calc: any | null        // computed values from /api/admin/transactions/.../smart-calc
  isPaid: boolean
  // Live values from billing panel state for the preview line
  appliedDebts: number
  appliedCredits: number
  // Save handler — single field. The markOverridden flag is accepted for
  // historical reasons but ignored; we don't track per-field overrides.
  onSaveField: (field: OverridableField, value: number | null, markOverridden: boolean) => Promise<void>
  // Trigger a recalculate so the field reverts to the computed value.
  onClearOverride: (field: OverridableField) => Promise<void>
}

export default function AgentCardFinancials({
  agent: a,
  txn,
  calc,
  isPaid,
  appliedDebts,
  appliedCredits,
  onSaveField,
  onClearOverride,
}: AgentCardFinancialsProps) {
  // We don't track per-field overrides — the manual_overrides column was
  // removed. Always render as "not overridden" which hides the amber
  // asterisks. Inline edits still work (saved directly to the field) but
  // are overwritten on the next Recalculate.
  const overrides: OverridesMap = {} as OverridesMap
  const isRetainer = a.installment_kind === 'retainer'

  // Live values: optimistic overlay so editing one field shows updated
  // dependent fields before the server round-trip finishes.
  const [liveOverlay, setLiveOverlay] = useState<Partial<Record<OverridableField, number | null>>>({})

  useEffect(() => {
    // When the agent prop changes (after a save lands), drop the overlay.
    setLiveOverlay({})
  }, [a.id, a.agent_basis, a.agent_gross, a.brokerage_split, a.split_percentage, a.team_lead_commission, a.other_fees, a.rebate_amount, a.btsa_amount, a.processing_fee])

  const liveVal = (field: OverridableField, fallback: any) =>
    liveOverlay[field] !== undefined ? liveOverlay[field] : fallback

  // Helpers used in both retainer and commission layouts
  function handleRetainerSave(field: OverridableField, v: number | null) {
    return onSaveField(field, v, true).catch(() => {})
  }
  function handleRetainerClear(field: OverridableField) {
    return onClearOverride(field).catch(() => {})
  }

  // ─── RETAINER ROW LAYOUT ───────────────────────────────────────────────────
  // Simpler structure: just retainer amount, office's retainer fee, and net.
  // No splits, no team lead, no BTSA, no rebate.
  if (isRetainer) {
    const retainerAmount = num(liveVal('agent_basis', a.agent_basis))
    const retainerFee = num(a.processing_fee)
    const debtsDeducted = num(a.debts_deducted)
    const amount1099 = retainerAmount - retainerFee
    const net = amount1099 - debtsDeducted - appliedDebts + appliedCredits
    const hasPreview = appliedDebts > 0 || appliedCredits > 0

    const editable = !isPaid

    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">Retainer</span>
        </div>

        <SectionH>Retainer</SectionH>
        <OverridableMoneyRow
          label="Retainer Amount"
          value={retainerAmount}
          isEditable={editable}
          isOverridden={!!overrides.agent_basis}
          onSave={v => handleRetainerSave('agent_basis', v)}
          onClearOverride={() => handleRetainerClear('agent_basis')}
          showZero
        />
        <OverridableMoneyRow
          label="Office Retainer Fee"
          value={retainerFee}
          isDeduction
          isEditable={editable}
          onSave={v => handleRetainerSave('processing_fee', v)}
          showZero
        />

        <div className="border-t border-luxury-gray-5/50 mt-3 pt-2 space-y-1">
          <div className="flex justify-between items-center text-xs">
            <span className="text-luxury-gray-3">1099 Amount</span>
            <span className="text-luxury-gray-2 font-mono">{fmt$(amount1099)}</span>
          </div>
          {debtsDeducted > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-luxury-gray-3">- Debts (saved)</span>
              <span className="text-red-500 font-mono">-{fmt$(debtsDeducted)}</span>
            </div>
          )}
          {appliedDebts > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-luxury-gray-3">- Debts (selected)</span>
              <span className="text-orange-600 font-mono">-{fmt$(appliedDebts)}</span>
            </div>
          )}
          {appliedCredits > 0 && (
            <div className="flex justify-between items-center text-xs">
              <span className="text-luxury-gray-3">+ Credits (selected)</span>
              <span className="text-green-600 font-mono">+{fmt$(appliedCredits)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-luxury-gray-5/30">
            <span className="text-xs font-semibold text-luxury-gray-2">
              Agent Net{hasPreview ? ' (preview)' : ''}
            </span>
            <span className="text-sm font-bold text-luxury-accent font-mono">
              {fmt$(net)}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // Helper for the retainer layout to save a simple field

  // ─── COMMISSION ROW LAYOUT (continues below) ──────────────────────────────

  // Resolved field values (live overlay → row → calc fallback)
  const agentBasis = num(liveVal('agent_basis', a.agent_basis ?? calc?.agent_basis))
  // brokerage_split_percentage and team_lead_percentage are NOT real columns
  // on transaction_internal_agents — they're derived from the dollar amounts.
  // split_percentage IS a real column.
  const splitPct = num(liveVal('split_percentage', a.split_percentage ?? calc?.agent_split_pct))
  const agentGross = num(liveVal('agent_gross', a.agent_gross ?? calc?.agent_gross))
  const brokerageSplit = num(liveVal('brokerage_split', a.brokerage_split ?? calc?.brokerage_split))
  const teamLeadComm = num(a.team_lead_commission ?? calc?.team_lead_payout)
  // Derive %s from the $ amounts and basis. Always accurate since every
  // recalc writes the dollars.
  const brokerageSplitPct = num(
    liveVal(
      'brokerage_split_percentage',
      agentBasis > 0 ? (brokerageSplit / agentBasis) * 100 : (100 - splitPct)
    )
  )
  const teamLeadPct = num(
    liveVal(
      'team_lead_percentage',
      agentBasis > 0 ? (teamLeadComm / agentBasis) * 100 : (calc?.team_lead_pct ?? 0)
    )
  )
  const otherFees = num(liveVal('other_fees', a.other_fees))
  const rebate = num(liveVal('rebate_amount', a.rebate_amount))
  const btsa = num(liveVal('btsa_amount', a.btsa_amount))

  const processingFee = num(a.processing_fee ?? calc?.processing_fee)
  const coachingFee = num(a.coaching_fee ?? calc?.coaching_fee)
  const debtsDeducted = num(a.debts_deducted)
  const salesVolume = num(a.sales_volume)

  // LIVE recompute — always uses canonical formula
  const live = computeCommission({
    agent_gross: agentGross,
    btsa_amount: btsa,
    processing_fee: processingFee,
    coaching_fee: coachingFee,
    other_fees: otherFees,
    rebate_amount: rebate,
    credits_applied: 0,
    debts_deducted: 0,
  })
  const amount1099 = live.amount_1099
  const agentNet = live.agent_net

  // Preview when items are checked in billing panel
  const netWithBilling = amount1099 - debtsDeducted - appliedDebts + appliedCredits
  const hasPreview = appliedDebts > 0 || appliedCredits > 0

  // Cascade: when a percentage or basis changes, derive the dependents
  // optimistically and call save with the right field.
  const cascade = (field: OverridableField, newVal: number | null) => {
    const next = { ...liveOverlay, [field]: newVal }
    if (field === 'split_percentage' && newVal != null) {
      // Agent gross, brokerage split, brokerage_split_pct cascade
      const basis = num(next.agent_basis !== undefined ? next.agent_basis : agentBasis)
      next.agent_gross = (basis * newVal) / 100
      next.brokerage_split = basis - next.agent_gross
      next.brokerage_split_percentage = 100 - newVal
    }
    if (field === 'brokerage_split_percentage' && newVal != null) {
      const basis = num(next.agent_basis !== undefined ? next.agent_basis : agentBasis)
      next.brokerage_split = (basis * newVal) / 100
      next.agent_gross = basis - next.brokerage_split
      next.split_percentage = 100 - newVal
    }
    if (field === 'agent_basis' && newVal != null) {
      const sp = num(next.split_percentage !== undefined ? next.split_percentage : splitPct)
      next.agent_gross = (newVal * sp) / 100
      next.brokerage_split = newVal - next.agent_gross
    }
    if (field === 'agent_gross' && newVal != null) {
      const basis = num(next.agent_basis !== undefined ? next.agent_basis : agentBasis)
      if (basis > 0) {
        next.split_percentage = (newVal / basis) * 100
        next.brokerage_split = basis - newVal
        next.brokerage_split_percentage = 100 - next.split_percentage
      }
    }
    if (field === 'brokerage_split' && newVal != null) {
      const basis = num(next.agent_basis !== undefined ? next.agent_basis : agentBasis)
      if (basis > 0) {
        next.brokerage_split_percentage = (newVal / basis) * 100
        next.agent_gross = basis - newVal
        next.split_percentage = 100 - next.brokerage_split_percentage
      }
    }
    setLiveOverlay(next)
  }

  const handleSave = async (field: OverridableField, newVal: number | null) => {
    cascade(field, newVal)
    try {
      await onSaveField(field, newVal, true)
    } catch (e) {
      // On failure drop overlay so user sees current state
      setLiveOverlay({})
    }
  }

  const handleClear = async (field: OverridableField) => {
    setLiveOverlay({})
    try {
      await onClearOverride(field)
    } catch {
      // ignore
    }
  }

  const editable = !isPaid

  return (
    <div className="space-y-0.5">
      {/* THIS SIDE */}
      <SectionH>This Side</SectionH>
      {salesVolume > 0 && (
        <OverridableMoneyRow
          label="Sales Volume"
          value={salesVolume}
          isEditable={false}
          showZero
        />
      )}
      <OverridableMoneyRow
        label="Office Gross"
        value={num(txn?.office_gross)}
        isEditable={false}
        showZero
      />

      {/* SPLIT */}
      <SectionH>Split</SectionH>
      <OverridableMoneyRow
        label="Agent Basis"
        value={agentBasis}
        isEditable={editable}
        isOverridden={!!overrides.agent_basis}
        onSave={v => handleSave('agent_basis', v)}
        onClearOverride={() => handleClear('agent_basis')}
        showZero
      />
      <PercentRow
        label="Agent"
        pctValue={splitPct}
        dollarValue={agentGross}
        isEditable={editable}
        isOverridden={!!overrides.split_percentage || !!overrides.agent_gross}
        onSavePct={v => handleSave('split_percentage', v)}
        onClearOverride={() => handleClear('split_percentage')}
      />
      {/* Brokerage row hidden on linked rows (team_lead, momentum_partner).
          Those rows only carry the carved-out commission for that role; the
          brokerage cut already lives on the source primary's row, so this
          row would render as "Brokerage 95% / $0.00" which is misleading. */}
      {a.agent_role !== 'team_lead' && a.agent_role !== 'momentum_partner' && (
        <PercentRow
          label="Brokerage"
          pctValue={brokerageSplitPct || (100 - splitPct)}
          dollarValue={brokerageSplit}
          isEditable={editable}
          isMuted
          isOverridden={!!overrides.brokerage_split_percentage || !!overrides.brokerage_split}
          onSavePct={v => handleSave('brokerage_split_percentage', v)}
          onClearOverride={() => handleClear('brokerage_split_percentage')}
        />
      )}
      {teamLeadPct > 0 || teamLeadComm > 0 ? (
        <PercentRow
          label="Team Lead"
          pctValue={teamLeadPct}
          dollarValue={teamLeadComm}
          isEditable={editable}
          isOverridden={!!overrides.team_lead_percentage}
          onSavePct={v => handleSave('team_lead_percentage', v)}
          onClearOverride={() => handleClear('team_lead_percentage')}
        />
      ) : null}

      {/* ADJUSTMENTS */}
      <SectionH>Adjustments</SectionH>
      {/* BTSA: always visible when editable so admin can enter from $0.
          When read-only, only show if there's an actual value. */}
      {(btsa > 0 || editable) && (
        <OverridableMoneyRow
          label="BTSA"
          value={btsa}
          isAddition
          isEditable={editable}
          isOverridden={!!overrides.btsa_amount}
          onSave={v => handleSave('btsa_amount', v)}
          onClearOverride={() => handleClear('btsa_amount')}
          showZero
        />
      )}
      {processingFee > 0 && (
        <OverridableMoneyRow
          label="Processing Fee"
          value={processingFee}
          isDeduction
          isLocked
          isEditable={false}
          showZero
        />
      )}
      {coachingFee > 0 && (
        <OverridableMoneyRow
          label="Coaching Fee"
          value={coachingFee}
          isDeduction
          isLocked
          isEditable={false}
          showZero
        />
      )}
      <OverridableMoneyRow
        label="Other Fees"
        value={otherFees}
        isDeduction
        isEditable={editable}
        isOverridden={!!overrides.other_fees}
        onSave={v => handleSave('other_fees', v)}
        onClearOverride={() => handleClear('other_fees')}
      />
      <OverridableMoneyRow
        label="Rebate"
        value={rebate}
        isDeduction
        isEditable={editable}
        isOverridden={!!overrides.rebate_amount}
        onSave={v => handleSave('rebate_amount', v)}
        onClearOverride={() => handleClear('rebate_amount')}
      />

      {/* TOTALS — billing panel goes between adjustments and totals (rendered by parent) */}
      <div className="border-t border-luxury-gray-5/50 mt-3 pt-2 space-y-1">
        <div className="flex justify-between items-center text-xs">
          <span className="text-luxury-gray-3">1099 Amount</span>
          <span className="text-luxury-gray-2 font-mono">{fmt$(amount1099)}</span>
        </div>
        {debtsDeducted > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-luxury-gray-3">- Debts (saved)</span>
            <span className="text-red-500 font-mono">-{fmt$(debtsDeducted)}</span>
          </div>
        )}
        {appliedDebts > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-luxury-gray-3">- Debts (selected)</span>
            <span className="text-orange-600 font-mono">-{fmt$(appliedDebts)}</span>
          </div>
        )}
        {appliedCredits > 0 && (
          <div className="flex justify-between items-center text-xs">
            <span className="text-luxury-gray-3">+ Credits (selected)</span>
            <span className="text-green-600 font-mono">+{fmt$(appliedCredits)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-1 border-t border-luxury-gray-5/30">
          <span className="text-xs font-semibold text-luxury-gray-2">
            Agent Net{hasPreview ? ' (preview)' : ''}
          </span>
          <span className="text-sm font-bold text-luxury-accent font-mono">
            {fmt$(netWithBilling)}
          </span>
        </div>
      </div>
    </div>
  )
}
