import { supabaseAdmin } from '@/lib/supabase'
import {
  COMMISSION_OFFSET_TYPE,
  COMMISSION_OFFSET_DESCRIPTION,
  isCommissionOffsetItem,
} from '@/lib/payload/commissionOffsetItems'

export {
  COMMISSION_OFFSET_TYPE,
  COMMISSION_OFFSET_DESCRIPTION,
  COMMISSION_OFFSET_REVERSAL_TYPE,
  isStagedCommissionOffset,
  isCommissionOffsetReversal,
  isCommissionOffsetItem,
  billedChargeTotal,
} from '@/lib/payload/commissionOffsetItems'

/**
 * Commission-offset line items on Payload invoices.
 *
 * When a debt that originated as a Payload invoice is settled internally
 * (withheld from a commission payout), the Payload copy has to be closed so
 * the agent cannot also pay it directly and get double-collected. Payload has
 * no "mark paid by offset" concept, so the app appends a negative `charge`
 * line item. Per Payload's docs a charge entry "refers to an incurred amount
 * or discount by the biller", so a negative charge is the documented way to
 * express a discount; `payment` is reserved for entries tied to a real
 * Payload transaction and is deliberately not used here.
 *   https://docs.payload.com/apis/invoices/
 *   https://docs.payload.com/apis/object-reference/line-items/
 *
 * Reversing that offset used to append a POSITIVE charge, which is what made
 * the invoice amount duplicate: a $50 fee staged then unstaged left the
 * invoice carrying $50 + $50 of charges against a single $50 offset. The
 * balance due happened to come out right, but the invoice's gross total, its
 * line item breakdown, and every screen that sums the positive line items all
 * read double. Each stage/unstage cycle added another $50.
 *
 * The offset is now REMOVED instead (DELETE /line_items/{id}, per
 * https://docs.payload.com/apis/api-design/), which restores the balance
 * without inventing a second charge. Applying an offset also clears any
 * leftover offset or reversal rows first, so an invoice already inflated by
 * the old code self-heals the next time it is staged.
 *
 * Only the offsets this app wrote by staging are ever touched. Matching is on
 * type AND an exact description, NOT on type alone, because the Mark Paid
 * modal's fourth method is also labelled "Commission Offset" and writes the
 * identical type string. See the comment at the top of
 * lib/payload/commissionOffsetItems.ts - that collision is the reason the
 * predicates live there and why every writer must use
 * COMMISSION_OFFSET_DESCRIPTION rather than a literal.
 *
 * Deleting a manually recorded settlement would reopen the invoice and cause
 * the fee to be withheld from a commission on top of money already collected,
 * so this distinction is load-bearing, not cosmetic.
 */

const PAYLOAD_API = 'https://api.payload.com'

const authHeader = () =>
  'Basic ' + Buffer.from((process.env.PAYLOAD_SECRET_KEY ?? '') + ':').toString('base64')

/**
 * Pull a Payload invoice ID out of an agent_debts.notes value. Matches every
 * stamp format the app has written: "Payload invoice ID: xxx",
 * "Payload invoice: xxx", and "payload_invoice_id:xxx".
 */
export function extractPayloadInvoiceId(notes: unknown): string | null {
  const m = String(notes ?? '').match(/payload[ _]invoice(?:[ _]id)?:\s*([A-Za-z0-9_-]+)/i)
  return m ? m[1].trim() : null
}

/** Fetch one invoice with its line items. Returns null on any failure. */
export async function fetchPayloadInvoice(invoiceId: string): Promise<any | null> {
  try {
    const res = await fetch(
      `${PAYLOAD_API}/invoices/${invoiceId}?fields[]=*&fields[]=items`,
      { headers: { Authorization: authHeader() } }
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export interface OffsetRemovalResult {
  ok: boolean
  removed: number
  failed: number
  /** Balance due after the removals, or null if it could not be re-read. */
  amountDue: number | null
  error?: string
}

/**
 * Delete every commission-offset and offset-reversal line item on an invoice.
 *
 * ok is true only when nothing was left behind, so callers can surface a
 * warning when Payload still needs a human. Removing zero items is a
 * success: it means the invoice was already clean.
 */
export async function removeCommissionOffsets(invoiceId: string): Promise<OffsetRemovalResult> {
  const invoice = await fetchPayloadInvoice(invoiceId)
  if (!invoice) {
    return { ok: false, removed: 0, failed: 0, amountDue: null, error: 'Could not load the Payload invoice.' }
  }

  const targets = (invoice.items || []).filter(
    (item: any) => isCommissionOffsetItem(item) && item?.id
  )
  if (targets.length === 0) {
    return { ok: true, removed: 0, failed: 0, amountDue: Number(invoice.amount_due ?? 0) }
  }

  let removed = 0
  let failed = 0
  let lastError = ''
  for (const item of targets) {
    try {
      const res = await fetch(`${PAYLOAD_API}/line_items/${item.id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeader() },
      })
      if (res.ok) {
        removed += 1
      } else {
        failed += 1
        lastError = await res.text().catch(() => `HTTP ${res.status}`)
        console.error('removeCommissionOffsets: delete failed', invoiceId, item.id, lastError)
      }
    } catch (err) {
      failed += 1
      lastError = String(err)
      console.error('removeCommissionOffsets: delete threw', invoiceId, item.id, err)
    }
  }

  const after = await fetchPayloadInvoice(invoiceId)
  return {
    ok: failed === 0,
    removed,
    failed,
    amountDue: after ? Number(after.amount_due ?? 0) : null,
    error: failed > 0 ? `${failed} offset line item(s) could not be removed in Payload. ${lastError}`.trim() : undefined,
  }
}

export interface OffsetApplyResult {
  ok: boolean
  /** Amount the offset closed out. 0 when the invoice already had no balance. */
  amountOffset: number
  error?: string
}

/**
 * Write one commission-offset line item for a balance the caller has already
 * read. Split out from applyCommissionOffset so a caller that needs the
 * balance for its own bookkeeping - stage_monthly_invoice writes it to
 * agent_debts.amount_owed - can offset that exact figure rather than reading
 * amount_due a second time and hoping the two agree.
 *
 * A balance of zero or less is a no-op, not an error.
 */
export async function writeCommissionOffset(
  invoiceId: string,
  balanceDue: number
): Promise<OffsetApplyResult> {
  if (!(balanceDue > 0)) {
    return { ok: true, amountOffset: 0 }
  }

  try {
    const res = await fetch(`${PAYLOAD_API}/line_items/`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        invoice_id: invoiceId,
        type: COMMISSION_OFFSET_TYPE,
        // Must be this constant. The description is what distinguishes a
        // staged offset from a settlement recorded by hand through the Mark
        // Paid modal, which shares the type string.
        description: COMMISSION_OFFSET_DESCRIPTION,
        amount: String(-balanceDue),
        entry_type: 'charge',
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => `HTTP ${res.status}`)
      console.error('writeCommissionOffset: settlement failed', invoiceId, detail)
      return { ok: false, amountOffset: 0, error: `Payload settlement failed. ${detail}`.trim() }
    }
  } catch (err) {
    console.error('writeCommissionOffset: threw', invoiceId, err)
    return { ok: false, amountOffset: 0, error: String(err) }
  }

  return { ok: true, amountOffset: balanceDue }
}

/**
 * Close an invoice's remaining balance with a single commission-offset line
 * item, after clearing any offset or reversal rows a previous stage/unstage
 * cycle left behind. Safe to call twice: an invoice with no balance is a
 * no-op.
 *
 * An invoice already settled by hand (Zelle, check, ACH, or a manually
 * recorded commission offset) reads amount_due of zero here, because the
 * narrowed predicates leave that settlement in place, so this is a no-op and
 * the fee is not withheld from a commission on top of money already
 * collected.
 */
export async function applyCommissionOffset(invoiceId: string): Promise<OffsetApplyResult> {
  // Clear stale offset/reversal pairs first so the invoice's gross charges go
  // back to what was actually billed before the new offset is written. An
  // invoice inflated by the old reversal-charge behavior is repaired here.
  await removeCommissionOffsets(invoiceId)

  const invoice = await fetchPayloadInvoice(invoiceId)
  if (!invoice) {
    return { ok: false, amountOffset: 0, error: 'Could not load the Payload invoice.' }
  }
  return writeCommissionOffset(invoiceId, Number(invoice.amount_due ?? 0))
}

/**
 * Record who settled a Payload invoice outside of Payload, so the Billing
 * page can say more than "Recorded manually". Never throws: attribution is
 * bookkeeping, and losing it must not fail a payout or a mark-paid.
 */
export async function recordInvoiceSettlement(input: {
  invoiceId: string
  agentId?: string | null
  actor?: { id: string; first_name?: string | null; last_name?: string | null; preferred_first_name?: string | null; preferred_last_name?: string | null } | null
  method: string
  source: string
  amount?: number | null
  note?: string | null
}): Promise<void> {
  try {
    const a = input.actor
    const name = a
      ? `${a.preferred_first_name || a.first_name || ''} ${a.preferred_last_name || a.last_name || ''}`.trim()
      : ''
    await supabaseAdmin.from('payload_invoice_settlements').insert({
      invoice_id: input.invoiceId,
      agent_id: input.agentId ?? null,
      settled_by: a?.id ?? null,
      settled_by_name: name || null,
      method: input.method,
      source: input.source,
      amount: input.amount ?? null,
      note: input.note ?? null,
    })
  } catch (err) {
    console.error('recordInvoiceSettlement failed for', input.invoiceId, err)
  }
}

/**
 * Mark the open commission-offset settlement rows for an invoice reversed, so
 * Payment History stops attributing a settlement that no longer stands.
 *
 * Scoped to the offset sources on purpose: a Zelle or check recorded through
 * mark-invoice-paid is a real payment that an unstage has no business
 * retracting. Never throws.
 */
export async function reverseInvoiceSettlements(invoiceId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('payload_invoice_settlements')
      .update({ reversed_at: new Date().toISOString() })
      .eq('invoice_id', invoiceId)
      .in('source', ['commission_offset', 'payout_auto_settle'])
      .is('reversed_at', null)
  } catch (err) {
    console.error('reverseInvoiceSettlements failed for', invoiceId, err)
  }
}
