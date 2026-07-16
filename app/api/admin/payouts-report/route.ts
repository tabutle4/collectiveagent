import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'
import { getCentralDateString } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

function isLeaseType(t: string | null): boolean {
  if (!t) return false
  if (t === 'lease') return true
  return isLeaseTransactionType(t)
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
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    // Fetch all checks linked to transactions (batched)
    const checks = await fetchAllRows(
      'checks_received',
      `id, property_address, check_amount, brokerage_amount, hold_amount, check_from,
       received_date, cleared_date, deposited_date,
       compliance_complete_date, crc_transferred, agents_paid, status, notes,
       transaction_id, agent_id, payment_method, payload_payment_link_id`,
      {
        filters: [
          { type: 'not', column: 'transaction_id', value: null },
          { type: 'eq', column: 'agents_paid', value: false },
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
       transaction_id, agent_id, payment_method, payload_payment_link_id`,
      {
        filters: [
          { type: 'is', column: 'transaction_id', value: null },
          { type: 'eq', column: 'agents_paid', value: false },
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
      const [agentsRes, externalRes, txnRes] = await Promise.all([
        supabaseAdmin
          .from('transaction_internal_agents')
          .select('id, transaction_id, agent_id, agent_role, agent_net, payment_status, payment_date, payment_method')
          .in('transaction_id', txnIds),
        supabaseAdmin
          .from('transaction_external_brokerages')
          .select('transaction_id, brokerage_name, agent_name, commission_amount, payment_status, payment_date')
          .in('transaction_id', txnIds),
        supabaseAdmin
          .from('transactions')
          .select('id, property_address, compliance_status, transaction_type, office_net')
          .in('id', txnIds),
      ])
      internalAgents = agentsRes.data || []
      externalBrokerages = externalRes.data || []
      transactions = txnRes.data || []
    }

    // Compliance is per side: each agent's compliance submission holds that
    // side's status. An agent is payable when THEIR side is complete, not when
    // the whole deal is. Load side statuses for the deals in view.
    const sideStatusByTxnAgent: Record<string, string> = {}
    const sideStatusesByTxn: Record<string, string[]> = {}
    if (txnIds.length) {
      const { data: sideSubs } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('transaction_id, agent_id, status, data')
        .in('transaction_id', txnIds)
        .filter('data->>submission_mode', 'eq', 'compliance')
      for (const s of sideSubs || []) {
        if (!s.transaction_id) continue
        sideStatusByTxnAgent[`${s.transaction_id}:${s.agent_id}`] = s.status
        if (!sideStatusesByTxn[s.transaction_id]) sideStatusesByTxn[s.transaction_id] = []
        sideStatusesByTxn[s.transaction_id].push(s.status)
      }
    }

    // Pull staged-but-pending debts/credits keyed by TIA so we can subtract
    // them from agent_net. After Mark Paid, agent_net already reflects them
    // (debts_deducted is on the row), so we only adjust for rows where the
    // TIA is still pending.
    const tiaIds = internalAgents.map(a => a.id).filter(Boolean)
    const stagedByTia: Record<string, { debts: number; credits: number }> = {}
    if (tiaIds.length > 0) {
      const { data: stagedRecords } = await supabaseAdmin
        .from('agent_debts')
        .select('record_type, amount_owed, amount_remaining, offset_transaction_agent_id, status')
        .in('offset_transaction_agent_id', tiaIds)
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

    // Role sort priority — primary agent first
    const ROLE_PRIORITY: Record<string, number> = {
      primary_agent: 0, listing_agent: 1, co_agent: 2,
      referral_agent: 3, team_lead: 4,
    }
    const roleOrder = (r: string) => ROLE_PRIORITY[r] ?? 99

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
      const sideStatuses = txn ? sideStatusesByTxn[txn.id] || [] : []
      const sidesDerived = sideStatuses.length === 0
        ? null
        : sideStatuses.includes('incomplete')
          ? 'incomplete'
          : sideStatuses.some(s => s === 'in_review' || s === 'submitted')
            ? 'in_review'
            : 'complete'
      // Single source: sidesDerived comes from compliance submissions and
      // txn.compliance_status is dual-written by the compliance page. The
      // stored per-check compliance_complete_date is consulted only as a
      // last resort for historical deals with no compliance submissions,
      // matching the fallback in lib/compliance/derive.ts.
      const complianceStatus = sidesDerived || txn?.compliance_status || (check.compliance_complete_date ? 'complete' : 'not_submitted')

      // Standalone check with direct agent
      const standaloneAgentName = check.agent_id ? agentNames[check.agent_id] : null

      return {
        check_id: check.id,
        transaction_id: check.transaction_id,
        address,
        // office net for commission deals; hand-entered amount for retainers and
        // other transactions with no commission math (office_net null)
        crc_amount: check.transaction_id
          ? (isAnchor ? (txn?.office_net != null ? Number(txn.office_net) : (check.brokerage_amount || 0)) : 0)
          : (check.brokerage_amount || 0),
        is_anchor: isAnchor,
        check_amount: check.check_amount,
        agents: agentRows,
        externals: externalRows,
        standalone_agent: standaloneAgentName,
        cleared_date: check.cleared_date,
        received_date: check.received_date,
        compliance_status: complianceStatus,
        crc_transferred: check.crc_transferred || false,
        agents_paid: check.agents_paid || false,
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
    const expenses = await fetchAllRows(
      'payout_expenses',
      '*',
      { orderBy: { column: 'created_at', ascending: false } }
    )

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

    // Auto-calculate pending Payload: checks where payment_method = 'payload' and not yet cleared
    // A cleared_date in the future still counts as pending. Use Central date,
    // not UTC: after ~7pm Texas time UTC has already rolled to tomorrow, which
    // would wrongly treat a check clearing tomorrow as already cleared.
    const today = getCentralDateString()
    // Rejected checks (ACH returned via Payload) never land, so they count
    // neither as pending payload nor as bank holds.
    const notCleared = (c: any) => (!c.cleared_date || c.cleared_date > today) && c.status !== 'rejected'
    const pendingPayloadChecks = allChecks.filter(c => c.payment_method === 'payload' && notCleared(c))

    // Split by source pay link so the report can break Pending Payload down.
    const commissionLinkId = settings?.payload_commission_link_id || null
    const retainerLinkId   = settings?.payload_retainer_link_id || null
    const sumChecks = (list: any[]) => list.reduce((sum, c) => sum + (parseFloat(c.check_amount) || 0), 0)
    const commissionLinkTotal = commissionLinkId
      ? sumChecks(pendingPayloadChecks.filter(c => c.payload_payment_link_id === commissionLinkId))
      : 0
    const retainerLinkTotal = retainerLinkId
      ? sumChecks(pendingPayloadChecks.filter(c => c.payload_payment_link_id === retainerLinkId))
      : 0
    const otherPayloadTotal = sumChecks(pendingPayloadChecks.filter(c =>
      c.payload_payment_link_id !== commissionLinkId && c.payload_payment_link_id !== retainerLinkId
    ))

    // PM rent in flight: tenant invoices paid via Payload whose funds have not
    // settled yet (funds_cleared_at stamped by the daily funding-sync cron).
    const pendingRentInvoices = await fetchAllRows(
      'tenant_invoices',
      'id, paid_amount, total_amount, payment_method, status, funds_cleared_at',
      {
        filters: [
          { type: 'eq', column: 'payment_method', value: 'payload' },
          { type: 'eq', column: 'status', value: 'paid' },
          { type: 'is', column: 'funds_cleared_at', value: null },
        ],
      }
    )
    const pmRentTotal = pendingRentInvoices.reduce(
      (sum, inv) => sum + (parseFloat(inv.paid_amount ?? inv.total_amount) || 0), 0
    )

    const pendingPayloadTotal = commissionLinkTotal + retainerLinkTotal + otherPayloadTotal + pmRentTotal

    // Auto bank holds: per-check hold_amount for checks that have not cleared.
    // Payload-method checks are excluded (they are counted in Pending Payload).
    const holdRows = allChecks
      .filter(c => c.payment_method !== 'payload' && notCleared(c) && (parseFloat(c.hold_amount) || 0) > 0)
      .map(c => ({
        check_id: c.id,
        label: c.property_address || c.check_from || 'Check',
        amount: parseFloat(c.hold_amount) || 0,
      }))
    const autoHoldsTotal = holdRows.reduce((sum, h) => sum + h.amount, 0)

    return NextResponse.json({
      rows,
      settings: settings || {},
      expenses,
      pm_fees: pmFees,
      landlord_payouts: landlordPayouts,
      pending_payload_total: pendingPayloadTotal,
      payload_breakdown: {
        commission_link: commissionLinkTotal,
        retainer_link: retainerLinkTotal,
        pm_rent: pmRentTotal,
        other: otherPayloadTotal,
      },
      hold_rows: holdRows,
      auto_holds_total: autoHoldsTotal,
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
