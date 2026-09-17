import { fetchAllRows } from '@/lib/supabase'
import { COMPLIANCE_REQUEST_MODES } from '@/lib/reporting/production'

/**
 * The set of transactions an agent has filed a compliance request against.
 *
 * Server only - it reads the database, and lib/reporting/production.ts stays
 * free of that so the charts component can import the rules it needs.
 *
 * Matching is on submission_mode, the way every other compliance surface in
 * the app matches (SIDE_MODES_FILTER in lib/compliance/derive.ts, the payouts
 * report, the compliance tracker), rather than on the Compliance & CDA
 * Request form id. The mode is the app's own vocabulary for what a submission
 * is; the form id is a row in a table that could be reseeded.
 */
export async function fetchComplianceRequestTxnIds(): Promise<Set<string>> {
  // 1,318 submission rows today, 953 of them a compliance request, and one row
  // per side, so this passes 1,000 soon - fetchAllRows, because a truncated
  // read here silently drops leases out of the quarter. Counted 2026-09-17.
  //
  // Only the two columns this function reads are selected. Pulling the whole
  // `data` jsonb to look at one key moved roughly 850 kB per call, on a query
  // that runs on every dashboard load and every quarterly report.
  //
  // Two PostgREST features are in play here and they fail in opposite
  // directions, so be precise about which guard covers which.
  //
  // The `in` filter is what makes the read small. If PostgREST ever ignored
  // it we would get all 1,318 rows back, and the mode check in the loop would
  // reject the ones that do not belong. Cost: bandwidth. Answer: still right.
  //
  // The `submission_mode:` alias is what the loop reads. If that ever stopped
  // resolving, every row would arrive with submission_mode undefined, the
  // check would match nothing, the set would come back empty and EVERY lease
  // would silently drop out of production while sales still looked perfect.
  // The mode check does not protect against that - it is the thing that would
  // do the damage. So the invariant below turns that failure into a thrown
  // error instead of a wrong number. Both features are documented (see
  // https://docs.postgrest.org/en/v12/references/api/tables_views.html,
  // "JSON columns" for the alias and the operators table for `in`), which is
  // why this works; the invariant is there for the day that stops being true.
  const rows = await fetchAllRows<{
    transaction_id: string | null
    submission_mode: string | null
  }>(
    'agent_form_submissions',
    'transaction_id, submission_mode:data->>submission_mode',
    {
      filters: [
        {
          type: 'in',
          column: 'data->>submission_mode',
          value: COMPLIANCE_REQUEST_MODES,
        },
      ],
    }
  )
  const ids = new Set<string>()
  for (const row of rows || []) {
    if (!row.transaction_id) continue
    if (COMPLIANCE_REQUEST_MODES.includes(String(row.submission_mode || ''))) {
      ids.add(row.transaction_id)
    }
  }

  // Rows came back but none of them qualified. That cannot happen against real
  // data - the filter already restricted the read to qualifying modes, and
  // every qualifying submission carries a transaction_id - so it means the
  // mode did not survive the round trip. Fail loudly rather than hand back an
  // empty set that reads as "no lease has a compliance request".
  if ((rows?.length ?? 0) > 0 && ids.size === 0) {
    throw new Error(
      'fetchComplianceRequestTxnIds read ' +
        rows.length +
        ' submission rows and resolved none of them to a compliance request. ' +
        'The submission_mode alias is most likely no longer resolving.'
    )
  }

  return ids
}
