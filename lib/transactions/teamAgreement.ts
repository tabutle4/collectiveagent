import { supabaseAdmin } from '@/lib/supabase'

// Matches a plain calendar date (YYYY-MM-DD). Longer ISO timestamps are sliced
// to their date portion before this test. Anything that does not match is
// treated as "no governing date" so a malformed or client-supplied value can
// never be interpolated into a PostgREST filter string.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const AGREEMENT_SELECT =
  'id, firm_min_override, team:teams!team_member_agreements_team_id_fkey(id, team_name)'

type SupabaseLike = typeof supabaseAdmin

export interface GoverningTeamAgreement {
  id: string
  firm_min_override?: boolean
  team: any
}

// Resolves which team agreement governs a transaction for an agent.
//
// A transaction is governed by the team agreement that was in effect on the
// deal's governing date: the purchase agreement execution date for sales, the
// tenant move-in date for leases, falling back to the closing date. This honors
// the team agreement exit provision that pending deals keep the team splits in
// effect when the deal was signed, even after the membership has since ended.
//
// If a valid governing date is supplied, the dated match is authoritative: a
// null result means no agreement covered that date, so standard brokerage
// splits apply. Only when no usable date exists at all do we fall back to the
// agent's currently active agreement, preserving legacy behavior so nothing
// regresses on deals that have no dates entered yet.
//
// When more than one agreement covers the same date, the one with the latest
// effective_date wins.
export async function resolveGoverningTeamAgreement(
  supabase: SupabaseLike,
  agentId: string,
  governingDate: string | null | undefined
): Promise<GoverningTeamAgreement | null> {
  const raw = governingDate ? String(governingDate).slice(0, 10) : null
  const safeDate = raw && DATE_RE.test(raw) ? raw : null

  if (safeDate) {
    const { data } = await supabase
      .from('team_member_agreements')
      .select(AGREEMENT_SELECT)
      .eq('agent_id', agentId)
      .lte('effective_date', safeDate)
      .or(`end_date.is.null,end_date.gte.${safeDate}`)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as any) || null
  }

  const { data: current } = await supabase
    .from('team_member_agreements')
    .select(AGREEMENT_SELECT)
    .eq('agent_id', agentId)
    .is('end_date', null)
    .maybeSingle()
  return (current as any) || null
}
