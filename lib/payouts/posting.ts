// lib/payouts/posting.ts
//
// Automatic ledger posting for the payouts account.
//
// The settled spec (claude/payoutsledger-settled-spec.md, section 1) says
// deposits, agent payouts and outside brokerage payouts auto-post. Only the
// sweep and the earmark release were ever built, so the ledger recorded three
// kinds of event out of six and the balance could never equal the bank without
// someone typing it.
//
// DERIVED, NOT HOOKED. This does not hang off the writers. `checks_received`
// is written from six places (the admin transaction route, the agent
// transaction route, the funding-sync cron, the Payload webhook, inbound email
// and relink), so a hook in one place silently misses the other five, and a
// seventh writer added later misses it again. Instead this asks the question
// the other way round: which source records qualify, and which of those have
// no ledger line yet? A record the app can see can never be missed, whichever
// route wrote it, including a row edited straight in SQL.
//
// IDEMPOTENT BY CONSTRUCTION. Every derived line carries a deterministic
// `external_id` (`deposit:<check id>`), and `brokerage_ledger.external_id` has
// a unique constraint. Running this twice, or twice at once, cannot double
// post. That is what makes it safe to call from a cron, from a button and
// inline after Mark Paid all at once.
//
// THE START DATE IS THE WHOLE BACKFILL STORY. Nothing dated before
// `company_settings.ledger_start_date` is ever posted, and nothing at all is
// posted until that date is set. The opening balance is one line at whatever
// the bank actually says on the day the ledger starts, and that figure already
// contains every deposit and payout that came before it. Posting history on
// top of it would count the same money twice.

import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { DEFAULT_LEDGER_ACCOUNT, entryTypeForCategory, type LedgerCategory } from '@/lib/payouts/ledger'
import { normalizePaymentMethod } from '@/lib/transactions/constants'

/** Prefixes this module owns. A line with any other external_id is left alone. */
const MANAGED_PREFIXES = ['deposit:', 'agent_payout:', 'external_payout:'] as const

export type PostingCounts = { added: number; reversed: number }

export type PostingResult = {
  started: boolean
  start_date: string | null
  deposits: PostingCounts
  agent_payouts: PostingCounts
  external_payouts: PostingCounts
  /** Lines whose source stopped qualifying but which are reconciled, so they were left alone. */
  left_for_review: string[]
}

const empty = (): PostingCounts => ({ added: 0, reversed: 0 })

/** A date column may arrive as a date or a timestamp. The ledger stores dates. */
function dateOnly(v: string | null | undefined): string | null {
  if (!v) return null
  return String(v).slice(0, 10)
}

function money(v: unknown): number {
  const n = Number(v || 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

type DerivedLine = {
  external_id: string
  entry_date: string
  category: LedgerCategory
  description: string
  amount: number
  transaction_id: string | null
  agent_id: string | null
  payment_method: string | null
  bank_reference: string | null
}

/**
 * Read the date the ledger opens. Null means it has not been started, and
 * nothing posts until it has.
 */
export async function ledgerStartDate(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('company_settings')
    .select('id, ledger_start_date')
    .limit(1)
    .maybeSingle()
  return dateOnly(data?.ledger_start_date)
}

/**
 * Bring the payouts ledger up to date with what the app already knows.
 *
 * Safe to call as often as you like. Returns what it changed so a caller can
 * report it rather than claiming success blindly.
 */
export async function syncPayoutsLedger(recordedBy?: string | null): Promise<PostingResult> {
  const start = await ledgerStartDate()
  const result: PostingResult = {
    started: !!start,
    start_date: start,
    deposits: empty(),
    agent_payouts: empty(),
    external_payouts: empty(),
    left_for_review: [],
  }
  if (!start) return result

  // Every check that ever landed in the payouts account. Not date filtered
  // here: the transaction ids are needed whatever the date, because a deal
  // whose check predates the start date can still have an agent paid after it,
  // and that payout is still payouts-account money.
  const checks = await fetchAllRows<{
    id: string
    transaction_id: string | null
    property_address: string | null
    check_from: string | null
    check_amount: number | string | null
    cleared_date: string | null
    status: string | null
    payment_method: string | null
  }>(
    'checks_received',
    'id, transaction_id, property_address, check_from, check_amount, cleared_date, status, payment_method',
    { filters: [{ type: 'eq', column: 'funds_destination', value: 'payouts' }] }
  )

  const payoutsTxnIds = new Set(
    (checks || []).map(c => c.transaction_id).filter((v): v is string => !!v)
  )

  // Existing derived lines, by external_id, so we can tell added from present
  // and spot lines whose source stopped qualifying.
  const existingRows = await fetchAllRows<{
    id: string
    external_id: string | null
    reconciled: boolean | null
  }>('brokerage_ledger', 'id, external_id, reconciled', {
    filters: [{ type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT }],
  })

  const managed = new Map<string, { id: string; reconciled: boolean }>()
  for (const row of existingRows || []) {
    const key = row.external_id
    if (!key) continue
    if (!MANAGED_PREFIXES.some(p => key.startsWith(p))) continue
    managed.set(key, { id: row.id, reconciled: row.reconciled === true })
  }

  const wanted = new Map<string, DerivedLine>()

  // ── Deposits ──────────────────────────────────────────────────────────────
  // Money is in the bank on the clear date. Tara's rule, and it is also the
  // only date that is reliably present: 77 of 332 payouts checks carry no
  // deposited_date at all, so keying off that would silently skip them.
  //
  // A rejected check never landed, so it is not a deposit and never becomes
  // one.
  for (const c of checks || []) {
    const cleared = dateOnly(c.cleared_date)
    if (!cleared || cleared < start) continue
    if (c.status === 'rejected') continue
    const amount = money(c.check_amount)
    if (amount <= 0) continue
    const label = c.property_address || c.check_from || 'Check received'
    wanted.set(`deposit:${c.id}`, {
      external_id: `deposit:${c.id}`,
      entry_date: cleared,
      category: 'deposit',
      description: label,
      amount,
      transaction_id: c.transaction_id || null,
      agent_id: null,
      payment_method: normalizePaymentMethod(c.payment_method),
      bank_reference: null,
    })
  }

  // ── Agent payouts ─────────────────────────────────────────────────────────
  // Payload ACH payouts leave the payouts account. Tara stated this directly;
  // two comments in reconcile-payouts said the operating account and were
  // wrong. They are corrected in the same patch as this file.
  const agents = await fetchAllRows<{
    id: string
    transaction_id: string | null
    agent_id: string | null
    agent_net: number | string | null
    payment_status: string | null
    payment_date: string | null
    payment_method: string | null
    payment_reference: string | null
  }>(
    'transaction_internal_agents',
    'id, transaction_id, agent_id, agent_net, payment_status, payment_date, payment_method, payment_reference',
    { filters: [{ type: 'eq', column: 'payment_status', value: 'paid' }] }
  )

  const addressByTxn = new Map<string, string>()
  for (const c of checks || []) {
    if (c.transaction_id && c.property_address && !addressByTxn.has(c.transaction_id)) {
      addressByTxn.set(c.transaction_id, c.property_address)
    }
  }

  for (const a of agents || []) {
    const paid = dateOnly(a.payment_date)
    // Marked paid with no date. There is no day to post it to, so it cannot be
    // recorded, but it is money that left and staying quiet about it is how a
    // ledger drifts without anyone noticing. Surfaced rather than skipped.
    if (!paid && Number(a.agent_net || 0) > 0 && a.transaction_id && payoutsTxnIds.has(a.transaction_id)) {
      result.left_for_review.push(`agent_payout:${a.id} (marked paid with no payment date)`)
      continue
    }
    if (!paid || paid < start) continue
    if (!a.transaction_id || !payoutsTxnIds.has(a.transaction_id)) continue
    const amount = money(a.agent_net)
    if (amount <= 0) continue
    wanted.set(`agent_payout:${a.id}`, {
      external_id: `agent_payout:${a.id}`,
      entry_date: paid,
      category: 'agent_payout',
      description: addressByTxn.get(a.transaction_id) || 'Agent commission',
      amount,
      transaction_id: a.transaction_id,
      agent_id: a.agent_id || null,
      payment_method: normalizePaymentMethod(a.payment_method),
      bank_reference: a.payment_reference || null,
    })
  }

  // ── Outside brokerage payouts ─────────────────────────────────────────────
  const externals = await fetchAllRows<{
    id: string
    transaction_id: string | null
    brokerage_name: string | null
    agent_name: string | null
    commission_amount: number | string | null
    payment_status: string | null
    payment_date: string | null
    payment_method: string | null
    payment_reference: string | null
  }>(
    'transaction_external_brokerages',
    'id, transaction_id, brokerage_name, agent_name, commission_amount, payment_status, payment_date, payment_method, payment_reference',
    { filters: [{ type: 'eq', column: 'payment_status', value: 'paid' }] }
  )

  for (const e of externals || []) {
    const paid = dateOnly(e.payment_date)
    if (!paid || paid < start) continue
    if (!e.transaction_id || !payoutsTxnIds.has(e.transaction_id)) continue
    const amount = money(e.commission_amount)
    if (amount <= 0) continue
    const who = e.brokerage_name || e.agent_name || 'Outside brokerage'
    const where = addressByTxn.get(e.transaction_id)
    wanted.set(`external_payout:${e.id}`, {
      external_id: `external_payout:${e.id}`,
      entry_date: paid,
      category: 'external_payout',
      description: where ? `${who}, ${where}` : who,
      amount,
      transaction_id: e.transaction_id,
      agent_id: null,
      payment_method: normalizePaymentMethod(e.payment_method),
      bank_reference: e.payment_reference || null,
    })
  }

  // ── Insert what is missing ────────────────────────────────────────────────
  const toInsert = [...wanted.values()].filter(l => !managed.has(l.external_id))

  for (const line of toInsert) {
    const { error } = await supabaseAdmin.from('brokerage_ledger').insert({
      entry_date: line.entry_date,
      entry_type: entryTypeForCategory(line.category),
      category: line.category,
      description: line.description,
      amount: line.amount,
      transaction_id: line.transaction_id,
      agent_id: line.agent_id,
      payment_method: line.payment_method,
      bank_reference: line.bank_reference,
      bank_date: line.entry_date,
      external_source: 'auto',
      external_id: line.external_id,
      recorded_by: recordedBy || null,
      account: DEFAULT_LEDGER_ACCOUNT,
    })
    if (error) {
      // 23505 is the unique violation on external_id, which means another run
      // inserted it between the read and the write. That is the constraint
      // doing its job, not a failure.
      if ((error as any).code === '23505') continue
      throw error
    }
    if (line.category === 'deposit') result.deposits.added++
    else if (line.category === 'agent_payout') result.agent_payouts.added++
    else result.external_payouts.added++
  }

  // ── Withdraw what no longer qualifies ─────────────────────────────────────
  // A check rejected after it cleared, or a payment un-marked, means the line
  // should not be there. An UNRECONCILED derived line is removed, because it
  // was derived rather than typed and will be re-derived if the source comes
  // back. A RECONCILED line is never touched: it has been agreed against a
  // bank statement, and silently removing it would make a signed-off period
  // change behind someone's back. Those are reported instead.
  for (const [key, row] of managed) {
    if (wanted.has(key)) continue
    if (row.reconciled) {
      result.left_for_review.push(key)
      continue
    }
    const { error } = await supabaseAdmin.from('brokerage_ledger').delete().eq('id', row.id)
    if (error) throw error
    if (key.startsWith('deposit:')) result.deposits.reversed++
    else if (key.startsWith('agent_payout:')) result.agent_payouts.reversed++
    else result.external_payouts.reversed++
  }

  return result
}

/**
 * Best effort version for calling straight after a write, so the ledger is
 * current the moment someone marks a payment rather than on the next cron.
 *
 * Deliberately swallows its error: a ledger line failing to post must never
 * turn a successful agent payment into an error the caller reports as a
 * failure. The daily cron and the catch-up button both re-derive the same
 * line, so nothing is lost, and the failure is logged rather than hidden.
 */
export async function syncPayoutsLedgerQuietly(recordedBy?: string | null): Promise<void> {
  try {
    await syncPayoutsLedger(recordedBy)
  } catch (error: any) {
    console.error('Ledger auto-post failed, will retry on the next run:', error?.message || error)
  }
}
