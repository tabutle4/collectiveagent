import { NextRequest, NextResponse } from 'next/server'
import { validateMagicLink } from '@/lib/magic-links'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Access token is required' }, { status: 400 })
    }

    const validation = validateMagicLink(token)
    if (!validation) {
      return NextResponse.json({ error: 'Invalid access link' }, { status: 401 })
    }

    const supabase = createClient()

    const { data: coordination, error: coordError } = await supabase
      .from('listing_coordination')
      .select('*')
      .eq('seller_magic_link', token)
      .single()

    if (coordError || !coordination) {
      return NextResponse.json(
        { error: 'Coordination not found or access link expired' },
        { status: 404 }
      )
    }

    if (!coordination.is_active) {
      return NextResponse.json(
        { error: 'This listing coordination service is no longer active' },
        { status: 403 }
      )
    }

    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', coordination.listing_id)
      .single()

    if (transactionError || !transaction) {
      return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
    }

    const { data: reports } = await supabase
      .from('coordination_weekly_reports')
      .select('*')
      .eq('coordination_id', coordination.id)
      .order('week_start_date', { ascending: false })
      .limit(4)

    // Get agent info from transaction_internal_agents
    let agentInfo = null

    // First try to get agent from transaction_internal_agents
    const { data: transactionAgent } = await supabase
      .from('transaction_internal_agents')
      .select('agent_id')
      .eq('transaction_id', transaction.id)
      .eq('agent_role', 'listing_agent')
      .single()

    const agentIdToUse = transactionAgent?.agent_id || coordination.agent_id

    if (agentIdToUse) {
      const { data: agentData } = await supabase
        .from('users')
        .select(
          'first_name, last_name, preferred_first_name, preferred_last_name, email, business_phone, personal_phone, role'
        )
        .eq('id', agentIdToUse)
        .single()

      if (agentData) {
        // For Courtney (broker only), use personal phone; for others, use business phone
        const isCourtneyBroker =
          (agentData.email?.toLowerCase().includes('courtney') ||
            agentData.preferred_first_name?.toLowerCase() === 'courtney' ||
            agentData.first_name?.toLowerCase() === 'courtney') &&
          agentData.role === 'Broker'

        const phone = isCourtneyBroker
          ? agentData.personal_phone || agentData.business_phone || ''
          : agentData.business_phone || agentData.personal_phone || ''

        agentInfo = {
          name:
            agentData.preferred_first_name && agentData.preferred_last_name
              ? `${agentData.preferred_first_name} ${agentData.preferred_last_name}`
              : `${agentData.first_name} ${agentData.last_name}`,
          email: agentData.email,
          phone: phone,
        }
      }
    }

    return NextResponse.json({
      success: true,
      coordination,
      listing: transaction,
      reports: reports || [],
      agent: agentInfo,
    })
  } catch (error: any) {
    console.error('Error loading seller dashboard:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load dashboard' },
      { status: 500 }
    )
  }
}
