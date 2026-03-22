import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

interface Split {
  agent: number
  team_lead: number
  firm: number
}

// GET - Get single team agreement (any authenticated user can view)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id } = await params

    // Fetch team agreement with team lead
    const { data: agreement, error: agreementError } = await supabase
      .from('team_agreements')
      .select(
        `
        *,
        team_lead:users!team_lead_id(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name
        )
      `
      )
      .eq('id', id)
      .single()

    if (agreementError) {
      throw agreementError
    }

    // Fetch team members with agent names
    const { data: members, error: membersError } = await supabase
      .from('team_members')
      .select(
        `
        *,
        agent:users!agent_id(
          id,
          preferred_first_name,
          preferred_last_name,
          first_name,
          last_name
        )
      `
      )
      .eq('team_agreement_id', id)

    if (membersError) {
      throw membersError
    }

    // Format team lead name
    const team_lead_name = agreement.team_lead
      ? `${agreement.team_lead.preferred_first_name || agreement.team_lead.first_name || ''} ${agreement.team_lead.preferred_last_name || agreement.team_lead.last_name || ''}`.trim()
      : null

    // Return combined data
    return NextResponse.json({
      agreement: {
        ...agreement,
        team_lead_name,
        team_members: members || [],
      },
    })
  } catch (error: any) {
    console.error('Error fetching team agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch team agreement' },
      { status: 500 }
    )
  }
}

// PUT - Update team agreement
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()

    const {
      team_name,
      team_lead_id: raw_team_lead_id,
      effective_date,
      expiration_date,
      status,
      agreement_document_url,
      notes,
      team_members,
    } = body

    // Sanitize UUID values - convert "undefined" string to null
    const sanitizeUUID = (value: any): string | null => {
      if (
        !value ||
        value === 'undefined' ||
        value === '' ||
        (typeof value === 'string' && value.trim() === '')
      ) {
        return null
      }
      return typeof value === 'string' ? value.trim() : value
    }

    const team_lead_id = sanitizeUUID(raw_team_lead_id)

    // Validation (same as POST)
    if (!team_name || !team_lead_id || !effective_date) {
      return NextResponse.json(
        { error: 'Team name, team lead, and effective date are required' },
        { status: 400 }
      )
    }

    if (!team_members || team_members.length === 0) {
      return NextResponse.json({ error: 'At least one team member is required' }, { status: 400 })
    }

    // Check that team lead is NOT in members
    const teamLeadInMembers = team_members.some((m: any) => m.agent_id === team_lead_id)
    if (teamLeadInMembers) {
      return NextResponse.json(
        {
          error:
            'Team lead cannot be added as a team member. The team lead is separate from team members.',
        },
        { status: 400 }
      )
    }

    // Validate splits
    for (const member of team_members) {
      if (!member.splits) {
        return NextResponse.json(
          { error: `Splits are required for team member ${member.agent_id}` },
          { status: 400 }
        )
      }

      // Helper function to check if a plan has any data
      const planHasData = (planSplits: any): boolean => {
        if (!planSplits) return false
        return Object.values(planSplits).some((split: any) => {
          if (!split || typeof split !== 'object') return false
          const typedSplit = split as Split
          return (typedSplit.agent || 0) + (typedSplit.team_lead || 0) + (typedSplit.firm || 0) > 0
        })
      }

      // Validate all sales plans (only validate custom if it has data)
      const salesPlans = ['new_agent', 'no_cap', 'cap', 'custom'] as const
      for (const plan of salesPlans) {
        const planSplits = member.splits.sales?.[plan]
        if (!planSplits) continue

        // Skip validation for custom plans if they have no data
        if (plan === 'custom' && !planHasData(planSplits)) {
          continue
        }

        for (const [source, split] of Object.entries(planSplits)) {
          if (split && typeof split === 'object') {
            const typedSplit = split as Split
            const total =
              (typedSplit.agent || 0) + (typedSplit.team_lead || 0) + (typedSplit.firm || 0)
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

      // Validate lease splits (only validate custom if it has data)
      const leasePlans = ['standard', 'custom'] as const
      for (const plan of leasePlans) {
        const planSplits = member.splits.lease?.[plan]
        if (!planSplits) continue

        // Skip validation for custom plans if they have no data
        if (plan === 'custom' && !planHasData(planSplits)) {
          continue
        }

        for (const [source, split] of Object.entries(planSplits)) {
          if (split && typeof split === 'object') {
            const typedSplit = split as Split
            const total =
              (typedSplit.agent || 0) + (typedSplit.team_lead || 0) + (typedSplit.firm || 0)
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

    // Check for duplicate agents
    const agentIds = team_members.map((m: any) => m.agent_id)
    const uniqueIds = new Set(agentIds)
    if (agentIds.length !== uniqueIds.size) {
      return NextResponse.json(
        { error: 'Cannot have duplicate agents on the same team' },
        { status: 400 }
      )
    }

    // Update team agreement
    const { error: agreementError } = await supabase
      .from('team_agreements')
      .update({
        team_name,
        team_lead_id,
        effective_date,
        expiration_date: expiration_date || null,
        status: status || 'active',
        agreement_document_url: agreement_document_url || null,
        notes: notes || null,
      })
      .eq('id', id)

    if (agreementError) {
      throw agreementError
    }

    // Delete existing members
    const { error: deleteError } = await supabase
      .from('team_members')
      .delete()
      .eq('team_agreement_id', id)

    if (deleteError) {
      throw deleteError
    }

    // Insert updated members
    const membersToInsert = team_members
      .map((member: any) => ({
        ...member,
        agent_id: sanitizeUUID(member.agent_id),
      }))
      .filter((member: any) => member.agent_id !== null && member.agent_id !== 'undefined') // Filter out members without valid agent_id
      .map((member: any) => ({
        team_agreement_id: id,
        agent_id: member.agent_id,
        joined_date: member.joined_date || effective_date,
        left_date: member.left_date || null,
        splits: member.splits || null,
        active_sales_plan: member.active_sales_plan || 'no_cap',
        active_lease_plan: member.active_lease_plan || 'standard',
      }))

    // Validate that we have members to insert
    if (membersToInsert.length === 0) {
      return NextResponse.json(
        { error: 'At least one team member with a valid agent ID is required' },
        { status: 400 }
      )
    }

    const { error: membersError } = await supabase.from('team_members').insert(membersToInsert)

    if (membersError) {
      throw membersError
    }

    // Fetch complete agreement
    const { data: completeAgreement, error: fetchError } = await supabase
      .from('team_agreements')
      .select(
        `
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
      `
      )
      .eq('id', id)
      .single()

    if (fetchError) {
      throw fetchError
    }

    return NextResponse.json({
      success: true,
      agreement: completeAgreement,
    })
  } catch (error: any) {
    console.error('Error updating team agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update team agreement' },
      { status: 500 }
    )
  }
}

// DELETE - Delete team agreement
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_team_agreements')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id } = await params

    // Delete will cascade to team_members
    const { error } = await supabase.from('team_agreements').delete().eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting team agreement:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete team agreement' },
      { status: 500 }
    )
  }
}
