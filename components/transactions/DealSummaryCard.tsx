'use client'

/**
 * Compact "Deal summary" card on the Overview tab. Renders a small label/
 * value grid with different fields for leases vs sales and admin vs agent.
 *
 * Sales show closing_date, leases show move_in_date (per Tara's note that
 * leases are qualified by move-in, not closed_date). Office gross is only
 * visible to broker/admin/ops and only when a payout total exists; agents
 * see "your cut" instead.
 */

import type { AppRole } from '@/lib/transactions/role'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

const fmt$ = (n: any): string => {
  const v = parseFloat(String(n ?? 0)) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(v)
}

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '--'
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '--'
  }
}

export default function DealSummaryCard({
  transaction,
  agents,
  role,
  currentUserId,
}: {
  transaction: any
  agents: any[]
  role: AppRole
  currentUserId: string | null
}) {
  const isLease = isLeaseTransactionType(transaction?.transaction_type)
  const canSeeOfficeGross = role === 'broker' || role === 'admin'

  // Client name: first contact with client-ish type, otherwise fall back
  const clientName = transaction?.client_name || '--'

  // Type label
  const typeLabel = isLease ? 'Lease' : 'Sale'

  // Price vs rent
  const priceLabel = isLease ? 'Monthly rent' : 'Sale price'
  const priceValue = isLease ? transaction?.monthly_rent : transaction?.sales_price

  // Date: closing for sales, move-in for leases
  const dateLabel = isLease ? 'Move-in' : 'Closing'
  const dateValue = isLease ? transaction?.move_in_date : transaction?.closed_date

  // Office gross = sum of agent_gross + brokerage splits (approximated from agents)
  const officeGross = agents.reduce((s: number, a: any) => {
    const gross = parseFloat(a.agent_gross || 0) || 0
    // Firm side of split — only primary/listing/co roles; approximation
    const firmSplit = gross && a.split_percentage
      ? (gross / (parseFloat(a.split_percentage) / 100)) *
        (1 - parseFloat(a.split_percentage) / 100)
      : 0
    return s + gross + (Number.isFinite(firmSplit) ? firmSplit : 0)
  }, 0)

  // Agent's own cut (for agent role)
  const mine = currentUserId
    ? agents.find((a: any) => a.agent_id === currentUserId)
    : null
  const myNet = mine ? parseFloat(mine.agent_net || 0) : 0

  return (
    <div id="deal-summary" className="container-card">
      <p className="field-label mb-2">Deal summary</p>
      <dl className="grid grid-cols-[auto_1fr] gap-y-1.5 gap-x-3 text-xs">
        <Row label="Client" value={clientName} />
        <Row label="Type" value={typeLabel} />
        <Row label={priceLabel} value={fmt$(priceValue)} />
        <Row label={dateLabel} value={fmtDate(dateValue)} />
        {canSeeOfficeGross && officeGross > 0 && (
          <Row label="Office gross" value={fmt$(officeGross)} />
        )}
        {role === 'agent' && mine && (
          <Row label="Your cut" value={fmt$(myNet)} />
        )}
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="field-label text-[10px] pt-0.5">{label}</dt>
      <dd className="text-luxury-gray-1 text-xs">{value}</dd>
    </>
  )
}
