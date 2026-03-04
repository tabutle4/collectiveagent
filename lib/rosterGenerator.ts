// ============================================================
// CHANGES TO lib/rosterGenerator.ts
// ============================================================
// 
// Find the regenerateRoster function (near the bottom of the file).
// Replace the entire function with this version.
// Everything else in the file stays the same.
// ============================================================

export const regenerateRoster = async () => {
  const client = supabaseAdmin
  
  console.log('🔄 Starting roster regeneration...')
  
  // Query for active users - fetch all, then filter by roles array
  const { data: allUsers, error } = await client
    .from('users')
    .select(
      'id, preferred_first_name, preferred_last_name, first_name, last_name, email, personal_phone, business_phone, birth_month, date_of_birth, office, team_name, division, role, roles, job_title, instagram_handle, tiktok_handle, threads_handle, youtube_url, linkedin_url, facebook_url, headshot_url, headshot_crop'
    )
    .eq('is_active', true)

  if (error) {
    console.error('❌ Error fetching agents for roster:', error)
    throw error
  }

  // Filter for users with 'agent' in roles array
  const agents = (allUsers || []).filter(user => {
    const roles = Array.isArray(user.roles) ? user.roles : []
    return roles.includes('agent')
  })

  // Sort agents
  agents.sort((a, b) => {
    const aName = `${a.preferred_first_name} ${a.preferred_last_name}`.toLowerCase()
    const bName = `${b.preferred_first_name} ${b.preferred_last_name}`.toLowerCase()
    return aName.localeCompare(bName)
  })

  console.log(`✅ Found ${agents?.length || 0} active agents with 'agent' role`)
  
  // Log agent names for debugging
  if (agents && agents.length > 0) {
    console.log('Agents included:', agents.map(a => `${a.preferred_first_name} ${a.preferred_last_name}`).join(', '))
  }

  const offices = getUniqueSorted((agents || []).map((agent) => agent.office?.trim() || null))
  const teams = getUniqueSorted((agents || []).map((agent) => agent.team_name?.trim() || null))
  // Extract individual divisions from combined divisions (split by |)
  const allDivisions = (agents || []).flatMap((agent) => extractDivisions(agent.division))
  const divisions = getUniqueSorted(allDivisions)

  const html = buildRosterHtml({
    agentCount: agents?.length || 0,
    officeOptions: buildOptions(offices),
    teamOptions: buildOptions(teams),
    divisionOptions: buildOptions(divisions),
    tableRows: buildTableRows(agents || []),
  })

  const outputPath = path.join(process.cwd(), 'public', 'agent-roster.html')
  
  try {
    await writeFile(outputPath, html, 'utf8')
    console.log(`✅ Roster HTML written to: ${outputPath}`)
  } catch (writeError) {
    console.error('❌ Error writing roster file:', writeError)
    throw writeError
  }

  console.log('✅ Roster regeneration complete!')
  return { agentCount: agents?.length || 0 }
}