// lib/payouts/holds.ts
//
// Money that belongs to the payouts account but is not spendable yet: bank
// holds on uncleared checks, and payments in flight at Payload.
//
// Lifted out of the payouts report so the reconciliation screen compares
// against the same figures the report shows. Reconciliation exists to catch
// disagreement between the app and the bank; it cannot do that if it and the
// report disagree with each other first.
//
// Behaviour is identical to the report's inline version, including the two
// details that are easy to lose:
//   * "not cleared" uses the Central date, not UTC. After roughly 7pm Texas
//     time UTC has rolled over, and a check clearing tomorrow would read as
//     already cleared.
//   * A rejected check never lands, so it is neither a hold nor pending
//     Payload.

import { fetchAllRows } from '@/lib/supabase'
import { getCentralDateString } from '@/lib/timezone'

export type HoldCheck = {
  id: string
  property_address?: string | null
  check_from?: string | null
  check_amount?: number | string | null
  hold_amount?: number | string | null
  cleared_date?: string | null
  status?: string | null
  payment_method?: string | null
  payload_payment_link_id?: string | null
}

export type HoldLine = { check_id: string; label: string; amount: number }

export function isNotCleared(c: HoldCheck, today: string): boolean {
  return (!c.cleared_date || c.cleared_date > today) && c.status !== 'rejected'
}

/**
 * Per-check hold_amount on checks that have not cleared. Payload-method checks
 * are excluded because they are counted under pending Payload instead, and
 * counting them in both would overstate what is unavailable.
 */
export function computeAutoHolds(
  checks: HoldCheck[],
  today: string = getCentralDateString()
): { lines: HoldLine[]; total: number } {
  const lines = checks
    .filter(
      c =>
        c.payment_method !== 'payload' &&
        isNotCleared(c, today) &&
        (parseFloat(String(c.hold_amount ?? 0)) || 0) > 0
    )
    .map(c => ({
      check_id: c.id,
      label: c.property_address || c.check_from || 'Check',
      amount: parseFloat(String(c.hold_amount ?? 0)) || 0,
    }))

  return { lines, total: Math.round(lines.reduce((s, h) => s + h.amount, 0) * 100) / 100 }
}

export type PayloadPending = {
  commission_link: number
  retainer_link: number
  pm_rent: number
  other: number
  total: number
}

/**
 * Payments taken through Payload whose funds have not settled: commission and
 * retainer pay links, anything on another link, and tenant rent invoices the
 * funding-sync cron has not yet stamped as cleared.
 */
export async function computePayloadPending(
  checks: HoldCheck[],
  settings: { payload_commission_link_id?: string | null; payload_retainer_link_id?: string | null } | null,
  today: string = getCentralDateString()
): Promise<PayloadPending> {
  const pending = checks.filter(c => c.payment_method === 'payload' && isNotCleared(c, today))

  const commissionLinkId = settings?.payload_commission_link_id || null
  const retainerLinkId = settings?.payload_retainer_link_id || null
  const sum = (list: HoldCheck[]) =>
    list.reduce((s, c) => s + (parseFloat(String(c.check_amount ?? 0)) || 0), 0)

  const commission_link = commissionLinkId
    ? sum(pending.filter(c => c.payload_payment_link_id === commissionLinkId))
    : 0
  const retainer_link = retainerLinkId
    ? sum(pending.filter(c => c.payload_payment_link_id === retainerLinkId))
    : 0
  const other = sum(
    pending.filter(
      c =>
        c.payload_payment_link_id !== commissionLinkId &&
        c.payload_payment_link_id !== retainerLinkId
    )
  )

  const pendingRentInvoices = await fetchAllRows<{
    paid_amount: number | string | null
    total_amount: number | string | null
  }>('tenant_invoices', 'id, paid_amount, total_amount, payment_method, status, funds_cleared_at', {
    filters: [
      { type: 'eq', column: 'payment_method', value: 'payload' },
      { type: 'eq', column: 'status', value: 'paid' },
      { type: 'is', column: 'funds_cleared_at', value: null },
    ],
  })
  const pm_rent = (pendingRentInvoices || []).reduce(
    (s, inv) => s + (parseFloat(String(inv.paid_amount ?? inv.total_amount ?? 0)) || 0),
    0
  )

  const round = (n: number) => Math.round(n * 100) / 100
  return {
    commission_link: round(commission_link),
    retainer_link: round(retainer_link),
    pm_rent: round(pm_rent),
    other: round(other),
    total: round(commission_link + retainer_link + other + pm_rent),
  }
}
