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

    const [txnRes, agentRes, typesRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, status, transaction_type, sales_price, monthly_rent, lease_term, closing_date, move_in_date, office_net'),
      supabase
        .from('transaction_internal_agents')
        .select('transaction_id, agent_net'),
      supabase
        .from('processing_fee_types')
        .select('name, is_lease')
        .eq('is_active', true),
    ])

    return NextResponse.json({
      transactions: txnRes.data || [],
      agentRows: agentRes.data || [],
      processingFeeTypes: typesRes.data || [],
    })
  } catch (err: any) {
    console.error('Dashboard transactions API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}