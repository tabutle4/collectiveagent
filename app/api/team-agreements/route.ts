import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List all team agreements
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'
    
    let query = supabase
      .from('team_agreements')
      .select(`
        *,
        team_lead:users!team_agreements_team_lead_id_fkey(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name
        ),
        team_members(
          id,
          agent_id,
          is_team_lead,
          joined_date,
          left_date,
          agent:users!team_members_agent_id_fkey(
            id,
            preferred_first_name,
            preferred_last_name,
            first_name,
            last_name
          )
        )
      `)
      .order('created_at', { ascending: false })
    
    if (status !== 'all') {
      query = query.eq('status', status)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw error
    }
    
    // Calculate member counts and format data
    const formatted = (data || []).map((agreement: any) => {
      const activeMembers = (agreement.team_members || []).filter(
        (m: any) => !m.left_date
      )
      
      return {
        ...agreement,
        member_count: activeMembers.length,
        total_members: agreement.team_members?.length || 0,
      }
    })
    
    return NextResponse.json({ agreements: formatted })
  } catch (error: any) {
    console.error('Error fetching team agreements:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch team agreements' },
      { status: 500 }
    )
  }
}

// POST - Create new team agreement
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    
    const {
      team_name,
      team_lead_id,
      effective_date,
      expiration_date,
      status,
      agreement_document_url,
      notes,
      team_members,
    } = body
    
    // Validation
    if (!team_name || !team_lead_id || !effective_date) {
      return NextResponse.json(
        { error: 'Team name, team lead, and effective date are required' },
        { status: 400 }
      )
    }
    
    if (!team_members || team_members.length === 0) {
      return NextResponse.json(
        { error: 'At least one team member is required' },
        { status: 400 }
      )
    }
    
    // Check that team lead is NOT in members
    const teamLeadInMembers = team_members.some(
      (m: any) => m.agent_id === team_lead_id
    )
    if (teamLeadInMembers) {
      return NextResponse.json(
        { error: 'Team lead cannot be added as a team member. The team lead is separate from team members.' },
        { status: 400 }
      )
    }
    
    // Validate splits total 100%
    for (const member of team_members) {
      if (!member.splits) {
        return NextResponse.json(
          { error: `Splits are required for team member ${member.agent_id}` },
          { status: 400 }
        )
      }
      
      // Validate all sales plans (including custom)
      const salesPlans = ['new_agent', 'no_cap', 'cap', 'custom'] as const
      for (const plan of salesPlans) {
        const planSplits = member.splits.sales?.[plan]
        if (planSplits) {
          for (const [source, split] of Object.entries(planSplits)) {
            if (split) {
              const total = (split.agent || 0) + (split.team_lead || 0) + (split.firm || 0)
              if (Math.abs(total - 100) > 0.01) {
                return NextResponse.json(
                  {
                    error: `Sales ${plan} - ${source} splits must total 100% for ${member.agent_id}. Current total: ${total}%`,
                  },
                  { status: 400 }
                )
              }
            }
          }
        }
      }
      
      // Validate lease splits (standard and custom)
      const leasePlans = ['standard', 'custom'] as const
      for (const plan of leasePlans) {
        const planSplits = member.splits.lease?.[plan]
        if (planSplits) {
          for (const [source, split] of Object.entries(planSplits)) {
            if (split) {
              const total = (split.agent || 0) + (split.team_lead || 0) + (split.firm || 0)
              if (Math.abs(total - 100) > 0.01) {
                return NextResponse.json(
                  {
                    error: `Lease ${plan} - ${source} splits must total 100% for ${member.agent_id}. Current total: ${total}%`,
                  },
                  { status: 400 }
                )
              }
            }
          }
        }
      }
    }
    
    // Check for duplicate agents
    const agentIds = team_members.map((m: any) => m.agent_id)
    const uniqueIds = new Set(agentIds)
    if (agentIds.length !== uniqueIds.size) {
      return NextResponse.json(
        { error: 'Cannot have duplicate agents on the same team' },
        { status: 400 }
      )
    }
    
    // Get current user for created_by
    const userStr = request.headers.get('x-user') // You may need to pass this from client
    let created_by = null
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        created_by = user.id
      } catch (e) {
        // Ignore
      }
    }
    
    // Create team agreement
    const { data: agreement, error: agreementError } = await supabase
      .from('team_agreements')
      .insert({
        team_name,
        team_lead_id,
        effective_date,
        expiration_date: expiration_date || null,
        status: status || 'active',
        agreement_document_url: agreement_document_url || null,
        notes: notes || null,
        created_by,
        updated_by: created_by,
      })
      .select()
      .single()
    
    if (agreementError) {
      throw agreementError
    }
    
    // Create team members
    const membersToInsert = team_members.map((member: any) => ({
      team_agreement_id: agreement.id,
      agent_id: member.agent_id,
      is_team_lead: false, // Team lead is separate, members are never team lead
      joined_date: member.joined_date || effective_date,
      left_date: member.left_date || null,
      splits: member.splits || null,
    }))
    
    const { error: membersError } = await supabase
      .from('team_members')
      .insert(membersToInsert)
    
    if (membersError) {
      // Rollback agreement if members fail
      await supabase.from('team_agreements').delete().eq('id', agreement.id)
      throw membersError
    }
    
    // Fetch complete agreement with relations
    const { data: completeAgreement, error: fetchError } = await supabase
      .from('team_agreements')
      .select(`
        *,
        team_lead:users!team_agreements_team_lead_id_fkey(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name
        ),
        team_members(
          *,
          agent:users!team_members_agent_id_fkey(
            id,
            preferred_first_name,
            preferred_last_name,
            first_name,
            last_name
          )
        )
      `)
      .eq('id', agreement.id)
      .single()
    
    if (fetchError) {
      throw fetchError
    }
    
    return NextResponse.json({
      success: true,
      agreement: completeAgreement,
    })
  } catch (error: any) {
    console.error('Error creating team agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create team agreement' },
      { status: 500 }
    )
  }
}

