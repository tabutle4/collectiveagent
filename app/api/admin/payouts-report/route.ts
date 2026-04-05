import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

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
      .order('cleared_date', { ascending: false })

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
      .order('cleared_date', { ascending: false })

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
          .select('transaction_id, agent_id, agent_role, agent_net, payment_status, payment_date, payment_method')
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

    // Assemble rows
    const rows = allChecks.map(check => {
      const txn = check.transaction_id ? txnMap[check.transaction_id] : null
      const agents = internalAgents.filter(a => a.transaction_id === check.transaction_id)
      const externals = externalBrokerages.filter(e => e.transaction_id === check.transaction_id)

      const agentRows = agents.map(a => ({
        agent_id: a.agent_id,
        name: agentNames[a.agent_id] || 'Unknown',
        amount: a.agent_net || 0,
        payment_status: a.payment_status,
        payment_date: a.payment_date,
      }))

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

    // Also In Payouts list
    const { data: expenses } = await supabaseAdmin
      .from('payout_expenses')
      .select('*')
      .order('created_at', { ascending: false })

    // Auto-calculate pending Payload: checks where payment_method = 'payload' and not yet cleared
    const pendingPayloadTotal = allChecks
      .filter(c => c.payment_method === 'payload' && c.status !== 'cleared')
      .reduce((sum, c) => sum + (c.check_amount || 0), 0)

    return NextResponse.json({
      rows,
      settings: settings || {},
      expenses: expenses || [],
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