import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildRosterHtml, buildTableRows } from '@/lib/rosterGenerator'

// Helper functions (same as in rosterGenerator.ts)
const getUniqueSorted = (values: (string | null)[]) => {
  const unique = Array.from(new Set(values.filter((val): val is string => !!val?.trim()).map((val) => val!.trim())))
  return unique.sort((a, b) => a.localeCompare(b))
}

// buildOptions needs to return HTML option strings, not objects
const buildOptions = (values: string[]) => {
  const escapeAttr = (str: string) => str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return values.map((value) => `                        <option value="${escapeAttr(value.toLowerCase())}">${escapeHtml(value)}</option>`).join('\n')
}

// This route generates the roster HTML dynamically
// The link stays the same (/agent-roster.html) but always shows current data
export async function GET() {
  try {
    console.log('🔄 Generating roster HTML dynamically...')
    
    // Fetch active agents with 'Agent' role
    const { data: allUsers, error: fetchError } = await supabaseAdmin
      .from('users')
      .select(
        'id, preferred_first_name, preferred_last_name, first_name, last_name, email, personal_phone, business_phone, birth_month, date_of_birth, office, team_name, division, role, job_title, instagram_handle, tiktok_handle, threads_handle, youtube_url, linkedin_url, facebook_url, headshot_url, headshot_crop'
      )
      .eq('is_active', true)

    if (fetchError) {
      console.error('❌ Error fetching users for roster:', fetchError)
      throw fetchError
    }

    // Filter for users with 'Agent' role (simple string, not array)
    const agents = (allUsers || []).filter(user => {
      return user.role === 'Agent'
    })

    // Sort agents
    agents.sort((a, b) => {
      const aName = `${a.preferred_first_name} ${a.preferred_last_name}`.toLowerCase()
      const bName = `${b.preferred_first_name} ${b.preferred_last_name}`.toLowerCase()
      return aName.localeCompare(bName)
    })

    console.log(`✅ Found ${agents?.length || 0} active agents with 'agent' role`)
    
    const offices = getUniqueSorted((agents || []).map((agent) => agent.office?.trim() || null))
    const teams = getUniqueSorted((agents || []).map((agent) => agent.team_name?.trim() || null))
    // Extract individual divisions from combined divisions (split by |)
    const extractDivisions = (division: string | null): string[] => {
      if (!division || !division.trim()) return []
      return division
        .split('|')
        .map(d => d.trim())
        .filter(d => d.length > 0)
    }
    const allDivisions = (agents || []).flatMap((agent) => extractDivisions(agent.division))
    const divisions = getUniqueSorted(allDivisions)

    // Generate HTML
    const html = buildRosterHtml({
      agentCount: agents?.length || 0,
      officeOptions: buildOptions(offices),
      teamOptions: buildOptions(teams),
      divisionOptions: buildOptions(divisions),
      tableRows: buildTableRows(agents || []),
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

