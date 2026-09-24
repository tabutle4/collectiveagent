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
const MANAGED_PREFIXES = [
  'deposit:',
  'agent_payout:',
  'external_payout:',
  'payout_batch:',
] as const

export type PostingCounts = { added: number; reversed: number }

export type PostingResult = {
  started: boolean
  start_date: string | null
  deposits: PostingCounts
  agent_payouts: PostingCounts
  external_payouts: PostingCounts
  /** The Payload batch lines that group payouts into one bank debit. */
  batches: PostingCounts
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
  /**
   * The `payout_batch:` line this one belongs underneath, or null for a line
   * that stands on its own.
   *
   * Payload debits the bank ONCE for a whole run of payouts, so six payments
   * are one line on the statement. Posting six ledger lines against that debit
   * means nothing can ever be ticked off, which is the one job this ledger
   * exists to do. A line with a batch key becomes a child of the batch instead,
   * and children are excluded from the balance by `parent_entry_id`, exactly as
   * sweep children already are.
   */
  batch_key: string | null
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
    batches: empty(),
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
    amount: number | string | null
    parent_entry_id: string | null
  }>('brokerage_ledger', 'id, external_id, reconciled, amount, parent_entry_id', {
    filters: [{ type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT }],
  })

  const managed = new Map<
    string,
    { id: string; reconciled: boolean; amount: number; parentEntryId: string | null }
  >()
  for (const row of existingRows || []) {
    const key = row.external_id
    if (!key) continue
    if (!MANAGED_PREFIXES.some(p => key.startsWith(p))) continue
    managed.set(key, {
      id: row.id,
      reconciled: row.reconciled === true,
      amount: money(row.amount),
      parentEntryId: row.parent_entry_id ?? null,
    })
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
      batch_key: null,
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
    payload_funding_id: string | null
  }>(
    'transaction_internal_agents',
    'id, transaction_id, agent_id, agent_net, payment_status, payment_date, payment_method, payment_reference, payload_funding_id',
    { filters: [{ type: 'eq', column: 'payment_status', value: 'paid' }] }
  )

  // Addresses come from the DEAL, not from the check.
  //
  // This used to read `checks_received.property_address`, which is blank on 243
  // of the 343 payouts checks - 71%. That is why a real agent payout posted on
  // 2026-09-24 read "Agent commission" while the address sat on the
  // transaction the whole time. The check is a payment against a deal and does
  // not reliably carry the deal's address; `transactions.property_address`
  // does, and is what every other screen shows.
  const addressByTxn = new Map<string, string>()
  const txnIds = Array.from(payoutsTxnIds)
  // Chunked. `fetchAllRows` pages the RESPONSE but passes the id list straight
  // into one `.in()`, and PostgREST takes its filters in the query string, so
  // the REQUEST grows with the number of ids. There are 327 payouts
  // transactions today, which is roughly a 12 KB URL - past the 8 KB request
  // line that common proxies and servers default to, and it grows with every
  // deal. 100 at a time keeps each request small and costs 4 round trips.
  const TXN_CHUNK = 100
  for (let i = 0; i < txnIds.length; i += TXN_CHUNK) {
    const slice = txnIds.slice(i, i + TXN_CHUNK)
    const txnRows = await fetchAllRows<{ id: string; property_address: string | null }>(
      'transactions',
      'id, property_address',
      { filters: [{ type: 'in', column: 'id', value: slice }] }
    )
    for (const t of txnRows || []) {
      if (t.property_address) addressByTxn.set(t.id, t.property_address)
    }
  }
  // The check's address is a fallback only, for a deal whose transaction row
  // carries none.
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
      batch_key: a.payload_funding_id ? `payout_batch:${a.payload_funding_id}` : null,
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
    payload_funding_id: string | null
  }>(
    'transaction_external_brokerages',
    'id, transaction_id, brokerage_name, agent_name, commission_amount, payment_status, payment_date, payment_method, payment_reference, payload_funding_id',
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
      // An outside brokerage can ride in the same Payload run as the agents.
      // Tara, 2026-09-24: "they can but have not so far." Grouping on the
      // funding id rather than on who was paid means the day it happens, it
      // lands in the right batch with no change here.
      batch_key: e.payload_funding_id ? `payout_batch:${e.payload_funding_id}` : null,
    })
  }

  // ── Batch parents ─────────────────────────────────────────────────────────
  // One line per Payload funding transaction, carrying the total that actually
  // hit the bank. The payouts inside it become its children.
  //
  // The amount is recomputed from the members on EVERY run rather than written
  // once. A payout marked paid tomorrow joins a batch posted today, and a
  // parent whose total was stamped at creation would quietly disagree with the
  // statement from then on.
  type Batch = {
    external_id: string
    entry_date: string
    amount: number
    count: number
    /** True until a member that is not an outside brokerage payout turns up. */
    allExternal: boolean
  }
  const batches = new Map<string, Batch>()
  for (const line of wanted.values()) {
    if (!line.batch_key) continue
    const b = batches.get(line.batch_key) || {
      external_id: line.batch_key,
      entry_date: line.entry_date,
      amount: 0,
      count: 0,
      allExternal: true,
    }
    b.amount = money(b.amount + line.amount)
    b.count++
    if (line.category !== 'external_payout') b.allExternal = false
    // Members share Payload's settlement date. The earliest is taken anyway so
    // a stray date cannot push the bank line later than the debit it explains.
    if (line.entry_date < b.entry_date) b.entry_date = line.entry_date
    batches.set(line.batch_key, b)
  }

  const parentIdByKey = new Map<string, string>()

  for (const [key, b] of batches) {
    const fundingId = key.slice('payout_batch:'.length)
    const existing = managed.get(key)
    if (existing) {
      parentIdByKey.set(key, existing.id)
      continue
    }
    const { data: created, error: parentError } = await supabaseAdmin
      .from('brokerage_ledger')
      .insert({
        entry_date: b.entry_date,
        // A run of outside brokerage payments is filed as one, rather than as
        // "Paid an agent", which would be a plainly wrong sentence on the
        // register. Direction is 'out' for both, so the balance is the same
        // either way.
        entry_type: entryTypeForCategory(b.allExternal ? 'external_payout' : 'agent_payout'),
        category: b.allExternal ? 'external_payout' : 'agent_payout',
        description: `Payload payout run, ${b.count} payment${b.count === 1 ? '' : 's'}`,
        amount: b.amount,
        transaction_id: null,
        agent_id: null,
        // Every payout in a Payload run leaves by ACH. Naming it means the
        // register says how the money moved rather than leaving it blank.
        payment_method: normalizePaymentMethod('ach'),
        // The Payload funding id, so a statement line can be matched to the
        // exact batch without leaving the ledger.
        bank_reference: fundingId,
        bank_date: b.entry_date,
        external_source: 'auto',
        external_id: key,
        recorded_by: recordedBy || null,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      .select('id')
      .single()
    if (parentError) {
      // Another run created it between the read and the write. Re-read rather
      // than fail: the children below need its id.
      if ((parentError as any).code === '23505') {
        const { data: found } = await supabaseAdmin
          .from('brokerage_ledger')
          .select('id')
          .eq('external_id', key)
          .maybeSingle()
        if (found?.id) {
          parentIdByKey.set(key, found.id)
          continue
        }
      }
      throw parentError
    }
    parentIdByKey.set(key, created.id)
    result.batches.added++
  }

  // ── Insert what is missing ────────────────────────────────────────────────
  const toInsert = [...wanted.values()].filter(l => !managed.has(l.external_id))

  for (const line of toInsert) {
    // A line whose batch parent could not be established is held back rather
    // than posted loose. Posting it at the top level would put it in the
    // balance a second time the moment the parent appears.
    const parentId = line.batch_key ? parentIdByKey.get(line.batch_key) ?? null : null
    if (line.batch_key && !parentId) {
      result.left_for_review.push(`${line.external_id} (its Payload batch line could not be created)`)
      continue
    }
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
      parent_entry_id: parentId,
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
    if (wanted.has(key) || batches.has(key)) continue
    if (row.reconciled) {
      result.left_for_review.push(key)
      continue
    }
    // Deleting a batch parent takes its children with it: the
    // parent_entry_id foreign key is ON DELETE CASCADE.
    //
    // `row.reconciled` above is the PARENT's flag and says nothing about its
    // children. Cascading past a reconciled child would delete a line that has
    // been agreed against a bank statement, along with its reconciled_at and
    // reconciled_by, which is exactly what the guard above exists to prevent
    // and is not recoverable. So the children are checked before the parent is
    // removed.
    if (key.startsWith('payout_batch:')) {
      const { data: kids, error: kidsError } = await supabaseAdmin
        .from('brokerage_ledger')
        .select('id, reconciled')
        .eq('parent_entry_id', row.id)
      if (kidsError) throw kidsError
      const reconciledKids = (kids || []).filter(k => k.reconciled === true)
      if (reconciledKids.length > 0) {
        result.left_for_review.push(
          `${key} (no longer has any payouts, but ${reconciledKids.length} of its lines are reconciled, so it was left alone)`
        )
        continue
      }
    }
    const { error } = await supabaseAdmin.from('brokerage_ledger').delete().eq('id', row.id)
    if (error) throw error
    if (key.startsWith('deposit:')) result.deposits.reversed++
    else if (key.startsWith('payout_batch:')) result.batches.reversed++
    else if (key.startsWith('agent_payout:')) result.agent_payouts.reversed++
    else result.external_payouts.reversed++
  }

  // ── Adopt lines posted before their batch existed ─────────────────────────
  // A payout posted while its Payload batch id was still unknown sits at the
  // top level, where it counts toward the balance in its own right. Creating a
  // batch parent above it without moving it underneath would count the same
  // money twice - once in the parent's total and once in the loose line.
  //
  // This is not hypothetical: every agent payout posted before this patch is in
  // exactly that state, and picks up a batch the moment the reconciliation
  // stores its funding id.
  for (const line of wanted.values()) {
    if (!line.batch_key) continue
    const existing = managed.get(line.external_id)
    if (!existing) continue
    const parentId = parentIdByKey.get(line.batch_key)
    if (!parentId) continue
    if (existing.parentEntryId === parentId) continue
    if (existing.reconciled) {
      result.left_for_review.push(
        `${line.external_id} (reconciled, and it belongs under ${line.batch_key}; moving it would change an agreed period)`
      )
      continue
    }
    const { error } = await supabaseAdmin
      .from('brokerage_ledger')
      .update({ parent_entry_id: parentId, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) throw error
  }

  // ── Keep each batch total equal to what is inside it ──────────────────────
  // Done last, after inserts and withdrawals, so it settles on the finished
  // membership. A parent that disagrees with its children is a bank line that
  // disagrees with the statement, which is the failure this whole file exists
  // to prevent.
  for (const [key, b] of batches) {
    const parentId = parentIdByKey.get(key)
    if (!parentId) continue

    // The total is taken from the children that are ACTUALLY under this parent
    // in the database, read back fresh - not from the membership this run
    // intended.
    //
    // That distinction is the difference between a right and a wrong balance.
    // Intended membership includes lines that did not end up as children: a
    // reconciled line the adoption step above refused to move stays at the top
    // level and keeps counting in its own right, so adding its amount to the
    // parent as well subtracts the same money twice. Reading the children back
    // also makes this self-correcting - a run that died halfway, or two runs
    // racing (Mark Paid posts inline, and the cron and the catch-up button can
    // both be running), leaves a total that the next run recomputes from fact
    // rather than from a stale snapshot.
    const { data: kids, error: kidsError } = await supabaseAdmin
      .from('brokerage_ledger')
      .select('id, amount')
      .eq('parent_entry_id', parentId)
    if (kidsError) throw kidsError
    const childCount = (kids || []).length
    const childTotal = money((kids || []).reduce((sum, k) => sum + Number(k.amount || 0), 0))

    // Members that exist but never became children. Worth saying out loud: the
    // batch line is smaller than the bank debit it names.
    if (childCount < b.count) {
      result.left_for_review.push(
        `${key} (${b.count - childCount} of its ${b.count} payouts are not under it, so the batch line is short of the bank debit)`
      )
    }

    const existing = managed.get(key)
    // A parent created during THIS run was inserted with the intended total
    // and still needs correcting to the real one.
    const recordedAmount = existing ? existing.amount : b.amount
    const recordedReconciled = existing ? existing.reconciled : false

    if (recordedReconciled) {
      // Agreed against a statement already. Changing it would alter a signed
      // off period behind someone's back.
      if (Math.abs(recordedAmount - childTotal) > 0.004) {
        result.left_for_review.push(
          `${key} (reconciled, but its payouts now total ${childTotal.toFixed(2)} against a recorded ${recordedAmount.toFixed(2)})`
        )
      }
      continue
    }
    if (childCount === 0) continue
    if (Math.abs(recordedAmount - childTotal) <= 0.004) continue
    const { error } = await supabaseAdmin
      .from('brokerage_ledger')
      .update({
        amount: childTotal,
        description: `Payload payout run, ${childCount} payment${childCount === 1 ? '' : 's'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parentId)
    if (error) throw error
    // Deliberately not counted as added or reversed. Nothing was created or
    // removed - a total was brought back into line with its children, and
    // reporting it as a new line would overstate what the run did.
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
