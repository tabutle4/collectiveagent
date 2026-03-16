// ===== Text Formatting =====

/** Convert text to Title Case (every word capitalized) */
export function toTitleCase(str: string): string {
  if (!str) return ''
  // Words that stay lowercase unless first word
  const minor = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'of', 'in'])
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i === 0 || !minor.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')
}

/** Format street address to Title Case, handle common abbreviations */
export function formatAddress(str: string): string {
  if (!str) return ''
  let formatted = toTitleCase(str)
  // Fix common street abbreviations
  const abbrevs: Record<string, string> = {
    'St': 'St', 'Dr': 'Dr', 'Ave': 'Ave', 'Blvd': 'Blvd', 'Ln': 'Ln',
    'Ct': 'Ct', 'Rd': 'Rd', 'Pl': 'Pl', 'Cir': 'Cir', 'Pkwy': 'Pkwy',
    'Hwy': 'Hwy', 'Fwy': 'Fwy', 'Apt': 'Apt', 'Ste': 'Ste', 'Unit': 'Unit',
    'Ne': 'NE', 'Nw': 'NW', 'Se': 'SE', 'Sw': 'SW',
    'N': 'N', 'S': 'S', 'E': 'E', 'W': 'W',
    'Po': 'PO',
  }
  // Replace directional and abbreviation fixes
  Object.entries(abbrevs).forEach(([lower, upper]) => {
    const regex = new RegExp(`\\b${lower}\\b`, 'g')
    formatted = formatted.replace(regex, upper)
  })
  return formatted
}

/** Format state code to uppercase */
export function formatState(str: string): string {
  return str ? str.toUpperCase().slice(0, 2) : ''
}

// ===== Phone Formatting =====

/** Format phone number to (XXX) XXX-XXXX */
export function formatPhone(value: string): string {
  // Strip everything except digits
  const digits = value.replace(/\D/g, '')
  // Remove leading 1 for US numbers
  const cleaned = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits
  if (cleaned.length === 0) return ''
  if (cleaned.length <= 3) return `(${cleaned}`
  if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`
  return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`
}

/** Strip phone formatting for storage */
export function stripPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 10)
}

// ===== Money Formatting =====

/** Format number as currency display: $1,234.56 */
export function formatMoney(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

/** Parse currency string back to number string for form state */
export function parseMoney(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, '')
  // Prevent multiple decimals
  const parts = cleaned.split('.')
  if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('')
  return cleaned
}

// ===== Address Builder =====

export function buildPropertyAddress(
  street: string, unit: string, city: string, state: string, zip: string
): string {
  if (!street) return ''
  const parts = [street]
  if (unit) parts[0] += `, ${unit}`
  if (city) parts.push(city)
  if (state) parts.push(state)
  if (zip) parts.push(zip)
  return parts.filter(Boolean).join(', ')
}