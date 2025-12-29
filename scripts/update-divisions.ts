/**
 * Script to update user divisions from CSV file
 * 
 * Usage:
 *   npx tsx scripts/update-divisions.ts
 * 
 * Or with explicit path:
 *   npx tsx scripts/update-divisions.ts /path/to/agent_report.csv
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'

// Load environment variables (optional - will use process.env directly)
try {
  require('dotenv').config({ path: join(process.cwd(), '.env.local') })
} catch (e) {
  // dotenv not available, use process.env directly
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: Missing Supabase environment variables')
  console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

interface CSVRow {
  agent_name: string
  email: string
  Office: string
  role: string
  'Additional Role': string
  team: string
  phone: string
  'IG handle': string
  Division: string
}

function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.split('\n').filter(line => line.trim())
  if (lines.length < 2) return []

  // Parse header
  const headers = lines[0]
    .split(',')
    .map(h => h.trim().replace(/^"|"$/g, ''))
  
  const rows: CSVRow[] = []
  
  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    
    // Simple CSV parsing that handles quoted fields
    const values: string[] = []
    let current = ''
    let inQuotes = false
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j]
      
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim()) // Add last value
    
    if (values.length !== headers.length) continue
    
    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index]?.replace(/^"|"$/g, '') || ''
    })
    
    rows.push(row as CSVRow)
  }
  
  return rows
}

async function updateDivisions() {
  // Get CSV file path from command line or use default
  const csvPath = process.argv[2] || '/Users/collectiverealtyco./Downloads/agent_report (1).csv'
  
  console.log(`Reading CSV from: ${csvPath}`)
  
  let csvContent: string
  try {
    csvContent = readFileSync(csvPath, 'utf-8')
  } catch (error: any) {
    console.error(`Error reading CSV file: ${error.message}`)
    process.exit(1)
  }
  
  // Parse CSV
  const csvRows = parseCSV(csvContent)
  
  if (csvRows.length === 0) {
    console.error('No data found in CSV file')
    process.exit(1)
  }
  
  console.log(`Found ${csvRows.length} rows in CSV`)
  console.log('Starting division updates...\n')
  
  // Track results
  const results = {
    updated: 0,
    notFound: [] as string[],
    errors: [] as string[],
    skipped: [] as string[],
  }
  
  // Update divisions
  for (const row of csvRows) {
    const email = row.email?.toLowerCase().trim()
    const division = row.Division?.trim() || null
    
    if (!email) {
      results.skipped.push('Row with no email')
      continue
    }
    
    // Skip if division is empty
    if (!division || division === '') {
      results.skipped.push(`${email} (empty division)`)
      continue
    }
    
    // Find user by email
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email, division')
      .eq('email', email)
      .single()
    
    if (findError || !user) {
      results.notFound.push(email)
      continue
    }
    
    // Only update if division is different
    if (user.division === division) {
      results.skipped.push(`${email} (already set to "${division}")`)
      continue
    }
    
    // Update division
    const { error: updateError } = await supabase
      .from('users')
      .update({ division })
      .eq('id', user.id)
    
    if (updateError) {
      results.errors.push(`${email}: ${updateError.message}`)
      continue
    }
    
    console.log(`✓ Updated ${email}: "${division}"`)
    results.updated++
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('UPDATE SUMMARY')
  console.log('='.repeat(60))
  console.log(`Total rows processed: ${csvRows.length}`)
  console.log(`✓ Successfully updated: ${results.updated}`)
  console.log(`✗ Not found: ${results.notFound.length}`)
  console.log(`⊘ Skipped: ${results.skipped.length}`)
  console.log(`⚠ Errors: ${results.errors.length}`)
  
  if (results.notFound.length > 0) {
    console.log('\nUsers not found:')
    results.notFound.slice(0, 10).forEach(email => console.log(`  - ${email}`))
    if (results.notFound.length > 10) {
      console.log(`  ... and ${results.notFound.length - 10} more`)
    }
  }
  
  if (results.errors.length > 0) {
    console.log('\nErrors:')
    results.errors.forEach(error => console.log(`  - ${error}`))
  }
  
  if (results.skipped.length > 0 && results.skipped.length <= 20) {
    console.log('\nSkipped:')
    results.skipped.forEach(skip => console.log(`  - ${skip}`))
  } else if (results.skipped.length > 20) {
    console.log(`\nSkipped ${results.skipped.length} rows (too many to display)`)
  }
  
  console.log('\nDone!')
}

updateDivisions().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

