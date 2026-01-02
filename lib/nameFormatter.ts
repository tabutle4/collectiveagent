/**
 * Formats a name to proper Title Case
 * Examples:
 * - "vivian" -> "Vivian"
 * - "VIVIAN" -> "Vivian"
 * - "john smith" -> "John Smith"
 * - "MARY-JANE" -> "Mary-Jane"
 * - "o'brien" -> "O'Brien"
 * - "van der berg" -> "Van Der Berg"
 */
export function formatNameToTitleCase(name: string): string {
  if (!name || !name.trim()) return name
  
  // Handle special cases and common prefixes
  const specialCases: Record<string, string> = {
    'mc': 'Mc',
    'mac': 'Mac',
    "o'": "O'",
    "d'": "D'",
    'van': 'Van',
    'von': 'Von',
    'de': 'De',
    'del': 'Del',
    'la': 'La',
    'le': 'Le',
    'el': 'El',
  }
  
  // Split by spaces, hyphens, and apostrophes (but keep them)
  return name
    .trim()
    .split(/([\s\-'])/)
    .map((part, index, array) => {
      // Skip separators (spaces, hyphens, apostrophes)
      if (/^[\s\-']$/.test(part)) return part
      
      const lowerPart = part.toLowerCase()
      
      // Check for special cases
      // Only match if prefix is the entire word OR followed by a space, hyphen, or apostrophe
      for (const [key, replacement] of Object.entries(specialCases)) {
        if (lowerPart === key) {
          // Entire word matches (e.g., "La" by itself)
          return replacement
        } else if (
          lowerPart.startsWith(key + ' ') ||
          lowerPart.startsWith(key + '-') ||
          lowerPart.startsWith(key + "'")
        ) {
          // Prefix followed by space, hyphen, or apostrophe (e.g., "La Fontaine", "De-La-Cruz", "O'Brien")
          return replacement + lowerPart.slice(key.length).charAt(0).toUpperCase() + lowerPart.slice(key.length + 1)
        }
      }
      
      // Default: capitalize first letter, lowercase the rest
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}

/**
 * Formats a role to proper case
 * Examples:
 * - "agent" -> "Agent"
 * - "team lead" -> "Team Lead"
 * - "Team_lead" -> "Team Lead"
 * - "BROKER" -> "Broker"
 */
export function formatRole(role: string): string {
  if (!role || !role.trim()) return role
  
  // First, replace underscores with spaces and normalize
  const normalized = role.replace(/_/g, ' ').trim()
  
  // Special handling for multi-word roles
  const roleMap: Record<string, string> = {
    'agent': 'Agent',
    'broker': 'Broker',
    'admin': 'Admin',
    'team lead': 'Team Lead',
    'teamlead': 'Team Lead',
    'team_lead': 'Team Lead',
    'operations officer': 'Operations Officer',
    'operationsofficer': 'Operations Officer',
    'operations_officer': 'Operations Officer',
    'coach': 'Coach',
    'ceo': 'CEO',
    'owner': 'Owner',
  }
  
  const lowerRole = normalized.toLowerCase()
  
  // Check if it's a known role
  if (roleMap[lowerRole]) {
    return roleMap[lowerRole]
  }
  
  // Default: capitalize each word (split by spaces)
  return normalized
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Normalizes a role array - converts underscores to spaces and formats roles
 * This should be used when saving roles to the database
 */
export function normalizeRoles(roles: string[]): string[] {
  if (!roles || !Array.isArray(roles)) return []
  
  return roles
    .map(role => {
      // Replace underscores with spaces
      const normalized = role.replace(/_/g, ' ').trim()
      // Format using formatRole
      return formatRole(normalized)
    })
    .filter(role => role && role.trim().length > 0)
}

