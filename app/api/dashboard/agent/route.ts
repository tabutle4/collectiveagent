import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()
    const userId = session.user.id

    // Load user, commission plan, transactions, and agent rows in parallel
    const [userRes, txnRes, agentRowsRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, commission_plan, cap_progress, qualifying_transaction_count, sales_volume_goal, units_goal, agent_net_goal, active_goals, division, monthly_fee_paid_through, full_nav_access')
        .eq('id', userId)
        .single(),
      supabase
        .from('transactions')
        .select('id, property_address, status, transaction_type, sales_price, monthly_rent, lease_term, client_name, updated_at, closing_date, closed_date, move_in_date')
        .eq('submitted_by', userId)
        .order('updated_at', { ascending: false }),
      supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_net, sales_volume, units')
        .eq('agent_id', userId),
    ])

    if (userRes.error) throw userRes.error
    const user = userRes.data

    // Load commission plan if user has one
    let commissionPlan = null
    if (user?.commission_plan) {
      const { data: plan } = await supabase
        .from('commission_plans')
        .select('id, name, has_cap, cap_amount, agent_split_percentage, firm_split_percentage, post_cap_agent_split, min_transactions_to_upgrade')
        .eq('name', user.commission_plan)
        .eq('is_active', true)
        .single()
      commissionPlan = plan
    }

    return NextResponse.json({
      user,
      commissionPlan,
      transactions: txnRes.data || [],
      agentRows: agentRowsRes.data || [],
    })
  } catch (err: any) {
    console.error('Agent dashboard API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}