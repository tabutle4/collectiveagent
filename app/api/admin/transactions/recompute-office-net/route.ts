import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { recomputeOfficeNet } from '@/lib/transactions/cascade'
import { CUTOVER_DATE } from '@/lib/payouts/ledger'

export const dynamic = 'force-dynamic'

// Re-derive office_net through the app's own function.
//
// office_net is written by recomputeOfficeNet and only when a deal is edited,
// so a deal last touched under older commission math still carries the older
// figure. Nothing had ever run it across the table. The sweep transfers
// whatever office_net says, and the ledger's opening entry freezes it, so this
// runs once before the cutover and then whenever a bulk correction lands.
//
// This deliberately calls the real function rather than recomputing in SQL.
// The formula has nine terms including eCommission offsets and pass-through
// side income; reimplementing it produced wrong answers twice during design.
//
// Batched because recomputeOfficeNet issues several queries per deal, and the
// in-scope population is a few hundred. The caller loops on next_cursor.

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100


export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_sweeps')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const explicitIds: string[] | null = Array.isArray(body?.transaction_ids)
      ? body.transaction_ids.filter((v: unknown) => typeof v === 'string')
      : null
    const limit = Math.min(Math.max(Number(body?.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const cursor: string | null = typeof body?.cursor === 'string' ? body.cursor : null

    // Scope. Without explicit ids: every non-cancelled deal dated 2026 or
    // later, or carrying no date at all. Sales are dated by closing_date and
    // leases by move_in_date, so both columns are read.
    //
    // A deal whose office net has already been swept is NEVER recomputed. The
    // sweep stores office_net_swept_amount precisely so that later drift in
    // office_net is detectable rather than silent; rewriting office_net on a
    // swept deal erases the evidence that the two ever disagreed, and on live
    // data that is 269 deals carrying $145,439.12 of recorded transfers. If a
    // swept deal really is wrong, undo its sweep first, then recompute, then
    // sweep the corrected figure. That leaves a trail.
    const swept = await fetchAllRows<{ id: string; property_address: string | null }>(
      'transactions',
      'id, property_address',
      { filters: [{ type: 'not', column: 'office_net_swept_at', value: null }] }
    )
    const sweptIds = new Set((swept || []).map(r => r.id))
    const sweptAddress = new Map((swept || []).map(r => [r.id, r.property_address]))

    let ids: string[]
    if (explicitIds && explicitIds.length > 0) {
      const refused = explicitIds.filter(id => sweptIds.has(id))
      if (refused.length > 0) {
        return NextResponse.json(
          {
            error: 'Some of those deals have already had their share moved to the income account. Undo the transfer first, then recompute.',
            refused: refused.map(id => ({
              transaction_id: id,
              property_address: sweptAddress.get(id) || null,
            })),
          },
          { status: 409 }
        )
      }
      ids = explicitIds
    } else {
      const rows = await fetchAllRows<{
        id: string
        closing_date: string | null
        move_in_date: string | null
      }>('transactions', 'id, closing_date, move_in_date', {
        filters: [{ type: 'neq', column: 'status', value: 'cancelled' }],
      })
      ids = (rows || [])
        .filter(r => {
          // A sale is dated by its closing date and a lease by its move in
          // date. Reading only closing_date put 9 leases that moved in during
          // 2025 back in scope, carrying $2,139.35 of office net, because a
          // lease has no closing date and a missing date was being read as
          // "current" rather than as "look at the other column".
          //
          // A deal with neither date is genuinely undated, which in practice
          // means it has not finished, so it stays in scope.
          const dated = r.closing_date || r.move_in_date
          return !dated || dated >= CUTOVER_DATE
        })
        .filter(r => !sweptIds.has(r.id))
        .map(r => r.id)
        .sort()
    }

    const startAt = cursor ? ids.findIndex(id => id > cursor) : 0
    const slice = startAt < 0 ? [] : ids.slice(startAt, startAt + limit)

    if (slice.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        changed: 0,
        remaining: 0,
        next_cursor: null,
        changes: [],
      })
    }

    // Read before, recompute, read after. recomputeOfficeNet returns nothing
    // and logs rather than throwing, so the before and after values are the
    // only way to report what actually moved.
    const { data: before } = await supabaseAdmin
      .from('transactions')
      .select('id, property_address, office_net')
      .in('id', slice)

    const beforeById = new Map<string, { address: string | null; officeNet: number | null }>()
    for (const r of before || []) {
      beforeById.set(r.id, {
        address: r.property_address,
        officeNet: r.office_net === null ? null : Number(r.office_net),
      })
    }

    for (const id of slice) {
      await recomputeOfficeNet(id)
    }

    const { data: after } = await supabaseAdmin
      .from('transactions')
      .select('id, office_net')
      .in('id', slice)

    const changes: Array<{
      transaction_id: string
      property_address: string | null
      before: number | null
      after: number | null
      delta: number
    }> = []

    for (const r of after || []) {
      const prev = beforeById.get(r.id)
      const nextVal = r.office_net === null ? null : Number(r.office_net)
      const prevVal = prev?.officeNet ?? null
      const same =
        prevVal === null && nextVal === null
          ? true
          : prevVal !== null && nextVal !== null && Math.round(prevVal * 100) === Math.round(nextVal * 100)
      if (!same) {
        changes.push({
          transaction_id: r.id,
          property_address: prev?.address ?? null,
          before: prevVal,
          after: nextVal,
          delta: Math.round(((nextVal ?? 0) - (prevVal ?? 0)) * 100) / 100,
        })
      }
    }

    const lastId = slice[slice.length - 1]
    const consumed = startAt < 0 ? ids.length : startAt + slice.length
    const remaining = Math.max(ids.length - consumed, 0)

    return NextResponse.json({
      success: true,
      processed: slice.length,
      changed: changes.length,
      remaining,
      next_cursor: remaining > 0 ? lastId : null,
      changes,
    })
  } catch (error: any) {
    console.error('Recompute office net error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
