/**
 * Canonical address keys. Pure string work, zero imports, safe to import from
 * client components and from server routes alike - the same split used by
 * lib/transactions/ecommission.ts against ecommissionSync.ts.
 *
 * This is the ONLY address-matching implementation in the app. Three separate
 * ones existed before and disagreed with each other, which is how the same
 * property ended up with two transactions:
 *
 *   utils.addressMatchKey        lowercased and stripped . , # only, so
 *                                "St" and "Street" compared as different
 *   compliance addressSearchTerms  ilike on the first two words, agent-scoped
 *   listings findExistingTransaction  called addressMatchKey, same weakness
 *
 * Two keys are produced for every address, because the duplicates that reached
 * production come in two shapes:
 *
 *   STRICT - punctuation stripped, street-type words and directionals reduced
 *   to one spelling, filler dropped, repeats collapsed, tokens sorted.
 *   "10606 Knox Landing Dr" and "10606 Knox Landing Drive" match. A strict
 *   match is the same property, so an unattended webhook may act on it.
 *
 *   LOOSE - the strict key with the street-type word removed entirely.
 *   "5618 Southbrook Drive" and "5618 Southbrook St" match: one suffix is
 *   simply wrong and no canonicalisation reconciles that. A loose match is a
 *   suggestion for a person to confirm and is never applied automatically.
 *
 * Both keys keep unit and zip tokens, so two units in one building never
 * collapse into each other. That is what makes brokerage-wide matching safe.
 */

/** Street-type words reduced to one spelling for the strict key. */
const STREET_TYPES: Record<string, string> = {
  street: 'st', st: 'st',
  drive: 'dr', dr: 'dr',
  road: 'rd', rd: 'rd',
  lane: 'ln', ln: 'ln',
  boulevard: 'blvd', blvd: 'blvd',
  avenue: 'ave', ave: 'ave', av: 'ave',
  court: 'ct', ct: 'ct',
  circle: 'cir', cir: 'cir',
  place: 'pl', pl: 'pl',
  parkway: 'pkwy', pkwy: 'pkwy',
  trail: 'trl', trl: 'trl',
  terrace: 'ter', ter: 'ter',
  highway: 'hwy', hwy: 'hwy',
  freeway: 'fwy', fwy: 'fwy',
  square: 'sq', sq: 'sq',
  crossing: 'xing', xing: 'xing',
}

/** Directional words reduced to one spelling for the strict key. */
const DIRECTIONALS: Record<string, string> = {
  north: 'n', n: 'n',
  south: 's', s: 's',
  east: 'e', e: 'e',
  west: 'w', w: 'w',
  northeast: 'ne', ne: 'ne',
  northwest: 'nw', nw: 'nw',
  southeast: 'se', se: 'se',
  southwest: 'sw', sw: 'sw',
}

/**
 * Words that carry no distinguishing information. Unit markers go here rather
 * than being dropped with their value: "Unit B" and ", B," must compare equal,
 * so the marker is removed and the "b" is kept.
 */
const FILLER = new Set([
  'unit', 'units', 'apt', 'apartment', 'ste', 'suite', 'no', 'num', 'number',
  'tx', 'texas', 'us', 'usa',
])

function tokenize(address: string): string[] {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/**
 * Drop repeats while keeping first-appearance order. Addresses arrive with the
 * city and zip pasted in twice often enough to matter - "1520 Oliver St,
 * Houston, Tx 77007, Unit 1463, Houston, TX 77007" is a real row - and without
 * this the repeat alone makes the key differ.
 */
function dedupeTokens(tokens: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tokens) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function buildAddressKeys(address: string | null | undefined): { strict: string; loose: string } {
  const empty = { strict: '', loose: '' }
  if (!address) return empty

  const raw = tokenize(address).filter(t => !FILLER.has(t))
  if (!raw.length) return empty

  const strictTokens: string[] = []
  const looseTokens: string[] = []
  for (const t of raw) {
    const street = STREET_TYPES[t]
    const dir = DIRECTIONALS[t]
    if (street) {
      // Canonical in the strict key; absent from the loose key, which is what
      // lets a wrong suffix still find its twin.
      strictTokens.push(street)
      continue
    }
    const canon = dir || t
    strictTokens.push(canon)
    looseTokens.push(canon)
  }

  // A key with no house number is not specific enough to match on. Retainer
  // placeholders ("Retainer client", a payer's name) land here and correctly
  // produce nothing, so they never match each other. Tested on the raw order,
  // before sorting moves the number.
  if (!/^\d/.test(raw[0])) return empty
  // A bare house number and nothing else. Require something to go with it.
  if (looseTokens.length < 2) return empty

  // Sorted, because the unit does not appear in a fixed position. "3402
  // Nathaniel Brown St, Houston, Tx 77021, Unit A/B, Houston, TX 77021" and
  // "3402 Nathaniel Brown St, Unit A & B, Houston, TX 77021" carry identical
  // tokens in different orders; comparing them in source order reports two
  // different properties, which is how that pair became a live duplicate.
  const strict = dedupeTokens(strictTokens).sort().join(' ')
  const loose = dedupeTokens(looseTokens).sort().join(' ')

  return { strict, loose }
}

/** Canonical strict key. Exported for callers that only need equality. */
export function canonicalAddressKey(address: string | null | undefined): string {
  return buildAddressKeys(address).strict
}

/** Looser key with the street-type word removed. Suggestions only. */
export function looseAddressKey(address: string | null | undefined): string {
  return buildAddressKeys(address).loose
}
