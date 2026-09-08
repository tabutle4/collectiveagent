// lib/transactions/retainerShell.ts
//
// A retainer-only deal is a SHELL, and that is deliberate. The client pays a
// retainer, a prospect record is opened for them, and it stays open as a shell
// even after the client converts to a real deal at a real address. Two records
// for one client is the correct end state, not a duplicate to be merged.
//
// The shape of that shell, as the office builds it by hand today:
//
//   <side>_base_commission   0
//   transaction_additional_income   one row, label 'Retainer', the amount
//   <side>_side_commission   base (0) + the additional income
//   office_gross             follows from the side commission
//   checklist                every active item marked complete, so the deal
//                            reads ready to pay out rather than pending
//
// The commission row itself (installment_kind 'retainer', agent_basis, the
// processing fee, agent_net) is already written correctly by both callers and
// is NOT touched here. What was missing was the transaction-level half.
import { supabaseAdmin } from '@/lib/supabase'
import { recomputeGrossAndOffice, isLeaseType } from '@/lib/transactions/cascade'
import { sideCategory, defaultSideForTransactionType } from '@/lib/transactions/sides'
import { formatNameToTitleCase } from '@/lib/nameFormatter'

// The label IS the description on transaction_additional_income - the table has
// no separate description column. 'Retainer' is already the established value
// there, so reuse it rather than introducing a second spelling.
const RETAINER_INCOME_LABEL = 'Retainer'

/**
 * The name a retainer prospect carries: `Client Name - Prospect`.
 *
 * Four code paths used to produce four different names for the same thing
 * (`Curshetis Caldwell`, `Matthew Hetrick (Retainer)`, `Retainer client`,
 * `Prospect - Matthew Hetrick`), and only one of them title-cased, which is how
 * `Curshetis caldwell` reached the database.
 *
 * The suffix is stable so `retainerClientKey` below can strip it back off. Do
 * not change one without the other.
 */
export function retainerProspectName(clientName: string | null | undefined): string {
  const clean = formatNameToTitleCase(String(clientName || '').trim())
  return clean ? `${clean} - Prospect` : 'Retainer - Prospect'
}

/**
 * A retainer prospect reduced to just the client, for matching.
 *
 * Strips the ` - Prospect` suffix so a renamed deal still matches a bare payer
 * name coming off a Payload payment. Without this the webhook's equality test
 * stops matching the moment deals are renamed, and every retainer payment after
 * that mints another duplicate deal.
 */
export function retainerClientKey(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .replace(/\s*-\s*prospect\s*$/i, '')
    .trim()
    .toLowerCase()
}

/**
 * Which side of the deal a retainer's income belongs to.
 *
 * Composed from the two helpers that already exist rather than repeating the
 * landlord/seller string test a third time. Today's retainer types all resolve
 * to the buying side, but a retainer attached to a landlord or seller deal
 * resolves to listing, so nothing here hardcodes a side.
 */
function retainerSideCategory(transactionType: string | null | undefined): 'buying' | 'listing' {
  return sideCategory(defaultSideForTransactionType(transactionType)) === 'listing' ? 'listing' : 'buying'
}

/**
 * Mark every active item on the deal's checklist complete.
 *
 * Retainer shells have no documents to collect, but an empty checklist leaves
 * them reading "pending" on the payouts report forever, which is indistinguishable
 * from a real deal that still needs work. Completing the items rather than
 * skipping the checklist keeps the report's checklist column meaningful and
 * leaves an audit trail; `auto_verified` marks that nobody ticked these by hand.
 *
 * Template choice matches the payouts report exactly: leases use 'payouts',
 * sales use 'cda'. Existing completions are left alone, so a resubmission does
 * not double-write and a box the office already ticked keeps its real
 * completed_by.
 */
async function autoCompleteRetainerChecklist(
  transactionId: string,
  transactionType: string | null | undefined,
  completedBy: string | null
): Promise<number> {
  // isLeaseType from cascade takes the type code itself, and this is the same
  // call the payouts report makes to pick a template, so both agree on which
  // checklist a deal is measured against.
  const slug = isLeaseType(String(transactionType || '')) ? 'payouts' : 'cda'
  const { data: template } = await supabaseAdmin
    .from('checklist_templates')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()
  if (!template?.id) return 0

  const { data: items } = await supabaseAdmin
    .from('checklist_items')
    .select('id')
    .eq('checklist_template_id', template.id)
    .eq('is_active', true)
  if (!items?.length) return 0

  const { data: done } = await supabaseAdmin
    .from('checklist_completions')
    .select('checklist_item_id')
    .eq('transaction_id', transactionId)
  const alreadyDone = new Set((done || []).map((d: any) => d.checklist_item_id))

  const missing = items
    .filter((i: any) => !alreadyDone.has(i.id))
    .map((i: any) => ({
      transaction_id: transactionId,
      checklist_item_id: i.id,
      completed_by: completedBy,
      completed_at: new Date().toISOString(),
      auto_verified: true,
      notes: 'Auto-completed: retainer only deal, no documents to collect.',
    }))
  if (!missing.length) return 0

  const { error } = await supabaseAdmin.from('checklist_completions').insert(missing)
  if (error) {
    console.error('Retainer checklist auto-complete failed:', error.message)
    return 0
  }
  return missing.length
}

/**
 * Put the transaction-level half of a retainer shell in place.
 *
 * Safe to call again on a resubmission: the Retainer income row is matched on
 * (transaction, side, label) and updated rather than added, so a corrected
 * amount replaces the old one instead of stacking a second Retainer line onto
 * the deal.
 *
 * Deliberately does NOT touch transaction_internal_agents. Both callers already
 * write the retainer money row, and rewriting it here would restate a figure
 * the office may have repriced.
 */
export async function applyRetainerShell(opts: {
  transactionId: string
  transactionType: string | null | undefined
  amount: number
  completedBy?: string | null
}): Promise<void> {
  const { transactionId, transactionType, amount } = opts
  const side = retainerSideCategory(transactionType)
  const baseField = side === 'listing' ? 'listing_base_commission' : 'buying_base_commission'
  const sideField = side === 'listing' ? 'listing_side_commission' : 'buying_side_commission'

  try {
    // Only a RETAINER-ONLY deal gets this shape. A retainer can also be filed
    // against a deal that carries real commission - 7711 Longmire Road holds a
    // $250 retainer alongside $1,130 of base commission - and zeroing the base
    // there would delete money nobody asked to touch.
    //
    // The test excludes this deal's own Retainer row, so a resubmission that
    // corrects the amount still goes through: on the second pass base is 0 and
    // the only additional income is the retainer itself.
    const { data: txnNow } = await supabaseAdmin
      .from('transactions')
      .select(`${baseField}, ${sideField}`)
      .eq('id', transactionId)
      .maybeSingle()
    const { data: otherIncomeRows } = await supabaseAdmin
      .from('transaction_additional_income')
      .select('amount, label')
      .eq('transaction_id', transactionId)
      .eq('side', side)
      .neq('label', RETAINER_INCOME_LABEL)
    const existingBase = parseFloat(String((txnNow as any)?.[baseField] ?? 0)) || 0
    const otherIncome = (otherIncomeRows || []).reduce(
      (sum: number, r: any) => sum + (parseFloat(r.amount) || 0),
      0
    )
    if (existingBase > 0 || otherIncome > 0) {
      console.warn(
        `applyRetainerShell skipped for ${transactionId}: deal carries commission ` +
        `(base ${existingBase}, other income ${otherIncome}), so it is not retainer only.`
      )
      return
    }

    // One Retainer row per deal and side: found and updated if it exists,
    // inserted if it does not. No unique constraint backs this, and none can be
    // added - `label` is free text the office types on the Additional Income
    // screen, so repeat labels are legitimate for everything else.
    //
    // That leaves a narrow race: two submissions landing at the same instant
    // could each find nothing and each insert, doubling the side total. Not
    // guarded here by decision - retainer deals are reviewed before the agent is
    // paid, so a doubled row is caught at payout.
    const { data: existing } = await supabaseAdmin
      .from('transaction_additional_income')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('side', side)
      .eq('label', RETAINER_INCOME_LABEL)
      .order('created_at', { ascending: true })
      .limit(1)

    if (existing?.[0]?.id) {
      await supabaseAdmin
        .from('transaction_additional_income')
        .update({ amount })
        .eq('id', existing[0].id)
    } else {
      await supabaseAdmin
        .from('transaction_additional_income')
        .insert({ transaction_id: transactionId, side, label: RETAINER_INCOME_LABEL, amount })
    }

    // Base is zero on a retainer deal: there is no commission, only the
    // retainer. The side total is base plus every additional-income row on that
    // side, which is the same arithmetic the Additional Comp action uses, so a
    // deal carrying both stays correct.
    const { data: additionalRows } = await supabaseAdmin
      .from('transaction_additional_income')
      .select('amount')
      .eq('transaction_id', transactionId)
      .eq('side', side)
    const additionalTotal = (additionalRows || []).reduce(
      (sum: number, r: any) => sum + (parseFloat(r.amount) || 0),
      0
    )

    await supabaseAdmin
      .from('transactions')
      .update({
        [baseField]: 0,
        [sideField]: additionalTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', transactionId)

    await recomputeGrossAndOffice(transactionId)

    // Inside the try, and last. If the money half above threw, the deal has no
    // retainer income on it and is NOT a finished shell, so completing its
    // checklist would tell the payouts report it is ready to pay out when the
    // office still has to price it by hand. The two halves stand or fall
    // together.
    await autoCompleteRetainerChecklist(transactionId, transactionType, opts.completedBy ?? null)
  } catch (err: any) {
    // Best effort, same posture as the retainer money row blocks in the Payload
    // webhook: a failure here must not lose the agent's submission or the
    // client's payment. The office can still price the deal by hand.
    console.error('applyRetainerShell failed:', err?.message || err)
  }
}
