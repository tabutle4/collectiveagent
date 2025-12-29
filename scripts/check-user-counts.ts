import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load environment variables
function loadEnv() {
  try {
    const envFile = readFileSync(join(process.cwd(), '.env.local'), 'utf-8')
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    })
  } catch (error) {
    console.warn('Could not load .env.local, using process.env directly')
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkUserCounts() {
  console.log('📊 Checking user counts...\n')

  // Get all users
  const { data: allUsers, error: allError } = await supabase
    .from('users')
    .select('id, email, is_active, roles')

  if (allError) {
    console.error('Error fetching all users:', allError)
    return
  }

  console.log(`Total users in database: ${allUsers?.length || 0}\n`)

  // Count by active status
  const activeUsers = allUsers?.filter(u => u.is_active === true) || []
  const inactiveUsers = allUsers?.filter(u => u.is_active === false) || []
  
  console.log(`Active users: ${activeUsers.length}`)
  console.log(`Inactive users: ${inactiveUsers.length}\n`)

  // Count by role
  const usersWithAgentRole = allUsers?.filter(u => 
    u.roles && Array.isArray(u.roles) && u.roles.includes('agent')
  ) || []
  
  const activeUsersWithAgentRole = activeUsers.filter(u => 
    u.roles && Array.isArray(u.roles) && u.roles.includes('agent')
  )

  console.log(`Users with 'agent' role: ${usersWithAgentRole.length}`)
  console.log(`Active users with 'agent' role: ${activeUsersWithAgentRole.length}\n`)

  // Show inactive users with agent role
  const inactiveAgents = usersWithAgentRole.filter(u => u.is_active === false)
  if (inactiveAgents.length > 0) {
    console.log(`⚠️  Inactive users with 'agent' role (${inactiveAgents.length}):`)
    inactiveAgents.forEach(u => {
      console.log(`   - ${u.email} (roles: ${JSON.stringify(u.roles)})`)
    })
    console.log()
  }

  // Show active users without agent role
  const activeNonAgents = activeUsers.filter(u => 
    !u.roles || !Array.isArray(u.roles) || !u.roles.includes('agent')
  )
  if (activeNonAgents.length > 0) {
    console.log(`ℹ️  Active users WITHOUT 'agent' role (${activeNonAgents.length}):`)
    activeNonAgents.forEach(u => {
      console.log(`   - ${u.email} (roles: ${JSON.stringify(u.roles)}, is_active: ${u.is_active})`)
    })
    console.log()
  }

  console.log('='.repeat(60))
  console.log('SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total users: ${allUsers?.length || 0}`)
  console.log(`Active users: ${activeUsers.length}`)
  console.log(`Users with 'agent' role: ${usersWithAgentRole.length}`)
  console.log(`✅ Active users with 'agent' role (roster count): ${activeUsersWithAgentRole.length}`)
  console.log('='.repeat(60))
}

checkUserCounts()
  .then(() => {
    console.log('\n✅ Check complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

