import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import { getCentralDateString } from '@/lib/timezone'
import { SIDE_MODES_FILTER, pickSideSubmissions, deriveSideStatus, expectedSides } from '@/lib/compliance/derive'
import { officeNetState } from '@/lib/payouts/ledger'
import { computeAutoHolds, computePayloadPending, isNotCleared, type HoldCheck } from '@/lib/payouts/holds'
import { fetchChecklistProgress } from '@/lib/payouts/checklist'
import { ledgerBalance } from '@/lib/payouts/position'
import { DEFAULT_LEDGER_ACCOUNT } from '@/lib/payouts/ledger'
import { billsDueWithin, billsDueTotal, type RecurringBill } from '@/lib/payouts/bills'
import { syncPayoutsLedgerQuietly } from '@/lib/payouts/posting'

export const dynamic = 'force-dynamic'



function isLeaseType(t: string | null): boolean {
  if (!t) return false
  if (t === 'lease') return true
  return isLeaseTransactionType(t)
}

// Pay-by date: 10 business days after the later of the check being received
// and compliance being complete. Same rule as the transaction detail page's
// checks and payouts tab, so both surfaces always agree.
function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date)
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d
}

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function periodLabel(month: number | null, year: number | null): string {
  if (!month || !year) return ''
  const m = MONTH_LABELS[month - 1] || ''
  return m ? `${m} ${year}` : `${year}`
}

export async function GET(request: NextRequest) {
  // Reading the payouts report is view-only, so it needs can_view_checks (which
  // TC holds). Writes below stay on can_manage_checks so viewers cannot edit.
  const auth = await requirePermission(request, 'can_view_checks')
  if (auth.error) return auth.error

  try {
    // Every check in the payouts account, whatever date it arrived.
    //
    // There is deliberately NO cutover filter here. The cutover is a LEDGER
    // boundary: the balance opens at the bank figure rather than being
    // reconstructed from history. It is not a filter on who we owe. An agent
    // who has not been paid is owed the money regardless of when the check
    // landed, and a liability that drops off this screen on a date boundary
    // makes the Bottom Line understate what we owe.
    //
    // This was got wrong once. A `received_date >= CUTOVER_DATE` filter here
    // hid 2409 Park Oaks Drive (check 2025-05-27, $850 still recorded against
    // the agent) and moved the Bottom Line by that amount with no
    // corresponding change in the bank. Date-scoping belongs on the ledger and
    // on the recompute scope, never on the list of people we owe.
    //
    // The stored `agents_paid` flag is deliberately NOT a filter here. It is
    // derived on edit and has drifted badly: 252 of 289 in-scope checks carried
    // a stale value, and because it was this report's primary filter, every one
    // of those deals was invisible on the screen the office works from. Paid is
    // derived below from the agent and external rows, which are the records
    // that actually get written when someone is paid.
    const checks = await fetchAllRows(
      'checks_received',
      `id, property_address, check_amount, brokerage_amount, hold_amount, check_from,
       received_date, cleared_date, deposited_date,
       compliance_complete_date, crc_transferred, agents_paid, status, notes,
       transaction_id, agent_id, payment_method, payload_payment_link_id,
       funds_destination`,
      {
        filters: [
          { type: 'not', column: 'transaction_id', value: null },
          { type: 'eq', column: 'funds_destination', value: 'payouts' },
        ],
        orderBy: { column: 'cleared_date', ascending: false },
      }
    )

    // Fetch standalone checks (no transaction) - batched
    const standaloneChecks = await fetchAllRows(
      'checks_received',
      `id, property_address, check_amount, brokerage_amount, hold_amount, check_from,
       received_date, cleared_date, deposited_date,
       compliance_complete_date, crc_transferred, agents_paid, status, notes,
       transaction_id, agent_id, payment_method, payload_payment_link_id,
       funds_destination`,
      {
        filters: [
          { type: 'is', column: 'transaction_id', value: null },
          { type: 'eq', column: 'funds_destination', value: 'payouts' },
        ],
        orderBy: { column: 'cleared_date', ascending: false },
      }
    )

    const allChecks = [...checks, ...standaloneChecks]

    // For each check with a transaction, get internal agents and external brokerages
    const txnIds = [...new Set(allChecks.map(c => c.transaction_id).filter(Boolean))]

    let internalAgents: any[] = []
    let externalBrokerages: any[] = []
    let transactions: any[] = []

    if (txnIds.length > 0) {
      // fetchAllRows, not a raw select. An .in() list does not lift PostgREST's
      // 1,000-row cap, and removing the stale agents_paid filter above widened
      // what these cover: the agent query returns 412 rows today against 304
      // deals, and grows with every deal. A truncated page here is not an
      // error, it is a payouts report that silently stops showing some agents.
      const [agents, externals, txns] = await Promise.all([
        fetchAllRows(
          'transaction_internal_agents',
          'id, transaction_id, agent_id, agent_role, agent_net, payment_status, payment_date, payment_method',
          { filters: [{ type: 'in', column: 'transaction_id', value: txnIds }] }
        ),
        fetchAllRows(
          'transaction_external_brokerages',
          // `id` is read below to build the row the Mark Paid button posts
          // back. It was missing from this list, so every external row reached
          // the browser with `id: undefined`, the click sent no external_id,
          // and the route answered 400. Every field read off a result has to
          // be in that result's SELECT list.
          'id, transaction_id, brokerage_name, agent_name, commission_amount, payment_status, payment_date',
          { filters: [{ type: 'in', column: 'transaction_id', value: txnIds }] }
        ),
        fetchAllRows(
          'transactions',
          'id, property_address, compliance_status, transaction_type, office_net, office_gross, is_intermediary, office_net_swept_at, office_net_swept_amount, closing_date',
          { filters: [{ type: 'in', column: 'id', value: txnIds }] }
        ),
      ])
      internalAgents = agents || []
      externalBrokerages = externals || []
      transactions = txns || []
    }

    // Compliance is per side: each agent's compliance submission holds that
    // side's status. An agent is payable when THEIR side is complete, not when
    // the whole deal is. Load side statuses for the deals in view.
    const sideStatusByTxnAgent: Record<string, string> = {}
    const sideStatusesByTxn: Record<string, string[]> = {}
    const sidesByTxn: Record<string, any[]> = {}
    if (txnIds.length) {
      // Deliberately still a raw select, not fetchAllRows. The mode filter is
      // a PostgREST filter string on a JSON path, and .in() on a JSON path is
      // not provably the same query. This is the compliance side derivation,
      // which is a hard rule: it is not re-implemented or rephrased. 380 rows
      // today against a 1,000 cap, so there is room; revisit before there is
      // not, and change it by testing the query, not by assuming.
      const { data: sideSubs } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('transaction_id, agent_id, submitted_at, status, data')
        .in('transaction_id', txnIds)
        .filter('data->>submission_mode', 'in', SIDE_MODES_FILTER)
      // Group by deal first so pickSideSubmissions can decide per transaction
      // whether the sides are its compliance submissions or its retainer.
      const subsByTxn: Record<string, any[]> = {}
      for (const s of sideSubs || []) {
        if (!s.transaction_id) continue
        if (!subsByTxn[s.transaction_id]) subsByTxn[s.transaction_id] = []
        subsByTxn[s.transaction_id].push(s)
      }
      for (const txnId of Object.keys(subsByTxn)) {
        const picked = pickSideSubmissions(subsByTxn[txnId])
        sidesByTxn[txnId] = picked
        for (const s of picked) {
          sideStatusByTxnAgent[`${txnId}:${s.agent_id}`] = s.status
          if (!sideStatusesByTxn[txnId]) sideStatusesByTxn[txnId] = []
          sideStatusesByTxn[txnId].push(s.status)
        }
      }
    }

    // Pull staged-but-pending debts/credits keyed by TIA so we can subtract
    // them from agent_net. After Mark Paid, agent_net already reflects them
    // (debts_deducted is on the row), so we only adjust for rows where the
    // TIA is still pending.
    const tiaIds = internalAgents.map(a => a.id).filter(Boolean)
    const stagedByTia: Record<string, { debts: number; credits: number }> = {}
    if (tiaIds.length > 0) {
      const stagedRecords = await fetchAllRows<any>(
        'agent_debts',
        'record_type, amount_owed, amount_remaining, offset_transaction_agent_id, status',
        { filters: [{ type: 'in', column: 'offset_transaction_agent_id', value: tiaIds }] }
      )
      for (const r of stagedRecords || []) {
        const key = r.offset_transaction_agent_id
        if (!key) continue
        if (!stagedByTia[key]) stagedByTia[key] = { debts: 0, credits: 0 }
        const owed = parseFloat(r.amount_owed ?? 0)
        const remaining = parseFloat(r.amount_remaining ?? 0)
        const applied = Math.max(0, owed - remaining)
        if (r.record_type === 'credit') stagedByTia[key].credits += applied
        else stagedByTia[key].debts += applied
      }
    }

    // Get agent names
    const agentIds = [...new Set(internalAgents.map(a => a.agent_id).filter(Boolean))]
    let agentNames: Record<string, string> = {}
    if (agentIds.length > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, preferred_first_name, first_name, preferred_last_name, last_name')
        .in('id', agentIds)
      for (const u of users || []) {
        agentNames[u.id] = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim()
      }
    }

    // Also get agent name for standalone checks linked to agent_id
    const standaloneAgentIds = [...new Set(allChecks.map(c => c.agent_id).filter(Boolean))]
    if (standaloneAgentIds.length > 0) {
      const { data: saUsers } = await supabaseAdmin
        .from('users')
        .select('id, preferred_first_name, first_name, preferred_last_name, last_name')
        .in('id', standaloneAgentIds)
      for (const u of saUsers || []) {
        agentNames[u.id] = `${u.preferred_first_name || u.first_name} ${u.preferred_last_name || u.last_name}`.trim()
      }
    }

    // Build txn lookup
    const txnMap = Object.fromEntries(transactions.map(t => [t.id, t]))

    // Checklist progress per transaction. Extracted to lib/payouts/checklist
    // so the sweep asks the same question the same way; two surfaces
    // disagreeing about whether a deal is ready is the class of bug this
    // build exists to remove. Counts as well as a boolean, because Needs
    // Attention says "Checklist 6 of 8" rather than just "not done".
    const checklistByTxn = await fetchChecklistProgress(
      transactions.map((t: any) => ({ id: t.id, transaction_type: t.transaction_type }))
    )

    // Multi-check support: office net and payouts belong to the transaction, not
    // to each check. Pick one anchor check per transaction (earliest received,
    // then lowest id) to carry them. Sibling checks of the same transaction show
    // as funding only, so nothing double counts on the report.
    const txnCheckGroups: Record<string, any[]> = {}
    for (const c of allChecks) {
      if (!c.transaction_id) continue
      ;(txnCheckGroups[c.transaction_id] ||= []).push(c)
    }
    const anchorCheckId: Record<string, string> = {}
    for (const [txnId, group] of Object.entries(txnCheckGroups)) {
      const ordered = [...group].sort((a, b) =>
        (a.received_date || '9999-12-31').localeCompare(b.received_date || '9999-12-31') ||
        String(a.id).localeCompare(String(b.id))
      )
      anchorCheckId[txnId] = ordered[0].id
    }

    // Central date, not UTC: after about 7pm Texas time UTC has already rolled
    // to tomorrow, which would treat a check clearing tomorrow as cleared.
    const today = getCentralDateString()

    // Paid, derived per deal rather than read off the stored flag, and keyed by
    // transaction so a funding-only sibling check answers the same as its
    // anchor. A deal is paid when every agent row and every outside brokerage
    // row on it says paid. A deal with no payees at all cannot be derived, so
    // those keep the stored flag instead of being called paid.
    const derivedPaidByTxn: Record<string, boolean> = {}
    for (const txnId of txnIds as string[]) {
      const agentsOn = internalAgents.filter(a => a.transaction_id === txnId)
      const externalsOn = externalBrokerages.filter(e => e.transaction_id === txnId)
      if (agentsOn.length + externalsOn.length === 0) continue
      derivedPaidByTxn[txnId] =
        agentsOn.every(a => a.payment_status === 'paid') &&
        externalsOn.every(e => e.payment_status === 'paid')
    }

    // Role sort priority — primary agent first
    const ROLE_PRIORITY: Record<string, number> = {
      primary_agent: 0, listing_agent: 1, co_agent: 2,
      referral_agent: 3, team_lead: 4,
    }
    const roleOrder = (r: string) => ROLE_PRIORITY[r] ?? 99

    // Pay-by per transaction. The detail page takes the latest received_date
    // and the latest compliance_complete_date across every check on the deal,
    // then adds 10 business days to whichever is later. Both dates must exist.
    // Standalone checks (no transaction) are keyed by their own check id.
    const payByKey = (c: any) => c.transaction_id || `check:${c.id}`
    const dateSpan: Record<string, { received: Date | null; compliance: Date | null }> = {}
    for (const c of allChecks) {
      const k = payByKey(c)
      if (!dateSpan[k]) dateSpan[k] = { received: null, compliance: null }
      if (c.received_date) {
        const d = new Date(c.received_date)
        if (!dateSpan[k].received || d > (dateSpan[k].received as Date)) dateSpan[k].received = d
      }
      if (c.compliance_complete_date) {
        const d = new Date(c.compliance_complete_date)
        if (!dateSpan[k].compliance || d > (dateSpan[k].compliance as Date)) dateSpan[k].compliance = d
      }
    }
    const payByDateFor: Record<string, string | null> = {}
    for (const [k, span] of Object.entries(dateSpan)) {
      if (!span.received || !span.compliance) { payByDateFor[k] = null; continue }
      const base = span.compliance > span.received ? span.compliance : span.received
      payByDateFor[k] = addBusinessDays(base, 10).toISOString().split('T')[0]
    }

    // Assemble rows
    const rows = allChecks.map(check => {
      const txn = check.transaction_id ? txnMap[check.transaction_id] : null
      const isAnchor = !check.transaction_id || anchorCheckId[check.transaction_id] === check.id
      const agents = (check.transaction_id && isAnchor)
        ? internalAgents
            .filter(a => a.transaction_id === check.transaction_id)
            .sort((a, b) => roleOrder(a.agent_role) - roleOrder(b.agent_role))
        : []
      const externals = (check.transaction_id && isAnchor)
        ? externalBrokerages.filter(e => e.transaction_id === check.transaction_id)
        : []

      const txnType = txn?.transaction_type || null
      const isLease = isLeaseType(txnType)

      const agentRows = agents.map(a => {
        const baseNet = parseFloat(a.agent_net || 0)
        // Apply staged debts/credits only when the TIA is not yet paid.
        // After Mark Paid, agent_net already reflects them.
        let amount = baseNet
        if (a.payment_status !== 'paid') {
          const staged = stagedByTia[a.id] || { debts: 0, credits: 0 }
          amount = baseNet - staged.debts + staged.credits
        }
        return {
          id: a.id,
          agent_id: a.agent_id,
          agent_role: a.agent_role,
          name: agentNames[a.agent_id] || 'Unknown',
          amount,
          payment_status: a.payment_status,
          payment_date: a.payment_date,
          is_lease: isLease,
          side_compliance: sideStatusByTxnAgent[`${a.transaction_id}:${a.agent_id}`] || null,
        }
      })

      const externalRows = externals.map(e => ({
        id: e.id,
        name: e.agent_name || e.brokerage_name || 'External',
        amount: e.commission_amount || 0,
        payment_status: e.payment_status,
        payment_date: e.payment_date,
        is_lease: isLease,
      }))

      const address = check.property_address || txn?.property_address || 'Unknown'
      // deriveSideStatus checks side coverage before the status ladder: an
      // intermediary deal with only one side filed is incomplete even when that
      // side is approved, because the missing side files no row and so cannot
      // show up as outstanding on its own.
      const sidesDerived = txn
        ? deriveSideStatus(sidesByTxn[txn.id] || [], txn.is_intermediary)
        : null
      // Single source: sidesDerived comes from compliance submissions and
      // txn.compliance_status is dual-written by the compliance page. The
      // stored per-check compliance_complete_date is consulted only as a
      // last resort for historical deals with no compliance submissions,
      // matching the fallback in lib/compliance/derive.ts.
      const complianceStatus = sidesDerived || txn?.compliance_status || (check.compliance_complete_date ? 'complete' : 'not_submitted')

      // Side progress for the report. Only meaningful when sides actually
      // filed: a historical deal with no submissions derives its status from
      // the stored date, and counting its (zero) sides would print 0/1 next to
      // a green "complete". Those send null and the report shows no fraction.
      const sideRows = txn ? sidesByTxn[txn.id] || [] : []
      const sidesExpected = sideRows.length > 0 ? expectedSides(txn?.is_intermediary) : null
      const sidesComplete =
        sidesExpected === null ? null : sideRows.filter((s: any) => s.status === 'complete').length

      // Standalone check with direct agent
      const standaloneAgentName = check.agent_id ? agentNames[check.agent_id] : null

      const checklistProgress = check.transaction_id
        ? (checklistByTxn[check.transaction_id] || { done: 0, required: 0, complete: false })
        : { done: 0, required: 0, complete: false }

      // Every check funding this deal has to have cleared, not just this one.
      const dealChecks = check.transaction_id
        ? (txnCheckGroups[check.transaction_id] || [check])
        : [check]
      const fundsCleared = dealChecks.every(c => !isNotCleared(c as HoldCheck, today))

      const derivedPaid = check.transaction_id && derivedPaidByTxn[check.transaction_id] !== undefined
        ? derivedPaidByTxn[check.transaction_id]
        : !!check.agents_paid

      return {
        check_id: check.id,
        transaction_id: check.transaction_id,
        address,
        // CRC's cut for a commission deal always comes from the deal's
        // brokerage net (office_net), never from the check's hand-entered
        // brokerage_amount. The check amount is used only when the linked
        // transaction has no commission math at all (office_gross 0/null,
        // e.g. a retainer), because such a transaction has no office_net to
        // show. A commission deal (office_gross > 0) whose office_net has not
        // been computed yet shows 0 rather than falling back to the check.
        // A commission deal whose office net has not been computed sends null,
        // not zero. A confident $0.00 next to a real deal reads as "we made
        // nothing on this", which is a different and wrong claim; null renders
        // as Unknown and puts the deal on a list someone has to clear.
        crc_amount: check.transaction_id
          ? (isAnchor
              ? (txn?.office_net != null
                  ? Number(txn.office_net)
                  : ((Number(txn?.office_gross) || 0) > 0 ? null : (check.brokerage_amount || 0)))
              : 0)
          : (check.brokerage_amount || 0),
        is_anchor: isAnchor,
        check_amount: check.check_amount,
        agents: agentRows,
        externals: externalRows,
        standalone_agent: standaloneAgentName,
        cleared_date: check.cleared_date,
        received_date: check.received_date,
        // Only promise a pay-by date once compliance is actually complete.
        // The date is gated on the same complianceStatus shown in the column,
        // not on the check's own compliance_complete_date, so a deal can never
        // display "not requested" next to a pay-by deadline.
        pay_by_date: complianceStatus === 'complete'
          ? (payByDateFor[check.transaction_id || `check:${check.id}`] || null)
          : null,
        compliance_status: complianceStatus,
        sides_complete: sidesComplete,
        sides_expected: sidesExpected,
        checklist_complete: checklistProgress.complete,
        checklist_done: checklistProgress.done,
        checklist_required: checklistProgress.required,
        // Funds cleared is a property of the whole deal, not of this one check.
        // A deal funded by two checks is not cleared until both are.
        funds_cleared: fundsCleared,
        office_net_state: officeNetState({
          hasPayoutsCheck: true,
          sweptAt: txn?.office_net_swept_at ?? null,
        }),
        office_net_swept_at: txn?.office_net_swept_at ?? null,
        office_net_swept_amount: txn?.office_net_swept_amount ?? null,
        crc_transferred: check.crc_transferred || false,
        // Derived, never the stored column. See the fetch above.
        agents_paid: derivedPaid,
        agents_paid_stored: check.agents_paid || false,
        status: check.status,
        notes: check.notes,
      }
    })

    // Company settings (bank balance, holds, payload pending)
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('bank_balance, funds_on_hold, payload_pending_balance, bank_balance_updated_at, payload_commission_link_id, payload_retainer_link_id')
      .limit(1)
      .maybeSingle()

    // Also In Payouts list (batched)
    // Active earmarks only. A released one is kept as history rather than
    // deleted, but it no longer holds anything back.
    const expenses = await fetchAllRows(
      'payout_expenses',
      '*',
      {
        filters: [{ type: 'eq', column: 'status', value: 'active' }],
        orderBy: { column: 'created_at', ascending: false },
      }
    )

    // The ledger balance, and what the recurring bills say is about to leave.
    // `ledgerBalance` is imported rather than re-summed here: three copies of a
    // balance is how two screens come to disagree about the same dollar.
    const ledger = await ledgerBalance()

    const billRows = await fetchAllRows<RecurringBill>(
      'recurring_bills',
      'id, name, amount, days, last_day_of_month, window_start_day, window_end_day, shift_earlier_for_nonbusiness, active, account',
      {
        filters: [
          { type: 'eq', column: 'active', value: true },
          // This report is the payouts account. `account` exists on the table
          // to keep the other accounts' bills out, and every live row happens
          // to be 'payouts' today, which is exactly when a missing filter goes
          // unnoticed until it does not.
          { type: 'eq', column: 'account', value: DEFAULT_LEDGER_ACCOUNT },
        ],
      }
    )
    const billOccurrences = billsDueWithin(billRows || [], today, 14)
    const billsDue = {
      total: billsDueTotal(billOccurrences),
      lines: billOccurrences,
    }

    // Pending PM agent referral fees (payee_type = 'agent', status = 'pending').
    // Brokerage-payee rows are intentionally excluded: that portion stays in
    // the CRC bank and would double-count the reconciliation.
    // Join to both landlord_disbursements (full-service) and pm_landlord_invoices
    // (self-collect and all new leases) since either may be the source. Use left
    // joins so rows with only an invoice (no disbursement) are not dropped.
    const pmAgentFeePayouts = await fetchAllRows(
      'pm_fee_payouts',
      `id, payee_id, payee_name, amount, payment_status, payment_date, payment_method,
       landlord_invoice_id,
       landlord_disbursements(
         period_month, period_year,
         managed_properties(property_address)
       ),
       pm_landlord_invoices(
         period_month, period_year,
         managed_properties(property_address)
       ),
       payee:users!pm_fee_payouts_payee_id_fkey(
         id, preferred_first_name, first_name, preferred_last_name, last_name
       )`,
      {
        filters: [
          { type: 'eq', column: 'payment_status', value: 'pending' },
          { type: 'eq', column: 'payee_type',     value: 'agent'   },
        ],
        orderBy: { column: 'created_at', ascending: false, nullsFirst: false },
      }
    )

    // Pending landlord disbursements
    const pendingLandlordDisbursements = await fetchAllRows(
      'landlord_disbursements',
      `id, net_amount, payment_status, payment_date, payment_method,
       period_month, period_year,
       landlords(first_name, last_name),
       managed_properties(property_address)`,
      {
        filters: [{ type: 'eq', column: 'payment_status', value: 'pending' }],
        orderBy: { column: 'created_at', ascending: false, nullsFirst: false },
      }
    )

    const pmFees = pmAgentFeePayouts.map(p => {
      // Use disbursement for period/property if present, fall back to landlord invoice
      const disb = (p as any).landlord_disbursements
      const inv  = (p as any).pm_landlord_invoices
      const property = disb?.managed_properties || inv?.managed_properties
      const u = (p as any).payee
      const periodM: number | null = disb?.period_month ?? inv?.period_month ?? null
      const periodY: number | null = disb?.period_year  ?? inv?.period_year  ?? null
      let payeeName = ''
      if (u) {
        const first = u.preferred_first_name || u.first_name || ''
        const last  = u.preferred_last_name  || u.last_name  || ''
        payeeName = `${first} ${last}`.trim()
      }
      if (!payeeName) payeeName = p.payee_name || 'Unknown Agent'
      return {
        id:             p.id,
        payee_name:     payeeName,
        payee_id:       p.payee_id || '',
        amount:         p.amount || 0,
        address:        property?.property_address || '',
        period:         periodLabel(periodM, periodY),
        payment_status: p.payment_status || 'pending',
        payment_date:   p.payment_date || null,
        payment_method: p.payment_method || null,
      }
    })

    const landlordPayouts = pendingLandlordDisbursements.map(d => {
      const ll = (d as any).landlords
      const property = (d as any).managed_properties
      const periodM: number | null = d.period_month ?? null
      const periodY: number | null = d.period_year ?? null
      const payeeName = ll
        ? (`${ll.first_name || ''} ${ll.last_name || ''}`.trim() || 'Unknown Landlord')
        : 'Unknown Landlord'
      return {
        id:             d.id,
        payee_name:     payeeName,
        amount:         d.net_amount || 0,
        address:        property?.property_address || '',
        period:         periodLabel(periodM, periodY),
        payment_status: d.payment_status || 'pending',
        payment_date:   d.payment_date || null,
        payment_method: d.payment_method || null,
      }
    })

    // Money still sitting at Payload and money the bank has not released.
    // Both come from lib/payouts/holds so the payouts report, the sweep and
    // the reconciliation screen can never disagree about the same dollar.
    const payload = await computePayloadPending(allChecks as HoldCheck[], settings, today)
    const holds = computeAutoHolds(allChecks as HoldCheck[], today)

    // Deals still to pay, after the derived paid flag. This is what the three
    // sections on the report are drawn from.
    const activeRows = rows.filter(r => !r.agents_paid)

    // Our share that is still in the payouts account: computed on deals whose
    // money is here and has not been moved, counted once per deal rather than
    // once per check. A deal whose office net has not been computed contributes
    // nothing and is listed instead, because a null is not a zero.
    const seenTxn = new Set<string>()
    let unsweptOfficeNet = 0
    const unsweptDeals: { transaction_id: string; address: string; amount: number }[] = []
    const officeNetUnknown: { transaction_id: string; address: string }[] = []
    for (const r of activeRows) {
      if (!r.transaction_id || !r.is_anchor) continue
      if (seenTxn.has(r.transaction_id)) continue
      seenTxn.add(r.transaction_id)
      if (r.office_net_state !== 'not_swept') continue
      if (r.crc_amount === null) {
        officeNetUnknown.push({ transaction_id: r.transaction_id, address: r.address })
        continue
      }
      const amount = Number(r.crc_amount) || 0
      if (amount <= 0) continue
      unsweptOfficeNet += amount
      unsweptDeals.push({ transaction_id: r.transaction_id, address: r.address, amount })
    }

    return NextResponse.json({
      rows: activeRows,
      settings: settings || {},
      expenses,
      pm_fees: pmFees,
      landlord_payouts: landlordPayouts,
      pending_payload_total: payload.total,
      payload_breakdown: {
        commission_link: payload.commission_link,
        retainer_link: payload.retainer_link,
        pm_rent: payload.pm_rent,
        other: payload.other,
      },
      hold_rows: holds.lines,
      auto_holds_total: holds.total,
      unswept_office_net: Math.round(unsweptOfficeNet * 100) / 100,
      unswept_deals: unsweptDeals.sort((a, b) => b.amount - a.amount),
      office_net_unknown: officeNetUnknown,
      // Once the ledger is started it is the balance, and the typed figure
      // stops being the source of truth for this screen. Both are sent so the
      // page can show which one it is using rather than silently switching.
      ledger_balance: ledger.balance,
      ledger_started: ledger.started,
      ledger_start_date: ledger.startDate,
      // Information beside the sweep, never subtracted. Settled spec section
      // 8: a 14 day window, shown so a transfer decision is made knowing what
      // is about to leave. Subtracting it would double count, because the bill
      // is not owed to anyone yet.
      bills_due_14_days: billsDue.total,
      bills_due_lines: billsDue.lines,
    })
  } catch (error: any) {
    console.error('Payouts report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { bank_balance, funds_on_hold, payload_pending_balance } = await request.json()

    const updates: any = { bank_balance_updated_at: new Date().toISOString() }
    if (bank_balance !== undefined) updates.bank_balance = parseFloat(bank_balance) || 0
    if (funds_on_hold !== undefined) updates.funds_on_hold = parseFloat(funds_on_hold) || 0
    if (payload_pending_balance !== undefined) updates.payload_pending_balance = parseFloat(payload_pending_balance) || 0

    const { data: existing } = await supabaseAdmin.from('company_settings').select('id').limit(1).maybeSingle()
    if (existing?.id) {
      await supabaseAdmin.from('company_settings').update(updates).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('company_settings').insert(updates)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const { action } = body

    // Mark external brokerage paid (agent mark-paid goes through /api/admin/transactions/[id])
    if (action === 'mark_external_paid') {
      const { external_id, payment_date, payment_method, payment_reference } = body
      if (!external_id) return NextResponse.json({ error: 'external_id required' }, { status: 400 })
      if (!payment_date) return NextResponse.json({ error: 'payment_date required' }, { status: 400 })
      const { error } = await supabaseAdmin
        .from('transaction_external_brokerages')
        .update({
          payment_status: 'paid',
          payment_date,
          payment_method: payment_method || null,
          payment_reference: payment_reference || null,
        })
        .eq('id', external_id)
      if (error) throw error
      // Money has left the payouts account, so record it now rather than at
      // the next nightly run. Best effort for the same reason as Mark Paid:
      // the brokerage has been paid either way.
      await syncPayoutsLedgerQuietly(auth.user.id)
      return NextResponse.json({ success: true })
    }

    // Compliance status is set only from the compliance request page.
    // The old per-check manual write (compliance_complete_date stamp plus
    // transactions.compliance_status update) was removed intentionally as
    // part of single-sourcing compliance. Unknown actions now error.
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
