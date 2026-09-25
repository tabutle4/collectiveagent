import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// What happened on this deal.
//
// Every row comes from a database trigger (migrations/checks/16), so this
// reads history rather than reconstructing it. Nothing here writes.
//
// The sentence a person reads is built HERE and not stored, so the wording can
// be improved later without rewriting what already happened.

/** Fields that move CRC's cut, and what to call each one out loud. */
const FIELD_LABELS: Record<string, string> = {
  office_net: "Our cut of the deal",
  office_gross: 'Our share before fees',
  gross_commission: 'Total commission on the deal',
  listing_side_commission: 'Listing side commission',
  buying_side_commission: 'Buying side commission',
  brokerage_split: "Brokerage's share of the split",
  processing_fee: 'Processing fee',
  coaching_fee: 'Coaching fee',
  other_fees: 'Other fees',
  agent_gross: "Agent's commission",
  agent_basis: 'Commission basis',
  btsa_amount: 'Bonus to selling agent',
  rebate_amount: 'Rebate',
  commission_amount: 'Outside brokerage commission',
  amount_1099_reportable: 'Outside brokerage 1099 amount',
  amount_owed: 'Amount owed',
  amount_remaining: 'Amount still owed',
  status: 'Status',
}

/** Which of those are the headline rather than the reason behind it. */
const HEADLINE_FIELDS = new Set(['office_net'])

const money = (v: string | null): string | null => {
  if (v === null || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return v
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const isNumeric = (v: string | null) =>
  v !== null && v !== '' && Number.isFinite(Number(v))

/**
 * The business day a change happened on, in Central time.
 *
 * Computed here rather than in the browser, because the obvious shortcut -
 * slicing the first ten characters off the timestamp - reads the UTC date
 * while the time beside it is rendered in Central. Anything after 7pm Central
 * is already tomorrow in UTC, so an edit made at 9:30pm on the 24th would file
 * itself under the 25th and still print "9:30 PM". A history screen that
 * misdates the evening is worse than no history screen, and the evening is
 * when this office does its books.
 */
const centralDay = (ts: string) =>
  new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_view_all_transactions')
  if (auth.error) return auth.error

  try {
    const { id } = await params

    // fetchAllRows: a deal edited repeatedly over months can pass a thousand
    // rows, and a truncated page here would quietly hide the oldest changes -
    // which are exactly the ones somebody is digging for.
    const rows = await fetchAllRows<{
      id: string
      occurred_at: string
      source_table: string
      record_id: string | null
      event_type: string
      field: string | null
      old_value: string | null
      new_value: string | null
      actor_id: string | null
      details: any
    }>(
      'transaction_activity',
      'id, occurred_at, source_table, record_id, event_type, field, old_value, new_value, actor_id, details',
      {
        filters: [{ type: 'eq', column: 'transaction_id', value: id }],
        orderBy: { column: 'occurred_at', ascending: false },
      }
    )

    // Whose row moved. A fee changing means little without the agent's name
    // beside it.
    const tiaIds = Array.from(
      new Set(
        (rows || [])
          .filter(r => r.source_table === 'transaction_internal_agents' && r.record_id)
          .map(r => r.record_id as string)
      )
    )
    const agentByTia = new Map<string, string>()
    if (tiaIds.length > 0) {
      const tias = await fetchAllRows<{ id: string; agent_id: string | null }>(
        'transaction_internal_agents',
        'id, agent_id',
        { filters: [{ type: 'in', column: 'id', value: tiaIds }] }
      )
      const agentIds = Array.from(
        new Set((tias || []).map(t => t.agent_id).filter((v): v is string => !!v))
      )
      const nameById = new Map<string, string>()
      if (agentIds.length > 0) {
        const users = await fetchAllRows<{
          id: string
          first_name: string | null
          last_name: string | null
          preferred_first_name: string | null
          preferred_last_name: string | null
        }>('users', 'id, first_name, last_name, preferred_first_name, preferred_last_name', {
          filters: [{ type: 'in', column: 'id', value: agentIds }],
        })
        for (const u of users || []) {
          const name = `${u.preferred_first_name || u.first_name || ''} ${
            u.preferred_last_name || u.last_name || ''
          }`.trim()
          if (name) nameById.set(u.id, name)
        }
      }
      for (const t of tias || []) {
        const n = t.agent_id ? nameById.get(t.agent_id) : null
        if (n) agentByTia.set(t.id, n)
      }
    }

    // Anyone the app itself recorded as having done something. Null on every
    // trigger row, because the database sees one service credential rather
    // than a person.
    const actorIds = Array.from(
      new Set((rows || []).map(r => r.actor_id).filter((v): v is string => !!v))
    )
    const actorById = new Map<string, string>()
    if (actorIds.length > 0) {
      const actors = await fetchAllRows<{
        id: string
        first_name: string | null
        last_name: string | null
      }>('users', 'id, first_name, last_name', {
        filters: [{ type: 'in', column: 'id', value: actorIds }],
      })
      for (const a of actors || []) {
        const name = `${a.first_name || ''} ${a.last_name || ''}`.trim()
        if (name) actorById.set(a.id, name)
      }
    }

    const entries = (rows || []).map(r => {
      const label = r.field ? FIELD_LABELS[r.field] || r.field : null
      const who = r.record_id ? agentByTia.get(r.record_id) || null : null
      const numeric = isNumeric(r.old_value) || isNumeric(r.new_value)
      const from = numeric ? money(r.old_value) : r.old_value
      const to = numeric ? money(r.new_value) : r.new_value
      const delta =
        isNumeric(r.old_value) && isNumeric(r.new_value)
          ? Math.round((Number(r.new_value) - Number(r.old_value)) * 100) / 100
          : null

      let summary: string
      if (r.event_type === 'field_changed' && label) {
        const subject = who ? `${label} for ${who}` : label
        if (from === null) summary = `${subject} was set to ${to}`
        else if (to === null) summary = `${subject} was cleared, was ${from}`
        else summary = `${subject} changed from ${from} to ${to}`
      } else {
        summary = r.event_type.replace(/_/g, ' ')
      }

      return {
        id: r.id,
        occurred_at: r.occurred_at,
        /** Central business day, for grouping. See centralDay above. */
        occurred_on: centralDay(r.occurred_at),
        summary,
        event_type: r.event_type,
        field: r.field,
        field_label: label,
        agent_name: who,
        old_value: r.old_value,
        new_value: r.new_value,
        old_display: from,
        new_display: to,
        delta,
        // True for the figure Courtney actually asks about; everything else is
        // the reason behind it.
        headline: !!(r.field && HEADLINE_FIELDS.has(r.field)),
        actor_name: r.actor_id ? actorById.get(r.actor_id) || null : null,
        source_table: r.source_table,
        details: r.details ?? null,
      }
    })

    return NextResponse.json({ entries })
  } catch (error: any) {
    console.error('Transaction activity error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
