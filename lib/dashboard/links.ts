/**
 * Custom dashboard links - the per-user list behind the broker dashboard's
 * "My links" section, stored as users.dashboard_links jsonb.
 *
 * Client-safe, zero imports: the same validator runs in the browser (so the
 * form can refuse a bad URL before saving) and on the server (so a hand-rolled
 * PATCH cannot store one). Client-side validation alone would be no
 * validation at all - anything writable in the UI has to be restricted at the
 * route as well.
 */

export interface DashboardLink {
  label: string
  url: string
}

export const DASHBOARD_LINK_MAX = 20
const LABEL_MAX = 60
const URL_MAX = 2048

/**
 * Only http and https. This is the security-relevant part: the value is
 * rendered into an href, so a javascript: or data: URL stored here would
 * execute in the viewer's browser. Anything that is not an absolute http(s)
 * URL is rejected outright rather than coerced.
 */
export function isValidLinkUrl(raw: string | null | undefined): boolean {
  const s = String(raw ?? '').trim()
  if (!s || s.length > URL_MAX) return false
  let parsed: URL
  try {
    parsed = new URL(s)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/**
 * Coerces whatever arrived into a clean, bounded list. Unparseable entries are
 * dropped rather than repaired, so a malformed save cannot silently store a
 * link that does not work. Order is preserved - the list is user-ordered.
 */
export function sanitizeDashboardLinks(input: unknown): DashboardLink[] {
  if (!Array.isArray(input)) return []
  const out: DashboardLink[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const url = String(rec.url ?? '').trim()
    if (!isValidLinkUrl(url)) continue
    const label = String(rec.label ?? '').trim().slice(0, LABEL_MAX)
    out.push({ label: label || url, url })
    if (out.length >= DASHBOARD_LINK_MAX) break
  }
  return out
}
