/**
 * Script to fix coordinations that have welcome_email_sent = true
 * but total_emails_sent = 0 (from before we fixed the activate route)
 * 
 * Run with: npx tsx scripts/fix-email-counts.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixEmailCounts() {
  console.log('Finding coordinations with welcome_email_sent = true but total_emails_sent = 0...')
  
  // Find coordinations that need fixing
  const { data: coordinations, error } = await supabase
    .from('listing_coordination')
    .select('id, welcome_email_sent, total_emails_sent, welcome_email_sent_at')
    .eq('welcome_email_sent', true)
    .eq('total_emails_sent', 0)

  if (error) {
    console.error('Error fetching coordinations:', error)
    return
  }

  if (!coordinations || coordinations.length === 0) {
    console.log('No coordinations need fixing!')
    return
  }

  console.log(`Found ${coordinations.length} coordination(s) to fix:`)
  coordinations.forEach(c => {
    console.log(`  - ID: ${c.id}, Welcome sent at: ${c.welcome_email_sent_at}`)
  })

  // Update each coordination
  let fixed = 0
  for (const coord of coordinations) {
    const { error: updateError } = await supabase
      .from('listing_coordination')
      .update({
        total_emails_sent: 1,
        last_email_sent_at: coord.welcome_email_sent_at || new Date().toISOString(),
      })
      .eq('id', coord.id)

    if (updateError) {
      console.error(`Error updating coordination ${coord.id}:`, updateError)
    } else {
      fixed++
      console.log(`✓ Fixed coordination ${coord.id}`)
    }
  }

  console.log(`\nFixed ${fixed} out of ${coordinations.length} coordination(s)`)
}

fixEmailCounts()
  .then(() => {
    console.log('Done!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script error:', error)
    process.exit(1)
  })

