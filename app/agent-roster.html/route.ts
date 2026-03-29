import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildRosterHtml, buildTableRows } from '@/lib/rosterGenerator'

// Helper functions (same as in rosterGenerator.ts)
const getUniqueSorted = (values: (string | null)[]) => {
  const unique = Array.from(
    new Set(values.filter((val): val is string => !!val?.trim()).map(val => val!.trim()))
  )
  return unique.sort((a, b) => a.localeCompare(b))
}

// buildOptions needs to return HTML option strings, not objects
const buildOptions = (values: string[]) => {
  const escapeAttr = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return values
    .map(
      value =>
        `                        <option value="${escapeAttr(value.toLowerCase())}">${escapeHtml(value)}</option>`
    )
    .join('\n')
}

// This route generates the roster HTML dynamically
// The link stays the same (/agent-roster.html) but always shows current data
export async function GET() {
  try {
    console.log('🔄 Generating roster HTML dynamically...')

    // Fetch active licensed agents
    const { data: agents, error: fetchError } = await supabaseAdmin
      .from('users')
      .select(
        'id, preferred_first_name, preferred_last_name, first_name, last_name, email, personal_phone, business_phone, birth_month, date_of_birth, office, division, role, roles, job_title, additional_roles, instagram_handle, tiktok_handle, threads_handle, youtube_url, linkedin_url, facebook_url, headshot_url, headshot_crop'
      )
      .eq('is_active', true)
      .eq('is_licensed_agent', true)

    if (fetchError) {
      console.error('❌ Error fetching users for roster:', fetchError)
      throw fetchError
    }

    // Query active team memberships with team names
    const { data: teamMemberships } = await supabaseAdmin
      .from('team_member_agreements')
      .select('agent_id, team_id, teams(team_name)')
      .is('end_date', null)

    // Query active team leads
    const { data: teamLeads } = await supabaseAdmin
      .from('team_leads')
      .select('agent_id')
      .is('end_date', null)

    // Build lookup maps
    const teamByAgentId = new Map<string, string>()
    if (teamMemberships) {
      for (const membership of teamMemberships) {
        const teamData = membership.teams as { team_name: string }[] | null
        if (teamData && teamData.length > 0 && teamData[0]?.team_name) {
          teamByAgentId.set(membership.agent_id, teamData[0].team_name)
        }
      }
    }

    const teamLeadIds = new Set<string>()
    if (teamLeads) {
      for (const lead of teamLeads) {
        teamLeadIds.add(lead.agent_id)
      }
    }

    // Merge team data into agent records
    const agentsWithTeams = (agents || []).map(user => ({
      ...user,
      team_name: teamByAgentId.get(user.id) || null,
      is_team_lead: teamLeadIds.has(user.id),
      additional_roles: user.additional_roles || null,
    }))

    // Sort agents
    const sortedAgents = agentsWithTeams.sort((a, b) => {
      const aName = `${a.preferred_first_name} ${a.preferred_last_name}`.toLowerCase()
      const bName = `${b.preferred_first_name} ${b.preferred_last_name}`.toLowerCase()
      return aName.localeCompare(bName)
    })

    console.log(`✅ Found ${sortedAgents.length} active licensed agents`)

    const offices = getUniqueSorted(sortedAgents.map(agent => agent.office?.trim() || null))
    const teams = getUniqueSorted(sortedAgents.map(agent => agent.team_name?.trim() || null))
    // Extract individual divisions from combined divisions (split by |)
    const extractDivisions = (division: string | null): string[] => {
      if (!division || !division.trim()) return []
      return division
        .split('|')
        .map(d => d.trim())
        .filter(d => d.length > 0)
    }
    const allDivisions = sortedAgents.flatMap(agent => extractDivisions(agent.division))
    const divisions = getUniqueSorted(allDivisions)

    // Generate HTML
    const html = buildRosterHtml({
      agentCount: sortedAgents.length,
      officeOptions: buildOptions(offices),
      teamOptions: buildOptions(teams),
      divisionOptions: buildOptions(divisions),
      tableRows: buildTableRows(sortedAgents),
    })

    console.log('✅ Roster HTML generated successfully')

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate', // Always fresh
      },
    })
  } catch (error: any) {
    console.error('❌ Error generating roster:', error)
    return new NextResponse(
      `<html><body><h1>Error loading roster</h1><p>${error?.message || 'Unknown error'}</p></body></html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      }
    )
  }
}
