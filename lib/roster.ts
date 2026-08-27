/**
 * Who is on the Collective Realty Co. roster, and how that is said to a human.
 *
 * ONE definition, shared by the roster page itself and by every surface that
 * needs to say whether a person is still with the firm. Client-safe, zero
 * imports beyond the shared constant, so a React component and a route handler
 * can both call it.
 *
 * THE ROSTER IS THREE CONDITIONS, not one. app/agent-roster.html/route.ts has
 * always built /admin/agent-roster and the public /roster from
 * is_active AND is_licensed_agent AND NOT Referral Collective, and nothing
 * downstream filters further - that query IS the roster. The deal page's firm
 * status label used to test is_active alone, which is why it could disagree
 * with the roster it was meant to mirror.
 *
 * Measured 27 August 2026: 91 users are is_active, 86 of those are licensed
 * agents, and 82 of those are not Referral Collective. So the three conditions
 * are not interchangeable and the roster is the narrowest of the three.
 *
 * REFERRAL COLLECTIVE IS NOT A DEPARTURE. RC is a separate entity with its own
 * roster; its agents pay an annual fee rather than the monthly one and are
 * deliberately kept off the CRC roster, which is a public-facing list of CRC
 * MLS agents. Calling them "Not with firm" next to a payout button would read
 * as "this person left," which is wrong and is the one thing that label exists
 * to warn about. They get their own state instead.
 *
 * A person who is off the roster because they are inactive is 'off_roster'
 * whatever their mls_choice, so a departed RC agent reads as departed rather
 * than as Referral Collective. Order of the checks below is load-bearing.
 */

import { REFERRAL_COLLECTIVE_MLS_CHOICE } from '@/lib/constants'

export type FirmStatus = 'on_roster' | 'referral_collective' | 'off_roster'

/** The fields of a users row this file reads. */
export interface RosterUserInput {
  is_active?: boolean | null
  is_licensed_agent?: boolean | null
  mls_choice?: string | null
}

/**
 * The three roster conditions, applied to a Supabase query builder. Kept
 * beside firmStatus() below so the SQL the roster page runs and the predicate
 * every other surface runs cannot drift apart unnoticed.
 *
 * Loosely typed on purpose: PostgREST builders are generic over the row shape
 * and re-declaring that here would buy nothing.
 */
export function applyRosterFilters<T>(query: T): T {
  return (query as any)
    .eq('is_active', true)
    .eq('is_licensed_agent', true)
    .neq('mls_choice', REFERRAL_COLLECTIVE_MLS_CHOICE)
}

/**
 * Where one person stands relative to the roster.
 *
 * Note the strict `=== true` on both booleans: a user row that was never
 * selected with these columns arrives undefined, and undefined must not read
 * as on the roster. It reads as off_roster, which is the safe direction next
 * to a payout button.
 */
export function firmStatus(user: RosterUserInput | null | undefined): FirmStatus {
  if (user?.is_active !== true || user?.is_licensed_agent !== true) return 'off_roster'
  if (String(user?.mls_choice || '') === REFERRAL_COLLECTIVE_MLS_CHOICE) {
    return 'referral_collective'
  }
  return 'on_roster'
}

/** True only for people the roster page would list. */
export function isOnRoster(user: RosterUserInput | null | undefined): boolean {
  return firmStatus(user) === 'on_roster'
}

export const FIRM_STATUS_LABELS: Record<FirmStatus, string> = {
  on_roster: 'With firm',
  referral_collective: 'Referral Collective',
  off_roster: 'Not with firm',
}

/**
 * Green for on the roster, red for gone, and the app's standard muted gray for
 * Referral Collective - it is information, not a warning, so it must not carry
 * the same alarm colour as a departure.
 */
export const FIRM_STATUS_CLASSES: Record<FirmStatus, string> = {
  on_roster: 'text-green-600',
  referral_collective: 'text-luxury-gray-3',
  off_roster: 'text-red-600',
}
