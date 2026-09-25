import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import {
  type LedgerCategory,
  LEDGER_CATEGORIES,
  ledgerCategoryLabel,
  ledgerDirection,
  signedAmount,
  entryTypeForCategory,
  DEFAULT_LEDGER_ACCOUNT,
} from '@/lib/payouts/ledger'
import { normalizePaymentMethod, paymentMethodLabel } from '@/lib/transactions/constants'

export const dynamic = 'force-dynamic'

// The payouts account ledger: every line explains the balance, and the balance
// is their sum.
//
// Courtney reads this through the Full ledger link on her day view, so every
// row carries a plain-English label and no raw category reaches a screen.
//
// Child rows (the per-deal lines under a sweep) are nested under their parent
// rather than listed flat, so a reader sees one bank line that opens into the
// deals behind it. Only parents count toward the running balance; counting both
// would double every sweep.

type LedgerRow = {
  id: string
  entry_date: string
  category: string
  category_label: string
  direction: 'in' | 'out' | 'none'
  description: string
  amount: number
  transaction_id: string | null
  /** The deal's address, resolved from `transactions`, not from the check. */
  property_address: string | null
  /** Who was paid, when the line names one. */
  agent_name: string | null
  bank_reference: string | null
  payment_method: string | null
  payment_method_label: string
  reconciled: boolean
  notes: string | null
  children: LedgerRow[]
  /**
   * On a sweep: what the screen was warning about when it was confirmed.
   * Recording these and never showing them would be half a control, so they
   * come back with the entry.
   */
  warnings: { transaction_id: string | null; property_address: string | null; warning: string }[]
}

function shape(
  r: any,
  children: LedgerRow[] = [],
  warnings: LedgerRow['warnings'] = [],
  lookups?: { address: Map<string, string>; agent: Map<string, string> }
): LedgerRow {
  return {
    id: r.id,
    entry_date: r.entry_date,
    category: r.category,
    category_label: ledgerCategoryLabel(r.category),
    direction: ledgerDirection(r.category),
    description: r.description,
    amount: Number(r.amount || 0),
    transaction_id: r.transaction_id ?? null,
    property_address: (r.transaction_id && lookups?.address.get(r.transaction_id)) || null,
    agent_name: (r.agent_id && lookups?.agent.get(r.agent_id)) || null,
    bank_reference: r.bank_reference ?? null,
    payment_method: r.payment_method ?? null,
    payment_method_label: paymentMethodLabel(r.payment_method),
    reconciled: !!r.reconciled,
    notes: r.notes ?? null,
    children,
    warnings,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_ledger')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const single = searchParams.get('date')
    const today = getCentralDateString()

    // One day for Courtney's popup, a range for the ledger page.
    const from = single || searchParams.get('from') || today
    const to = single || searchParams.get('to') || today

    // Whether the ledger has been opened at all. The page needs it to decide
    // between offering Start the ledger and offering Catch up the ledger, and
    // an empty entry list on its own cannot tell those apart from a quiet week.
    const { data: settingsRow } = await supabaseAdmin
      .from('company_settings')
      .select('id, ledger_start_date')
      .limit(1)
      .maybeSingle()
    const ledgerStart = settingsRow?.ledger_start_date
      ? String(settingsRow.ledger_start_date).slice(0, 10)
      : null
    const ledgerStarted = !!ledgerStart

    const rows = await fetchAllRows<any>(
      'brokerage_ledger',
      'id, entry_date, entry_type, category, subcategory, description, amount, transaction_id, agent_id, parent_entry_id, bank_reference, bank_date, payment_method, reconciled, notes, created_at',
      {
        filters: [
          { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
          // `from` is widened to the start date when the requested window
          // reaches back before the ledger opened, so the register never lists
          // a line the opening balance already accounts for.
          { type: 'gte', column: 'entry_date', value: ledgerStart && from < ledgerStart ? ledgerStart : from },
          { type: 'lte', column: 'entry_date', value: to },
        ],
      }
    )

    const all = rows || []
    const childrenByParent: Record<string, any[]> = {}
    for (const r of all) {
      if (r.parent_entry_id) (childrenByParent[r.parent_entry_id] ||= []).push(r)
    }

    const parents = all
      .filter(r => !r.parent_entry_id)
      .sort(
        (a, b) =>
          String(b.entry_date).localeCompare(String(a.entry_date)) ||
          String(b.created_at || '').localeCompare(String(a.created_at || ''))
      )

    // One query for every sweep in the window rather than one per entry.
    const sweepIds = parents.filter(p => p.category === 'sweep').map(p => p.id)
    const warningsByEntry: Record<string, LedgerRow['warnings']> = {}
    if (sweepIds.length > 0) {
      // fetchAllRows: one sweep can carry several warnings per deal, so this
      // table grows faster than the sweeps themselves and an .in() list does
      // not lift the 1,000-row cap.
      const warningRows = await fetchAllRows<{
        ledger_entry_id: string
        transaction_id: string | null
        property_address: string | null
        warning: string
      }>('sweep_warnings', 'ledger_entry_id, transaction_id, property_address, warning', {
        filters: [{ type: 'in', column: 'ledger_entry_id', value: sweepIds }],
      })
      for (const w of warningRows || []) {
        ;(warningsByEntry[w.ledger_entry_id] ||= []).push({
          transaction_id: w.transaction_id ?? null,
          property_address: w.property_address ?? null,
          warning: w.warning,
        })
      }
    }

    // Address and agent are resolved here rather than frozen into the
    // description at posting time. A description written months ago cannot
    // follow a corrected address, and the ledger has always stored the ids
    // needed to look both up - it just never sent them.
    const txnIdsOnRows = Array.from(
      new Set(all.map(r => r.transaction_id).filter((v: any): v is string => !!v))
    )
    const agentIdsOnRows = Array.from(
      new Set(all.map(r => r.agent_id).filter((v: any): v is string => !!v))
    )
    // Both lookups are chunked. `fetchAllRows` pages the response, but the id
    // list goes into one `.in()` and PostgREST carries its filters in the
    // query string, so the REQUEST grows with the number of ids. A wide date
    // window on a busy ledger would build a URL past the 8 KB request line
    // that common proxies default to, and it would fail as the ledger grew
    // rather than on the day it shipped.
    const ID_CHUNK = 100
    const addressByTxn = new Map<string, string>()
    for (let i = 0; i < txnIdsOnRows.length; i += ID_CHUNK) {
      const txnRows = await fetchAllRows<{ id: string; property_address: string | null }>(
        'transactions',
        'id, property_address',
        { filters: [{ type: 'in', column: 'id', value: txnIdsOnRows.slice(i, i + ID_CHUNK) }] }
      )
      for (const t of txnRows || []) {
        if (t.property_address) addressByTxn.set(t.id, t.property_address)
      }
    }
    const agentNameById = new Map<string, string>()
    for (let i = 0; i < agentIdsOnRows.length; i += ID_CHUNK) {
      const userRows = await fetchAllRows<{
        id: string
        first_name: string | null
        last_name: string | null
        preferred_first_name: string | null
        preferred_last_name: string | null
      }>('users', 'id, first_name, last_name, preferred_first_name, preferred_last_name', {
        filters: [{ type: 'in', column: 'id', value: agentIdsOnRows.slice(i, i + ID_CHUNK) }],
      })
      for (const u of userRows || []) {
        // Preferred name first, matching how every other screen addresses an
        // agent.
        const first = u.preferred_first_name || u.first_name || ''
        const last = u.preferred_last_name || u.last_name || ''
        const name = `${first} ${last}`.trim()
        if (name) agentNameById.set(u.id, name)
      }
    }
    const lookups = { address: addressByTxn, agent: agentNameById }

    const entries = parents.map(p =>
      shape(
        p,
        (childrenByParent[p.id] || [])
          .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
          .map(c => shape(c, [], [], lookups)),
        warningsByEntry[p.id] || [],
        lookups
      )
    )

    // Opening balance is everything before the window; only parents count.
    // fetchAllRows has no 'lt', so ask for on or before the previous day.
    const dayBefore = new Date(`${from}T00:00:00Z`)
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    const priorCutoff = dayBefore.toISOString().slice(0, 10)

    // The same start-date floor `ledgerBalance` applies, and for the same
    // reason. Rows can exist from before the ledger was opened, and the
    // opening balance is the bank's own figure, which already contains
    // whatever they describe.
    //
    // This register and the Payouts Report must never disagree about one bank
    // account. Flooring one and not the other is exactly how that happens: on
    // live data three surviving pre-start rows would have put Money Movement
    // $1,012.69 above the figure the report shows, permanently.
    const priorFilters: Array<{ type: string; column: string; value: unknown }> = [
      { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
      { type: 'lte', column: 'entry_date', value: priorCutoff },
    ]
    if (ledgerStart) {
      priorFilters.push({ type: 'gte', column: 'entry_date', value: ledgerStart })
    }

    const priorRows = await fetchAllRows<any>(
      'brokerage_ledger',
      'amount, category, parent_entry_id, entry_date',
      { filters: priorFilters as any }
    )
    const opening = (priorRows || [])
      .filter(r => !r.parent_entry_id)
      .reduce((s, r) => s + signedAmount(r.category, Number(r.amount || 0)), 0)

    const movement = entries.reduce((s, e) => s + signedAmount(e.category, e.amount), 0)

    const totals = {
      opening: Math.round(opening * 100) / 100,
      in: Math.round(entries.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0) * 100) / 100,
      out: Math.round(entries.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0) * 100) / 100,
      // Net of anything reversed in the window, so a sweep recorded and undone
      // on the same day reads as nothing moved rather than as money moved.
      swept: Math.round(
        (entries.filter(e => e.category === 'sweep').reduce((s, e) => s + e.amount, 0) -
          entries.filter(e => e.category === 'sweep_reversal').reduce((s, e) => s + e.amount, 0)) * 100
      ) / 100,
      closing: Math.round((opening + movement) * 100) / 100,
    }

    // ── What changed about our cut ──────────────────────────────────────────
    // Deliberately NOT ledger entries. A deal's cut moving does not move the
    // bank account by a penny - it changes what we are owed - so posting it to
    // the ledger would make the balance wrong. It belongs here because it is
    // the other half of "what happened", and it is the question somebody asks
    // when the figure on screen is higher than it was yesterday.
    //
    // Fetched a day wide on either side and then filtered exactly, because
    // occurred_at is a timestamp and the window is in Central business days.
    // Subtracting a fixed offset would be wrong for half the year.
    const wideFrom = new Date(`${from}T00:00:00Z`)
    wideFrom.setUTCDate(wideFrom.getUTCDate() - 1)
    const wideTo = new Date(`${to}T00:00:00Z`)
    wideTo.setUTCDate(wideTo.getUTCDate() + 2)
    const centralDay = (ts: string) =>
      new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

    const activityRows = await fetchAllRows<{
      id: string
      transaction_id: string
      occurred_at: string
      old_value: string | null
      new_value: string | null
    }>('transaction_activity', 'id, transaction_id, occurred_at, old_value, new_value', {
      filters: [
        { type: 'eq', column: 'field', value: 'office_net' },
        { type: 'gte', column: 'occurred_at', value: wideFrom.toISOString() },
        { type: 'lte', column: 'occurred_at', value: wideTo.toISOString() },
      ],
      orderBy: { column: 'occurred_at', ascending: false },
    })

    const inWindow = (activityRows || []).filter(r => {
      const day = centralDay(r.occurred_at)
      return day >= from && day <= to
    })

    const crcTxnIds = Array.from(new Set(inWindow.map(r => r.transaction_id)))
    const crcAddress = new Map<string, string>()
    for (let i = 0; i < crcTxnIds.length; i += ID_CHUNK) {
      const rowsT = await fetchAllRows<{ id: string; property_address: string | null }>(
        'transactions',
        'id, property_address',
        { filters: [{ type: 'in', column: 'id', value: crcTxnIds.slice(i, i + ID_CHUNK) }] }
      )
      for (const t of rowsT || []) {
        if (t.property_address) crcAddress.set(t.id, t.property_address)
      }
    }

    // One line per deal, not one per edit. Somebody who changed a fee three
    // times in a morning moved the cut once as far as anyone reading this
    // cares: from where it started to where it ended up.
    const byDeal = new Map<
      string,
      { transaction_id: string; address: string | null; first_old: string | null; last_new: string | null; edits: number; last_at: string }
    >()
    // inWindow is newest first, so walking it backwards gives oldest first.
    for (let i = inWindow.length - 1; i >= 0; i--) {
      const r = inWindow[i]
      const existing = byDeal.get(r.transaction_id)
      if (!existing) {
        byDeal.set(r.transaction_id, {
          transaction_id: r.transaction_id,
          address: crcAddress.get(r.transaction_id) || null,
          first_old: r.old_value,
          last_new: r.new_value,
          edits: 1,
          last_at: r.occurred_at,
        })
      } else {
        existing.last_new = r.new_value
        existing.edits++
        existing.last_at = r.occurred_at
      }
    }

    const crcChanges = [...byDeal.values()]
      .map(d => {
        const was = Number(d.first_old || 0)
        const now = Number(d.last_new || 0)
        return {
          transaction_id: d.transaction_id,
          address: d.address,
          was: Math.round(was * 100) / 100,
          now: Math.round(now * 100) / 100,
          difference: Math.round((now - was) * 100) / 100,
          edits: d.edits,
          last_at: d.last_at,
        }
      })
      // A cut edited and put back where it started is not a change anybody
      // needs to read about.
      .filter(d => Math.abs(d.difference) > 0.004)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

    return NextResponse.json({
      from,
      to,
      entries,
      totals,
      started: ledgerStarted,
      start_date: ledgerStart,
      crc_changes: crcChanges,
      crc_change_total: Math.round(crcChanges.reduce((s, c) => s + c.difference, 0) * 100) / 100,
    })
  } catch (error: any) {
    console.error('Ledger read error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_ledger')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const category: LedgerCategory = body?.category
    const amount = Number(body?.amount)
    const description: string = String(body?.description || '').trim()
    const entryDate: string = body?.entry_date || getCentralDateString()

    if (!LEDGER_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: 'Unknown category' }, { status: 400 })
    }
    // Sweeps are recorded by the sweep route, which reads office net server
    // side. Letting one in here would accept an amount from the request body.
    // A reversal is the same money going the other way and belongs to the same
    // route, which also clears the swept stamps on the deals.
    if (category === 'sweep' || category === 'sweep_reversal') {
      return NextResponse.json(
        { error: 'Record a sweep, or undo one, from the sweep dialog rather than as a manual entry' },
        { status: 400 }
      )
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Enter an amount greater than zero' }, { status: 400 })
    }
    if (!description) {
      return NextResponse.json({ error: 'Enter a description' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('brokerage_ledger')
      .insert({
        entry_date: entryDate,
        entry_type: entryTypeForCategory(category),
        category,
        subcategory: body?.subcategory || null,
        description,
        amount: Math.round(amount * 100) / 100,
        transaction_id: body?.transaction_id || null,
        agent_id: body?.agent_id || null,
        bank_reference: body?.bank_reference || null,
        bank_date: body?.bank_date || entryDate,
        notes: body?.notes || null,
        external_source: body?.external_source || null,
        payment_method: normalizePaymentMethod(body?.payment_method),
        recorded_by: auth.user.id,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      .select('id')
      .single()
    if (error) throw error

    return NextResponse.json({ success: true, id: data.id })
  } catch (error: any) {
    console.error('Ledger write error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
