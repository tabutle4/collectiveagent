import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { readFileSync } from 'fs'
import { join } from 'path'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    let csvContent: string | undefined = body.csvContent
    
    // If no CSV content provided, try to read from file
    if (!csvContent) {
      // Try multiple possible paths
      const possiblePaths = [
        join(process.cwd(), '../../Downloads/agent_report (1).csv'),
        '/Users/collectiverealtyco./Downloads/agent_report (1).csv',
        join(process.cwd(), 'agent_report (1).csv'),
      ]
      
      for (const csvPath of possiblePaths) {
        try {
          csvContent = readFileSync(csvPath, 'utf-8')
          break
        } catch (error) {
          // Try next path
        }
      }
      
      if (!csvContent) {
        return NextResponse.json(
          { error: 'CSV file not found. Please provide csvContent in the request body or ensure the file is at the expected location.' },
          { status: 400 }
        )
      }
    }
    
    // Parse CSV
    const csvRows = parseCSV(csvContent)
    
    if (csvRows.length === 0) {
      return NextResponse.json(
        { error: 'No data found in CSV file' },
        { status: 400 }
      )
    }
    
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
      const { data: user, error: findError } = await supabaseAdmin
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
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ division })
        .eq('id', user.id)
      
      if (updateError) {
        results.errors.push(`${email}: ${updateError.message}`)
        continue
      }
      
      results.updated++
    }
    
    return NextResponse.json({
      message: 'Division update completed',
      summary: {
        total: csvRows.length,
        updated: results.updated,
        notFound: results.notFound.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      details: {
        notFound: results.notFound,
        skipped: results.skipped.slice(0, 10), // Limit to first 10
        errors: results.errors,
      },
    })
  } catch (error: any) {
    console.error('Division update error:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred while updating divisions' },
      { status: 500 }
    )
  }
}

