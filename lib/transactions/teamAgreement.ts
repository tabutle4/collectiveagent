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

// Resolves which people were team leads on a given team as of a deal's
// governing date.
//
// Leadership changes hands. Looking up "who leads this team right now" puts the
// current lead's name on a deal that closed under someone else, and pays team
// lead splits to the wrong person. Same governing date as the membership
// resolver above: execution date for sales, move-in for leases, falling back to
// closing.
//
// A null start_date means the lead has held the role since before the record
// was kept, so it counts. A null end_date means they still hold it. With no
// usable governing date we fall back to the currently active leads, preserving
// legacy behavior on deals with no dates entered.
export async function resolveGoverningTeamLeads(
  supabase: SupabaseLike,
  teamIds: string[],
  governingDate: string | null | undefined
): Promise<any[]> {
  if (teamIds.length === 0) return []
  const raw = governingDate ? String(governingDate).slice(0, 10) : null
  const safeDate = raw && DATE_RE.test(raw) ? raw : null

  const base = supabase
    .from('team_leads')
    .select(`
      team_id, agent_id, start_date, created_at,
      agent:users!team_leads_agent_id_fkey(
        id, first_name, last_name, preferred_first_name, preferred_last_name
      )
    `)
    .in('team_id', teamIds)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  const { data } = safeDate
    ? await base
        .or(`start_date.is.null,start_date.lte.${safeDate}`)
        .or(`end_date.is.null,end_date.gte.${safeDate}`)
    : await base.is('end_date', null)

  return data || []
}
