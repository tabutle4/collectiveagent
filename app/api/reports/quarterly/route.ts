import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireRole } from '@/lib/api-auth'

/**
 * GET /api/reports/quarterly
 * 
 * Returns all data needed for the quarterly sales meeting presentation.
 * Only accessible by operations and broker roles.
 * 
 * Query params:
 *   - year: number (default: current year)
 *   - quarter: 1-4 (default: current quarter)
 */
export async function GET(request: NextRequest) {
  // Only operations and broker can access reports
  const auth = await requireRole(request, ['operations', 'broker'])
  if (auth.error) return auth.error

  try {
    const { searchParams } = new URL(request.url)
    
    // Determine quarter date range
    const now = new Date()
    const currentQuarter = Math.ceil((now.getMonth() + 1) / 3)
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()))
    const quarter = parseInt(searchParams.get('quarter') || String(currentQuarter))
    
    const quarterStartMonth = (quarter - 1) * 3
    const startDate = new Date(year, quarterStartMonth, 1)
    const endDate = new Date(year, quarterStartMonth + 3, 0, 23, 59, 59) // Last day of quarter
    
    const startDateStr = startDate.toISOString().split('T')[0]
    const endDateStr = endDate.toISOString().split('T')[0]

    // Run all queries in parallel
    const [
      newAgentsRes,
      activeAgentsRes,
      transactionsRes,
      internalAgentsRes,
      teamMembersRes,
      teamsRes,
    ] = await Promise.all([
      // New agents this quarter
      supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, office, headshot_url, join_date')
        .gte('join_date', startDateStr)
        .lte('join_date', endDateStr)
        .eq('is_licensed_agent', true)
        .eq('is_active', true),
      
      // All active agents by office
      supabaseAdmin
        .from('users')
        .select('id, office')
        .eq('status', 'active')
        .eq('is_active', true)
        .eq('is_licensed_agent', true),
      
      // Closed transactions - we'll filter by date in JS since we need to check
      // closing_date for sales and move_in_date for leases
      supabaseAdmin
        .from('transactions')
        .select('id, transaction_type, sales_price, monthly_rent, lease_term, closing_date, closed_date, move_in_date, office_location, status')
        .eq('status', 'closed'),
      
      // All internal agent records for closed transactions
      supabaseAdmin
        .from('transaction_internal_agents')
        .select(`
          transaction_id,
          agent_id,
          sales_volume,
          units,
          agent_net,
          agent:users!transaction_internal_agents_agent_id_fkey(
            id,
            first_name,
            last_name,
            preferred_first_name,
            preferred_last_name,
            office,
            headshot_url
          )
        `),
      
      // Active team memberships
      supabaseAdmin
        .from('team_member_agreements')
        .select('agent_id, team_id')
        .is('end_date', null),
      
      // Teams with leads
      supabaseAdmin
        .from('teams')
        .select(`
          id,
          team_name,
          team_leads(
            agent_id,
            agent:users!team_leads_agent_id_fkey(
              id,
              first_name,
              last_name,
              preferred_first_name,
              preferred_last_name,
              headshot_url
            )
          )
        `)
        .eq('status', 'active'),
    ])

    // Build lookup maps
    const transactions = transactionsRes.data || []
    const internalAgents = internalAgentsRes.data || []
    const teamMembers = teamMembersRes.data || []
    const teams = teamsRes.data || []

    // Filter transactions to only those in quarter range
    // For sales: use closed_date if available, otherwise closing_date
    // For leases: use move_in_date
    const closedTransactionIds = new Set(
      transactions
        .filter(t => {
          let dateField: string | null = null
          if (t.transaction_type === 'Lease') {
            dateField = t.move_in_date
          } else {
            // For sales, prefer closed_date (actual) over closing_date (target)
            dateField = t.closed_date || t.closing_date
          }
          if (!dateField) return false
          return dateField >= startDateStr && dateField <= endDateStr
        })
        .map(t => t.id)
    )

    // Filter internal agents to only closed transactions in range
    const relevantAgentRows = internalAgents.filter(ia => closedTransactionIds.has(ia.transaction_id))

    // Build agent -> team lookup
    const agentTeamMap: Record<string, string> = {}
    teamMembers.forEach(tm => {
      agentTeamMap[tm.agent_id] = tm.team_id
    })

    // Calculate totals
    let totalVolume = 0
    let totalUnits = 0
    relevantAgentRows.forEach(row => {
      totalVolume += parseFloat(row.sales_volume || '0')
      totalUnits += parseFloat(row.units || '0')
    })

    // Agent count by office
    const activeAgents = activeAgentsRes.data || []
    const houstonCount = activeAgents.filter(a => a.office?.toLowerCase().includes('houston')).length
    const dallasCount = activeAgents.filter(a => a.office?.toLowerCase().includes('dallas')).length

    // Top producers by office and type
    const agentStats: Record<string, { 
      agent: any, 
      salesVolume: number, 
      salesUnits: number, 
      leaseVolume: number, 
      leaseUnits: number,
      office: string 
    }> = {}

    relevantAgentRows.forEach(row => {
      const txn = transactions.find(t => t.id === row.transaction_id)
      if (!txn || !row.agent) return
      
      const agentId = row.agent_id
      if (!agentStats[agentId]) {
        agentStats[agentId] = {
          agent: row.agent,
          salesVolume: 0,
          salesUnits: 0,
          leaseVolume: 0,
          leaseUnits: 0,
          office: (row.agent as any).office || txn.office_location || 'Houston'
        }
      }
      
      const volume = parseFloat(row.sales_volume || '0')
      const units = parseFloat(row.units || '0')
      
      if (txn.transaction_type === 'Sale') {
        agentStats[agentId].salesVolume += volume
        agentStats[agentId].salesUnits += units
      } else {
        agentStats[agentId].leaseVolume += volume
        agentStats[agentId].leaseUnits += units
      }
    })

    // Format agent name helper
    const formatName = (agent: any) => {
      const first = agent.preferred_first_name || agent.first_name || ''
      const last = agent.preferred_last_name || agent.last_name || ''
      return `${first} ${last}`.trim()
    }

    const formatInitials = (agent: any) => {
      const first = agent.preferred_first_name || agent.first_name || ''
      const last = agent.preferred_last_name || agent.last_name || ''
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }

    // Split by office and sort
    const agentList = Object.values(agentStats)
    
    const topSalesHouston = agentList
      .filter(a => a.office?.toLowerCase().includes('houston') && a.salesVolume > 0)
      .sort((a, b) => b.salesVolume - a.salesVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        headshot_url: a.agent.headshot_url,
        volume: a.salesVolume,
        units: a.salesUnits,
      }))

    const topSalesDallas = agentList
      .filter(a => a.office?.toLowerCase().includes('dallas') && a.salesVolume > 0)
      .sort((a, b) => b.salesVolume - a.salesVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        headshot_url: a.agent.headshot_url,
        volume: a.salesVolume,
        units: a.salesUnits,
      }))

    const topLeasesHouston = agentList
      .filter(a => a.office?.toLowerCase().includes('houston') && a.leaseVolume > 0)
      .sort((a, b) => b.leaseVolume - a.leaseVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        headshot_url: a.agent.headshot_url,
        volume: a.leaseVolume,
        units: a.leaseUnits,
      }))

    const topLeasesDallas = agentList
      .filter(a => a.office?.toLowerCase().includes('dallas') && a.leaseVolume > 0)
      .sort((a, b) => b.leaseVolume - a.leaseVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        headshot_url: a.agent.headshot_url,
        volume: a.leaseVolume,
        units: a.leaseUnits,
      }))

    // Calculate team production
    const teamStats: Record<string, { volume: number, units: number }> = {}
    
    relevantAgentRows.forEach(row => {
      const teamId = agentTeamMap[row.agent_id]
      if (!teamId) return
      
      if (!teamStats[teamId]) {
        teamStats[teamId] = { volume: 0, units: 0 }
      }
      
      teamStats[teamId].volume += parseFloat(row.sales_volume || '0')
      teamStats[teamId].units += parseFloat(row.units || '0')
    })

    // Get top 2 teams with their details
    const topTeams = Object.entries(teamStats)
      .sort(([, a], [, b]) => b.volume - a.volume)
      .slice(0, 2)
      .map(([teamId, stats]) => {
        const team = teams.find(t => t.id === teamId)
        const activeLead = (team?.team_leads as any[])?.find(l => l.agent)
        const leadAgent = activeLead?.agent
        
        // Get team members
        const memberIds = teamMembers.filter(tm => tm.team_id === teamId).map(tm => tm.agent_id)
        const memberAgents = relevantAgentRows
          .filter(row => memberIds.includes(row.agent_id) && row.agent)
          .map(row => row.agent as any)
          .filter((agent: any, index: number, self: any[]) => 
            self.findIndex((a: any) => a.id === agent.id) === index
          )
          .slice(0, 4)
        
        return {
          id: teamId,
          name: team?.team_name || 'Unknown Team',
          lead: leadAgent ? {
            name: formatName(leadAgent),
            initials: formatInitials(leadAgent),
            headshot_url: (leadAgent as any).headshot_url,
          } : null,
          members: memberAgents.map((m: any) => ({
            initials: formatInitials(m),
            headshot_url: m.headshot_url,
          })),
          volume: stats.volume,
          units: stats.units,
        }
      })

    // Format new agents
    const newAgents = (newAgentsRes.data || []).map(a => ({
      name: formatName(a),
      initials: formatInitials(a),
      headshot_url: a.headshot_url,
      office: a.office,
    }))

    return NextResponse.json({
      quarter: {
        year,
        quarter,
        startDate: startDateStr,
        endDate: endDateStr,
      },
      growth: {
        newAgents: newAgents.length,
        newAgentsList: newAgents,
        totalAgents: activeAgents.length,
        houstonAgents: houstonCount,
        dallasAgents: dallasCount,
      },
      volume: {
        totalVolume,
        totalUnits,
        avgDealSize: totalUnits > 0 ? totalVolume / totalUnits : 0,
      },
      topTeams,
      topProducers: {
        sales: {
          houston: topSalesHouston,
          dallas: topSalesDallas,
        },
        leases: {
          houston: topLeasesHouston,
          dallas: topLeasesDallas,
        },
      },
    })
  } catch (err: any) {
    console.error('Quarterly report API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}