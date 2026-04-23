/**
 * Firm-wide standard defaults for commission plan terms.
 *
 * These previously lived as hardcoded strings inside the document template
 * functions. They now read from company_settings so ops can adjust firm
 * standards without a code change, and per-agent overrides on the users
 * table cleanly layer on top.
 */

export interface StandardPlanDefaults {
  /** Standard New Agent Plan coaching/training fee per transaction. */
  coachingFee: number
  /** Standard Cap Plan dollar cap amount. */
  capAmount: number
  /** Standard Cap Plan post-cap split string (agent/agency), e.g. '97/3'. */
  postCapSplit: string
}

/**
 * Hard fallback values used only when company_settings is unreachable or
 * not yet seeded. Matches the firm's current documented standard so the
 * behavior is identical to the pre-migration state even under fallback.
 */
const HARD_FALLBACK: StandardPlanDefaults = {
  coachingFee: 500,
  capAmount: 18000,
  postCapSplit: '97/3',
}

/**
 * Read firm-wide plan defaults from company_settings. Returns the hard
 * fallback if the row doesn't exist yet or the query fails — never throws,
 * so document generation is never blocked on this read.
 *
 * supabase: any Supabase client (service-role or anon both work since
 * company_settings is readable by the app).
 */
export async function getStandardPlanDefaults(supabase: any): Promise<StandardPlanDefaults> {
  try {
    const { data, error } = await supabase
      .from('company_settings')
      .select('standard_new_agent_coaching_fee, standard_cap_amount, standard_post_cap_split')
      .single()

    if (error || !data) return HARD_FALLBACK

    return {
      coachingFee:
        data.standard_new_agent_coaching_fee != null
          ? Number(data.standard_new_agent_coaching_fee)
          : HARD_FALLBACK.coachingFee,
      capAmount:
        data.standard_cap_amount != null
          ? Number(data.standard_cap_amount)
          : HARD_FALLBACK.capAmount,
      postCapSplit: data.standard_post_cap_split || HARD_FALLBACK.postCapSplit,
    }
  } catch {
    return HARD_FALLBACK
  }
}
