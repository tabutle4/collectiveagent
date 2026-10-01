import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import {
  countsTowardProduction,
  hasComplianceRequest,
  productionDate,
  productionToday,
  productionUnits,
  productionVolume,
  PRODUCTION_ROLES,
} from '@/lib/reporting/production'
import { fetchComplianceRequestTxnIds } from '@/lib/reporting/complianceRequests'
import { isValidQuarter, quarterRange } from '@/lib/reporting/quarters'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import {
  buildMembershipResolver,
  governingTeamDate,
} from '@/lib/reporting/teamAttribution'
import {
  addressKey,
  countByFlag,
  exclusionReason,
  flagsForDeal,
  LEASE_TEMPLATE_KEY,
  SALE_TEMPLATE_KEY,
  type ChecklistProgress,
  type ReconAgentRow,
  type ReconRow,
  type ReconTransaction,
} from '@/lib/reporting/quarterlyReconciliation'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/reports/quarterly-reconciliation?year=2026&quarter=3
 *
 * Every deal the quarterly report counts for that quarter, with whatever is
 * wrong with it, plus the deals in the same window that did NOT make the
 * report and why.
 *
 * Recomputed on every request. Nothing is cached and no flag is stored, so a
 * deal fixed on its own page stops being flagged the next time this loads.
 * That is the whole working loop: open the report, open a deal, fix it, load
 * the report again.
 */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_view_quarterly_reconciliation')
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    const now = new Date()
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()))
    const quarter = parseInt(
      searchParams.get('quarter') || String(Math.ceil((now.getMonth() + 1) / 3))
    )

    // Unvalidated, year=NaN reaches new Date(NaN) and throws RangeError deep in
    // the handler, surfacing as a 500 that reads like a server fault. quarter=99
    // is worse: it answers cheerfully about 2050 as though that were a quarter.
    if (!isValidQuarter(year, quarter)) {
      return NextResponse.json(
        { error: 'Pick a valid year and a quarter from 1 to 4' },
        { status: 400 }
      )
    }

    // Quarter boundaries come from lib/reporting/quarters.ts, which the
    // quarterly report route also uses. Two reports disagreeing about where a
    // quarter ends would be the first thing to make this one useless, and a
    // second copy of the arithmetic is how that disagreement starts.
    const { startDate: startDateStr, endDate: endDateStr } = quarterRange(year, quarter)

    const [transactions, agentRows, complianceRequestIds, templates,
           teamMembers, teams, teamLeadRows, items] =
      await Promise.all([
        fetchAllRows<ReconTransaction & { compliance_status?: string | null }>(
          'transactions',
          `id, property_address, unit, transaction_type, status, compliance_status,
           sales_price, monthly_rent, lease_term, acceptance_date, move_in_date, closing_date,
           office_gross, gross_commission, listing_side_commission, buying_side_commission`
        ),
        fetchAllRows<ReconAgentRow>(
          'transaction_internal_agents',
          `id, transaction_id, agent_id, agent_role, installment_kind, sales_volume, units,
           agent_gross, btsa_amount, processing_fee, coaching_fee, other_fees,
           rebate_amount, debts_deducted, amount_1099_reportable, agent_net,
           agent:users!transaction_internal_agents_agent_id_fkey(
             id, first_name, last_name, preferred_first_name, preferred_last_name
           )`
        ),
        fetchComplianceRequestTxnIds(),
        fetchAllRows<{ id: string; name: string; slug: string | null; applies_to: string | null }>(
          'checklist_templates',
          'id, name, slug, applies_to'
        ),
        // Every membership with its dates, so a deal gets the team its agent
        // was actually on at the time rather than today's roster - the same
        // rule the quarterly report now uses.
        fetchAllRows<{ agent_id: string; team_id: string; effective_date: string; end_date: string | null }>(
          'team_member_agreements',
          'agent_id, team_id, effective_date, end_date'
        ),
        fetchAllRows<{ id: string; team_name: string }>('teams', 'id, team_name'),
        // Leading a team is the second way of belonging to one: a lead has no
        // team_member_agreements row, so without these rows their own deals
        // resolve to no team at all.
        fetchAllRows<{ team_id: string; agent_id: string; start_date: string | null; end_date: string | null }>(
          'team_leads',
          'team_id, agent_id, start_date, end_date'
        ),
        fetchAllRows<{ id: string; checklist_template_id: string; is_active: boolean | null }>(
          'checklist_items',
          'id, checklist_template_id, is_active'
        ),
      ])

    const today = productionToday()

    // Execution date for sales, move-in for leases, falling back to closing -
    // the date that decides which team a deal belongs to.
    const governingDateByTxn = new Map<string, string | null>()
    transactions.forEach(txn => {
      governingDateByTxn.set(
        txn.id,
        governingTeamDate(txn, isLeaseTransactionType(txn.transaction_type))
      )
    })

    // Deals whose production date lands in this quarter, whether or not they
    // qualify. The ones that qualify are the report; the rest are the near
    // misses underneath it.
    const inWindow = transactions.filter(t => {
      const d = productionDate(t)
      return !!d && d >= startDateStr && d <= endDateStr
    })

    const qualified = inWindow.filter(t =>
      countsTowardProduction(t as any, {
        complianceRequested: hasComplianceRequest(t as any, complianceRequestIds),
        today,
      })
    )
    const qualifiedIds = new Set(qualified.map(t => t.id))

    // Checklist completions, restricted to the deals on this page. The table
    // holds nearly 7,000 rows app-wide and only these matter.
    //
    // Templates are keyed on applies_to ('sale' / 'lease'), never on the display
    // name, so renaming a checklist in the admin UI cannot silently switch a
    // flag off. See lib/reporting/quarterlyReconciliation.ts.
    const activeItems = items.filter(i => i.is_active !== false)
    const templateById: Record<string, string> = {}
    for (const t of templates) {
      const key = String(t.applies_to || '').toLowerCase()
      if (key) templateById[t.id] = key
    }
    const templateByItem: Record<string, string> = {}
    for (const i of activeItems) {
      const key = templateById[i.checklist_template_id]
      if (key) templateByItem[i.id] = key
    }
    const totals: Record<string, number> = {}
    for (const i of activeItems) {
      const key = templateById[i.checklist_template_id]
      if (key) totals[key] = (totals[key] || 0) + 1
    }

    // Both buckets must resolve. If one does not, every deal of that kind would
    // quietly stop being checked rather than erroring - the exact silent failure
    // this report exists to catch, happening to the report itself.
    if (!totals[SALE_TEMPLATE_KEY] || !totals[LEASE_TEMPLATE_KEY]) {
      throw new Error(
        'Checklist templates did not resolve by applies_to. Expected active items for ' +
          `'${SALE_TEMPLATE_KEY}' and '${LEASE_TEMPLATE_KEY}', got ` +
          JSON.stringify(totals) +
          '. Check checklist_templates.applies_to.'
      )
    }

    const completions = qualifiedIds.size
      ? await fetchAllRows<{ transaction_id: string; checklist_item_id: string }>(
          'checklist_completions',
          'transaction_id, checklist_item_id',
          { filters: [{ type: 'in', column: 'transaction_id', value: [...qualifiedIds] }] }
        )
      : []

    // Counted per distinct item, not per row. checklist_completions has no
    // uniqueness constraint on (transaction_id, checklist_item_id) and a
    // duplicate already exists live - 31235 Casanova Drive carries 9 rows for 8
    // items and sits in the current Q3 report. Counting rows, a deal with one
    // duplicate and one genuinely missing item reads as complete and its flag
    // disappears silently.
    const done: Record<string, Record<string, number>> = {}
    const countedCompletions = new Set<string>()
    for (const c of completions) {
      const template = templateByItem[c.checklist_item_id]
      if (!template) continue
      const once = c.transaction_id + '|' + c.checklist_item_id
      if (countedCompletions.has(once)) continue
      countedCompletions.add(once)
      if (!done[c.transaction_id]) done[c.transaction_id] = {}
      done[c.transaction_id][template] = (done[c.transaction_id][template] || 0) + 1
    }
    const checklists: ChecklistProgress = { done, totals }

    // Address index for duplicate detection, across every non-cancelled deal
    // rather than only this quarter - a duplicate entered a month later still
    // duplicates this one. Cancelled twins are left out on purpose: every near
    // match found on 2026-09-29 was a duplicate the office had already caught
    // and cancelled the same day.
    const byAddress: Record<string, { id: string; production_date: string | null }[]> = {}
    for (const t of transactions) {
      if (String(t.status || '') === 'cancelled') continue
      const key = addressKey(t)
      if (!key) continue
      if (!byAddress[key]) byAddress[key] = []
      byAddress[key].push({ id: t.id, production_date: productionDate(t) })
    }

    const rowsByTxn: Record<string, ReconAgentRow[]> = {}
    for (const r of agentRows) {
      if (!r.transaction_id) continue
      if (!rowsByTxn[r.transaction_id]) rowsByTxn[r.transaction_id] = []
      rowsByTxn[r.transaction_id].push(r)
    }

    // Notes and credits, both scoped to the deals on this page rather than read
    // whole. Notes grow forever; credits live on agent_debts and are the reason
    // a stored 1099 figure can legitimately differ from the formula.
    const scopedIds = [...qualifiedIds]

    const notes = scopedIds.length
      ? await fetchAllRows<{ transaction_id: string; note: string; author_name: string | null; created_at: string }>(
          'quarterly_reconciliation_notes',
          'transaction_id, note, author_name, created_at',
          { filters: [{ type: 'in', column: 'transaction_id', value: scopedIds }] }
        )
      : []

    // Mark Paid folds an applied credit into the stored amount_1099_reportable,
    // but no credits column exists on the agent row, so recomputing the formula
    // without it reports a mismatch on a row that is correct.
    //
    // amount_remaining is GENERATED ALWAYS AS (amount_owed - amount_paid), so
    // amount_owed - amount_remaining is exactly amount_paid: the part of the
    // credit actually applied. lib/transactions/markPaid.ts uses the same
    // expression. This assumes a credit was applied to one agent row; Mark Paid
    // overwrites offset_transaction_agent_id rather than splitting, so a credit
    // spread over two deals would report its whole value against the later row.
    // No partially applied credit exists today.
    const scopedRowIds = agentRows
      .filter(r => r.id && qualifiedIds.has(r.transaction_id))
      .map(r => String(r.id))
    const creditRows = scopedRowIds.length
      ? await fetchAllRows<{
          offset_transaction_agent_id: string | null
          amount_owed: number | string | null
          amount_remaining: number | string | null
        }>(
          'agent_debts',
          'offset_transaction_agent_id, amount_owed, amount_remaining',
          {
            filters: [
              { type: 'eq', column: 'record_type', value: 'credit' },
              { type: 'in', column: 'offset_transaction_agent_id', value: scopedRowIds },
            ],
          }
        )
      : []
    const creditsByRow: Record<string, number> = {}
    for (const c of creditRows) {
      if (!c.offset_transaction_agent_id) continue
      const used =
        (parseFloat(String(c.amount_owed ?? 0)) || 0) -
        (parseFloat(String(c.amount_remaining ?? 0)) || 0)
      if (used === 0) continue
      creditsByRow[c.offset_transaction_agent_id] =
        (creditsByRow[c.offset_transaction_agent_id] || 0) + used
    }

    const notesByTxn: Record<string, { note: string; author_name: string | null; created_at: string }[]> = {}
    for (const n of notes) {
      if (!n.transaction_id) continue
      if (!notesByTxn[n.transaction_id]) notesByTxn[n.transaction_id] = []
      notesByTxn[n.transaction_id].push({
        note: n.note,
        author_name: n.author_name,
        created_at: n.created_at,
      })
    }
    // fetchAllRows orders by id, which is a random uuid here, so two notes on
    // one deal would otherwise render in arbitrary order.
    for (const list of Object.values(notesByTxn)) {
      list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    }

    // Dated team resolution, same helper the quarterly report uses so the two
    // cannot disagree about which team a deal belonged to.
    const resolveTeamForAgent = buildMembershipResolver(teamMembers, teamLeadRows)
    const teamNameById: Record<string, string> = {}
    for (const t of teams) teamNameById[t.id] = t.team_name

    const agentName = (a: any): string => {
      const row = Array.isArray(a) ? a[0] : a
      if (!row) return 'Unknown agent'
      const first = row.preferred_first_name || row.first_name || ''
      const last = row.preferred_last_name || row.last_name || ''
      return `${first} ${last}`.trim() || 'Unknown agent'
    }

    const rows: (ReconRow & { notes: any[] })[] = qualified.map(txn => {
      const all = rowsByTxn[txn.id] || []
      const production = all.filter(
        r => !r.installment_kind && PRODUCTION_ROLES.includes(String(r.agent_role || ''))
      )
      const pdate = productionDate(txn)
      const twins = (byAddress[addressKey(txn)] || []).filter(t => t.id !== txn.id)

      // Every role, retainers included. Volume and units below still come from
      // production rows only, so widening this list cannot move those figures -
      // it only decides which deals appear when you filter to a person.
      const byAgent = new Map<string, { id: string; name: string; roles: string[] }>()
      for (const r of all) {
        if (!r.agent_id) continue
        const role = r.installment_kind ? 'retainer' : String(r.agent_role || 'unknown')
        const found = byAgent.get(r.agent_id)
        if (found) {
          if (!found.roles.includes(role)) found.roles.push(role)
        } else {
          byAgent.set(r.agent_id, { id: r.agent_id, name: agentName(r.agent), roles: [role] })
        }
      }
      const agents = [...byAgent.values()]

      // Agent net across every payee, matching how the quarterly report sums
      // it: all roles, installment rows excluded (those count by payment date).
      const agentNet = all
        .filter(r => !r.installment_kind)
        .reduce((sum, r) => sum + (parseFloat(String(r.agent_net ?? 0)) || 0), 0)

      // Every production agent is tried before falling back to any other
      // payee. fetchAllRows orders by id, which is a random uuid, so taking
      // only the first row picked arbitrarily between two agents and labelled
      // 7 deals teamless when a second production agent did resolve to a team.
      const governingDate = governingDateByTxn.get(txn.id)
      let teamId: string | null = null
      for (const candidate of [...production.map(r => r.agent_id), ...agents.map(a => a.id)]) {
        if (!candidate) continue
        teamId = resolveTeamForAgent(candidate, governingDate)
        if (teamId) break
      }

      return {
        transaction_id: txn.id,
        property_address: txn.property_address || 'No address',
        unit: txn.unit || null,
        is_lease: isLeaseTransactionType(txn.transaction_type),
        production_date: pdate,
        agents,
        volume: production.reduce((s, r) => s + productionVolume(r), 0),
        units: production.reduce((s, r) => s + productionUnits(r), 0),
        agentNet: Math.round(agentNet * 100) / 100,
        teamId,
        teamName: teamId ? teamNameById[teamId] || null : null,
        legacyImport:
          (txn.listing_side_commission === null || txn.listing_side_commission === undefined) &&
          (txn.buying_side_commission === null || txn.buying_side_commission === undefined),
        flags: flagsForDeal({
          txn,
          rows: all,
          productionDate: pdate,
          checklists,
          addressTwins: twins,
          creditsByRow,
        }),
        notes: notesByTxn[txn.id] || [],
      }
    })

    const nearMisses = inWindow
      .filter(t => !qualifiedIds.has(t.id))
      .map(txn => ({
        transaction_id: txn.id,
        property_address: txn.property_address || 'No address',
        unit: txn.unit || null,
        is_lease: isLeaseTransactionType(txn.transaction_type),
        production_date: productionDate(txn),
        reason:
          exclusionReason(txn, {
            complianceRequested: hasComplianceRequest(txn as any, complianceRequestIds),
            today,
          }) || 'Does not qualify',
      }))
      .sort((a, b) => String(a.production_date).localeCompare(String(b.production_date)))

    return NextResponse.json({
      quarter: { year, quarter, startDate: startDateStr, endDate: endDateStr },
      rows: rows.sort((a, b) => b.flags.length - a.flags.length),
      counts: countByFlag(rows),
      totals: {
        deals: rows.length,
        flagged: rows.filter(r => r.flags.length > 0).length,
        volume: rows.reduce((s, r) => s + r.volume, 0),
        units: rows.reduce((s, r) => s + r.units, 0),
      },
      nearMisses,
      teams: teams
        .map(t => ({ id: t.id, name: t.team_name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })
  } catch (err: any) {
    console.error('Quarterly reconciliation API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST - leave a note on a flagged deal.
 *
 * Notes are additive and nothing is ever hidden by one. A note explains what
 * was found; it does not clear the flag, because the flag clears itself when
 * the deal is fixed.
 */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_quarterly_reconciliation')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const transactionId = String(body?.transaction_id || '')
    const note = String(body?.note || '').trim()

    if (!transactionId || !note) {
      return NextResponse.json(
        { error: 'transaction_id and note are both required' },
        { status: 400 }
      )
    }
    if (note.length > 2000) {
      return NextResponse.json({ error: 'Note is too long' }, { status: 400 })
    }

    // The author comes from the session, never from the body - a client that
    // could name its own author could put anyone's name on a note.
    const authorName =
      [
        auth.user.preferred_first_name || auth.user.first_name,
        auth.user.preferred_last_name || auth.user.last_name,
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || null

    const { error } = await supabaseAdmin.from('quarterly_reconciliation_notes').insert({
      transaction_id: transactionId,
      note,
      author_id: auth.user.id,
      author_name: authorName,
    })
    if (error) {
      console.error('Quarterly reconciliation note insert failed:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Quarterly reconciliation note error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
