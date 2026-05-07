import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

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
      `id, property_address, check_amount, brokerage_amount,
       received_date, cleared_date, deposited_date,
       compliance_complete_date, crc_transferred, agents_paid, status, notes,
       transaction_id, agent_id, payment_method`,
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
      `id, property_address, check_amount, brokerage_amount,
       received_date, cleared_date, deposited_date,
       compliance_complete_date, crc_transferred, agents_paid, status, notes,
       transaction_id, agent_id, payment_method`,
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
          .select('id, property_address, compliance_status, transaction_type')
          .in('id', txnIds),
      ])
      internalAgents = agentsRes.data || []
      externalBrokerages = externalRes.data || []
      transactions = txnRes.data || []
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

    // Role sort priority — primary agent first
    const ROLE_PRIORITY: Record<string, number> = {
      primary_agent: 0, listing_agent: 1, co_agent: 2,
      referral_agent: 3, team_lead: 4,
    }
    const roleOrder = (r: string) => ROLE_PRIORITY[r] ?? 99

    // Assemble rows
    const rows = allChecks.map(check => {
      const txn = check.transaction_id ? txnMap[check.transaction_id] : null
      const agents = internalAgents
        .filter(a => a.transaction_id === check.transaction_id)
        .sort((a, b) => roleOrder(a.agent_role) - roleOrder(b.agent_role))
      const externals = externalBrokerages.filter(e => e.transaction_id === check.transaction_id)

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
          agent_id: a.agent_id,
          name: agentNames[a.agent_id] || 'Unknown',
          amount,
          payment_status: a.payment_status,
          payment_date: a.payment_date,
        }
      })

      const externalRows = externals.map(e => ({
        name: e.agent_name || e.brokerage_name || 'External',
        amount: e.commission_amount || 0,
        payment_status: e.payment_status,
        payment_date: e.payment_date,
      }))

      const address = check.property_address || txn?.property_address || 'Unknown'
      const complianceStatus = txn?.compliance_status || (check.compliance_complete_date ? 'complete' : 'not_submitted')

      // Standalone check with direct agent
      const standaloneAgentName = check.agent_id ? agentNames[check.agent_id] : null

      return {
        check_id: check.id,
        transaction_id: check.transaction_id,
        address,
        crc_amount: check.brokerage_amount || 0,
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
      .select('bank_balance, funds_on_hold, payload_pending_balance, bank_balance_updated_at')
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
    const pmAgentFeePayouts = await fetchAllRows(
      'pm_fee_payouts',
      `id, payee_id, payee_name, amount, payment_status, payment_date, payment_method,
       landlord_disbursements!inner(
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
      const disb = (p as any).landlord_disbursements
      const property = disb?.managed_properties
      const u = (p as any).payee
      const periodM: number | null = disb?.period_month ?? null
      const periodY: number | null = disb?.period_year ?? null
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
   // A cleared_date in the future still counts as pending
   const today = new Date().toISOString().split('T')[0]
   const pendingPayloadTotal = allChecks
     .filter(c => c.payment_method === 'payload' && (!c.cleared_date || c.cleared_date > today))
     .reduce((sum, c) => sum + (c.check_amount || 0), 0)

    return NextResponse.json({
      rows,
      settings: settings || {},
      expenses,
      pm_fees: pmFees,
      landlord_payouts: landlordPayouts,
      pending_payload_total: pendingPayloadTotal,
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

// Update compliance status for a specific check
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    const { check_id, compliance_status } = await request.json()

    if (!check_id) {
      return NextResponse.json({ error: 'check_id is required' }, { status: 400 })
    }

    // Update the check's compliance status (stored on checks_received or via compliance_complete_date)
    const updates: Record<string, any> = {}
    
    if (compliance_status === 'complete') {
      updates.compliance_complete_date = new Date().toISOString().split('T')[0]
    } else if (compliance_status === 'not_submitted') {
      updates.compliance_complete_date = null
    }
    
    // Also store the explicit status if there's a column for it
    // For now, we'll use compliance_complete_date to indicate completion
    // and null to indicate not submitted
    
    const { error } = await supabaseAdmin
      .from('checks_received')
      .update(updates)
      .eq('id', check_id)

    if (error) throw error

    // If there's a linked transaction, update its compliance_status too
    const { data: check } = await supabaseAdmin
      .from('checks_received')
      .select('transaction_id')
      .eq('id', check_id)
      .single()

    if (check?.transaction_id) {
      await supabaseAdmin
        .from('transactions')
        .update({ compliance_status })
        .eq('id', check.transaction_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}