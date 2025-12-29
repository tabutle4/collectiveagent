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

async function checkPlaceholderPasswords() {
  console.log('🔍 Checking for placeholder passwords...\n')

  const { data: users, error } = await supabase
    .from('users')
    .select('email, preferred_first_name, preferred_last_name, roles, password_hash')
    .like('password_hash', '%placeholder%')

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  if (!users || users.length === 0) {
    console.log('✅ No placeholder passwords found! All users have proper password hashes.')
  } else {
    console.log(`⚠️  Found ${users.length} user(s) with placeholder passwords:\n`)
    users.forEach(user => {
      console.log(`   - ${user.preferred_first_name} ${user.preferred_last_name}`)
      console.log(`     Email: ${user.email}`)
      console.log(`     Roles: ${JSON.stringify(user.roles)}`)
      console.log(`     Password hash: ${user.password_hash}\n`)
    })
  }
}

checkPlaceholderPasswords()
  .then(() => {
    console.log('✅ Check complete')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Error:', error)
    process.exit(1)
  })

