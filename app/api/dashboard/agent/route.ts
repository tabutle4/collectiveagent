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
        .select(
          'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, commission_plan, qualifying_transaction_count, sales_volume_goal, units_goal, agent_net_goal, active_goals, division, monthly_fee_paid_through, full_nav_access'
        )
        .eq('id', userId)
        .single(),
      supabase
        .from('transactions')
        .select(
          'id, property_address, status, transaction_type, sales_price, monthly_rent, lease_term, client_name, updated_at, closing_date, closed_date, move_in_date'
        )
        .eq('submitted_by', userId)
        .order('closing_date', { ascending: false }),
      supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_net, sales_volume, units, brokerage_split, counts_toward_progress')
        .eq('agent_id', userId),
    ])

    if (userRes.error) throw userRes.error
    const user = userRes.data

    // Detect cap plan from string (handles custom plans like "Custom - 85/15 Cap")
    const planStr = (user?.commission_plan || '').toLowerCase()
    const hasCap = (planStr.includes('cap') && !planStr.includes('no cap')) || 
                   (planStr.startsWith('custom') && planStr.includes('cap') && !planStr.includes('no cap'))
    
    // Load commission plan if user has one (for other plan details)
    let commissionPlan = null
    if (user?.commission_plan) {
      const { data: plan } = await supabase
        .from('commission_plans')
        .select(
          'id, name, has_cap, cap_amount, agent_split_percentage, firm_split_percentage, post_cap_agent_split, min_transactions_to_upgrade'
        )
        .eq('name', user.commission_plan)
        .eq('is_active', true)
        .single()
      commissionPlan = plan
    }
    
    // Calculate YTD cap progress from TIA (not stored value)
    let capProgress = 0
    if (hasCap) {
      const currentYear = new Date().getFullYear()
      const yearStart = `${currentYear}-01-01`
      
      // Get closed transaction IDs for this year
      const { data: closedTxns } = await supabase
        .from('transactions')
        .select('id')
        .eq('status', 'closed')
        .gte('closing_date', yearStart)
      
      const closedIds = (closedTxns || []).map(t => t.id)
      
      // Sum brokerage_split from agent rows on those transactions
      const agentRows = agentRowsRes.data || []
      capProgress = agentRows
        .filter((r: any) => 
          closedIds.includes(r.transaction_id) && 
          r.counts_toward_progress !== false
        )
        .reduce((sum: number, r: any) => sum + parseFloat(r.brokerage_split || 0), 0)
    }
    
    // Override commission plan cap info for custom plans
    if (hasCap && !commissionPlan?.has_cap) {
      commissionPlan = {
        ...commissionPlan,
        has_cap: true,
        cap_amount: 18000,
      }
    }

    return NextResponse.json({
      user,
      commissionPlan,
      transactions: txnRes.data || [],
      agentRows: agentRowsRes.data || [],
      capProgress,
    })
  } catch (err: any) {
    console.error('Agent dashboard API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
