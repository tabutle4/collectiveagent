import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
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

    // Run all queries in parallel (all batched)
    const [
      newAgents,
      activeAgents,
      transactions,
      internalAgents,
      teamMembers,
      teams,
    ] = await Promise.all([
      // New agents this quarter
      fetchAllRows(
        'users',
        'id, first_name, last_name, preferred_first_name, preferred_last_name, office, headshot_url, join_date',
        {
          filters: [
            { type: 'gte', column: 'join_date', value: startDateStr },
            { type: 'lte', column: 'join_date', value: endDateStr },
            { type: 'eq', column: 'is_licensed_agent', value: true },
            { type: 'eq', column: 'is_active', value: true },
          ],
        }
      ),
      
      // All active agents by office
      fetchAllRows(
        'users',
        'id, office, first_name, last_name, preferred_first_name, preferred_last_name',
        {
          filters: [
            { type: 'eq', column: 'status', value: 'active' },
            { type: 'eq', column: 'is_active', value: true },
            { type: 'eq', column: 'is_licensed_agent', value: true },
          ],
        }
      ),
      
      // Transactions - we'll filter by date and status in JS since we need different logic
      // for sales (require closed) vs leases (just need move_in_date in past)
      fetchAllRows(
        'transactions',
        'id, transaction_type, sales_price, monthly_rent, lease_term, closing_date, closed_date, move_in_date, office_location, status',
        {
          filters: [{ type: 'neq', column: 'status', value: 'cancelled' }],
        }
      ),
      
      // All internal agent records for closed transactions
      fetchAllRows(
        'transaction_internal_agents',
        `transaction_id,
         agent_id,
         agent_role,
         sales_volume,
         units,
         agent_net,
         installment_kind,
         agent:users!transaction_internal_agents_agent_id_fkey(
           id,
           first_name,
           last_name,
           preferred_first_name,
           preferred_last_name,
           office,
           headshot_url
         )`
      ),
      
      // Active team memberships
      fetchAllRows(
        'team_member_agreements',
        'agent_id, team_id',
        {
          filters: [{ type: 'is', column: 'end_date', value: null }],
        }
      ),
      
      // Teams with leads
      fetchAllRows(
        'teams',
        `id,
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
         )`,
        {
          filters: [{ type: 'eq', column: 'status', value: 'active' }],
        }
      ),
    ])

    // Helper to check if transaction is a lease
    const isLeaseType = (txnType: string | null) => {
      const t = (txnType || '').toLowerCase()
      return t.includes('tenant') || t.includes('landlord') || t.includes('lease')
    }

    // Filter transactions to only those in quarter range
    // For sales: use closed_date if available, otherwise closing_date, require closed status
    // For leases: use move_in_date, just needs to be in the past within range
    const qualifiedTransactionIds = new Set(
      transactions
        .filter(t => {
          const isLease = isLeaseType(t.transaction_type)
          let dateField: string | null = null
          
          if (isLease) {
            // Use move_in_date; fall back to closing_date if not set (never use closed_date for leases)
            dateField = t.move_in_date || t.closing_date
            if (!dateField) return false
            const moveInDate = new Date(dateField)
            if (moveInDate > now) return false
          } else {
            // Sales require closed status
            if (t.status !== 'closed') return false
            // For sales, use closing_date only (never closed_date)
            dateField = t.closing_date
          }
          
          if (!dateField) return false
          return dateField >= startDateStr && dateField <= endDateStr
        })
        .map(t => t.id)
    )

    // Filter internal agents to only qualified transactions in range
    const allRelevantRows = internalAgents.filter(ia => qualifiedTransactionIds.has(ia.transaction_id))
    // Production roles only: primary_agent and listing_agent count for firm volume/units/top producers
    // (co_agent, team_lead, referral_agent, momentum_partner do not add units or volume)
    // Installment/retainer rows have sales_volume=0 and units=0 by construction,
    // so they contribute nothing to totals here without needing a special filter.
    const PRODUCTION_ROLES = ['primary_agent', 'listing_agent']
    const relevantAgentRows = allRelevantRows.filter(ia => PRODUCTION_ROLES.includes(ia.agent_role))

    // Build agent -> team lookup
    const agentTeamMap: Record<string, string> = {}
    teamMembers.forEach(tm => {
      agentTeamMap[tm.agent_id] = tm.team_id
    })

    // Calculate totals
    let totalVolume = 0
    let totalUnits = 0
    let totalAgentNet = 0
    relevantAgentRows.forEach(row => {
      totalVolume += parseFloat(row.sales_volume || '0')
      // units: existing TIA rows default to 1 (legacy). Installment rows
      // set this to 0 explicitly so they don't double-count.
      totalUnits += row.units != null ? parseFloat(row.units || '0') : 1
    })
    // Agent net includes all payees (co-agents, team leads, etc.)
    allRelevantRows.forEach(row => {
      totalAgentNet += parseFloat(row.agent_net || '0')
    })

    // Agent count by office
    const houstonCount = activeAgents.filter(a => a.office?.toLowerCase().includes('houston')).length
    const dallasCount = activeAgents.filter(a => {
      const office = a.office?.toLowerCase() || ''
      return office.includes('dallas') || office.includes('dfw')
    }).length

    // Top producers by office and type
    const agentStats: Record<string, { 
      agent: any, 
      salesVolume: number, 
      salesUnits: number, 
      leaseVolume: number, 
      leaseUnits: number,
      office: string 
    }> = {}

    const PRODUCER_ROLES = ['primary_agent', 'listing_agent', 'co_agent']
    allRelevantRows.forEach(row => {
      // Top producers: primary, listing, co_agent only
      if (!PRODUCER_ROLES.includes(row.agent_role)) return
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
      // units: legacy rows default to 1. Installment rows set 0 to avoid
      // double-counting.
      const units = row.units != null ? parseFloat(row.units || '0') : 1
      
      const isLease = isLeaseType(txn.transaction_type)
      
      if (isLease) {
        agentStats[agentId].leaseVolume += volume
        agentStats[agentId].leaseUnits += units
      } else {
        agentStats[agentId].salesVolume += volume
        agentStats[agentId].salesUnits += units
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

    // Helper to check if office is Dallas/DFW
    const isDallasOffice = (office: string | null | undefined) => {
      const o = (office || '').toLowerCase()
      return o.includes('dallas') || o.includes('dfw')
    }
    
    const isHoustonOffice = (office: string | null | undefined) => {
      return (office || '').toLowerCase().includes('houston')
    }

    // Exclude broker from top producers (Courtney Okanlomo)
    const BROKER_ID = '7d99cfe9-db1e-42db-aa2a-7a42a68765f6'

    // Split by office and sort (excluding broker)
    const agentList = Object.values(agentStats).filter(a => (a.agent as any).id !== BROKER_ID)
    
    const topSalesHouston = agentList
      .filter(a => isHoustonOffice(a.office) && a.salesVolume > 0)
      .sort((a, b) => b.salesVolume - a.salesVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        volume: a.salesVolume,
        units: a.salesUnits,
      }))

    const topSalesDallas = agentList
      .filter(a => isDallasOffice(a.office) && a.salesVolume > 0)
      .sort((a, b) => b.salesVolume - a.salesVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        volume: a.salesVolume,
        units: a.salesUnits,
      }))

    const topLeasesHouston = agentList
      .filter(a => isHoustonOffice(a.office) && a.leaseVolume > 0)
      .sort((a, b) => b.leaseVolume - a.leaseVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        volume: a.leaseVolume,
        units: a.leaseUnits,
      }))

    const topLeasesDallas = agentList
      .filter(a => isDallasOffice(a.office) && a.leaseVolume > 0)
      .sort((a, b) => b.leaseVolume - a.leaseVolume)
      .slice(0, 3)
      .map(a => ({
        name: formatName(a.agent),
        initials: formatInitials(a.agent),
        volume: a.leaseVolume,
        units: a.leaseUnits,
      }))

    // Calculate team production
    const teamStats: Record<string, { volume: number, units: number }> = {}
    
    allRelevantRows.forEach(row => {
      const teamId = agentTeamMap[row.agent_id]
      if (!teamId) return
      // Team stats: primary + listing only (consistent with firm totals)
      if (!PRODUCTION_ROLES.includes(row.agent_role)) return

      
      if (!teamStats[teamId]) {
        teamStats[teamId] = { volume: 0, units: 0 }
      }
      
      teamStats[teamId].volume += parseFloat(row.sales_volume || '0')
      teamStats[teamId].units += row.units != null ? parseFloat(row.units || '0') : 1
    })

    // Get top 2 teams with their details
    const topTeams = Object.entries(teamStats)
      .sort(([, a], [, b]) => b.volume - a.volume)
      .slice(0, 2)
      .map(([teamId, stats]) => {
        const team = teams.find(t => t.id === teamId)
        
        // Get ALL active team leads
        const activeLeads = (team?.team_leads as any[])?.filter(l => l.agent) || []
        const leadAgents = activeLeads.map(l => ({
          name: formatName(l.agent),
          initials: formatInitials(l.agent),
        }))
        
        // Get team members (excluding leads) - show ALL members, not just those with deals
        const leadIds = activeLeads.map(l => l.agent?.id)
        const memberIds = teamMembers.filter(tm => tm.team_id === teamId).map(tm => tm.agent_id)
        const memberAgents = activeAgents
          .filter(agent => memberIds.includes(agent.id) && !leadIds.includes(agent.id))
        
        return {
          id: teamId,
          name: team?.team_name || 'Unknown Team',
          leads: leadAgents,
          members: memberAgents.map((m: any) => ({
            initials: formatInitials(m),
          })),
          volume: stats.volume,
          units: stats.units,
        }
      })

    // Format new agents
    const newAgentsList = newAgents.map(a => ({
      name: formatName(a),
      initials: formatInitials(a),
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
        newAgents: newAgentsList.length,
        newAgentsList,
        totalAgents: activeAgents.length,
        houstonAgents: houstonCount,
        dallasAgents: dallasCount,
      },
      volume: {
        totalVolume,
        totalUnits,
        avgDealSize: totalUnits > 0 ? totalVolume / totalUnits : 0,
        totalAgentNet,
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