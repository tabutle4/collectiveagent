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
  /** True once the ledger has been started, which makes `app` authoritative. */
  started: boolean
  start_date: string | null
  as_of: string
}

const round = (n: number) => Math.round(n * 100) / 100

/**
 * The payouts account balance according to the ledger, plus whether the ledger
 * has been started at all.
 *
 * Exported because the payouts report needs the same figure for its Bottom
 * Line. Three copies of a balance is how two screens come to disagree about
 * the same dollar, which is the whole reason this file exists, so the report
 * imports this rather than summing the ledger itself.
 *
 * Only parent entries count. The per-deal children under a sweep are detail
 * and would double every transfer.
 *
 * Lines dated BEFORE the start date are excluded, and this is load bearing
 * rather than tidy. Rows can exist in the table from before the ledger was
 * opened - trial entries, an earlier attempt, an import - and the opening
 * balance is the bank's own figure, which already contains whatever those
 * rows describe. Counting them as well states the same money twice. On live
 * data at the time of writing that was $14,272.99 of pre-start rows against a
 * real balance of $10,492.36, so the Bottom Line would have read more than
 * double.
 */
export async function ledgerBalance(): Promise<{
  balance: number
  started: boolean
  startDate: string | null
}> {
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('id, ledger_start_date')
    .limit(1)
    .maybeSingle()
  const startDate = settings?.ledger_start_date
    ? String(settings.ledger_start_date).slice(0, 10)
    : null

  // No start date means the ledger is not open, so it has no balance to give.
  // Returning a sum of whatever rows happen to exist would hand the report a
  // number that looks authoritative and is not.
  if (!startDate) return { balance: 0, started: false, startDate: null }

  const rows = await fetchAllRows<{
    amount: number | string
    category: string
    parent_entry_id: string | null
    entry_date: string | null
  }>('brokerage_ledger', 'amount, category, parent_entry_id, entry_date', {
    filters: [
      { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
      { type: 'gte', column: 'entry_date', value: startDate },
    ],
  })

  const balance = round(
    (rows || [])
      .filter(r => !r.parent_entry_id)
      .reduce((s, r) => s + signedAmount(r.category, Number(r.amount || 0)), 0)
  )

  return { balance, started: true, startDate }
}

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

  // One implementation, called. This was a second byte-for-byte copy of the
  // same reduce, which is the exact failure this file's header warns about.
  //
  // It also returns the start date, which is why the settings read above does
  // NOT ask for `ledger_start_date`. Selecting a column that does not exist
  // yet makes PostgREST answer 42703 and hands back a null row, and this
  // function does not check that error, so the typed bank balance, holds and
  // Payload figures would all quietly read zero if the code ever reached
  // production ahead of its migration.
  const ledgerState = await ledgerBalance()
  const ledger = ledgerState.balance

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
    started: ledgerState.started,
    start_date: ledgerState.startDate,
    as_of: today,
  }
}
