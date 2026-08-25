import { supabaseAdmin as supabase } from '@/lib/supabase'
import { computeCommission } from '@/lib/transactions/math'
import { num, recomputeOfficeNet } from '@/lib/transactions/cascade'
import { settlePayloadInvoiceForDebt } from '@/lib/payload/settleInvoiceForDebt'

// ─── Mark agent paid (TIA) ───────────────────────────────────────────────────
// Extracted verbatim from the `mark_paid` action in
// app/api/admin/transactions/[id]/route.ts so the reconciliation cron and the
// human Mark Paid button run the SAME code. There is exactly one
// implementation of this money math; no caller reimplements any part of it.
//
// Behaviour contract, preserved exactly as the route had it:
//   - Missing TIA row            -> throws Error('Agent record not found')
//   - Row already paid           -> returns { alreadyPaid: true }, writes nothing
//   - Missing agent user row     -> throws the Supabase error
//   - Failed TIA update          -> throws the Supabase error
//   - Success                    -> returns { alreadyPaid: false, updates }
//
// The route turns those into the same 500 / 409 / 200 responses it always did.
// The cron reads the same result object and never renders HTTP status.

export interface DebtApplication {
  debt_id: string
  amount: any
}

export interface CreditApplication {
  credit_id: string
  amount: any
}

export interface MarkAgentPaidArgs {
  /** Transaction id. Used for offset_transaction_id and recomputeOfficeNet. */
  transactionId: string
  internalAgentId: string
  paymentDate: string
  paymentMethod?: string | null
  paymentReference?: string | null
  fundingSource?: string | null
  debtsToApply?: DebtApplication[] | null
  creditsToApply?: CreditApplication[] | null
  /**
   * Only written when an actual boolean is passed. An absent value must not
   * overwrite an existing false set by add_internal_agent or
   * apply_primary_split.
   */
  countsTowardProgress?: boolean
  /**
   * The signed-in user who marked it paid. Written to paid_by. Optional
   * and left null by the reconciliation cron, which is not a person - a
   * row with a payment_date and no paid_by is one the cron settled from
   * Payload's own funding date.
   */
  paidBy?: string | null
}

export interface MarkAgentPaidResult {
  alreadyPaid: boolean
  updates?: Record<string, any>
}

export async function markAgentPaid(args: MarkAgentPaidArgs): Promise<MarkAgentPaidResult> {
  const id = args.transactionId
  const internal_agent_id = args.internalAgentId
  const payment_date = args.paymentDate
  const payment_method = args.paymentMethod
  const payment_reference = args.paymentReference
  const funding_source = args.fundingSource
  const debts_to_apply = args.debtsToApply
  const credits_to_apply = args.creditsToApply
  const counts_toward_progress = args.countsTowardProgress

  const { data: tia, error: tiaError } = await supabase
    .from('transaction_internal_agents')
    .select('*')
    .eq('id', internal_agent_id)
    .single()
  if (tiaError || !tia) throw new Error('Agent record not found')

  if (tia.payment_status === 'paid') {
    return { alreadyPaid: true }
  }

  // Existence guard on the agent's user row. The columns it selects are no
  // longer read here - the New Agent Plan qualifying count is DERIVED from
  // transaction_internal_agents.counts_toward_progress now, not incremented
  // in place - but the lookup and its throw are part of the route's current
  // behaviour, so they are preserved rather than quietly dropped.
  const { error: userError } = await supabase
    .from('users')
    .select('id, commission_plan, qualifying_transaction_count, qualifying_transaction_target')
    .eq('id', tia.agent_id)
    .single()
  if (userError) throw userError

  // Sum debts to apply
  let totalDebtsDeducted = 0
  if (debts_to_apply && debts_to_apply.length > 0) {
    for (const debtApp of debts_to_apply) {
      totalDebtsDeducted += num(debtApp.amount)
    }
  }

  // Sum credits to apply
  let totalCreditsApplied = 0
  if (credits_to_apply && credits_to_apply.length > 0) {
    for (const creditApp of credits_to_apply) {
      totalCreditsApplied += num(creditApp.amount)
    }
  }

  // Also fold in any debts/credits that were previously STAGED on this
  // txn/tia (status='paid' with offset_* matching). Their agent_debts row
  // was already updated at stage time; we just need their amount in the
  // TIA totals so agent_net / debts_deducted reflect them.
  const { data: stagedRecords } = await supabase
    .from('agent_debts')
    .select('id, record_type, amount_owed, amount_paid, amount_remaining')
    .eq('offset_transaction_id', id)
    .eq('offset_transaction_agent_id', internal_agent_id)
    .eq('status', 'paid')
  const debtAppliedIds = new Set(
    (debts_to_apply || []).map((d: any) => d.debt_id).filter(Boolean)
  )
  const creditAppliedIds = new Set(
    (credits_to_apply || []).map((c: any) => c.credit_id).filter(Boolean)
  )
  for (const sr of stagedRecords || []) {
    // Skip records that are also in *_to_apply (avoid double counting).
    if (debtAppliedIds.has(sr.id) || creditAppliedIds.has(sr.id)) continue
    // Amount that was actually applied at stage time =
    //   amount_owed - amount_remaining (mirrors reverse_mark_paid math).
    const owed = num(sr.amount_owed)
    const remaining = num(sr.amount_remaining ?? 0)
    const appliedAtStage = Math.max(0, owed - remaining)
    if (sr.record_type === 'credit') {
      totalCreditsApplied += appliedAtStage
    } else {
      totalDebtsDeducted += appliedAtStage
    }
  }

  // Use the CANONICAL commission formula from lib/transactions/math.ts.
  // Locked 2026-05-04 (Phase 2.6).
  //   amount_1099 = agent_gross + btsa − processing − coaching − other_fees − rebate + credits
  //   agent_net   = amount_1099 − debts
  //
  // team_lead_commission on primary TIA is informational only - it was
  // carved out of agent_gross at apply_primary_split time. Do NOT pass
  // it as a deduction here.
  //
  // RETAINER rows: the formula above also works for retainer rows because
  // we map agent_basis -> agent_gross (the income before any fee), and
  // processing_fee carries the office's retainer fee. All other fields
  // are 0 on a retainer row by construction, so the formula reduces to:
  //   amount_1099 = basis − retainer_fee + credits
  //   agent_net   = amount_1099 − debts
  const isRetainer = tia.installment_kind === 'retainer'
  const grossForFormula = isRetainer ? tia.agent_basis : tia.agent_gross

  const { amount_1099: amount1099, agent_net: agentNet } = computeCommission({
    agent_gross: grossForFormula,
    btsa_amount: tia.btsa_amount,
    processing_fee: tia.processing_fee,
    coaching_fee: tia.coaching_fee,
    other_fees: tia.other_fees,
    rebate_amount: tia.rebate_amount,
    credits_applied: totalCreditsApplied,
    debts_deducted: totalDebtsDeducted,
  })

  const tiaUpdate: any = {
    payment_status: 'paid',
    payment_date,
    payment_method: payment_method || null,
    payment_reference: payment_reference || null,
    funding_source: funding_source || 'crc',
    amount_1099_reportable: amount1099,
    debts_deducted: Math.round(totalDebtsDeducted * 100) / 100,
    agent_net: agentNet,
    paid_by: args.paidBy || null,
    updated_at: new Date().toISOString(),
  }
  // Money paid outside the app (check, wire, Zelle, or a payout sent
  // straight from the Payload dashboard) never passes through
  // process_payout, so nothing stamps payment_sent_date and the row would
  // read as paid with no record of when it went out. Fill it from the date
  // the office entered - which also restores backdating, since that field
  // is operator-supplied. Only written when empty: a real Payload
  // initiation date is never overwritten.
  if (!tia.payment_sent_date && payment_date) {
    tiaUpdate.payment_sent_date = payment_date
  }
  // Persist the office's "counts toward progress" decision. It used to
  // arrive in the body, feed the counter increment, and then be discarded,
  // so the decision lived nowhere durable. The New Agent Plan count is
  // derived from this column now, so it has to be written. Only write when
  // the client actually sends a boolean: an absent key must not overwrite
  // an existing false set by add_internal_agent or apply_primary_split.
  if (typeof counts_toward_progress === 'boolean') {
    tiaUpdate.counts_toward_progress = counts_toward_progress
  }

  const { error: updateTiaError } = await supabase
    .from('transaction_internal_agents')
    .update(tiaUpdate)
    .eq('id', internal_agent_id)
  if (updateTiaError) throw updateTiaError

  // Apply debts
  if (debts_to_apply && debts_to_apply.length > 0) {
    for (const debtApp of debts_to_apply) {
      const { data: debt } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('id', debtApp.debt_id)
        .single()

      if (debt) {
        const amountRemaining = num(debt.amount_remaining ?? debt.amount_owed)
        const amountApplied = num(debtApp.amount)
        const newRemaining = amountRemaining - amountApplied

        const debtUpdate: any = {
          amount_paid: num(debt.amount_paid) + amountApplied,
          offset_transaction_id: id,
          offset_transaction_agent_id: internal_agent_id,
          updated_at: new Date().toISOString(),
        }
        if (newRemaining <= 0) {
          debtUpdate.status = 'paid'
          debtUpdate.date_resolved = payment_date
        }
        await supabase.from('agent_debts').update(debtUpdate).eq('id', debtApp.debt_id)
        // Two-way billing sync: a debt collected at Mark Paid time must
        // also close its Payload invoice copy (negative Commission Offset
        // line item, same as stage_debt). Before this, only debts staged
        // through the Billing panel settled in Payload; debts applied in
        // the Mark Paid modal left their Payload invoices open.
        await settlePayloadInvoiceForDebt(debtApp.debt_id)
      }
    }
  }

  // Apply credits - same agent_debts table, record_type='credit'.
  // Mark the credit row as paid (consumed) and link to this transaction.
  if (credits_to_apply && credits_to_apply.length > 0) {
    for (const creditApp of credits_to_apply) {
      const { data: credit } = await supabase
        .from('agent_debts')
        .select('*')
        .eq('id', creditApp.credit_id)
        .single()

      if (credit) {
        const amountRemaining = num(credit.amount_remaining ?? credit.amount_owed)
        const amountApplied = num(creditApp.amount)
        const newRemaining = amountRemaining - amountApplied

        const creditUpdate: any = {
          amount_paid: num(credit.amount_paid) + amountApplied,
          offset_transaction_id: id,
          offset_transaction_agent_id: internal_agent_id,
          updated_at: new Date().toISOString(),
        }
        if (newRemaining <= 0) {
          creditUpdate.status = 'paid'
          creditUpdate.date_resolved = payment_date
        }
        await supabase.from('agent_debts').update(creditUpdate).eq('id', creditApp.credit_id)
      }
    }
  }

  await recomputeOfficeNet(id)

  return {
    alreadyPaid: false,
    updates: { ...tiaUpdate, debts_applied: debts_to_apply?.length || 0 },
  }
}
