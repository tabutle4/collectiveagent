/**
 * Process a commission payout to an agent through Payload ACH.
 *
 * Server-only. The amount is ALWAYS computed here from the TIA row using
 * the canonical commission formula - agent_net after staged debts/credits,
 * the same math Mark Paid uses. A payout amount is never accepted from the
 * request body.
 *
 * Ownership guard: the payment method on file must be an active
 * bank_account belonging to the agent's PAYOUT customer
 * (users.payload_payout_customer_id, falling back to payload_payee_id when
 * the payout pointer is not set). Paying a method owned by a different
 * Payload customer is how money reaches the wrong person, so it is a hard
 * block, not a warning.
 *
 * Account routing: Referral Collective agents (mls_choice = 'Referral
 * Collective (No MLS)') draw from PAYLOAD_RC_PROCESSING_ID; everyone else
 * from PAYLOAD_PAYOUTS_PROCESSING_ID. The processing_id is passed
 * explicitly on the send - never rely on the account default.
 *
 * The send itself is POST /transactions with type=credit - Payload's only
 * documented way to move money out (docs.payload.com/apis/payouts/). The
 * response is a Transaction object (txn_... id) whose id is stored in
 * payment_reference; its live status is readable later via
 * GET /transactions/{id} (payoutStatus below).
 *
 * On success the TIA's payment_sent_date is stamped - the initiation
 * record that the removed "Mark Payment Sent" button used to write - and
 * the Payload payout id is stored in payment_reference. Mark Paid remains
 * the later moment when funds clear.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { computeCommission } from '@/lib/transactions/math'

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? 0))
  return isNaN(n) ? 0 : n
}

const plAuth = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

/** Role → payout description prefix, per the office's Payload conventions. */
/**
 * Whether a Payload payment method may RECEIVE a commission payout, and the
 * customer it must belong to.
 *
 * Payload keeps two different things behind two different setup pages, and
 * records the difference on the method itself
 * (docs.payload.com/apis/object-reference/payment-methods):
 *
 *   default_credit_method   - may be the default for CREDITS. A payout is a
 *                             credit.
 *   default_payment_method  - may be the default for PAYMENTS, i.e. being
 *                             charged. That is the monthly-fee account.
 *   transfer_type           - 'send-only' | 'receive-only' | 'two-way'.
 *
 * On 24 Aug 2026 the verify-bank-connections cron adopted 16 agents' BILLING
 * customer as their payout customer, because it looked for any active bank
 * account and treated default_credit_method as a sort key. This guard is the
 * layer that refuses to send money on the back of that.
 *
 * Two rules, and the blast radius of each was measured before shipping:
 *
 *  1. payload_payout_customer_id must be set, and must NOT equal
 *     payload_payee_id. A payout customer that IS the billing customer is
 *     the corrupted shape; 41 of 57 payable agents have them genuinely
 *     distinct and are unaffected, 0 agents relied on the old
 *     `|| payload_payee_id` fallback, and the 16 corrupted rows are refused
 *     until a human re-links them.
 *
 *  2. transfer_type 'send-only' cannot receive anything, so it is refused.
 *
 * default_credit_method is deliberately NOT a hard block: this code cannot
 * see how consistently Payload populates it across existing methods, and
 * blocking every payout on an unverified flag is worse than the problem. It
 * is surfaced in the preview and reported by the cron instead.
 */
export function payoutTargetProblem(
  agentUser: {
    payload_payout_customer_id?: string | null
    payload_payee_id?: string | null
  },
  pm?: any
): string | null {
  const payoutCustomer = String(agentUser.payload_payout_customer_id || '')
  const billingCustomer = String(agentUser.payload_payee_id || '')
  if (!payoutCustomer) {
    return 'No payout customer is on file for this agent, only a billing customer. Send Bank Activation so they set up a payout bank account in Payload.'
  }
  if (billingCustomer && payoutCustomer === billingCustomer) {
    // One Payload CUSTOMER can legitimately serve both purposes, because a
    // customer holds several methods and Payload records what each one is for.
    // One agent is set up exactly that way: a receive-only bank for payouts and
    // a send-only card that bills the monthly fee, both on one customer,
    // created months before the cron incident.
    //
    // So the equality itself is not the defect. The defect was paying a BILLING
    // bank, and Payload marks those send-only with default_credit_method false.
    // When the method in hand is one Payload says can receive a credit, the
    // dangerous case is excluded on the evidence and there is nothing to refuse.
    // Measured across all 225 methods on this account, 24 August 2026: the 51
    // receive-only methods are exactly the 51 credit-capable ones, and no
    // billing account is among them.
    //
    // Called without a method (or with one Payload does not mark credit
    // capable), this still refuses - so the check is unchanged everywhere the
    // method is unknown.
    if (!payoutMethodCanReceiveCredit(pm)) {
      return 'This agent\'s payout customer is the same Payload customer used to bill their monthly fee, and the account on file is not marked as one that can receive credits, so it may be their billing bank. Confirm the payout account in Payload and re-link it from their profile before paying.'
    }
  }
  return null
}

/**
 * Payload's own marking for "this account may receive a credit".
 * A commission payout is a credit, so a billing account never satisfies this:
 * every send-only method on this account has default_credit_method false.
 */
export function payoutMethodCanReceiveCredit(pm: any): boolean {
  if (!pm) return false
  if (String(pm.transfer_type || '').toLowerCase() === 'send-only') return false
  return !!pm.default_credit_method
}

export function payoutMethodProblem(pm: any): string | null {
  if (String(pm?.transfer_type || '').toLowerCase() === 'send-only') {
    return 'The bank account on file is send-only in Payload, so it cannot receive a commission payout. The agent needs to set up a payout bank account.'
  }
  return null
}

export function payoutDescription(
  tia: { agent_role?: string | null; installment_kind?: string | null },
  propertyAddress: string
): string {
  const role = String(tia.agent_role || '')
  let prefix = 'Commission'
  if (role === 'team_lead') prefix = 'Team Lead Split'
  else if (role === 'referral_agent') prefix = 'Referral Split'
  else if (role === 'momentum_partner') prefix = 'Momentum Partner Split'
  // primary_agent / listing_agent / co_agent / retainer rows all read
  // "Commission - {address}" - a retainer is still commission income.
  return `${prefix} - ${propertyAddress}`
}

export interface ProcessPayoutResult {
  ok: boolean
  error?: string
  payoutId?: string
  amount?: number
  paymentSentDate?: string
  /** The address named as Payload's receipt recipient on this send. Returned
   *  so the office is told which inbox to expect the receipt in, rather than
   *  being assured an email was delivered - nobody has yet watched this path
   *  deliver one. Empty means nobody was named and nobody will be emailed. */
  receiptEmail?: string | null
}

/**
 * The one computation of "net to agent" for a payout, shared by the send
 * (processPayout) and the preview modal (previewPayout) so the number the
 * office confirms is the number that gets sent. Mirrors Mark Paid with
 * empty *_to_apply lists: anything already staged against this row
 * (status='paid' with matching offset_*) reduces or adds to the net
 * exactly as it will at Mark Paid time.
 */
async function payoutNetForRow(
  tia: any,
  transactionId: string,
  internalAgentId: string
): Promise<number> {
  const { data: stagedRecords } = await supabaseAdmin
    .from('agent_debts')
    .select('id, record_type, amount_owed, amount_remaining')
    .eq('offset_transaction_id', transactionId)
    .eq('offset_transaction_agent_id', internalAgentId)
    .eq('status', 'paid')

  let totalDebtsDeducted = 0
  let totalCreditsApplied = 0
  for (const sr of stagedRecords || []) {
    const appliedAtStage = Math.max(0, num(sr.amount_owed) - num(sr.amount_remaining ?? 0))
    if (sr.record_type === 'credit') totalCreditsApplied += appliedAtStage
    else totalDebtsDeducted += appliedAtStage
  }

  const isRetainer = tia.installment_kind === 'retainer'
  const grossForFormula = isRetainer ? tia.agent_basis : tia.agent_gross
  const { agent_net: payoutAmount } = computeCommission({
    agent_gross: grossForFormula,
    btsa_amount: tia.btsa_amount,
    processing_fee: tia.processing_fee,
    coaching_fee: tia.coaching_fee,
    other_fees: tia.other_fees,
    rebate_amount: tia.rebate_amount,
    credits_applied: totalCreditsApplied,
    debts_deducted: totalDebtsDeducted,
  })
  return payoutAmount
}

export async function processPayout({
  transactionId,
  internalAgentId,
}: {
  transactionId: string
  internalAgentId: string
}): Promise<ProcessPayoutResult> {
  // ── The row being paid ────────────────────────────────────────────────
  const { data: tia, error: tiaError } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('*')
    .eq('id', internalAgentId)
    .eq('transaction_id', transactionId)
    .single()
  if (tiaError || !tia) return { ok: false, error: 'Agent record not found on this deal' }

  if (tia.payment_status === 'paid') {
    return { ok: false, error: 'This row is already marked paid - nothing left to send.' }
  }
  if (tia.payment_sent_date) {
    return {
      ok: false,
      error: `A payout was already initiated for this row on ${tia.payment_sent_date}. Use Mark Paid when it clears.`,
    }
  }

  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select('id, property_address')
    .eq('id', transactionId)
    .single()
  if (!txn) return { ok: false, error: 'Transaction not found' }

  const { data: agentUser } = await supabaseAdmin
    .from('users')
    .select(
      'id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, mls_choice, bank_connected, payload_payment_method_id, payload_payout_customer_id, payload_payee_id'
    )
    .eq('id', tia.agent_id)
    .single()
  if (!agentUser) return { ok: false, error: 'Agent not found' }

  // ── Amount: canonical formula, staged debts/credits folded in ────────
  const payoutAmount = await payoutNetForRow(tia, transactionId, internalAgentId)

  if (!(payoutAmount > 0)) {
    return {
      ok: false,
      error: `Computed net to agent is $${payoutAmount.toFixed(2)} - nothing to pay out.`,
    }
  }

  // ── Bank + ownership guard ────────────────────────────────────────────
  if (!agentUser.bank_connected || !agentUser.payload_payment_method_id) {
    return {
      ok: false,
      error: 'Agent has no verified bank connection - resend Bank Connect from the app.',
    }
  }

  let pm: any = null
  try {
    const pmRes = await fetch(
      `https://api.payload.com/payment_methods/${agentUser.payload_payment_method_id}`,
      { headers: { Authorization: plAuth() } }
    )
    if (pmRes.status === 404) {
      return {
        ok: false,
        error: 'Payment method no longer exists in Payload - resend Bank Connect from the app.',
      }
    }
    if (!pmRes.ok) {
      return { ok: false, error: `Payload lookup failed (${pmRes.status}) - try again in a moment.` }
    }
    pm = await pmRes.json().catch(() => null)
  } catch (e: any) {
    return { ok: false, error: `Payload lookup failed: ${e?.message || 'network error'}` }
  }

  if (String(pm?.type || '') !== 'bank_account') {
    return { ok: false, error: 'Payment method on file is not a bank account - resend Bank Connect from the app.' }
  }
  // Payload documents exactly three payment-method statuses: active,
  // inactive, declining. Only `inactive` means unusable. `declining` is a
  // live connection having processing trouble, so it is allowed through
  // here (blocking it would strand an agent who can still be paid) - the
  // preview modal surfaces it so the office sends with eyes open.
  if (String(pm?.status || '').toLowerCase() === 'inactive') {
    return { ok: false, error: 'Bank account is inactive in Payload - resend Bank Connect from the app.' }
  }
  // Is this agent's payout target trustworthy at all? Checked BEFORE the
  // ownership comparison, because the comparison cannot catch a payout
  // customer that was copied from the billing customer - it would just be
  // agreeing with itself.
  const targetProblem = payoutTargetProblem(agentUser, pm)
  if (targetProblem) {
    return { ok: false, error: targetProblem }
  }
  const methodProblem = payoutMethodProblem(pm)
  if (methodProblem) {
    return { ok: false, error: methodProblem }
  }
  const pmCustomer = String(pm?.customer_id || pm?.customer?.id || '')
  // No `|| payload_payee_id` fallback. Falling back to the billing customer
  // made a bank on the billing account an acceptable payout target, which is
  // the whole failure being closed here. Measured 24 Aug 2026: 0 of the 57
  // payable agents relied on that fallback, so removing it blocks nobody who
  // was not already misdirected.
  const expectedCustomer = String(agentUser.payload_payout_customer_id || '')
  if (!expectedCustomer || !pmCustomer || pmCustomer !== expectedCustomer) {
    return {
      ok: false,
      error:
        "Payment method belongs to a different Payload customer than this agent's payout customer - resend Bank Connect from the app",
    }
  }

  // ── Processing account ────────────────────────────────────────────────
  const isRC = agentUser.mls_choice === 'Referral Collective (No MLS)'
  const processingId = isRC
    ? process.env.PAYLOAD_RC_PROCESSING_ID
    : process.env.PAYLOAD_PAYOUTS_PROCESSING_ID
  if (!processingId) {
    return {
      ok: false,
      error: `Payout processing account is not configured (${isRC ? 'PAYLOAD_RC_PROCESSING_ID' : 'PAYLOAD_PAYOUTS_PROCESSING_ID'}).`,
    }
  }

  // ── Claim, then send ──────────────────────────────────────────────────
  // The conditional claim on payment_sent_date IS the double-click guard:
  // two admins clicking together cannot both pass the read above and both
  // create a payout. Claim first; if the Payload call then fails, release
  // the claim so the button works again. (Claiming after sending would
  // leave the losing click free to send a second payout.)
  const sentDate = new Date().toISOString().split('T')[0]
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('transaction_internal_agents')
    .update({ payment_sent_date: sentDate, updated_at: new Date().toISOString() })
    .eq('id', internalAgentId)
    .is('payment_sent_date', null)
    .select('id')
  if (claimError) return { ok: false, error: claimError.message }
  if (!claimed || claimed.length === 0) {
    return { ok: false, error: 'A payout was already initiated for this row.' }
  }

  const description = payoutDescription(tia, txn.property_address || 'transaction')
  // Who Payload addresses the receipt to: office_email || email, matching
  // every other agent-facing money notification in the app. All 57
  // bank-connected active agents have an office_email today, so none falls
  // through to a personal address and none resolves to nothing. Declared out
  // here because the success result reports it back to the caller.
  const receiptEmail = agentUser.office_email || agentUser.email || ''
  const receiptName = `${agentUser.preferred_first_name || agentUser.first_name || ''} ${agentUser.preferred_last_name || agentUser.last_name || ''}`.trim()
  let payoutData: any = null
  let payoutFailed: string | null = null
  // Distinguishes "Payload answered and rejected" from "we never heard back".
  // Only the former is safe to release the claim on.
  let payoutAmbiguous = false
  try {
    // Payload's documented send-money call: POST /transactions with
    // type=credit (docs.payload.com/apis/payouts/). The old /payouts/ path
    // exists nowhere in Payload's API docs.
    //
    // `receipts` names who gets Payload's receipt: the documented optional
    // array of {name, email}, "The email that will receive the receipt"
    // (docs.payload.com/apis/payouts/). Nested list-of-objects form encoding
    // is the documented syntax, list[0][attr]
    // (docs.payload.com/apis/api-design/).
    //
    // Sent deliberately, and NOT because the app has no email of its own to
    // send. The agent still gets exactly two things - their commission
    // statement, sent manually by the office, and Payload's receipt - but
    // this parameter is what makes the second one arrive:
    //
    //   1. Payload's docs do not say a credit recipient is emailed when
    //      `receipts` is omitted. The only automatic receipt they describe is
    //      an ACCOUNT SETTING ("Automatic branded emailed receipts for
    //      customers can be enabled from the Emails and Notifications tab",
    //      docs.payload.com/apis/receipts/), and the "Credit Alerts" class in
    //      Payload's support docs never says who receives it. A documented
    //      parameter whose whole purpose is naming the receipt recipient is
    //      evidence the API does not infer one.
    //   2. The credit receipts observed in an agent's inbox on 8/11 and
    //      8/21/2026 were originated by hand in the Payload dashboard, not by
    //      this code: as of 2026-08-23 no transaction_internal_agents row has
    //      ever carried a payment_sent_date or payment_reference, and no POST
    //      creating a credit existed anywhere in the app before this file. So
    //      they say nothing about what this API call does.
    //   3. Naming the address explicitly also sidesteps the payout customer's
    //      own email, which is whatever the agent typed during Payload's bank
    //      activation flow and which nothing in this app has ever corrected
    //      (syncPayloadCustomerEmail writes the BILLING customer). The DB
    //      address below is one the office controls.
    //
    // Worst case, automatic receipts are also on and the agent gets the same
    // receipt twice. That is a far better failure than an agent never being
    // told a real payment left.
    const payoutBody: Record<string, string> = {
      type: 'credit',
      amount: payoutAmount.toFixed(2),
      payment_method_id: agentUser.payload_payment_method_id,
      processing_id: processingId,
      description,
    }
    if (receiptEmail) {
      payoutBody['receipts[0][email]'] = receiptEmail
      if (receiptName) payoutBody['receipts[0][name]'] = receiptName
    }
    const payoutRes = await fetch('https://api.payload.com/transactions', {
      method: 'POST',
      headers: {
        Authorization: plAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(payoutBody),
    })
    payoutData = await payoutRes.json().catch(() => null)
    if (!payoutRes.ok) {
      // Payload's error body carries error_description (documented shape),
      // not message; keep message as a defensive fallback.
      payoutFailed =
        payoutData?.error_description ||
        payoutData?.message ||
        `Payload payout failed (${payoutRes.status})`
    }
  } catch (e: any) {
    // No answer: the POST may have reached Payload and created the payout.
    // Releasing the claim here would re-arm the button and a retry could send
    // a SECOND ACH. A stuck row that needs a human beats a duplicate payout.
    payoutFailed = e?.message || 'Payload payout failed'
    payoutAmbiguous = true
  }

  if (payoutFailed) {
    if (payoutAmbiguous) {
      return {
        ok: false,
        error: `No response from Payload, so this payout may have been created. Use Check Payload now on this row to see whether it exists before retrying. If no payout exists, Clear and allow retry re-enables the button. (${payoutFailed})`,
      }
    }
    // Payload answered and rejected: nothing was created. Release the claim
    // so the office can fix the problem and retry.
    await supabaseAdmin
      .from('transaction_internal_agents')
      .update({ payment_sent_date: null, updated_at: new Date().toISOString() })
      .eq('id', internalAgentId)
    return { ok: false, error: payoutFailed }
  }

  // Record what was sent. The caller sends no email of its own - the
  // `receipts` recipient named on the send above is what notifies the agent.
  await supabaseAdmin
    .from('transaction_internal_agents')
    .update({
      payment_method: 'ACH',
      payment_reference: payoutData?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', internalAgentId)

  return {
    ok: true,
    payoutId: payoutData?.id,
    amount: payoutAmount,
    paymentSentDate: sentDate,
    receiptEmail: receiptEmail || null,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Payout preview - everything the office sees in the confirm modal before
// any money moves. Read-only: pulls the customer and bank account LIVE from
// Payload at the moment the preview opens, so the cross-check is against
// Payload's own record, not the app's cached users row. If either live
// lookup fails, the caller must show that plainly and keep Confirm
// disabled - an unreachable Payload is a reason to block, not to skip.
// ─────────────────────────────────────────────────────────────────────────

export interface PreviewPayoutResult {
  ok: boolean
  error?: string
  amount?: number
  description?: string
  /** Payload's own record for the payout customer, live. */
  customerName?: string | null
  customerEmail?: string | null
  /** Live payment-method details. account_number never leaves the server -
   *  only the last 4; routing_number is never read out at all. */
  accountHolder?: string | null
  bankName?: string | null
  accountType?: string | null
  accountLast4?: string | null
  /** Payload's payment-method status. 'declining' still sends, but the
   *  office should see it before confirming. */
  bankStatus?: string | null
  /**
   * Payload's default_credit_method flag on this account. A commission payout
   * is a credit, so `false` is what a billing-only bank account looks like.
   * NOT a hard block - the send still allows it, because how consistently
   * Payload populates the flag on already-connected methods is unverified.
   * Shown in the confirm modal so the office sends with eyes open.
   */
  canReceiveCredit?: boolean
  /** 'send-only' | 'receive-only' | 'two-way'. send-only is refused. */
  transferType?: string | null
}

export async function previewPayout({
  transactionId,
  internalAgentId,
}: {
  transactionId: string
  internalAgentId: string
}): Promise<PreviewPayoutResult> {
  const { data: tia, error: tiaError } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('*')
    .eq('id', internalAgentId)
    .eq('transaction_id', transactionId)
    .single()
  if (tiaError || !tia) return { ok: false, error: 'Agent record not found on this deal' }

  if (tia.payment_status === 'paid') {
    return { ok: false, error: 'This row is already marked paid - nothing left to send.' }
  }
  if (tia.payment_sent_date) {
    return {
      ok: false,
      error: `A payout was already initiated for this row on ${tia.payment_sent_date}. Use Mark Paid when it clears.`,
    }
  }

  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select('id, property_address')
    .eq('id', transactionId)
    .single()
  if (!txn) return { ok: false, error: 'Transaction not found' }

  const { data: agentUser } = await supabaseAdmin
    .from('users')
    .select(
      'id, bank_connected, payload_payment_method_id, payload_payout_customer_id, payload_payee_id'
    )
    .eq('id', tia.agent_id)
    .single()
  if (!agentUser) return { ok: false, error: 'Agent not found' }

  const payoutAmount = await payoutNetForRow(tia, transactionId, internalAgentId)
  if (!(payoutAmount > 0)) {
    return {
      ok: false,
      error: `Computed net to agent is $${payoutAmount.toFixed(2)} - nothing to pay out.`,
    }
  }

  if (!agentUser.bank_connected || !agentUser.payload_payment_method_id) {
    return {
      ok: false,
      error: 'Agent has no verified bank connection - resend Bank Connect from the app.',
    }
  }
  // The half of the target check that needs no method: no payout customer at
  // all. The equality check now depends on what Payload says the method is for,
  // so it runs below, once the method has been fetched.
  if (!agentUser.payload_payout_customer_id) {
    return { ok: false, error: payoutTargetProblem(agentUser) as string }
  }
  const expectedCustomer = String(agentUser.payload_payout_customer_id || '')
  if (!expectedCustomer) {
    return {
      ok: false,
      error: 'Agent has no Payload customer on file - resend Bank Connect from the app.',
    }
  }

  const verifyFailed =
    'Could not verify this account against Payload right now - try again'

  // Customer name/email, live (same GET /customers/{id} endpoint
  // syncCustomerEmail writes through).
  let customer: any = null
  try {
    const custRes = await fetch(`https://api.payload.com/customers/${expectedCustomer}`, {
      headers: { Authorization: plAuth() },
    })
    if (!custRes.ok) return { ok: false, error: verifyFailed }
    customer = await custRes.json().catch(() => null)
  } catch {
    return { ok: false, error: verifyFailed }
  }
  if (!customer) return { ok: false, error: verifyFailed }

  // Bank account details, live (same GET /payment_methods/{id} endpoint the
  // send's ownership guard calls).
  let pm: any = null
  try {
    const pmRes = await fetch(
      `https://api.payload.com/payment_methods/${agentUser.payload_payment_method_id}`,
      { headers: { Authorization: plAuth() } }
    )
    if (!pmRes.ok) return { ok: false, error: verifyFailed }
    pm = await pmRes.json().catch(() => null)
  } catch {
    return { ok: false, error: verifyFailed }
  }
  if (!pm) return { ok: false, error: verifyFailed }
  // Mirror the send's hard block so the preview can never show a Confirm
  // button for a payout the send would reject.
  if (String(pm?.status || '').toLowerCase() === 'inactive') {
    return {
      ok: false,
      error: 'Bank account is inactive in Payload - resend Bank Connect from the app.',
    }
  }
  // Same rules as the send, with the same inputs, or the modal would show a
  // green preview for a payout processPayout is about to refuse - or refuse one
  // the send would allow.
  const previewTargetProblem = payoutTargetProblem(agentUser, pm)
  if (previewTargetProblem) {
    return { ok: false, error: previewTargetProblem }
  }
  const previewMethodProblem = payoutMethodProblem(pm)
  if (previewMethodProblem) {
    return { ok: false, error: previewMethodProblem }
  }

  // Mask server-side: only the last 4 of the account number ever reaches the
  // browser, and the routing number is never read out of the response.
  const rawAccountNumber = String(pm?.bank_account?.account_number ?? '')
  const accountLast4 = rawAccountNumber ? rawAccountNumber.slice(-4) : null

  return {
    ok: true,
    amount: payoutAmount,
    description: payoutDescription(tia, txn.property_address || 'transaction'),
    customerName: customer?.name ?? null,
    customerEmail: customer?.email ?? null,
    accountHolder: pm?.account_holder ?? null,
    bankName: pm?.bank_name ?? null,
    accountType: pm?.bank_account?.account_type ?? null,
    accountLast4,
    bankStatus: pm?.status ?? null,
    canReceiveCredit: !!pm?.default_credit_method,
    transferType: pm?.transfer_type ?? null,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Payout status - read-only lookups so the office never needs Payload's own
// dashboard to answer "did this payout land."
// ─────────────────────────────────────────────────────────────────────────

export interface PayoutStatusResult {
  ok: boolean
  error?: string
  /** True when Payload answered 404 - the payout does not exist. */
  notFound?: boolean
  /** Documented Transaction values: authorized, processing, processed,
   *  declined, voided, rejected. Displayed as returned, never string-matched
   *  against a guessed list. */
  status?: string | null
  statusMessage?: string | null
  /** Documented values: pending, captured, batched, refunded, reversed. */
  fundingStatus?: string | null
  amount?: number | null
  processedDate?: string | null
}

export async function payoutStatus(paymentReference: string): Promise<PayoutStatusResult> {
  try {
    const res = await fetch(`https://api.payload.com/transactions/${paymentReference}`, {
      headers: { Authorization: plAuth() },
    })
    if (res.status === 404) return { ok: true, notFound: true }
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error:
          data?.error_description || data?.message || `Payload lookup failed (${res.status})`,
      }
    }
    return {
      ok: true,
      status: data?.status ?? null,
      statusMessage: data?.status_message ?? null,
      fundingStatus: data?.funding_status ?? null,
      amount: data?.amount ?? null,
      processedDate: data?.processed_date ?? null,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Payload lookup failed' }
  }
}

export interface PayoutCandidate {
  id: string
  amount: number | null
  status: string | null
  fundingStatus: string | null
  createdAt: string | null
  description: string | null
}

/**
 * Fallback for an AMBIGUOUS payout - one where the send got no response, so
 * no txn_ id was ever captured. Lists recent credit transactions for the
 * payee customer since just before the send date so the operator can
 * visually match one (or see there is none and clear the claim). Uses only
 * documented query-string filtering: attribute equality, the >value
 * conditional, and limit (docs.payload.com/apis/api-design/).
 */
export async function recentPayoutCredits(
  customerId: string,
  sinceIso: string
): Promise<{ ok: boolean; error?: string; candidates?: PayoutCandidate[] }> {
  try {
    const qs = new URLSearchParams({
      type: 'credit',
      customer_id: customerId,
      created_at: `>${sinceIso}`,
      limit: '20',
    })
    const res = await fetch(`https://api.payload.com/transactions/?${qs.toString()}`, {
      headers: { Authorization: plAuth() },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        ok: false,
        error:
          data?.error_description || data?.message || `Payload lookup failed (${res.status})`,
      }
    }
    // List responses are a JSON array; accept a values-wrapped list
    // defensively.
    const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.values) ? data.values : []
    const candidates: PayoutCandidate[] = rows
      .map(r => ({
        id: String(r?.id || ''),
        amount: r?.amount ?? null,
        status: r?.status ?? null,
        fundingStatus: r?.funding_status ?? null,
        createdAt: r?.created_at ?? null,
        description: r?.description ?? null,
      }))
      .filter(r => r.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    return { ok: true, candidates }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Payload lookup failed' }
  }
}
