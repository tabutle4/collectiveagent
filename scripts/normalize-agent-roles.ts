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

async function normalizeAgentRoles() {
  console.log('🔄 Normalizing agent roles to lowercase...\n')

  // Get all users
  const { data: users, error: fetchError } = await supabase
    .from('users')
    .select('id, email, roles')

  if (fetchError) {
    console.error('❌ Error fetching users:', fetchError)
    return
  }

  console.log(`📊 Found ${users?.length || 0} total users\n`)

  let updatedCount = 0
  const updates: Array<{ email: string; oldRoles: string[]; newRoles: string[] }> = []

  // Process each user
  for (const user of users || []) {
    if (!user.roles || !Array.isArray(user.roles)) continue

    // Normalize roles to lowercase
    const normalizedRoles = user.roles.map((role: string) => role.toLowerCase())
    
    // Check if any role changed
    const hasChanges = user.roles.some((role: string, index: number) => 
      role !== normalizedRoles[index]
    )

    if (hasChanges) {
      // Update user's roles
      const { error: updateError } = await supabase
        .from('users')
        .update({ roles: normalizedRoles })
        .eq('id', user.id)

      if (updateError) {
        console.error(`❌ Error updating ${user.email}:`, updateError.message)
      } else {
        updatedCount++
        updates.push({
          email: user.email,
          oldRoles: [...user.roles],
          newRoles: normalizedRoles,
        })
        console.log(`✅ Updated ${user.email}: ${JSON.stringify(user.roles)} → ${JSON.stringify(normalizedRoles)}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 NORMALIZATION SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total users checked: ${users?.length || 0}`)
  console.log(`Users updated: ${updatedCount}`)
  console.log('='.repeat(60))

  if (updates.length > 0) {
    console.log('\n📝 Updated Users:')
    updates.forEach(update => {
      console.log(`   ${update.email}:`)
      console.log(`      Old: ${JSON.stringify(update.oldRoles)}`)
      console.log(`      New: ${JSON.stringify(update.newRoles)}`)
    })
  }

  console.log('\n✨ Normalization complete!')
}

normalizeAgentRoles()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

