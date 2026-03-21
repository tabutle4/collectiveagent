import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load environment variables from .env.local manually
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
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Make sure .env.local is configured.')
}

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is required. Make sure .env.local is configured.')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface MatchResult {
  filename: string
  matched: boolean
  userId?: string
  userName?: string
  matchType?: 'preferred' | 'legal'
  error?: string
}

interface UnmatchedAgent {
  id: string
  preferred_name: string
  legal_name: string
  email: string
}

// Normalize name for matching (lowercase, replace hyphens with spaces, trim)
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/-/g, ' ').trim()
}

// Extract name from filename (e.g., "Headshot-Tara-Butler.jpg" -> "Tara Butler")
function extractNameFromFilename(filename: string): string {
  // Remove "Headshot-" prefix and file extension
  const withoutPrefix = filename.replace(/^Headshot-/i, '')
  const withoutExt = withoutPrefix.replace(/\.(jpg|jpeg|png|JPG|JPEG|PNG|web|pdf)$/i, '')
  // Remove duplicate markers like (1), (2), etc.
  const withoutDuplicates = withoutExt.replace(/\s*\([0-9]+\)\s*$/i, '')
  // Remove extra words like "Websitee Photo"
  const cleaned = withoutDuplicates.replace(/\s+websitee\s+photo/i, '').replace(/\s+photo/i, '')
  // Replace hyphens with spaces and trim
  return cleaned.replace(/-/g, ' ').trim()
}

// Fuzzy match function - tries multiple strategies
function fuzzyMatch(extracted: string, userFullName: string): boolean {
  const normalizedExtracted = normalizeName(extracted)
  const normalizedUser = normalizeName(userFullName)

  // Exact match
  if (normalizedExtracted === normalizedUser) return true

  // Remove apostrophes and special chars for comparison
  const extractedClean = normalizedExtracted.replace(/[''"]/g, '').replace(/[^a-z0-9\s]/g, '')
  const userClean = normalizedUser.replace(/[''"]/g, '').replace(/[^a-z0-9\s]/g, '')
  if (extractedClean === userClean) return true

  // Split into parts (also split on apostrophes for names like "Bree'Ajanai")
  const extractedParts = extractedClean.split(/[\s']+/).filter(p => p.length > 0)
  const userParts = userClean.split(/[\s']+/).filter(p => p.length > 0)

  // Must have at least first and last name
  if (extractedParts.length < 2 || userParts.length < 2) return false

  // Check if first and last names match (ignoring middle names/initials)
  const extractedFirst = extractedParts[0]
  const extractedLast = extractedParts[extractedParts.length - 1]
  const userFirst = userParts[0]
  const userLast = userParts[userParts.length - 1]

  // Also get the full first name part (before any space/apostrophe) for comparison
  const extractedFirstFull = extractedClean.split(/\s+/)[0] || extractedFirst
  const userFirstFull = userClean.split(/\s+/)[0] || userFirst

  // First and last match
  if (extractedFirst === userFirst && extractedLast === userLast) return true

  // Handle common typos (e.g., "Hll" -> "Hill", "Staggers" variations)
  const typoMap: Record<string, string[]> = {
    hll: ['hill'],
    staggers: ['stagger'],
    websitee: ['website'],
  }

  // Check with typo corrections
  let extractedFirstFixed = extractedFirst
  let extractedLastFixed = extractedLast
  let userFirstFixed = userFirst
  let userLastFixed = userLast

  for (const [typo, corrections] of Object.entries(typoMap)) {
    if (extractedLast.includes(typo)) {
      for (const correction of corrections) {
        if (userLast.includes(correction)) {
          extractedLastFixed = extractedLast.replace(typo, correction)
          break
        }
      }
    }
    if (userLast.includes(typo)) {
      for (const correction of corrections) {
        if (extractedLast.includes(correction)) {
          userLastFixed = userLast.replace(typo, correction)
          break
        }
      }
    }
  }

  if (extractedFirstFixed === userFirstFixed && extractedLastFixed === userLastFixed) return true
  if (extractedFirst === userFirst && extractedLastFixed === userLastFixed) return true
  if (extractedFirstFixed === userFirstFixed && extractedLast === userLast) return true

  // Partial match: check if extracted name is contained in user name (e.g., "Bree Holmes" in "Bree'Ajanai Holmes")
  const userFullClean = userClean.replace(/\s+/g, ' ')
  const extractedFullClean = extractedClean.replace(/\s+/g, ' ')

  // Remove apostrophes and check if one contains the other
  const userNoApostrophe = userFullClean.replace(/'/g, '')
  const extractedNoApostrophe = extractedFullClean.replace(/'/g, '')

  // Check if extracted name (without apostrophes) is contained in user name
  if (userNoApostrophe.includes(extractedNoApostrophe)) {
    // Verify first and last name parts still match
    if (
      extractedFirst === userFirst ||
      userFirst.startsWith(extractedFirst) ||
      extractedFirst.startsWith(userFirst)
    ) {
      if (extractedLast === userLast || userLast === extractedLast) {
        return true
      }
    }
  }

  // Also check if user name (without apostrophes) is contained in extracted name
  if (extractedNoApostrophe.includes(userNoApostrophe)) {
    if (
      extractedFirst === userFirst ||
      extractedFirst.startsWith(userFirst) ||
      userFirst.startsWith(extractedFirst)
    ) {
      if (extractedLast === userLast || extractedLast === userLast) {
        return true
      }
    }
  }

  // Special case: if first names match (first part) and last names match, but user has middle name/initial
  // e.g., "Bree Holmes" matches "Bree'Ajanai Holmes" or "Bree Ajanai Holmes"
  if (extractedFirst === userFirst && extractedLast === userLast) {
    return true
  }

  // Check if first name (first part) matches and last name matches, ignoring middle parts
  // This handles cases like "Bree Holmes" matching "Bree'Ajanai Holmes" or "Bree Ajanai Holmes"
  if (extractedFirst === userFirst) {
    // Check if last name matches
    if (extractedLast === userLast) {
      return true
    }
    // Or if last name is in the user's name parts (handles middle names)
    if (userParts.includes(extractedLast)) {
      return true
    }
  }

  // Check if extracted first name matches the start of user's first name part
  // e.g., "Bree" matches "Bree'Ajanai" when split
  if (
    userFirstFull.startsWith(extractedFirstFull) ||
    extractedFirstFull.startsWith(userFirstFull)
  ) {
    if (extractedLast === userLast) {
      return true
    }
  }

  return false
}

async function matchHeadshots() {
  console.log('🖼️  Starting headshot matching process...\n')

  // Read all files from /public/headshots/
  const headshotsDir = join(process.cwd(), 'public', 'headshots')
  let files: string[]

  try {
    files = await readdir(headshotsDir)
    // Filter out non-image files and invalid files
    files = files.filter(file => {
      const lower = file.toLowerCase()
      return (
        lower.startsWith('headshot-') &&
        (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png'))
      )
    })
    console.log(`📁 Found ${files.length} headshot files\n`)
  } catch (error) {
    console.error('❌ Error reading headshots directory:', error)
    process.exit(1)
  }

  // Fetch all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select(
      'id, first_name, last_name, preferred_first_name, preferred_last_name, email, headshot_url'
    )
    .eq('is_active', true)

  if (usersError) {
    console.error('❌ Error fetching users:', usersError)
    process.exit(1)
  }

  console.log(`👥 Found ${users?.length || 0} active users\n`)

  const results: MatchResult[] = []
  const matchedUserIds = new Set<string>()

  // Track which base filenames have been matched (to skip duplicates)
  const matchedBaseNames = new Set<string>()

  // Match each headshot file to a user
  for (const filename of files) {
    const extractedName = extractNameFromFilename(filename)

    // Skip if this is a duplicate of an already matched file
    const baseName = extractedName
      .toLowerCase()
      .replace(/\s*\([0-9]+\)\s*$/, '')
      .trim()
    if (matchedBaseNames.has(baseName)) {
      results.push({
        filename,
        matched: false,
        error: `Duplicate file - base name already matched`,
      })
      console.log(`⏭️  Skipping duplicate: ${filename} (already matched)`)
      continue
    }

    let matched = false
    let matchedUser: any = null
    let matchType: 'preferred' | 'legal' | undefined

    // Try exact match first with preferred name
    for (const user of users || []) {
      const preferredFullName = `${user.preferred_first_name} ${user.preferred_last_name}`
      const normalizedPreferred = normalizeName(preferredFullName)
      const normalizedExtracted = normalizeName(extractedName)

      if (normalizedPreferred === normalizedExtracted) {
        matched = true
        matchedUser = user
        matchType = 'preferred'
        break
      }
    }

    // Try exact match with legal name
    if (!matched) {
      for (const user of users || []) {
        const legalFullName = `${user.first_name} ${user.last_name}`
        const normalizedLegal = normalizeName(legalFullName)
        const normalizedExtracted = normalizeName(extractedName)

        if (normalizedLegal === normalizedExtracted) {
          matched = true
          matchedUser = user
          matchType = 'legal'
          break
        }
      }
    }

    // Try fuzzy match with preferred name
    if (!matched) {
      for (const user of users || []) {
        const preferredFullName = `${user.preferred_first_name} ${user.preferred_last_name}`

        if (fuzzyMatch(extractedName, preferredFullName)) {
          matched = true
          matchedUser = user
          matchType = 'preferred'
          break
        }
      }
    }

    // Try fuzzy match with legal name
    if (!matched) {
      for (const user of users || []) {
        const legalFullName = `${user.first_name} ${user.last_name}`

        if (fuzzyMatch(extractedName, legalFullName)) {
          matched = true
          matchedUser = user
          matchType = 'legal'
          break
        }
      }
    }

    if (matched && matchedUser) {
      // Upload headshot to Supabase Storage
      const filePath = join(headshotsDir, filename)
      let publicUrl: string | null = null

      try {
        // Read the file
        const fileBuffer = await readFile(filePath)

        // Determine content type from extension
        const extension = filename.split('.').pop()?.toLowerCase() || 'jpg'
        const contentType =
          extension === 'png' ? 'image/png' : extension === 'jpeg' ? 'image/jpeg' : 'image/jpeg'

        // Generate unique filename: userId-timestamp.extension
        const timestamp = Date.now()
        const storageFileName = `${matchedUser.id}-${timestamp}.${extension}`

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('headshots')
          .upload(storageFileName, fileBuffer, {
            contentType,
            upsert: true, // Replace if exists
          })

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`)
        }

        // Get public URL
        const { data: urlData } = supabase.storage.from('headshots').getPublicUrl(storageFileName)

        publicUrl = urlData.publicUrl
      } catch (uploadErr: any) {
        results.push({
          filename,
          matched: false,
          error: `Upload to Supabase Storage failed: ${uploadErr.message}`,
        })
        console.log(`❌ Upload failed for ${filename}: ${uploadErr.message}`)
        continue
      }

      // Update user's headshot_url in database with Supabase Storage URL
      const { error: updateError } = await supabase
        .from('users')
        .update({ headshot_url: publicUrl })
        .eq('id', matchedUser.id)

      if (updateError) {
        results.push({
          filename,
          matched: false,
          error: `Database update failed: ${updateError.message}`,
        })
      } else {
        results.push({
          filename,
          matched: true,
          userId: matchedUser.id,
          userName:
            matchType === 'preferred'
              ? `${matchedUser.preferred_first_name} ${matchedUser.preferred_last_name}`
              : `${matchedUser.first_name} ${matchedUser.last_name}`,
          matchType,
        })
        matchedUserIds.add(matchedUser.id)
        matchedBaseNames.add(baseName)
        const matchTypeLabel = matchType === 'preferred' ? 'preferred name' : 'legal name'
        const normalizedExtracted = normalizeName(extractedName)
        const isFuzzy =
          normalizedExtracted !==
            normalizeName(
              `${matchedUser.preferred_first_name} ${matchedUser.preferred_last_name}`
            ) &&
          normalizedExtracted !==
            normalizeName(`${matchedUser.first_name} ${matchedUser.last_name}`)
        const fuzzyLabel = isFuzzy ? ' (fuzzy match)' : ''
        console.log(
          `✅ Matched: ${filename} → ${matchedUser.preferred_first_name} ${matchedUser.preferred_last_name} (${matchTypeLabel}${fuzzyLabel})`
        )
      }
    } else {
      results.push({
        filename,
        matched: false,
        error: `No matching user found for "${extractedName}"`,
      })
      console.log(`❌ No match: ${filename} (extracted: "${extractedName}")`)
    }
  }

  // Find users without headshots
  const usersWithoutHeadshots: UnmatchedAgent[] = []
  for (const user of users || []) {
    if (!user.headshot_url && !matchedUserIds.has(user.id)) {
      usersWithoutHeadshots.push({
        id: user.id,
        preferred_name: `${user.preferred_first_name} ${user.preferred_last_name}`,
        legal_name: `${user.first_name} ${user.last_name}`,
        email: user.email,
      })
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 MATCHING SUMMARY')
  console.log('='.repeat(60))

  const matchedCount = results.filter(r => r.matched).length
  const unmatchedCount = results.filter(r => !r.matched).length

  console.log(`\n✅ Successfully matched: ${matchedCount} headshots`)
  console.log(`❌ Unmatched files: ${unmatchedCount}`)
  console.log(`👤 Agents without headshots: ${usersWithoutHeadshots.length}`)

  if (unmatchedCount > 0) {
    console.log('\n❌ UNMATCHED FILES:')
    results
      .filter(r => !r.matched)
      .forEach(r => {
        console.log(`   - ${r.filename}${r.error ? ` (${r.error})` : ''}`)
      })
  }

  if (usersWithoutHeadshots.length > 0) {
    console.log('\n👤 AGENTS WITHOUT HEADSHOTS:')
    usersWithoutHeadshots.forEach(agent => {
      console.log(`   - ${agent.preferred_name} (${agent.legal_name}) - ${agent.email}`)
    })
  }

  console.log('\n' + '='.repeat(60))
  console.log('✨ Matching process complete!')
  console.log('='.repeat(60) + '\n')
}

// Run the script
matchHeadshots()
  .then(() => {
    console.log('✅ Script completed successfully')
    process.exit(0)
  })
  .catch(error => {
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
