// lib/transactions/externalBrokerage.ts
//
// What may be written to a transaction_external_brokerages row, and by whom.
//
// Two routes update this table: the admin one at
// /api/admin/transactions/[id] and the one at /api/transactions/[id]. They had
// drifted. The admin route refused to touch a locked field on a paid row; the
// other had no such check and would rewrite a paid brokerage's commission
// amount. A protection only one of two doors enforces is not a protection, so
// both now import from here.
//
// Neither route had a field allow-list at all. Both spread the client's
// `updates` object straight into the UPDATE, which meant a request could set
// `transaction_id` and move a brokerage onto a different deal, or write
// `payload_funding_id`, which belongs to the payment provider. The columns
// below are the ones a person legitimately edits; everything else is dropped
// rather than rejected, so an older client sending a stray key still saves the
// fields it meant to.

/** Columns a person may edit. Every other column is dropped on the way in. */
export const EDITABLE_TEB_FIELDS = new Set([
  'brokerage_role',
  'brokerage_role_other',
  'brokerage_name',
  'brokerage_dba',
  'brokerage_ein',
  'brokerage_address',
  'brokerage_city',
  'brokerage_state',
  'brokerage_zip',
  'broker_name',
  'broker_phone',
  'broker_email',
  'agent_name',
  'agent_phone',
  'agent_email',
  'commission_amount',
  'amount_1099_reportable',
  'payment_status',
  'payment_date',
  'payment_method',
  'payment_reference',
  'w9_on_file',
  'w9_date_received',
  'federal_id_type',
  'federal_id_number',
  'notes',
  'side',
  'funding_source',
])

/**
 * Frozen once the brokerage is marked paid. Money and tax identity: changing
 * either after payment makes the record disagree with what actually went out,
 * and with the 1099 that follows from it. Unmark paid first.
 *
 * funding_source is deliberately NOT here. It says which account the money came
 * from, the payouts ledger reads it, and the 38 rows that predate the column
 * all default to Collective Realty Co. Correcting one to Title is only ever
 * possible after the fact.
 */
export const LOCKED_TEB_FIELDS = new Set([
  'brokerage_name',
  'brokerage_role',
  'brokerage_ein',
  'federal_id_type',
  'federal_id_number',
  'commission_amount',
  'amount_1099_reportable',
  'w9_on_file',
  'w9_date_received',
  'broker_name',
  'agent_name',
  'agent_email',
  'agent_phone',
])

export type TebUpdateResult =
  | { ok: true; fields: Record<string, any> }
  | { ok: false; blocked: string[] }

/**
 * Narrow a client's update to what it is allowed to write.
 *
 * Returns the blocked list when a paid row is asked to change a locked field,
 * so the caller can answer 409 with the field names rather than saving a
 * partial edit the person did not ask for. Unknown keys are dropped silently:
 * they are not an attempt at anything, just a client sending more than the
 * table holds.
 */
export function pickEditableTebFields(
  updates: Record<string, any> | null | undefined,
  isPaid: boolean
): TebUpdateResult {
  const incoming = updates || {}

  if (isPaid) {
    const blocked = Object.keys(incoming).filter(k => LOCKED_TEB_FIELDS.has(k))
    if (blocked.length > 0) return { ok: false, blocked }
  }

  const fields: Record<string, any> = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (EDITABLE_TEB_FIELDS.has(key)) fields[key] = value
  }
  return { ok: true, fields }
}
