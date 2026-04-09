import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Add business days (M-F) to a date
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date)
  let added = 0
  while (added < days) {
    result.setDate(result.getDate() + 1)
    const dow = result.getDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return result
}

// Calculate pay-by date - requires BOTH received_date and compliance_complete_date
function calculatePayByDate(receivedDate: string | null, complianceDate: string | null): string | null {
  if (!receivedDate || !complianceDate) return null
  const received = new Date(receivedDate)
  const compliance = new Date(complianceDate)
  const base = compliance > received ? compliance : received
  const payBy = addBusinessDays(base, 10)
  return payBy.toISOString().split('T')[0]
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  try {
    // Fetch all checks linked to transactions with agent + external data
    const { data: checks, error: checksError } = await supabaseAdmin
      .from('checks_received')
      .select(`
        id, property_address, check_amount, brokerage_amount,
        received_date, cleared_date, deposited_date,
        compliance_complete_date, crc_transferred, agents_paid, status, notes,
        transaction_id, agent_id, payment_method
      `)
      .not('transaction_id', 'is', null)
      .eq('agents_paid', false)
      .order('cleared_date', { ascending: false })
      .range(0, 9999)

    if (checksError) throw checksError

    // Fetch standalone checks (no transaction)
    const { data: standaloneChecks } = await supabaseAdmin
      .from('checks_received')
      .select(`
        id, property_address, check_amount, brokerage_amount,
        received_date, cleared_date, deposited_date,
        compliance_complete_date, crc_transferred, agents_paid, status, notes,
        transaction_id, agent_id, payment_method
      `)
      .is('transaction_id', null)
      .eq('agents_paid', false)
      .order('cleared_date', { ascending: false })
      .range(0, 9999)

    const allChecks = [...(checks || []), ...(standaloneChecks || [])]

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
          .select('id, transaction_id, brokerage_name, agent_name, commission_amount, payment_status, payment_date')
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

    // Group checks by transaction_id to avoid duplicate agent rows
    const checksByTransaction = new Map<string | null, any[]>()
    for (const check of allChecks) {
      const key = check.transaction_id || `standalone-${check.id}`
      if (!checksByTransaction.has(key)) {
        checksByTransaction.set(key, [])
      }
      checksByTransaction.get(key)!.push(check)
    }

    // Assemble rows - one per transaction (or standalone check)
    const rows: any[] = []
    for (const [key, checksGroup] of checksByTransaction.entries()) {
      const firstCheck = checksGroup[0]
      const txn = firstCheck.transaction_id ? txnMap[firstCheck.transaction_id] : null
      const agents = internalAgents
        .filter(a => a.transaction_id === firstCheck.transaction_id)
        .sort((a, b) => roleOrder(a.agent_role) - roleOrder(b.agent_role))
      const externals = externalBrokerages.filter(e => e.transaction_id === firstCheck.transaction_id)

      const agentRows = agents.map(a => ({
        id: a.id, // TIA record id for marking paid
        agent_id: a.agent_id,
        name: agentNames[a.agent_id] || 'Unknown',
        amount: a.agent_net || 0,
        payment_status: a.payment_status,
        payment_date: a.payment_date,
      }))

      const externalRows = externals.map(e => ({
        id: e.id, // External brokerage record id
        name: e.agent_name || e.brokerage_name || 'External',
        amount: e.commission_amount || 0,
        payment_status: e.payment_status,
        payment_date: e.payment_date,
      }))

      const address = firstCheck.property_address || txn?.property_address || 'Unknown'
      const complianceStatus = txn?.compliance_status || (firstCheck.compliance_complete_date ? 'complete' : 'not_submitted')

      // Standalone check with direct agent
      const standaloneAgentName = firstCheck.agent_id ? agentNames[firstCheck.agent_id] : null

      // Sum amounts across all checks in this group
      const totalCheckAmount = checksGroup.reduce((sum: number, c: any) => sum + (c.check_amount || 0), 0)
      const totalBrokerageAmount = checksGroup.reduce((sum: number, c: any) => sum + (c.brokerage_amount || 0), 0)

      // Use latest cleared date from any check (not requiring all to be cleared)
      let latestClearedDate: string | null = null
      for (const c of checksGroup) {
        if (c.cleared_date && (!latestClearedDate || c.cleared_date > latestClearedDate)) {
          latestClearedDate = c.cleared_date
        }
      }

      // CRC transferred only when ALL checks have been transferred
      const allCrcTransferred = checksGroup.every((c: any) => c.crc_transferred)
      
      // Check-level agents_paid flag (manual override) - true if ANY check is marked
      const checkAgentsPaid = checksGroup.some((c: any) => c.agents_paid)

      // Find latest received and compliance dates for pay-by calculation
      let latestReceived: string | null = null
      let latestCompliance: string | null = null
      for (const c of checksGroup) {
        if (c.received_date && (!latestReceived || c.received_date > latestReceived)) {
          latestReceived = c.received_date
        }
        if (c.compliance_complete_date && (!latestCompliance || c.compliance_complete_date > latestCompliance)) {
          latestCompliance = c.compliance_complete_date
        }
      }
      const payByDate = calculatePayByDate(latestReceived, latestCompliance)

      rows.push({
        check_id: firstCheck.id, // Primary check ID for actions
        check_ids: checksGroup.map((c: any) => c.id), // All check IDs
        transaction_id: firstCheck.transaction_id,
        address,
        crc_amount: totalBrokerageAmount,
        check_amount: totalCheckAmount,
        check_count: checksGroup.length,
        agents: agentRows,
        externals: externalRows,
        standalone_agent: standaloneAgentName,
        cleared_date: latestClearedDate,
        received_date: firstCheck.received_date,
        compliance_status: complianceStatus,
        pay_by_date: payByDate,
        crc_transferred: allCrcTransferred,
        agents_paid: checkAgentsPaid,
        status: firstCheck.status,
        notes: checksGroup.map((c: any) => c.notes).filter(Boolean).join(' | '),
      })
    }

    // Company settings (bank balance, holds, payload pending)
    const { data: settings } = await supabaseAdmin
      .from('company_settings')
      .select('bank_balance, funds_on_hold, payload_pending_balance, bank_balance_updated_at')
      .limit(1)
      .maybeSingle()

    // Also In Payouts list
    const { data: expenses } = await supabaseAdmin
      .from('payout_expenses')
      .select('*')
      .order('created_at', { ascending: false })
      .range(0, 9999)

    // Auto-calculate pending Payload: checks where payment_method = 'payload' and not yet cleared
    const pendingPayloadTotal = allChecks
      .filter(c => c.payment_method === 'payload' && !c.cleared_date)
      .reduce((sum, c) => sum + (c.check_amount || 0), 0)

    // PM Fee Payouts (agent referrals only, pending)
    const { data: pmFeePayouts, error: pmError } = await supabaseAdmin
      .from('pm_fee_payouts')
      .select(`
        id, payee_type, payee_id, payee_name, amount,
        payment_status, payment_date, payment_method,
        landlord_disbursements!inner(
          id, period_month, period_year,
          managed_properties(property_address, city)
        )
      `)
      .eq('payee_type', 'agent')
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (pmError) console.error('PM fee payouts error:', pmError)

    // Format PM fee payouts
    const pmFees = (pmFeePayouts || []).map(p => {
      const disb = p.landlord_disbursements as any
      const prop = disb?.managed_properties as any
      const periodLabel = disb ? `${disb.period_month}/${disb.period_year}` : ''
      const fullAddress = [prop?.property_address, prop?.city].filter(Boolean).join(', ')
      return {
        id: p.id,
        payee_name: p.payee_name,
        payee_id: p.payee_id,
        amount: p.amount || 0,
        address: fullAddress,
        period: periodLabel,
        payment_status: p.payment_status,
        payment_date: p.payment_date,
        payment_method: p.payment_method,
      }
    })

    // Landlord Disbursements (pending)
    const { data: landlordDisbursements, error: ldError } = await supabaseAdmin
      .from('landlord_disbursements')
      .select(`
        id, net_amount, payment_status, payment_date, payment_method,
        period_month, period_year,
        landlords(id, first_name, last_name),
        managed_properties(property_address, city)
      `)
      .eq('payment_status', 'pending')
      .order('created_at', { ascending: false })
      .range(0, 9999)

    if (ldError) console.error('Landlord disbursements error:', ldError)

    // Format landlord disbursements
    const landlordPayouts = (landlordDisbursements || []).map(d => {
      const landlord = d.landlords as any
      const prop = d.managed_properties as any
      const periodLabel = `${d.period_month}/${d.period_year}`
      const fullAddress = [prop?.property_address, prop?.city].filter(Boolean).join(', ')
      const landlordName = landlord 
        ? `${landlord.first_name} ${landlord.last_name}`.trim()
        : 'Unknown Landlord'
      return {
        id: d.id,
        payee_name: landlordName,
        amount: d.net_amount || 0,
        address: fullAddress,
        period: periodLabel,
        payment_status: d.payment_status,
        payment_date: d.payment_date,
        payment_method: d.payment_method,
      }
    })

    return NextResponse.json({
      rows,
      settings: settings || {},
      expenses: expenses || [],
      pending_payload_total: pendingPayloadTotal,
      pm_fees: pmFees,
      landlord_payouts: landlordPayouts,
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
    const body = await request.json()
    const { action } = body

    // Mark individual agent (TIA) as paid
    if (action === 'mark_agent_paid') {
      const { tia_id, payment_method } = body
      if (!tia_id) {
        return NextResponse.json({ error: 'tia_id is required' }, { status: 400 })
      }

      const today = new Date().toISOString().split('T')[0]
      
      const { error } = await supabaseAdmin
        .from('transaction_internal_agents')
        .update({
          payment_status: 'paid',
          payment_date: today,
          payment_method: payment_method || 'check',
        })
        .eq('id', tia_id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // Mark external brokerage as paid
    if (action === 'mark_external_paid') {
      const { external_id, payment_method } = body
      if (!external_id) {
        return NextResponse.json({ error: 'external_id is required' }, { status: 400 })
      }

      const today = new Date().toISOString().split('T')[0]
      
      const { error } = await supabaseAdmin
        .from('transaction_external_brokerages')
        .update({
          payment_status: 'paid',
          payment_date: today,
          payment_method: payment_method || 'check',
        })
        .eq('id', external_id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    // Update compliance status (existing functionality)
    const { check_id, compliance_status } = body

    if (!check_id) {
      return NextResponse.json({ error: 'check_id is required' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    
    if (compliance_status === 'complete') {
      updates.compliance_complete_date = new Date().toISOString().split('T')[0]
    } else if (compliance_status === 'not_submitted') {
      updates.compliance_complete_date = null
    }
    
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
