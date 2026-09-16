// lib/payouts/position.ts
//
// Where the payouts account stands right now, computed one way.
//
// Three surfaces need this figure and each had its own copy: the reconciliation
// screen, the nightly snapshot, and the overnight comparison on Money Movement.
// Three copies of a balance is how two screens come to disagree about the same
// dollar, which is the class of bug this whole build exists to remove.

import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { getCentralDateString } from '@/lib/timezone'
import { signedAmount, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'
import { computeAutoHolds, computePayloadPending, type HoldCheck, type PayloadPending } from '@/lib/payouts/holds'

export type PayoutsPosition = {
  /** What the statement was last typed as. */
  typed: { bank: number; holds: number; payload: number; total: number; updated_at: string | null }
  /** What the app works out from its own records. */
  app: { ledger: number; holds: number; payload: number; total: number }
  /** Our share that is in this account and has not been moved. */
  unswept: { amount: number; deals: number }
  hold_lines: { check_id: string; label: string; amount: number }[]
  payload_breakdown: PayloadPending
  /** Statement minus app. Zero when everything ties. */
  difference: number
  as_of: string
}

const round = (n: number) => Math.round(n * 100) / 100

export async function currentPosition(): Promise<PayoutsPosition> {
  const today = getCentralDateString()

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('id, bank_balance, bank_balance_updated_at, funds_on_hold, payload_pending_balance, payload_commission_link_id, payload_retainer_link_id')
    .limit(1)
    .maybeSingle()

  // transaction_id is selected because the unswept figure needs it. A field
  // read but not selected comes back undefined silently, which would make
  // unswept office net read as zero forever.
  const checks = await fetchAllRows<HoldCheck & { transaction_id: string | null }>(
    'checks_received',
    'id, transaction_id, property_address, check_from, check_amount, hold_amount, cleared_date, status, payment_method, payload_payment_link_id',
    { filters: [{ type: 'eq', column: 'funds_destination', value: 'payouts' }] }
  )

  const holds = computeAutoHolds(checks || [], today)
  const payload = await computePayloadPending(checks || [], settings, today)

  const ledgerRows = await fetchAllRows<{
    amount: number | string
    category: string
    parent_entry_id: string | null
  }>('brokerage_ledger', 'amount, category, parent_entry_id', {
    filters: [{ type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT }],
  })

  // Only parent entries count. The per-deal children under a sweep are detail
  // and would double every transfer.
  const ledger = round(
    (ledgerRows || [])
      .filter(r => !r.parent_entry_id)
      .reduce((s, r) => s + signedAmount(r.category, Number(r.amount || 0)), 0)
  )

  // Only a deal whose money actually landed in this account can be unswept.
  const payoutsTxnIds = Array.from(
    new Set((checks || []).map(c => c.transaction_id).filter((v): v is string => !!v))
  )
  let unsweptAmount = 0
  let unsweptDeals = 0
  if (payoutsTxnIds.length > 0) {
    const txns = await fetchAllRows<{
      id: string
      office_net: number | string | null
      office_net_swept_at: string | null
      status: string | null
    }>('transactions', 'id, office_net, office_net_swept_at, status', {
      filters: [{ type: 'in', column: 'id', value: payoutsTxnIds }],
    })
    for (const t of txns || []) {
      if (t.status === 'cancelled' || t.office_net_swept_at) continue
      const v = Number(t.office_net || 0)
      if (v === 0) continue
      unsweptAmount += v
      unsweptDeals += 1
    }
  }

  const typedBank = Number(settings?.bank_balance || 0)
  const typedHolds = Number(settings?.funds_on_hold || 0)
  const typedPayload = Number(settings?.payload_pending_balance || 0)
  const typedTotal = round(typedBank + typedHolds + typedPayload)
  const appTotal = round(ledger + holds.total + payload.total)

  return {
    typed: {
      bank: round(typedBank),
      holds: round(typedHolds),
      payload: round(typedPayload),
      total: typedTotal,
      updated_at: settings?.bank_balance_updated_at ?? null,
    },
    app: { ledger, holds: holds.total, payload: payload.total, total: appTotal },
    unswept: { amount: round(unsweptAmount), deals: unsweptDeals },
    hold_lines: holds.lines,
    payload_breakdown: payload,
    difference: round(typedTotal - appTotal),
    as_of: today,
  }
}
