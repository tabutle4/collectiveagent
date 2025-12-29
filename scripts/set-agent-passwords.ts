import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'
import bcrypt from 'bcryptjs'

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

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

async function setAgentPasswords() {
  console.log('🔐 Setting default passwords for agents...\n')

  // Get default password from command line or use default
  const defaultPassword = process.argv[2] || 'Welcome2026!'
  
  console.log(`Using password: ${defaultPassword}`)
  console.log('⚠️  Make sure to share this password with agents securely!\n')

  // Get all agents (case-insensitive)
  const { data: allUsers, error: fetchError } = await supabase
    .from('users')
    .select('id, email, preferred_first_name, preferred_last_name, roles, password_hash')

  if (fetchError) {
    console.error('❌ Error fetching users:', fetchError)
    return
  }

  // Filter for agents (case-insensitive) OR users with placeholder passwords
  const agents = (allUsers || []).filter(user => {
    const hasAgentRole = user.roles && Array.isArray(user.roles) && 
      user.roles.some((role: string) => role.toLowerCase() === 'agent')
    const hasPlaceholder = user.password_hash && user.password_hash.includes('placeholder')
    return hasAgentRole || hasPlaceholder
  })

  console.log(`📊 Found ${agents?.length || 0} agents (including those with placeholder passwords)\n`)

  // Hash the password once
  const passwordHash = await hashPassword(defaultPassword)

  let updatedCount = 0
  const updates: Array<{ email: string; name: string }> = []

  // Update each agent's password
  for (const agent of agents || []) {
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('id', agent.id)

    if (updateError) {
      console.error(`❌ Error updating ${agent.email}:`, updateError.message)
    } else {
      updatedCount++
      const name = `${agent.preferred_first_name} ${agent.preferred_last_name}`
      updates.push({ email: agent.email, name })
      console.log(`✅ Updated password for ${name} (${agent.email})`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total agents: ${agents?.length || 0}`)
  console.log(`Passwords updated: ${updatedCount}`)
  console.log(`Default password: ${defaultPassword}`)
  console.log('='.repeat(60))

  if (updates.length > 0) {
    console.log('\n📝 Updated Agents:')
    updates.forEach(update => {
      console.log(`   ${update.name} - ${update.email}`)
    })
  }

  console.log('\n✨ Password update complete!')
  console.log('\n📧 Next steps:')
  console.log('   1. Share the password with agents securely')
  console.log('   2. Encourage them to change their password after first login')
  console.log('   3. They can use "Forgot Password" if needed')
}

setAgentPasswords()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

