import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { deriveComplianceForTransactions } from '@/lib/compliance/derive'
import { fetchChecklistProgress } from '@/lib/payouts/checklist'
import {
  type SweepGates,
  sweepRefusal,
  isSweepReady,
  waitingOn,
  sidesBadge,
} from '@/lib/payouts/sweep'
import { entryTypeForCategory, DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'

// Money as it belongs on a ledger line: always two decimals.
//
// NOT `fmtMoney` from lib/compliance/fieldGroups.tsx, which is the only
// exported one. That version omits minimumFractionDigits, so a round figure
// renders as "$1,000" with no cents - fine on a compliance form, wrong on a
// financial record. This matches the formatter the reconciliation cron uses
// for the same reason.
const fmtMoney = (v: any) => {
  const n = parseFloat(v ?? 0) || 0
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
import { normalizePaymentMethod } from '@/lib/transactions/constants'

export const dynamic = 'force-dynamic'

// Moving office net from the payouts account to the income account.
//
// Only money that actually reached the payouts account can be swept, which is
// why every query here filters checks on funds_destination = 'payouts'. A deal
// where title paid the payee directly never had money in this account, so it
// is not unswept, it is Paid at closing.
//
// Compliance comes from deriveComplianceForTransactions and nowhere else.

type SweepDeal = {
  transaction_id: string
  property_address: string | null
  office_net: number
  gates: SweepGates
  ready: boolean
  refusal: string | null
  waiting_on: string[]
  sides_badge: string | null
  last_cleared_date: string | null
}

async function loadSweepable(): Promise<SweepDeal[]> {
  const today = getCentralDateString()

  const checks = await fetchAllRows<{
    transaction_id: string | null
    cleared_date: string | null
    status: string | null
    funds_destination: string | null
  }>('checks_received', 'transaction_id, cleared_date, status, funds_destination', {
    filters: [{ type: 'eq', column: 'funds_destination', value: 'payouts' }],
  })

  const byTxn: Record<string, Array<{ cleared: string | null; status: string | null }>> = {}
  for (const c of checks || []) {
    if (!c.transaction_id) continue
    ;(byTxn[c.transaction_id] ||= []).push({ cleared: c.cleared_date, status: c.status })
  }

  const txnIds = Object.keys(byTxn)
  if (txnIds.length === 0) return []

  const txns = await fetchAllRows<{
    id: string
    property_address: string | null
    transaction_type: string | null
    office_net: number | string | null
    office_net_swept_at: string | null
    status: string | null
  }>(
    'transactions',
    'id, property_address, transaction_type, office_net, office_net_swept_at, status',
    { filters: [{ type: 'in', column: 'id', value: txnIds }] }
  )

  // Unswept, not cancelled, and carrying an office net worth moving.
  const candidates = (txns || []).filter(
    t => t.status !== 'cancelled' && !t.office_net_swept_at && Number(t.office_net || 0) !== 0
  )
  if (candidates.length === 0) return []

  const [compliance, checklist] = await Promise.all([
    deriveComplianceForTransactions(candidates.map(t => t.id)),
    fetchChecklistProgress(candidates.map(t => ({ id: t.id, transaction_type: t.transaction_type }))),
  ])

  return candidates
    .map(t => {
      const group = byTxn[t.id] || []
      const fundsCleared =
        group.length > 0 &&
        group.every(
          c => !!c.cleared && c.cleared <= today && String(c.status || '') !== 'rejected'
        )
      const lastCleared = group
        .map(c => c.cleared)
        .filter((d): d is string => !!d)
        .sort()
        .pop() || null

      const derived = compliance[t.id]
      const progress = checklist[t.id] || { done: 0, required: 0, complete: false }

      const gates: SweepGates = {
        fundsCleared,
        checklistDone: progress.done,
        checklistRequired: progress.required,
        sidesComplete: (derived?.sides || []).filter(s => s.status === 'complete').length,
        sidesExpected: derived?.expected ?? 1,
      }

      const officeNet = Number(t.office_net || 0)
      const refusal = sweepRefusal(officeNet)

      return {
        transaction_id: t.id,
        property_address: t.property_address,
        office_net: officeNet,
        gates,
        ready: isSweepReady(gates, officeNet),
        refusal,
        waiting_on: waitingOn(gates),
        sides_badge: sidesBadge(gates),
        last_cleared_date: lastCleared,
      }
    })
    .sort((a, b) => b.office_net - a.office_net)
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_sweeps')
  if (auth.error) return auth.error

  try {
    const deals = await loadSweepable()
    const readyTotal = deals.filter(d => d.ready).reduce((s, d) => s + d.office_net, 0)
    const allTotal = deals.reduce((s, d) => s + d.office_net, 0)
    const refusedTotal = deals.filter(d => d.refusal).reduce((s, d) => s + d.office_net, 0)

    return NextResponse.json({
      deals,
      totals: {
        all: Math.round(allTotal * 100) / 100,
        ready: Math.round(readyTotal * 100) / 100,
        not_ready: Math.round((allTotal - readyTotal - refusedTotal) * 100) / 100,
        refused: Math.round(refusedTotal * 100) / 100,
      },
    })
  } catch (error: any) {
    console.error('Sweep list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_sweeps')
  if (auth.error) return auth.error

  let parentId: string | null = null
  // Deals stamped so far in this request. PostgREST gives no transaction, so
  // this is how the catch knows what to put back.
  const stampedIds: string[] = []
  // Hoisted so the catch can scope its unstamp to this request's own stamps
  // and never touch a sweep someone else recorded in the meantime.
  const sweptAt = new Date().toISOString()

  try {
    const body = await request.json()
    const ids: string[] = Array.isArray(body?.transaction_ids)
      ? body.transaction_ids.filter((v: unknown) => typeof v === 'string')
      : []
    const entryDate: string = body?.transfer_date || getCentralDateString()
    const bankReference: string | null = body?.bank_reference || null
    // A method may come from the browser; an amount may not. Anything the
    // shared list does not recognise is stored as nothing rather than as a
    // word nobody can group on later.
    const paymentMethod = normalizePaymentMethod(body?.payment_method)
    // Recording something that already happened, rather than moving money now.
    //
    // Needed because the stamp columns had no route into them except the sweep
    // itself and hand-written SQL, and SQL is how 17 deals ended up stamped
    // with no ledger line behind them. This gives that job a door.
    //
    // It stamps the deals and writes NO ledger entry, deliberately: the money
    // left before the ledger opened, so the opening balance already accounts
    // for it. Posting a line as well would take the same money out twice.
    const alreadyMoved = body?.already_moved === true

    // What actually left the bank, which is not always what the deals add up
    // to.
    //
    // Money gets moved to income ahead of a sweep, or part of a deal's share
    // is already gone, so the real transfer can be smaller than the deals it
    // covers. It can also be larger, when the account is being balanced down
    // and the excess is more than the deals account for. Until now this box
    // computed the figure and refused to be told otherwise, so the only way to
    // record the truth was to mark the deals moved and then hand-write a
    // separate ledger line - which lands in the generic "money moved out"
    // category and never reaches the Moved To Income total.
    //
    // Same reasoning as the amount on Record This As Paid: only the person
    // looking at the bank knows what really moved.
    const actualRaw = body?.actual_amount
    const actualProvided =
      actualRaw !== undefined && actualRaw !== null && String(actualRaw).trim() !== ''
    const actualAmount = actualProvided ? Number(actualRaw) : null
    if (actualProvided && (!Number.isFinite(actualAmount as number) || (actualAmount as number) <= 0)) {
      return NextResponse.json(
        { error: 'Enter the amount that actually moved, as a number greater than zero' },
        { status: 400 }
      )
    }

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Select at least one deal to sweep' }, { status: 400 })
    }

    // Amounts are never taken from the request. Office net is read here.
    const deals = await loadSweepable()
    const chosen = deals.filter(d => ids.includes(d.transaction_id))

    const missing = ids.filter(id => !chosen.some(d => d.transaction_id === id))
    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'Some deals are no longer sweepable. Reload and try again.', missing },
        { status: 409 }
      )
    }

    const refused = chosen.filter(d => d.refusal)
    if (refused.length > 0) {
      return NextResponse.json(
        {
          error: 'One or more deals cannot be swept',
          refused: refused.map(d => ({
            transaction_id: d.transaction_id,
            property_address: d.property_address,
            reason: d.refusal,
          })),
        },
        { status: 422 }
      )
    }

    const total = Math.round(chosen.reduce((s, d) => s + d.office_net, 0) * 100) / 100
    // The bank figure. Defaults to what the deals add up to, which is the
    // ordinary case.
    const transferred = actualProvided ? Math.round((actualAmount as number) * 100) / 100 : total
    const partial = Math.abs(transferred - total) > 0.004

    if (alreadyMoved) {
      const sweptAtHistoric = new Date().toISOString()
      const historicIds = chosen.map(d => d.transaction_id)
      const { data: stamped, error: stampError } = await supabaseAdmin
        .from('transactions')
        .update({
          office_net_swept_at: sweptAtHistoric,
          office_net_swept_amount: null,
          updated_at: sweptAtHistoric,
        })
        .in('id', historicIds)
        .is('office_net_swept_at', null)
        .select('id')
      if (stampError) throw stampError

      // The amount is left null on purpose. `office_net_swept_amount` records
      // what was actually transferred, and for a historic move nobody knows
      // that figure. Writing today's office net there would look like evidence
      // and be a guess, which is worse than an honest blank.
      return NextResponse.json({
        success: true,
        already_moved: true,
        // What was actually stamped, not what was selected. The `.is()` guard
        // can skip a deal another request stamped in between, and reporting
        // the request's own list would claim work it did not do.
        deals: stamped?.length ?? 0,
        ledger_entry_id: null,
      })
    }

    // One bank line, with a real ledger row per deal beneath it. The parent
    // reconciles against the single statement entry; each child names one deal
    // and its office net, so the detail survives as data rather than as a note.
    const { data: parent, error: parentError } = await supabaseAdmin
      .from('brokerage_ledger')
      .insert({
        entry_date: entryDate,
        entry_type: entryTypeForCategory('sweep'),
        category: 'sweep',
        // Both figures, because the gap between them is the thing somebody
        // asks about later. A line reading $1,085.19 against 11 deals worth
        // $6,309.39 is not a mistake, and it should not look like one.
        description: partial
          ? `Moved to the income account, ${chosen.length} deal${chosen.length === 1 ? '' : 's'} covering ${fmtMoney(total)}`
          : `Office net moved to the income account, ${chosen.length} deal${chosen.length === 1 ? '' : 's'}`,
        amount: transferred,
        notes: partial
          ? `The deals covered add up to ${fmtMoney(total)}. ${fmtMoney(transferred)} actually moved${transferred < total ? ', so the rest had already gone or stayed in the account' : ', which is more than the deals account for'}.`
          : null,
        bank_reference: bankReference,
        bank_date: entryDate,
        payment_method: paymentMethod,
        recorded_by: auth.user.id,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      .select('id')
      .single()

    if (parentError) throw parentError
    parentId = parent.id

    const children = chosen.map(d => ({
      entry_date: entryDate,
      entry_type: entryTypeForCategory('sweep'),
      category: 'sweep',
      subcategory: 'deal',
      description: d.property_address || 'Unnamed deal',
      amount: Math.round(d.office_net * 100) / 100,
      transaction_id: d.transaction_id,
      parent_entry_id: parentId,
      bank_reference: bankReference,
      bank_date: entryDate,
      payment_method: paymentMethod,
      recorded_by: auth.user.id,
      account: DEFAULT_LEDGER_ACCOUNT,
    }))

    const { error: childError } = await supabaseAdmin.from('brokerage_ledger').insert(children)
    if (childError) throw childError

    // What the screen was warning about, per deal, at this moment. Recomputed
    // here from loadSweepable rather than taken from the request, for the same
    // reason the amounts are: the browser is not the record.
    //
    // A deal that was fully ready contributes no rows, which reads correctly
    // as nothing flagged. These cascade with the parent, so a sweep that fails
    // and is rolled back below takes its warnings with it.
    const warnings = chosen.flatMap(d =>
      d.waiting_on.map(w => ({
        ledger_entry_id: parentId as string,
        transaction_id: d.transaction_id,
        property_address: d.property_address,
        warning: w,
      }))
    )
    if (warnings.length > 0) {
      const { error: warningError } = await supabaseAdmin.from('sweep_warnings').insert(warnings)
      if (warningError) throw warningError
    }

    // Stamp the deals. The amount is stored alongside the date so later drift
    // in office_net is detectable rather than silent.
    //
    // The .is(null) guard is what stops two people sweeping the same deal at
    // once, but on its own it fails quietly: the second writer matches no row,
    // gets no error, and its ledger entries stay behind as a second record of
    // money that only moved once. So a stamp that touches nothing is treated
    // as the race it is, and the catch below deletes this sweep's parent,
    // which cascades to its children.
    for (const d of chosen) {
      const { data: stamped, error: stampError } = await supabaseAdmin
        .from('transactions')
        .update({
          office_net_swept_at: sweptAt,
          // Blank when the transfer did not match the deals. `office_net_swept_amount`
          // records what was actually moved for THIS deal, and when only part
          // of the total moved nobody knows which deal it came from. Writing
          // the deal's own office net there would look like evidence and be a
          // guess - the same call as the historic path above.
          office_net_swept_amount: partial ? null : Math.round(d.office_net * 100) / 100,
          updated_at: sweptAt,
        })
        .eq('id', d.transaction_id)
        .is('office_net_swept_at', null)
        .select('id')
      if (stampError) throw stampError
      if (!stamped || stamped.length === 0) {
        throw new Error(
          `${d.property_address || 'A deal'} was moved by someone else while this was open. Nothing has been recorded. Reload and try again.`
        )
      }
      stampedIds.push(d.transaction_id)
    }

    return NextResponse.json({
      success: true,
      sweep_entry_id: parentId,
      deals: chosen.length,
      amount: total,
      entry_date: entryDate,
      // How many deals were moved with something still flagged against them.
      // Shown back to the person who confirmed, so the record is not a
      // surprise later.
      deals_with_warnings: chosen.filter(d => d.waiting_on.length > 0).length,
    })
  } catch (error: any) {
    // PostgREST gives no transaction, so undo by hand, in both directions.
    //
    // Deleting the parent cascades to the children. Unstamping matters just as
    // much and was missing: the loop stamps one deal at a time, so a failure
    // partway through used to leave the earlier deals marked swept with no
    // ledger row behind them. Those deals then vanish from the sweep dialog
    // (loadSweepable filters on office_net_swept_at being null), from the
    // unswept total, and from reconciliation. Their office net would be
    // invisible everywhere while the error on screen said "Nothing has been
    // recorded", which is the worst combination: money silently out of view
    // and a message telling you not to look.
    const failures: string[] = []

    if (parentId) {
      const { error: delError } = await supabaseAdmin
        .from('brokerage_ledger')
        .delete()
        .eq('id', parentId)
      if (delError) failures.push(`ledger entry ${parentId}`)
    }

    if (stampedIds.length > 0) {
      const { error: clearError } = await supabaseAdmin
        .from('transactions')
        .update({ office_net_swept_at: null, office_net_swept_amount: null })
        .in('id', stampedIds)
        .eq('office_net_swept_at', sweptAt)
      if (clearError) failures.push(`${stampedIds.length} deal stamps`)
    }

    console.error('Record sweep error:', error)

    // A compensation that itself failed is the one case where a person has to
    // go and look. Say so plainly rather than returning the original error and
    // letting it read like a clean abort.
    if (failures.length > 0) {
      console.error('Sweep rollback incomplete:', failures, { parentId, stampedIds })
      return NextResponse.json(
        {
          error: `The transfer failed and could not be fully undone. Someone needs to check ${failures.join(' and ')} by hand before sweeping again.`,
          rollback_incomplete: true,
          ledger_entry_id: parentId,
          stamped_transaction_ids: stampedIds,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
