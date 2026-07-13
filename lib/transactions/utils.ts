import { formatNameToTitleCase } from '@/lib/nameFormatter'
// ===== Text Formatting =====

/** Convert text to Title Case (every word capitalized) */
export function toTitleCase(str: string): string {
  if (!str) return ''
  // Words that stay lowercase unless first word
  const minor = new Set([
    'a',
    'an',
    'the',
    'and',
    'but',
    'or',
    'for',
    'nor',
    'on',
    'at',
    'to',
    'by',
    'of',
    'in',
  ])
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
    St: 'St',
    Dr: 'Dr',
    Ave: 'Ave',
    Blvd: 'Blvd',
    Ln: 'Ln',
    Ct: 'Ct',
    Rd: 'Rd',
    Pl: 'Pl',
    Cir: 'Cir',
    Pkwy: 'Pkwy',
    Hwy: 'Hwy',
    Fwy: 'Fwy',
    Apt: 'Apt',
    Ste: 'Ste',
    Unit: 'Unit',
    Ne: 'NE',
    Nw: 'NW',
    Se: 'SE',
    Sw: 'SW',
    N: 'N',
    S: 'S',
    E: 'E',
    W: 'W',
    Po: 'PO',
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
  street: string,
  unit: string,
  city: string,
  state: string,
  zip: string
): string {
  if (!street) return ''
  const parts = [street]
  if (unit) parts[0] += `, ${unit}`
  if (city) parts.push(city)
  if (state) parts.push(state)
  if (zip) parts.push(zip)
  return parts.filter(Boolean).join(', ')
}

// ===== Address Normalization =====

/**
 * Clean an address for STORAGE and DISPLAY. Collapses stray whitespace,
 * trims, and applies consistent Title Case plus standard street/directional
 * abbreviations. This is what should be saved on the record so every address
 * reads the same way regardless of how the agent typed it.
 */
export function normalizeAddressForStorage(str: string | null | undefined): string {
  if (!str) return ''
  // Collapse runs of whitespace (including tabs/newlines) to single spaces, trim.
  const collapsed = str.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''
  return formatAddress(collapsed)
}

/**
 * Produce a canonical MATCH KEY for comparing two addresses in find-or-create
 * logic. This is NOT stored or shown to anyone. It lowercases, strips
 * punctuation, and collapses whitespace so "123 Main St." and "123 main  street"
 * compare as close as possible. It intentionally keeps unit/zip content so that
 * a missing unit or zip still produces a different key (we do not want to merge
 * two genuinely different units into one deal).
 */
export function addressMatchKey(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .replace(/[.,#]/g, ' ') // drop common punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim()
}

/**
 * Normalize free-typed entry fields on transactions, checks, and related
 * records at every point of entry. People type addresses and names in ALL
 * CAPS or all lowercase; storage should always be consistently formatted.
 * Only touches string values that are present; leaves everything else as-is.
 */
export function normalizeTransactionEntryFields<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = { ...obj }
  if (typeof out.property_address === 'string' && out.property_address.trim()) {
    out.property_address = normalizeAddressForStorage(out.property_address)
  }
  for (const key of ['client_name', 'title_officer_name', 'agent_name', 'payor_name']) {
    if (typeof out[key] === 'string' && out[key].trim()) {
      out[key] = formatNameToTitleCase(out[key].trim())
    }
  }
  for (const key of ['title_company', 'brokerage_name']) {
    if (typeof out[key] === 'string' && out[key].trim()) {
      out[key] = toTitleCase(out[key].trim())
    }
  }
  return out as T
}

// ===== Structured Address Components =====

/** Full state name to postal abbreviation, so "texas" / "TEXAS" / "tX" all become "TX". */
const STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
}

const VALID_STATE_ABBRS = new Set(Object.values(STATE_NAME_TO_ABBR))

/**
 * Normalize whatever the agent typed into a two letter postal abbreviation.
 * Returns an empty string when it cannot be resolved, so the caller can reject.
 */
export function normalizeState(input: string | null | undefined): string {
  if (!input) return ''
  const cleaned = input.replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!cleaned) return ''
  if (cleaned.length === 2 && VALID_STATE_ABBRS.has(cleaned.toUpperCase())) {
    return cleaned.toUpperCase()
  }
  return STATE_NAME_TO_ABBR[cleaned] || ''
}

/** Keep only the digits of a zip, allowing the optional plus four form. */
export function normalizeZip(input: string | null | undefined): string {
  if (!input) return ''
  const digits = input.replace(/[^0-9]/g, '')
  if (digits.length === 9) return `${digits.slice(0, 5)}-${digits.slice(5)}`
  return digits.slice(0, 5)
}

export interface AddressComponents {
  street_address: string
  unit: string
  city: string
  state: string
  zip: string
}

/** Clean a set of address components entered on a form. */
export function normalizeAddressComponents(input: Partial<AddressComponents>): AddressComponents {
  return {
    street_address: normalizeAddressForStorage(input.street_address || ''),
    unit: (input.unit || '').replace(/\s+/g, ' ').trim(),
    city: toTitleCase((input.city || '').replace(/\s+/g, ' ').trim()),
    state: normalizeState(input.state),
    zip: normalizeZip(input.zip),
  }
}

/**
 * Build the display string stored on property_address. Everything that already
 * reads property_address keeps working; the difference is that the app now
 * generates it from validated parts instead of trusting free text.
 */
export function buildDisplayAddress(c: Partial<AddressComponents>): string {
  const parts: string[] = []
  const street = (c.street_address || '').trim()
  const unit = (c.unit || '').trim()
  const city = (c.city || '').trim()
  const state = (c.state || '').trim()
  const zip = (c.zip || '').trim()

  if (street) parts.push(street)
  if (unit) parts.push(/^(unit|apt|ste|suite|#)/i.test(unit) ? unit : `Unit ${unit}`)
  if (city) parts.push(city)

  const tail = [state, zip].filter(Boolean).join(' ')
  const joined = parts.join(', ')
  if (joined && tail) return `${joined}, ${tail}`
  return joined || tail
}

/**
 * Validate address components at the point of entry. An empty list means the
 * address is good. Routes reject the submission when anything is returned, so a
 * malformed address can never reach the database again.
 */
export function validateAddressComponents(c: Partial<AddressComponents>): string[] {
  const errors: string[] = []
  const street = (c.street_address || '').trim()
  const city = (c.city || '').trim()
  const state = normalizeState(c.state)
  const zip = normalizeZip(c.zip)

  if (!street) errors.push('Street address is required')
  else if (!/\d/.test(street)) errors.push('Street address should start with a house number')

  if (!city) errors.push('City is required')
  if (!state) errors.push('State is not recognized, use a name like Texas or an abbreviation like TX')
  if (!zip) errors.push('Zip code is required')
  else if (!/^\d{5}(-\d{4})?$/.test(zip)) errors.push('Zip code must be 5 digits')

  return errors
}

// ===== Property Stats =====

export interface PropertyStats {
  bedrooms: number | null
  bathrooms: number | null
  garage: number | null
  building_sqft: number | null
}

/**
 * Normalize the property stats an agent types on a form into the columns that
 * live on the transaction. transactions is the single source of truth for
 * stats; the flyer reads them from there rather than keeping its own copies.
 *
 * Accepts messy input ("2.5", "1,901", "", null) and returns clean numbers or
 * null. Never throws.
 */
export function normalizePropertyStats(input: {
  bedrooms?: string | number | null
  bathrooms?: string | number | null
  garage?: string | number | null
  sqft?: string | number | null
}): PropertyStats {
  const int = (v: string | number | null | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(String(v).replace(/[^0-9.]/g, ''))
    if (Number.isNaN(n) || n < 0) return null
    return Math.round(n)
  }
  const num = (v: string | number | null | undefined): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(String(v).replace(/[^0-9.]/g, ''))
    if (Number.isNaN(n) || n < 0) return null
    return n
  }
  return {
    bedrooms: int(input.bedrooms),
    bathrooms: num(input.bathrooms),
    garage: int(input.garage),
    building_sqft: num(input.sqft),
  }
}
