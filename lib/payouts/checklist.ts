// lib/payouts/checklist.ts
//
// How far through its checklist a deal is. Lifted out of the payouts report so
// the sweep asks the same question the same way; two surfaces disagreeing about
// whether a deal is ready is exactly the class of bug this build exists to fix.
//
// Behaviour is identical to what the payouts report did inline before this
// existed: sales use the `cda` checklist, leases use `payouts`, only active
// items count, and a deal with no required items is never complete.

import { supabaseAdmin, fetchAllRows } from '@/lib/supabase'
import { isLeaseTransactionType } from '@/lib/transactions/transactionTypes'

export type ChecklistProgress = {
  done: number
  required: number
  complete: boolean
}

/** Matches the payouts report's local isLeaseType, including the bare 'lease'. */
function isLeaseType(t: string | null | undefined): boolean {
  if (!t) return false
  if (t === 'lease') return true
  return isLeaseTransactionType(t)
}

/**
 * Progress for each transaction id given. Transactions must carry their
 * `transaction_type`, because it picks the template.
 */
export async function fetchChecklistProgress(
  transactions: Array<{ id: string; transaction_type: string | null }>
): Promise<Record<string, ChecklistProgress>> {
  const out: Record<string, ChecklistProgress> = {}
  const txnIds = transactions.map(t => t.id)
  if (txnIds.length === 0) return out

  const { data: templates } = await supabaseAdmin
    .from('checklist_templates')
    .select('id, slug')
    .in('slug', ['cda', 'payouts'])

  const cdaTemplateId = (templates || []).find((t: any) => t.slug === 'cda')?.id || null
  const payoutTemplateId = (templates || []).find((t: any) => t.slug === 'payouts')?.id || null

  const { data: itemRows } = await supabaseAdmin
    .from('checklist_items')
    .select('id, checklist_template_id')
    .eq('is_active', true)
    .in('checklist_template_id', [cdaTemplateId, payoutTemplateId].filter(Boolean))

  const cdaItemIds = (itemRows || [])
    .filter((i: any) => i.checklist_template_id === cdaTemplateId)
    .map((i: any) => i.id)
  const payoutItemIds = (itemRows || [])
    .filter((i: any) => i.checklist_template_id === payoutTemplateId)
    .map((i: any) => i.id)

  const completions = await fetchAllRows<{ transaction_id: string; checklist_item_id: string }>(
    'checklist_completions',
    'transaction_id, checklist_item_id',
    { filters: [{ type: 'in', column: 'transaction_id', value: txnIds }] }
  )

  const doneByTxn: Record<string, Set<string>> = {}
  for (const c of completions || []) {
    if (!c.transaction_id) continue
    ;(doneByTxn[c.transaction_id] ||= new Set()).add(c.checklist_item_id)
  }

  for (const t of transactions) {
    const required: string[] = isLeaseType(t.transaction_type) ? payoutItemIds : cdaItemIds
    const done = doneByTxn[t.id] || new Set<string>()
    const doneCount = required.filter(iid => done.has(iid)).length
    out[t.id] = {
      done: doneCount,
      required: required.length,
      complete: required.length > 0 && doneCount >= required.length,
    }
  }

  return out
}
