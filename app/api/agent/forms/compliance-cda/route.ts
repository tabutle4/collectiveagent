import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout } from '@/lib/email/layout'
import { buildFormAnswersHtml } from '@/lib/form-fields'
import { Resend } from 'resend'
import { normalizeAddressForStorage, toTitleCase, normalizePropertyStats, normalizeAddressComponents, buildDisplayAddress } from '@/lib/transactions/utils'
import { checkRequired, requiredFieldsError, complianceRules, complianceIsLease } from '@/lib/forms/requiredFields'
import { feeCodeFromRepresenting, feeCodeFromRetainerType } from '@/lib/transactions/feeCode'
import { createFlyerFromForm } from '@/lib/flyers/createFlyerFromForm'
import { ensurePrimaryTia, autoCascadeTransaction, recomputeOfficeNet } from '@/lib/transactions/cascade'
import { syncEcommissionRecords } from '@/lib/transactions/ecommissionSync'
import { formatNameToTitleCase } from '@/lib/nameFormatter'
import { findDuplicateTransactions, findPartialAddressMatches } from '@/lib/transactions/dedupe'

// Convert compliance-form commission inputs into a gross commission dollar
// amount. commission_basis_price is the PRICE the commission is computed on
// and must NEVER be written to gross_commission directly - that bug produced
// deals whose commission equaled the full sale price. Returns null when the
// inputs cannot produce a plausible figure; the office sets it at review.
// Retainer prospects do not all carry the client's name the same way. The
// retainer form writes it to client_name AND property_address, but records
// created by other paths leave client_name null and keep the name only in
// property_address ("Marlene Howard - Retainer", "Prospect - Ismaela Yuill").
// Searching client_name alone missed every one of those, so an agent filing
// compliance was told no retainer existed when one did. Match on either field.
// The term is the first word of the typed name, stripped to letters and digits
// so it can never break the PostgREST or() filter syntax.
function retainerNameTerm(clientName: any): string {
  return String(clientName || '').trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '')
}

// Open retainers this agent already has for a client with a similar name.
// One definition used in three places: the as-you-type lookup on the form, the
// retainer submission check, and the compliance submission check. They must
// agree, or the form shows a match the submit does not honor, or the reverse.
async function findRetainerProspects(agentId: string, clientName: any) {
  const term = retainerNameTerm(clientName)
  if (!term) return []
  const { data: tiaRows } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('transaction_id')
    .eq('agent_id', agentId)
    .eq('installment_kind', 'retainer')
  if (!tiaRows?.length) return []
  const ids = Array.from(new Set(tiaRows.map((r: any) => r.transaction_id).filter(Boolean)))
  if (!ids.length) return []
  const { data: prospects } = await supabaseAdmin
    .from('transactions')
    .select('id, client_name, property_address, created_at, status')
    .in('id', ids)
    .or(`client_name.ilike.%${term}%,property_address.ilike.%${term}%`)
    .eq('status', 'prospect')
  return (prospects || []).map((t: any) => ({
    id: t.id,
    client_name: t.client_name || t.property_address,
    created_at: t.created_at,
    is_prospect: true,
  }))
}

function computeGrossFromRate(basisPrice: any, rate: any, rateType: any): number | null {
  const clean = (v: any) => parseFloat(String(v ?? '').replace(/[^0-9.]/g, ''))
  const basis = clean(basisPrice)
  const rateNum = clean(rate)
  if (!Number.isFinite(rateNum) || rateNum <= 0) return null
  let gross: number | null = null
  if (String(rateType || 'percent') === 'flat') gross = Math.round(rateNum * 100) / 100
  else if (Number.isFinite(basis) && basis > 0) gross = Math.round(basis * rateNum) / 100
  if (gross != null && Number.isFinite(basis) && basis > 1000 && gross > basis * 0.25) return null
  return gross
}


export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

// A typed address rarely matches the stored one exactly (commas, suffixes,
// city/zip present or missing, double spaces). Fall back to matching on the
// street number + street name when the full string finds nothing.
/**
 * Resolve the transaction an agent means by an address they typed.
 *
 * Previously this did an ilike on the first two words, scoped to the agent's
 * own commission rows. Two words is loose enough to hit the wrong deal on a
 * street with several listings, and the agent scope meant a deal created by
 * the Under Contract form or the Payload webhook was invisible here, so the
 * compliance submission made a second transaction for the same property.
 *
 * Now it uses the one canonical matcher, brokerage-wide. The agent's own deals
 * are preferred when several match, so the common case is unchanged.
 *
 * allowPartial is for the search box. The canonical matcher compares two whole
 * addresses for equality, so an agent who types "3006 Brooks Ct" against a deal
 * stored as "3006 Brooks Ct, Pearland, TX 77584" is told no deal exists and
 * files a second compliance form for a property that already has one. When
 * nothing matches outright, the search falls back to a subset match.
 *
 * The POST does not pass allowPartial, but that on its own does not keep a
 * partial match out of the write path: the form posts whatever this preview
 * returned back as transaction_id, and the POST attaches to that id without
 * re-checking the address. The guard that actually holds is inside the
 * function - a partial match resolves only to a single deal the agent is
 * already on, or to nothing.
 */
async function findTransactionByAddress(
  agentId: string,
  propertyAddress: string,
  options: { allowPartial?: boolean } = {}
) {
  const matches = await findDuplicateTransactions(propertyAddress)

  const { data: tiaRows } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('transaction_id')
    .eq('agent_id', agentId)
  const ownIds = new Set((tiaRows || []).map((r: any) => r.transaction_id).filter(Boolean))

  // The partial fallback resolves to ONE of the agent's OWN deals or to
  // nothing at all.
  //
  // What this preview returns is not advice. The form posts it straight back
  // as transaction_id, the POST trusts that id without re-checking the
  // address, and the compliance branch then overwrites that deal's price,
  // gross commission, client and dates. So a partial match that picks the
  // wrong deal is a write to the wrong deal.
  //
  // A typed address with no unit on it is a subset of EVERY unit in the
  // building, which is exactly the collapse buildAddressKeys keeps unit and
  // zip tokens to prevent. On live data 96 of 1,150 deals resolve to more
  // than one candidate on a street-line search, several of them a different
  // unit at the same address and several belonging to another agent. Ranking
  // them and taking the first silently picks one.
  //
  // Restricting to the agent's own deals and requiring exactly one still
  // fixes the case this fallback was added for - an agent looking for a deal
  // they are on, typing it short - and leaves every ambiguous or
  // someone-else's-deal case reporting no match, which is the outcome the
  // agent already knows how to handle.
  let partial: typeof matches = []
  if (!matches.length && options.allowPartial) {
    partial = (await findPartialAddressMatches(propertyAddress)).filter(m => ownIds.has(m.id))
    if (partial.length !== 1) return null
  }
  const pool = matches.length ? matches : partial
  if (!pool.length) return null

  // Exact beats similar (findDuplicateTransactions already sorted that way);
  // among equals, the agent's own deal wins over a colleague's.
  const chosen =
    pool.find(m => m.confidence === 'exact' && ownIds.has(m.id)) ||
    pool.find(m => m.confidence === 'exact') ||
    pool.find(m => ownIds.has(m.id)) ||
    pool[0]

  const { data } = await supabaseAdmin
    .from('transactions')
    .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status')
    .eq('id', chosen.id)
    .maybeSingle()
  return data || null
}

async function sendNotifications(emails: string[], subject: string, html: string, identifier: string) {
  for (const email of emails) {
    if (!email?.trim()) continue
    try {
      await resend.emails.send({ from: FROM_EMAIL, to: [email.trim()], subject: `${subject} - ${identifier}`, html })
    } catch (err) { console.error(`Failed to notify ${email}:`, err) }
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')
  const transactionId = searchParams.get('transaction_id')
  const mode = searchParams.get('mode')
  const onBehalfOfAgentId = searchParams.get('on_behalf_of_agent_id')
  // Office staff may look up an agent's transactions when filing on their behalf.
  // Verify staff server-side; otherwise fall back to the caller's own id.
  const STAFF_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
  const lookupAgentId =
    onBehalfOfAgentId && STAFF_ROLES.includes(String(auth.user.role || '').toLowerCase())
      ? onBehalfOfAgentId
      : auth.user.id
  // As-you-type retainer lookup. The form asks on every change to the client
  // name, so the agent is told a retainer already exists while they are still
  // on the first field, instead of after filling the whole form and pressing
  // submit. Same query the submit-time checks run.
  const clientNameLookup = searchParams.get('client_name')
  if (clientNameLookup !== null) {
    try {
      return NextResponse.json({ matches: await findRetainerProspects(lookupAgentId, clientNameLookup) })
    } catch {
      // A failed lookup must never block typing. The submit-time check still
      // catches the duplicate.
      return NextResponse.json({ matches: [] })
    }
  }
  try {
    let txn: any = null
    if (transactionId) {
      const { data } = await supabaseAdmin.from('transactions')
        .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division, client_phone, title_officer_phone, unit, bedrooms, bathrooms, garage, building_sqft, acceptance_date, is_intermediary')
        .eq('id', transactionId).single()
      txn = data
    } else if (address?.trim()) {
      // Same canonical resolver the POST path uses, so the deal the form
      // previews is always the deal the submission attaches to. These two
      // disagreeing is what let an agent see "no existing deal" and file a
      // duplicate.
      const resolved = await findTransactionByAddress(lookupAgentId, address, { allowPartial: true })
      if (resolved) {
        const { data } = await supabaseAdmin.from('transactions')
          .select('id, property_address, is_locked, compliance_status, transaction_type, representing, status, tenant_transaction_type, lease_term, closing_date, move_in_date, mls_link, client_name, client_email, lead_source, loan_type, sales_price, monthly_rent, gross_commission, bonus_amount, btsa_amount, rebate_amount, internal_referral, internal_referral_fee, external_referral, external_referral_fee, brokerage_referral, brokerage_referral_fee, title_officer_name, title_company, title_company_email, flyer_division, client_phone, title_officer_phone, unit, bedrooms, bathrooms, garage, building_sqft, acceptance_date, is_intermediary')
          .eq('id', resolved.id).maybeSingle()
        txn = data
      }
    }
    if (!txn) return NextResponse.json({ transaction: null, last_submission: null })
    let lastSubmission: any = null
    if (mode === 'subsequent') {
      const { data: lastSub } = await supabaseAdmin.from('agent_form_submissions')
        .select('id, data, submitted_at').eq('transaction_id', txn.id).eq('agent_id', lookupAgentId)
        .order('submitted_at', { ascending: false }).limit(1).maybeSingle()
      lastSubmission = lastSub || null
    }
    return NextResponse.json({ transaction: txn, last_submission: lastSubmission })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  try {
    const body = await request.json()
    const { submission_mode, on_behalf_of_agent_id } = body
    if (!submission_mode) return NextResponse.json({ error: 'submission_mode is required' }, { status: 400 })

    // Office staff may submit on behalf of an agent. Verify the submitter is
    // staff server-side before honoring the selected agent (never trust the client).
    const STAFF_ROLES = ['admin', 'broker', 'operations', 'tc', 'support']
    let agentId = auth.user.id
    let agentEmail = auth.user.email
    let agentName = `${auth.user.first_name} ${auth.user.last_name}`
    if (on_behalf_of_agent_id) {
      const submitterRole = String(auth.user.role || '').toLowerCase()
      if (!STAFF_ROLES.includes(submitterRole)) {
        return NextResponse.json({ error: 'Not permitted to submit on behalf of another agent' }, { status: 403 })
      }
      // Confirm the target is a real licensed agent
      const { data: targetAgent } = await supabaseAdmin
        .from('users')
        .select('id, email, first_name, last_name, preferred_first_name, preferred_last_name')
        .eq('id', on_behalf_of_agent_id)
        .eq('is_licensed_agent', true)
        .maybeSingle()
      if (!targetAgent) {
        return NextResponse.json({ error: 'Selected agent not found' }, { status: 400 })
      }
      agentId = on_behalf_of_agent_id
      agentEmail = targetAgent.email || auth.user.email
      agentName = `${targetAgent.preferred_first_name || targetAgent.first_name || ''} ${targetAgent.preferred_last_name || targetAgent.last_name || ''}`.trim() || agentName
    }
    const now = new Date().toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const { data: formRecord } = await supabaseAdmin.from('forms').select('id, name, notification_emails, triggers_flyer, flyer_type')
      .eq('linked_form_type', 'compliance_cda').eq('is_active', true).maybeSingle()
    const notificationEmails: string[] = formRecord?.notification_emails || []

    // ── RETAINER ─────────────────────────────────────────────────────────────
    if (submission_mode === 'retainer') {
      const { client_name, retainer_transaction_type, retainer_amount, docs_confirmed } = body
      if (!client_name?.trim()) return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
      if (!retainer_transaction_type) return NextResponse.json({ error: 'Transaction type is required' }, { status: 400 })
      if (!retainer_amount || parseFloat(retainer_amount) <= 0) return NextResponse.json({ error: 'Retainer amount is required' }, { status: 400 })
      if (!docs_confirmed) return NextResponse.json({ error: 'You must confirm all required documents are signed and uploaded' }, { status: 400 })
      const amount = parseFloat(retainer_amount)
      const limits: Record<string, [number, number]> = {
        residential_rental: [250, 500], residential_buyer: [750, 1000], commercial_rental: [750, 1000],
      }
      const [min, max] = limits[retainer_transaction_type] || [0, 0]
      if (amount < min || amount > max) return NextResponse.json({ error: `Retainer amount must be between $${min} and $${max} for this transaction type` }, { status: 400 })
      const isLease = retainer_transaction_type !== 'residential_buyer'

      // Check for existing retainer transactions for this agent with a similar client name.
      // confirm_new_deal=true means agent already reviewed the matches and confirmed this is a new deal.
      const { confirm_new_deal } = body
      // body.transaction_id means the agent already answered this question by
      // picking one of the matches, so raising the same panel again would loop
      // them straight back to it. The attach branch below re-derives the
      // allowed set server-side, so skipping the panel here does not skip the
      // ownership check.
      if (!confirm_new_deal && !String(body.transaction_id || '').trim()) {
        const matchingTxns = await findRetainerProspects(agentId, client_name)
        if (matchingTxns.length) {
          return NextResponse.json({ success: false, duplicate_check: true, matches: matchingTxns })
        }
      }

      // A retainer prospect can already exist without its compliance ever
      // having been filed -- the office creates one, or an earlier attempt got
      // part way. When the agent picks that record off the duplicate panel, the
      // submission attaches to it instead of creating a second prospect for the
      // same client. The money fields are written the same way either path, so
      // the record ends up identical to one filed in a single pass.
      const attachRetainerId = String(body.transaction_id || '').trim()
      let transactionId: string
      // Read this agent's existing retainer submission on the target once, up
      // front. Two things below need it: officeHasPriced compares the basis on
      // the commission row against what the agent last submitted, and the
      // resubmit branch updates this row in place instead of inserting.
      let existingSubmissionId: string | null = null
      let priorResubmitCount = 0
      let priorAmount = 0
      if (attachRetainerId) {
        const { data: priorSub, error: priorErr } = await supabaseAdmin
          .from('agent_form_submissions')
          .select('id, data')
          .eq('transaction_id', attachRetainerId)
          .eq('agent_id', agentId)
          .filter('data->>submission_mode', 'eq', 'retainer')
          .order('submitted_at', { ascending: true })
          .limit(1)
        // Same rule as the retainer row read below: a failed read must never be
        // taken as "there is nothing here". Reading it that way would insert a
        // second submission and treat the agent's own figure as the office's,
        // while telling the agent it worked.
        if (priorErr) {
          console.error('Failed to load the existing retainer submission:', priorErr)
          return NextResponse.json({ error: 'Could not read that retainer, so nothing was changed. Please try again.' }, { status: 500 })
        }
        existingSubmissionId = priorSub?.[0]?.id || null
        priorResubmitCount = Number(priorSub?.[0]?.data?.resubmit_count) || 0
        priorAmount = Number(priorSub?.[0]?.data?.retainer_amount) || 0
      }
      // Set when the attach target already carries a basis the office entered.
      let officeHasPriced = false
      let existingBasis = 0
      const retainerFields = {
        installment_kind: 'retainer', agent_basis: amount, processing_fee: 45,
        amount_1099_reportable: Math.round((amount - 45) * 100) / 100,
        agent_net: Math.round((amount - 45) * 100) / 100,
        payment_status: 'pending', split_percentage: 0, agent_gross: 0, brokerage_split: 0,
        coaching_fee: 0, team_lead_commission: 0, btsa_amount: 0, rebate_amount: 0,
        other_fees: 0, sales_volume: 0, units: 0, debts_deducted: 0, counts_toward_progress: false, updated_at: now,
      }

      if (attachRetainerId) {
        // Ownership and the existing row are the same question, so one query
        // answers both: a retainer row on this transaction, belonging to this
        // agent. Checked by id rather than by name. The panel matched on the
        // client name, but the agent can correct that name before submitting,
        // and re-deriving the allowed set from the corrected name rejects the
        // record they just picked with no way back to it -- the lookup that
        // raised the panel keys on the same name. Id gives the same security
        // property: the agent must already hold a retainer row on the deal.
        // limit(1) rather than maybeSingle(): a prospect can carry a second
        // commission row for the same agent that is not a retainer, and one of
        // these already does.
        const { data: existingRows, error: existingErr } = await supabaseAdmin
          .from('transaction_internal_agents')
          .select('id, payment_status, agent_basis')
          .eq('transaction_id', attachRetainerId)
          .eq('agent_id', agentId)
          .eq('installment_kind', 'retainer')
          .order('created_at', { ascending: true })
          .limit(1)
        // A failed read must never be read as "no row here". Treating it that
        // way would let the request carry on and write a second retainer row to
        // a prospect that already has one, doubling the basis and the 1099
        // while the agent sees success and the office is told it attached
        // correctly. Nothing is written if this read did not answer.
        if (existingErr) {
          console.error('Failed to load the existing retainer row:', existingErr)
          return NextResponse.json({ error: 'Could not read that retainer, so nothing was changed. Please try again.' }, { status: 500 })
        }
        const existingRow = existingRows?.[0] || null
        // The deal also has to still be open. A retainer that has been turned
        // into a live transaction is no longer something to file against.
        const { data: targetTxn, error: targetErr } = await supabaseAdmin
          .from('transactions')
          .select('id, status')
          .eq('id', attachRetainerId)
          .maybeSingle()
        if (targetErr) {
          console.error('Failed to load the retainer prospect:', targetErr)
          return NextResponse.json({ error: 'Could not read that retainer, so nothing was changed. Please try again.' }, { status: 500 })
        }
        if (!existingRow || !targetTxn || targetTxn.status !== 'prospect') {
          return NextResponse.json({ error: 'That retainer is no longer available to attach to. Start the submission again to pick it from the list.' }, { status: 400 })
        }
        if (existingRow.payment_status === 'paid') {
          // Writing over a paid row would silently restate money that has
          // already gone out, and accepting the submission without writing
          // would tell the agent it worked when nothing was recorded.
          return NextResponse.json({ error: 'This retainer has already been paid out, so it cannot be resubmitted. Contact the office if something on it needs to change.' }, { status: 400 })
        }
        transactionId = attachRetainerId
        await supabaseAdmin.from('transactions').update({
          transaction_type: feeCodeFromRetainerType(retainer_transaction_type) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'),
          updated_at: now,
        }).eq('id', transactionId)
        // A basis already on the row means the office has priced it. The agent
        // resubmitting must not reset a waived fee or a corrected amount back
        // to what the form collected, so leave the money alone and say so in
        // the office notification instead.
        // The office has priced this row only when the basis differs from what
        // the agent last submitted. Testing for non-zero cannot tell the two
        // apart: the minimum retainer is $250, so a first filing always leaves
        // a non-zero basis and every resubmission looked like an office price.
        // The money row then kept the old figure while the submission showed
        // the new one, which matters most when the agent is correcting the
        // type, since rental and buyer sit in different amount bands.
        const currentBasis = parseFloat(existingRow.agent_basis || 0)
        officeHasPriced = currentBasis > 0 && Math.abs(currentBasis - priorAmount) > 0.005
        existingBasis = officeHasPriced ? currentBasis : 0
        if (!officeHasPriced) {
          await supabaseAdmin.from('transaction_internal_agents').update(retainerFields).eq('id', existingRow.id)
        }
      } else {
        const { data: newTxn, error: createErr } = await supabaseAdmin.from('transactions')
          .insert({ property_address: formatNameToTitleCase(client_name.trim()), client_name: formatNameToTitleCase(client_name.trim()), status: 'prospect', transaction_type: feeCodeFromRetainerType(retainer_transaction_type) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'), submitted_by: agentId, updated_at: now })
          .select('id').single()
        if (createErr || !newTxn) { console.error('Failed to create retainer transaction:', createErr); return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 }) }
        transactionId = newTxn.id
        await supabaseAdmin.from('transaction_internal_agents').insert({
          transaction_id: transactionId, agent_id: agentId, agent_role: 'primary_agent', ...retainerFields,
        })
      }
      // Attaching to an existing retainer is a resubmission, not a new filing.
      // The deal and the commission row are already reused above; the
      // submission has to be too, or Leah gets a second row on her queue for
      // the same retainer and has to clear the stale one by hand every time an
      // agent fixes something. existingSubmissionId was read above the attach
      // branch because officeHasPriced needs the same row.
      const submissionData: Record<string, any> = { submission_mode: 'retainer', client_name, retainer_transaction_type, retainer_amount: amount, docs_confirmed }
      // The duplicate row used to be the only record that a resubmission
      // happened. Updating in place would lose that, so the count and the date
      // carry it on the row itself.
      if (existingSubmissionId) {
        submissionData.resubmit_count = priorResubmitCount + 1
        submissionData.resubmitted_at = now
      }

      let submission: { id: string } | null = null
      if (existingSubmissionId) {
        const { data: updated, error: updateErr } = await supabaseAdmin.from('agent_form_submissions')
          .update({
            submitted_at: now,
            status: 'submitted',
            data: submissionData,
            // Leah's rejection notes describe the version the agent just
            // replaced, so leaving them would show a stale reason against new
            // work. Cleared here for the same reason set-status clears them on
            // complete. reviewed_at and reviewed_by go with them: the row is
            // awaiting review again, not reviewed.
            admin_notes: null,
            reviewed_at: null,
            reviewed_by: null,
            updated_at: now,
          })
          .eq('id', existingSubmissionId)
          .select('id').single()
        // Falling through on a failed update would show the agent the success
        // screen and send the office the "submission received" email while
        // Leah's queue still held the old row -- her rejection notes intact,
        // status still incomplete. The agent stops chasing, and nobody knows.
        if (updateErr || !updated) {
          console.error('Failed to update the existing retainer submission:', updateErr)
          return NextResponse.json({ error: 'Could not update that retainer, so nothing was changed. Please try again.' }, { status: 500 })
        }
        submission = updated
      } else {
        const { data: inserted } = await supabaseAdmin.from('agent_form_submissions')
          .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: submissionData, updated_at: now })
          .select('id').single()
        submission = inserted || null
      }
      const typeLabel: Record<string, string> = { residential_rental: 'Residential Rental', residential_buyer: 'Residential Buyer', commercial_rental: 'Commercial Rental' }
      const notifyHtml = getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:#555555;">A retainer submission has been received.</p>
         <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${agentName}</p>
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Client:</strong> ${client_name}</p>
           <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Type:</strong> ${typeLabel[retainer_transaction_type] || retainer_transaction_type}</p>
           <p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Amount:</strong> $${amount.toFixed(2)} (agent net $${(amount - 45).toFixed(2)} after $45 processing fee)</p>
         </div>
         <p style="font-size:13px;color:#555555;margin:0 0 16px;">Agent confirmed all required documents are signed and uploaded to the Dotloop loop. Please confirm payment received and process payout.</p>
         ${attachRetainerId ? `<p style="font-size:13px;color:#555555;margin:0 0 16px;">This was filed against an existing retainer for this client rather than creating a new one.${officeHasPriced ? ` The commission row already carried a basis of $${existingBasis.toFixed(2)}, so it was left as entered and the agent's figure above was not written to it.` : ''}</p>` : ''}
         <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/transactions/${transactionId}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View Transaction</a></p>
         ${buildFormAnswersHtml(submissionData)}`,
        { title: 'New Retainer Submission', preheader: `Retainer for ${client_name}` }
      )
      await sendNotifications(notificationEmails, 'Retainer Submission', notifyHtml, client_name)
      return NextResponse.json({ success: true, transaction_id: transactionId, submission_id: submission?.id || null, message: 'Retainer submission received. The office will confirm payment and process your payout within 48-72 hours of funds clearing and documents being approved.' })
    }

    // ── FIND TRANSACTION (compliance + subsequent) ────────────────────────────
    // The agent either searched and found one, or they are creating a new one
    // and gave us the address in parts.
    const { property_address, transaction_id: clientTransactionId } = body
    const hasSearchAddress = !!property_address?.trim()
    const hasNewAddress = !!(body.street_address || body.city || body.zip)
    if (!hasSearchAddress && !hasNewAddress && !clientTransactionId) {
      return NextResponse.json({ error: 'Property address is required' }, { status: 400 })
    }
    let txn: any = null
    if (clientTransactionId) {
      const { data } = await supabaseAdmin.from('transactions').select('id, property_address, is_locked, compliance_status, transaction_type, representing, status').eq('id', clientTransactionId).single()
      txn = data
    } else if (hasSearchAddress) {
      txn = await findTransactionByAddress(agentId, property_address)
    }

    // ── SUBSEQUENT ───────────────────────────────────────────────────────────
    if (submission_mode === 'subsequent') {
      if (!txn) return NextResponse.json({ error: 'No transaction found for that address. Please check and try again.' }, { status: 404 })
      const { last_submission_id, notes, ...formFields } = body
      let previousData: Record<string, any> = {}
      if (last_submission_id) {
        const { data: prevSub } = await supabaseAdmin.from('agent_form_submissions').select('data').eq('id', last_submission_id).single()
        previousData = prevSub?.data || {}
      }
      // crc_both_sides is deliberately NOT diffed. No submission filed before it
      // existed carries an answer, so comparing it against the previous
      // submission reports "changed" on an update where the agent changed
      // nothing - and changedFields.length is the gate that decides whether the
      // deal is written to at all. Eight of the last forty-nine updates recorded
      // zero changed fields and correctly wrote nothing; without this they would
      // each have stamped compliance_status back to 'submitted', five of them on
      // a deal the office had already completed. It is also not a field the
      // office needs listed in the changed-fields email.
      const skipKeys = new Set(['submission_mode', 'property_address', 'transaction_id', 'last_submission_id', 'notes', 'crc_both_sides'])
      const changedFields: string[] = []
      for (const [key, value] of Object.entries(formFields)) {
        if (skipKeys.has(key)) continue
        if (JSON.stringify(previousData[key]) !== JSON.stringify(value)) changedFields.push(key)
      }
      // A side the office has already reviewed is locked here exactly as it is on
      // the full compliance form: the submission is recorded, the office is told,
      // and NOTHING on the deal is rewritten.
      //
      // This form was the open door. It writes the same money the full form does
      // - price, gross commission, that side's commission, dates, BTSA, rebate -
      // and re-runs the cascade, guarded only by transactions.is_locked, a column
      // nothing has ever set. Thirteen updates have already landed on a side that
      // was reviewed. With a completed side now outranking a newer open one, an
      // unlocked update would be worse than before: the deal would keep reading
      // complete and stay payable on numbers nobody re-reviewed.
      //
      // Derived from the side's own completed submission, the same test the full
      // form uses, so the two forms cannot disagree about what is locked.
      const repForLock = String(formFields.representing || txn.representing || '').toLowerCase().trim()
      const { data: completedSubRows } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('data')
        .eq('transaction_id', txn.id)
        .eq('status', 'complete')
        .filter('data->>submission_mode', 'eq', 'compliance')
      const sideLockedSub = !!repForLock && (completedSubRows || []).some(
        (row: any) => String(row?.data?.representing || '').toLowerCase().trim() === repForLock
      )
      const submissionData = {
        ...formFields, notes: notes || null, changed_fields: changedFields, submission_mode: 'subsequent',
        ...(sideLockedSub ? { locked_transaction: true, locked_reason: 'side_complete' } : {}),
      }
      const { data: submission } = await supabaseAdmin.from('agent_form_submissions')
        .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: txn.id, data: submissionData, updated_at: now })
        .select('id').single()
      // Set-only-ON, and outside the changed-fields gate. The answer is not
      // diffed (see skipKeys), so an agent whose only correction is "yes, we hold
      // both sides" has an empty changedFields and would never reach the write
      // block below. They still do not get to clear a flag the office set.
      if (!txn.is_locked && !sideLockedSub && formFields.crc_both_sides === true) {
        await supabaseAdmin.from('transactions').update({ is_intermediary: true, updated_at: now }).eq('id', txn.id)
      }
      if (!txn.is_locked && !sideLockedSub && changedFields.length > 0) {
        // Only write the fields that actually changed plus the compliance status fields
        // Same rule as the first submission: a referred-out lease is still a
        // lease. When the resubmission does not say what kind of client was
        // referred, trust what the transaction already is instead of guessing.
        const rep = formFields.representing || txn.representing
        const isLease = rep === 'referred_out' && !formFields.referred_client_type
          ? txn.transaction_type === 'lease'
          : complianceIsLease({ representing: rep, referred_client_type: formFields.referred_client_type })
        // The agent must have confirmed the on-screen commission summary.
        if (body.commission_confirmed !== true) {
          return NextResponse.json({ error: 'Please confirm the commission calculation in the Commission Summary box before submitting.' }, { status: 400 })
        }
        // Same commission derivation as a first submission, from this
        // branch's formFields: base = computed gross, side = base + additional
        // compensation, on the side the agent represents.
        const addlSub = Array.isArray(formFields.additional_compensation)
          ? formFields.additional_compensation.reduce((s: number, c: any) => s + (parseFloat(String(c?.amount ?? 0)) || 0), 0)
          : 0
        const computedGrossSub = computeGrossFromRate(formFields.commission_basis_price, formFields.commission_rate, formFields.commission_rate_type)
        const repLowerSub = String(rep || '').toLowerCase()
        const sideCommissionFieldsSub: Record<string, any> =
          computedGrossSub == null ? {} :
          (repLowerSub.includes('seller') || repLowerSub.includes('landlord')) ? {
            listing_base_commission: computedGrossSub,
            listing_side_commission: Math.round((computedGrossSub + addlSub) * 100) / 100,
          } :
          (repLowerSub.includes('buyer') || repLowerSub.includes('tenant')) ? {
            buying_base_commission: computedGrossSub,
            buying_side_commission: Math.round((computedGrossSub + addlSub) * 100) / 100,
          } : {}
        // %/$ resolution - same policy as a first submission: BTSA and rebate
        // percent of the SALES PRICE (basis), referral fees percent of gross.
        const basisPriceSub = parseFloat(String(formFields.commission_basis_price ?? '').replace(/[^0-9.]/g, '')) || 0
        const volumeSub = parseFloat(String(formFields.total_sales_rent_price ?? '').replace(/[^0-9.]/g, '')) || 0
        const resolveSub = (v: any, t: any, base: number) => {
          const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')) || 0
          return String(t || 'flat') === 'percent' ? Math.round(base * n) / 100 : n
        }
        const btsaSub = resolveSub(formFields.bonus_btsa_amount, formFields.bonus_btsa_amount_type, basisPriceSub)
        const rebateSub = resolveSub(formFields.rebate_amount, formFields.rebate_amount_type, basisPriceSub)
        const grossFeeBaseSub = computedGrossSub ?? 0
        const fieldMap: Record<string, any> = {
          representing:          formFields.representing || null,
          tenant_transaction_type: formFields.tenant_transaction_type || null,
          lease_term:            formFields.lease_term_months ? parseInt(formFields.lease_term_months) : null,
          closing_date:          isLease ? null : formFields.closing_or_movein_date || null,
          move_in_date:          isLease ? formFields.closing_or_movein_date || null : null,
          acceptance_date:       formFields.acceptance_date || null,
          loan_type:             formFields.loan_type || null,
          // Corrected semantics: commission basis price IS the sales price
          // (or rent); the total is the reported production VOLUME.
          sales_price:           basisPriceSub > 0 ? basisPriceSub : null,
          monthly_rent:          isLease && basisPriceSub > 0 ? basisPriceSub : null,
          sales_volume:          volumeSub > 0 ? volumeSub : null,
          gross_commission:      computedGrossSub,
          bonus_amount:          btsaSub,
          has_btsa:              btsaSub > 0,
          btsa_amount:           btsaSub,
          rebate_amount:         rebateSub,
          internal_referral:     formFields.internal_referral || false,
          internal_referral_fee: formFields.internal_referral ? resolveSub(formFields.internal_referral_fee, formFields.internal_referral_fee_type, grossFeeBaseSub) : 0,
          internal_referral_fee_type: formFields.internal_referral_fee_type || 'flat',
          external_referral:     formFields.external_referral || false,
          external_referral_fee: formFields.external_referral ? resolveSub(formFields.external_referral_fee, formFields.external_referral_fee_type, grossFeeBaseSub) : 0,
          external_referral_fee_type: formFields.external_referral_fee_type || 'flat',
          brokerage_referral:    formFields.brokerage_referral || false,
          brokerage_referral_fee: formFields.brokerage_referral ? resolveSub(formFields.brokerage_referral_fee, formFields.brokerage_referral_fee_type, grossFeeBaseSub) : 0,
          brokerage_referral_fee_type: formFields.brokerage_referral_fee_type || 'flat',
          has_ecommission:       !!formFields.has_ecommission,
          ecommission_amount:    formFields.has_ecommission ? (parseFloat(String(formFields.ecommission_amount ?? 0)) || 0) : null,
          // Subsequent now renders the same field block as a first submission,
          // so every column that block can change has to be writable here too.
          // Without these a corrected title company or client email was
          // silently dropped on resubmission.
          client_name:           formFields.client_name || null,
          client_email:          formFields.client_email || null,
          client_phone:          formFields.client_phone || null,
          title_officer_name:    formFields.title_officer_name || null,
          title_company:         formFields.title_company || null,
          title_company_email:   formFields.title_company_email || null,
          title_officer_phone:   formFields.title_phone || null,
          mls_link:              formFields.mls_link || null,
          lead_source:           formFields.lead_source || null,
          unit:                  formFields.unit || null,
          bedrooms:              formFields.bedrooms ? parseInt(String(formFields.bedrooms)) : null,
          bathrooms:             formFields.bathrooms ? parseFloat(String(formFields.bathrooms)) : null,
          garage:                formFields.garage ? parseInt(String(formFields.garage)) : null,
          building_sqft:         formFields.sqft ? parseFloat(String(formFields.sqft)) : null,
          flyer_division:        formFields.flyer_division || null,
        }
        // Keys that map from form field name to transaction column name
        const formToColumn: Record<string, string> = {
          lease_term_months:        'lease_term',
          closing_or_movein_date:   isLease ? 'move_in_date' : 'closing_date',
          total_sales_rent_price:   'sales_volume',
          commission_basis_price:   isLease ? 'monthly_rent' : 'sales_price',
          bonus_btsa_amount:        'bonus_amount',
          has_ecommission:          'has_ecommission',
          ecommission_amount:       'ecommission_amount',
          title_phone:              'title_officer_phone',
          sqft:                     'building_sqft',
        }
        // Build partial update: only include columns whose form field changed
        const partialUpdate: Record<string, any> = {
          compliance_status:        'submitted',
          compliance_submitted_at:  now,
          compliance_submitted_by:  agentId,
          updated_at:               now,
        }
        for (const changedKey of changedFields) {
          const col = formToColumn[changedKey] || changedKey
          if (col in fieldMap) partialUpdate[col] = fieldMap[col]
          // has_btsa and btsa_amount follow bonus_btsa_amount
          if (changedKey === 'bonus_btsa_amount') {
            partialUpdate.has_btsa = fieldMap.has_btsa
            partialUpdate.btsa_amount = fieldMap.btsa_amount
          }
          // closing_date and move_in_date are paired
          if (changedKey === 'closing_or_movein_date') {
            partialUpdate.closing_date = fieldMap.closing_date
            partialUpdate.move_in_date = fieldMap.move_in_date
          }
          // basis price drives BOTH price columns (sale vs lease semantics)
          if (changedKey === 'commission_basis_price') {
            partialUpdate.sales_price = fieldMap.sales_price
            partialUpdate.monthly_rent = fieldMap.monthly_rent
          }
          // fee type changes re-resolve their dollar columns
          if (changedKey === 'internal_referral_fee_type' || changedKey === 'internal_referral_fee') {
            partialUpdate.internal_referral_fee = fieldMap.internal_referral_fee
            partialUpdate.internal_referral_fee_type = fieldMap.internal_referral_fee_type
          }
          if (changedKey === 'external_referral_fee_type' || changedKey === 'external_referral_fee') {
            partialUpdate.external_referral_fee = fieldMap.external_referral_fee
            partialUpdate.external_referral_fee_type = fieldMap.external_referral_fee_type
          }
          if (changedKey === 'brokerage_referral_fee_type' || changedKey === 'brokerage_referral_fee') {
            partialUpdate.brokerage_referral_fee = fieldMap.brokerage_referral_fee
            partialUpdate.brokerage_referral_fee_type = fieldMap.brokerage_referral_fee_type
          }
          if (changedKey === 'rebate_amount_type') {
            partialUpdate.rebate_amount = fieldMap.rebate_amount
          }
          if (changedKey === 'bonus_btsa_amount_type') {
            partialUpdate.bonus_amount = fieldMap.bonus_amount
            partialUpdate.has_btsa = fieldMap.has_btsa
            partialUpdate.btsa_amount = fieldMap.btsa_amount
          }
          // Commission inputs drive gross + base + side commissions together
          if (['commission_basis_price', 'commission_rate', 'commission_rate_type', 'additional_compensation'].includes(changedKey)) {
            partialUpdate.gross_commission = fieldMap.gross_commission
            Object.assign(partialUpdate, sideCommissionFieldsSub)
          }
        }
        await supabaseAdmin.from('transactions').update(partialUpdate).eq('id', txn.id)
        // BTSA and rebate live on the agent's commission row - the payout math
        // reads them there, not from the transaction columns. Never touch a
        // row that has already been paid.
        if (changedFields.includes('bonus_btsa_amount') || changedFields.includes('rebate_amount')) {
          await supabaseAdmin
            .from('transaction_internal_agents')
            .update({
              ...(changedFields.includes('bonus_btsa_amount') || changedFields.includes('bonus_btsa_amount_type') ? { btsa_amount: btsaSub } : {}),
              ...(changedFields.includes('rebate_amount') || changedFields.includes('rebate_amount_type') ? { rebate_amount: rebateSub } : {}),
              updated_at: now,
            })
            .eq('transaction_id', txn.id)
            .eq('agent_id', agentId)
            .eq('agent_role', 'primary_agent')
            .neq('payment_status', 'paid')
        }
        // Referral fees land on the primary row's other_fees (they come out
        // of the agent's NET) - same policy as a first submission, recomputed
        // from this resubmission's values. Only when a referral or commission
        // input changed, and never over office-entered fees (the tag rule).
        const REFERRAL_TAG_SUB = '[referral fees - compliance form]'
        const intFeeSub = fieldMap.internal_referral_fee || 0
        const extFeeSub = fieldMap.external_referral_fee || 0
        const brokFeeSub = fieldMap.brokerage_referral_fee || 0
        const refPartsSub: string[] = []
        if (intFeeSub > 0) refPartsSub.push(`Internal Referral Fee $${intFeeSub.toFixed(2)}`)
        if (extFeeSub > 0) refPartsSub.push(`External Referral Fee $${extFeeSub.toFixed(2)}`)
        if (brokFeeSub > 0) refPartsSub.push(`Brokerage Referral Fee $${brokFeeSub.toFixed(2)}`)
        const refTotalSub = Math.round((intFeeSub + extFeeSub + brokFeeSub) * 100) / 100
        const referralInputsChanged = changedFields.some(k =>
          k.startsWith('internal_referral') || k.startsWith('external_referral') || k.startsWith('brokerage_referral') ||
          ['commission_basis_price', 'commission_rate', 'commission_rate_type'].includes(k)
        )
        if (referralInputsChanged) {
          const { data: primarySub } = await supabaseAdmin
            .from('transaction_internal_agents')
            .select('id, other_fees, other_fees_description, payment_status')
            .eq('transaction_id', txn.id)
            .eq('agent_id', agentId)
            .eq('agent_role', 'primary_agent')
            .limit(1)
            .maybeSingle()
          if (primarySub && primarySub.payment_status !== 'paid') {
            const existingFeesSub = parseFloat(String(primarySub.other_fees ?? 0)) || 0
            const taggedSub = String(primarySub.other_fees_description || '').includes(REFERRAL_TAG_SUB)
            if (!(existingFeesSub > 0 && !taggedSub)) {
              await supabaseAdmin
                .from('transaction_internal_agents')
                .update({
                  other_fees: refTotalSub,
                  other_fees_description: refPartsSub.length ? `${refPartsSub.join('; ')} ${REFERRAL_TAG_SUB}` : null,
                  updated_at: now,
                })
                .eq('id', primarySub.id)
            }
          }
        }
        // Internal referral newly reported on a resubmission: create the
        // receiving CRC agent's payout row. Duplicate-guarded, so a
        // resubmission that repeats the same referral changes nothing.
        const intAgentIdSub = String((body as any).internal_referral_agent_id || '')
        const sideFromRepSub =
          repLowerSub.includes('landlord') ? 'landlord'
          : repLowerSub.includes('seller') ? 'seller'
          : repLowerSub.includes('tenant') ? 'tenant'
          : repLowerSub.includes('buyer') ? 'buyer'
          : null
        if (formFields.internal_referral && intFeeSub > 0 && intAgentIdSub && intAgentIdSub !== agentId) {
          const { data: existingRefSub } = await supabaseAdmin
            .from('transaction_internal_agents')
            .select('id')
            .eq('transaction_id', txn.id)
            .eq('agent_id', intAgentIdSub)
            .eq('agent_role', 'referral_agent')
            .limit(1)
            .maybeSingle()
          if (!existingRefSub) {
            await supabaseAdmin.from('transaction_internal_agents').insert({
              transaction_id: txn.id,
              agent_id: intAgentIdSub,
              agent_role: 'referral_agent',
              side: sideFromRepSub,
              agent_basis: null,
              agent_gross: intFeeSub,
              agent_net: intFeeSub,
              amount_1099_reportable: intFeeSub,
              sales_volume: 0,
              units: 0,
              counts_toward_progress: false,
              payment_status: 'pending',
              funding_source: 'crc',
              lead_source: 'own',
              adjustment_notes: 'Internal referral fee reported on the compliance form; paid out of the referring deal agent\'s net.',
              updated_at: now,
            })
          }
        }
        // eCommission newly reported on a resubmission: same auto-record as a
        // first submission (invoice for regular plans, brokerage-net repayment
        // for broker plans). Duplicate-guarded by the notes tag / TEB lookup.
        const ecSubAmount = fieldMap.has_ecommission ? (parseFloat(String(fieldMap.ecommission_amount ?? 0)) || 0) : 0
        // NOT gated on ecSubAmount > 0. Unchecking has_ecommission, or
        // correcting the amount to zero, writes null to the transaction column
        // above, so the debt and the payout row have to follow it down to zero
        // or the agent's check stays short and eCommission still gets paid for
        // an advance the agent just said does not exist. Only the two INSERTs
        // below need a positive amount; the syncs do not.
        if (changedFields.includes('has_ecommission') || changedFields.includes('ecommission_amount')) {
          const { data: subAgentProfile } = await supabaseAdmin
            .from('users').select('commission_plan, lease_commission_plan').eq('id', agentId).single()
          const subPlanCode = String(
            (isLease && subAgentProfile?.lease_commission_plan) ? subAgentProfile.lease_commission_plan : (subAgentProfile?.commission_plan || '')
          )
          const isBrokerPlanSub = /broker/i.test(subPlanCode) || /^custom\s+lease\s+0\s*\/\s*100$/i.test(subPlanCode.trim())
          // Same policy as a first submission: the external payout record is
          // ALWAYS created (eCommission is owed their money either way); the
          // agent-side repayment debt only exists off the broker plan.
          let recordsInserted = false
          const { data: existingEcTebSub } = await supabaseAdmin
            .from('transaction_external_brokerages')
            .select('id')
            .eq('transaction_id', txn.id)
            .eq('brokerage_role', 'other')
            .ilike('brokerage_name', 'eCommission%')
            .limit(1)
            .maybeSingle()
          if (!existingEcTebSub && ecSubAmount > 0) {
            await supabaseAdmin.from('transaction_external_brokerages').insert({
              transaction_id: txn.id,
              brokerage_role: 'other',
              brokerage_role_other: 'ecommission_repayment',
              brokerage_name: 'eCommission (Advance Repayment)',
              commission_amount: ecSubAmount,
              amount_1099_reportable: ecSubAmount,
              payment_status: 'pending',
              side: sideFromRepSub,
              notes: isBrokerPlanSub
                ? 'Broker plan deal: eCommission advance repaid from brokerage net. Auto-created from the agent compliance form.'
                : 'eCommission advance repayment. Collected from the agent payout (see the matching eCommission debt) and paid out here. Auto-created from the agent compliance form.',
            })
            recordsInserted = true
          }
          let existingDebtSub: { id: string } | null = null
          if (!isBrokerPlanSub) {
            const tagSub = `auto:compliance-ecommission:${txn.id}`
            const { data: foundDebtSub } = await supabaseAdmin
              .from('agent_debts')
              .select('id')
              .eq('agent_id', agentId)
              .ilike('notes', `%${tagSub}%`)
              .limit(1)
              .maybeSingle()
            existingDebtSub = foundDebtSub
            if (!existingDebtSub && ecSubAmount > 0) {
              await supabaseAdmin.from('agent_debts').insert({
                agent_id: agentId,
                debt_type: 'ecommission',
                description: `eCommission Repayment - ${txn.property_address || 'compliance submission'}`,
                amount_owed: ecSubAmount,
                amount_paid: 0,
                date_incurred: now.slice(0, 10),
                status: 'outstanding',
                record_type: 'debt',
                notes: `Reported by agent on the compliance form. ${tagSub}`,
              })
              recordsInserted = true
            }
          }
          // Records that already existed get the current figure pushed onto
          // them, zero included. syncEcommissionRecords refuses to rewrite a
          // debt that has already been staged (it reports 'locked' instead) and
          // recomputes office_net, which both tables feed.
          if (existingEcTebSub || existingDebtSub) {
            await syncEcommissionRecords(txn.id, ecSubAmount)
          }
          // A NEW payout row changes an office_net input on its own, and this
          // has to be a plain `if`, not an `else if`: when the debt already
          // exists but the payout row does not, syncEcommissionRecords reports
          // 'locked'/'unchanged' and skips its own recompute while the insert
          // above just moved an input. Reachable in sequence -- debt staged,
          // payout row missing, agent resubmits -- and office net would then
          // overstate by the full advance. recomputeOfficeNet is idempotent, so
          // running it twice costs nothing.
          if (recordsInserted) {
            await recomputeOfficeNet(txn.id)
          }
        }
        // External referral on a resubmission: the fee is charged to the agent's
        // net above, so the outside brokerage needs its payout row here too. A
        // first submission does this in createEcommissionDebtAndTeb, which this
        // branch returns before ever reaching. Duplicate-guarded.
        if (formFields.external_referral && extFeeSub > 0) {
          const tebNameSub = String((body as any).external_referral_brokerage_name || '').trim()
            || 'External referral brokerage (name pending)'
          const { data: existingExtTebSub } = await supabaseAdmin
            .from('transaction_external_brokerages')
            .select('id')
            .eq('transaction_id', txn.id)
            .eq('brokerage_role', 'referral')
            .limit(1)
            .maybeSingle()
          if (!existingExtTebSub) {
            await supabaseAdmin.from('transaction_external_brokerages').insert({
              transaction_id: txn.id,
              brokerage_role: 'referral',
              brokerage_name: tebNameSub,
              commission_amount: extFeeSub,
              amount_1099_reportable: extFeeSub,
              payment_status: 'pending',
              side: sideFromRepSub,
              notes: 'Auto-created from the agent compliance form. Office: complete W-9 / EIN / address at review.',
            })
          }
        }

        // Contacts. A first submission upserts the title company and the
        // client; a resubmission never did, so a corrected title company never
        // reached transaction_contacts -- which is exactly where the CDA reads
        // the address for Send to Title. Same upsert, same shape.
        const upsertContactSub = async (
          contactType: string,
          fields: { name: string | null; company: string | null; email: string | null; phone: string | null }
        ) => {
          if (!fields.name && !fields.company && !fields.email && !fields.phone) return
          const { data: existingContact } = await supabaseAdmin
            .from('transaction_contacts')
            .select('id')
            .eq('transaction_id', txn.id)
            .eq('contact_type', contactType)
            .maybeSingle()
          if (existingContact) {
            await supabaseAdmin.from('transaction_contacts')
              .update({ name: fields.name, company: fields.company, email: fields.email, phone: fields.phone, updated_at: now })
              .eq('id', existingContact.id)
          } else {
            await supabaseAdmin.from('transaction_contacts')
              .insert({ transaction_id: txn.id, contact_type: contactType, name: fields.name, company: fields.company, email: fields.email, phone: fields.phone })
          }
        }
        const repLowerContact = String(rep || '').toLowerCase()
        const clientContactTypeSub =
          repLowerContact.includes('landlord') ? 'landlord'
          : repLowerContact.includes('seller') ? 'seller'
          : repLowerContact.includes('tenant') ? 'tenant'
          : repLowerContact.includes('buyer') ? 'buyer'
          : null
        if (clientContactTypeSub) {
          await upsertContactSub(clientContactTypeSub, {
            name: formFields.client_name || null,
            company: null,
            email: formFields.client_email || null,
            phone: formFields.client_phone || null,
          })
        }
        await upsertContactSub('title_company', {
          name: formFields.title_officer_name || null,
          company: formFields.title_company || null,
          email: formFields.title_company_email || null,
          phone: formFields.title_phone || null,
        })

        // Flyer. The shared block now shows the flyer question on a
        // resubmission too, so honour it -- but update the existing flyer
        // rather than creating a second one for the same deal. Same display-line
        // resolution and type override as a first submission.
        if (formFields.flyer_display_type) {
          let flyerLineSub: string | null = null
          if (formFields.flyer_display_type === 'division') {
            flyerLineSub = formFields.flyer_division || null
          } else if (formFields.flyer_display_type === 'team') {
            flyerLineSub = formFields.flyer_team_name || null
          } else if (formFields.flyer_display_type === 'office') {
            const { data: officeRow } = await supabaseAdmin
              .from('users').select('office').eq('id', agentId).single()
            flyerLineSub = officeRow?.office || null
          }
          const { data: existingFlyer } = await supabaseAdmin
            .from('transaction_flyers')
            .select('id')
            .eq('transaction_id', txn.id)
            .limit(1)
            .maybeSingle()
          if (existingFlyer) {
            await supabaseAdmin.from('transaction_flyers')
              .update({ flyer_division: flyerLineSub, updated_at: now })
              .eq('id', existingFlyer.id)
          } else {
            await createFlyerFromForm({
              form: formRecord as any,
              transactionId: txn.id,
              agentId,
              flyerDivision: flyerLineSub,
              typeOverride: isLease ? 'just_leased' : 'just_sold',
            })
          }
        }

        // Commission inputs may have changed - re-run the cascade so tia rows
        // and TL/momentum payouts stay in sync with the resubmitted values.
        // Cascade LAST so its office_net recompute sees the records above.
        await autoCascadeTransaction(txn.id)
      }
      const formatLabel = (k: string) => k.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      const changedHtml = changedFields.length
        ? `<div style="background:#fff8e6;padding:14px 18px;margin:0 0 20px;border-left:3px solid #C5A278;"><p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1a1a1a;">Changed fields:</p><ul style="margin:0;padding-left:18px;">${changedFields.map(f => `<li style="font-size:13px;color:#555;">${formatLabel(f)}</li>`).join('')}</ul></div>`
        : '<p style="font-size:13px;color:#555;margin:0 0 16px;">No field changes detected.</p>'
      const lockedNote = (txn.is_locked || sideLockedSub)
        ? `<p style="font-size:13px;color:#C5A278;margin:0 0 16px;"><strong>Note:</strong> ${txn.is_locked ? 'Transaction is locked' : `The ${repForLock} side has already been reviewed`}. Manual update required.</p>`
        : ''
      const notifyHtml = getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Resubmission received for <strong style="color:#1a1a1a;">${txn.property_address}</strong>.</p>
         ${lockedNote}${changedHtml}
         ${notes ? `<p style="font-size:13px;color:#555;margin:0 0 16px;"><strong>Agent notes:</strong> ${notes}</p>` : ''}
         <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View in Compliance Dashboard</a></p>
         ${buildFormAnswersHtml(submissionData)}`,
        { title: 'Subsequent Compliance Resubmission', preheader: `Resubmission for ${txn.property_address}` }
      )
      await sendNotifications(notificationEmails, 'Compliance Resubmission', notifyHtml, txn.property_address)
      return NextResponse.json({
        success: true, locked: txn.is_locked || sideLockedSub, submission_id: submission?.id || null, changed_fields: changedFields,
        message: (txn.is_locked || sideLockedSub) ? 'Your resubmission has been received. Because this transaction has been reviewed by the office, any updates will be applied manually. No action is needed from you.' : 'Resubmission received. The office has been notified.',
      })
    }

    // ── COMPLIANCE ───────────────────────────────────────────────────────────
    const { team_or_office, unit, in_matrix, mls_link, client_name, client_email, client_phone, lead_source,
      closing_or_movein_date, acceptance_date, representing, tenant_transaction_type, lease_term_months,
      referred_client_type, commission_basis_price, commission_rate, commission_rate_type,
      total_sales_rent_price, bonus_btsa_amount, additional_compensation, rebate_amount,
      internal_referral, internal_referral_fee, external_referral, external_referral_fee,
      brokerage_referral, brokerage_referral_fee, title_officer_name, title_company,
      title_company_email, title_phone, loan_type, expedite_acknowledged, bedrooms, bathrooms, garage, sqft,
      flyer_display_type, flyer_division, flyer_team_name, additional_notes,
      // Does CRC hold BOTH sides of this deal? Asked on the form so the second
      // side is expected from the moment the first one files. Without it the
      // flag had to be set by hand on the deal, and an intermediary deal
      // nobody remembered to flag expects one side, so it reads compliant the
      // moment that one side is approved and the other is never chased.
      crc_both_sides } = body

    if (!expedite_acknowledged) return NextResponse.json({ error: 'You must acknowledge the expedite policy' }, { status: 400 })
    if (!acceptance_date) return NextResponse.json({ error: 'Acceptance date is required' }, { status: 400 })
    if (!closing_or_movein_date) return NextResponse.json({ error: 'Closing or move-in date is required' }, { status: 400 })

    const { data: agentProfile } = await supabaseAdmin.from('users').select('office, commission_plan, lease_commission_plan').eq('id', agentId).single()
    // A referred out deal is still a lease if the client referred was a tenant
    // or landlord. Without this, a referred out lease was treated as a sale:
    // the date landed in closing_date, move_in_date stayed null, and monthly
    // rent was never written. The flyer logic below already handled this; the
    // data did not.
    const isLease = complianceIsLease({ representing, referred_client_type })

    // Broker plan detection (same rule as the cascade): the broker keeps no
    // commission, so an eCommission advance is repaid out of the brokerage
    // net, not billed to the agent. Matches broker_100, plan strings
    // containing "broker", and the lease magic string "Custom Lease 0/100".
    const brokerPlanCode = String(
      (isLease && agentProfile?.lease_commission_plan) ? agentProfile.lease_commission_plan : (agentProfile?.commission_plan || '')
    )
    const isBrokerPlan = /broker/i.test(brokerPlanCode) || /^custom\s+lease\s+0\s*\/\s*100$/i.test(brokerPlanCode.trim())

    // Server-side gate: the agent must have confirmed the on-screen commission
    // summary before we accept the submission (retainer mode has no commission).
    if (body.commission_confirmed !== true) {
      return NextResponse.json({ error: 'Please confirm the commission calculation in the Commission Summary box before submitting.' }, { status: 400 })
    }

    // Where the commission lands on the deal. Base = computed gross; the side
    // total also includes additional compensation (same convention as the
    // additional-income route). Seller/landlord deals fill the listing side,
    // buyer/tenant deals fill the buying side, so the Overview tab and the
    // office-net math finally see the money without a manual office step.
    const additionalCompTotal = Array.isArray(additional_compensation)
      ? additional_compensation.reduce((s: number, c: any) => s + (parseFloat(String(c?.amount ?? 0)) || 0), 0)
      : 0
    const computedGross = computeGrossFromRate(commission_basis_price, commission_rate, commission_rate_type)
    const repLower = String(representing || '').toLowerCase()
    const sideCommissionFields: Record<string, any> =
      computedGross == null ? {} :
      (repLower.includes('seller') || repLower.includes('landlord')) ? {
        listing_base_commission: computedGross,
        listing_side_commission: Math.round((computedGross + additionalCompTotal) * 100) / 100,
      } :
      (repLower.includes('buyer') || repLower.includes('tenant')) ? {
        buying_base_commission: computedGross,
        buying_side_commission: Math.round((computedGross + additionalCompTotal) * 100) / 100,
      } : {}
    const tiaSideFromRep =
      repLower.includes('landlord') ? 'landlord'
      : repLower.includes('seller') ? 'seller'
      : repLower.includes('tenant') ? 'tenant'
      : repLower.includes('buyer') ? 'buyer'
      : null
    // %/$ resolution. Percent bases per office policy: BTSA and rebate are a
    // percent of the SALES PRICE (the commission basis price); referral fees
    // are a percent of the computed gross commission.
    const basisPriceNum = parseFloat(String(commission_basis_price ?? '').replace(/[^0-9.]/g, '')) || 0
    const volumeNum = parseFloat(String(total_sales_rent_price ?? '').replace(/[^0-9.]/g, '')) || 0
    const resolveAmt = (v: any, t: any, base: number) => {
      const n = parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')) || 0
      return String(t || 'flat') === 'percent' ? Math.round(base * n) / 100 : n
    }
    const btsaNum = resolveAmt(bonus_btsa_amount, (body as any).bonus_btsa_amount_type, basisPriceNum)
    const rebateNum = resolveAmt(rebate_amount, (body as any).rebate_amount_type, basisPriceNum)
    const grossForFees = computedGross ?? 0
    const internalFeeNum = internal_referral ? resolveAmt(internal_referral_fee, (body as any).internal_referral_fee_type, grossForFees) : 0
    const externalFeeNum = external_referral ? resolveAmt(external_referral_fee, (body as any).external_referral_fee_type, grossForFees) : 0
    const brokerageFeeNum = brokerage_referral ? resolveAmt(brokerage_referral_fee, (body as any).brokerage_referral_fee_type, grossForFees) : 0
    const ecommissionNum = (body as any).has_ecommission ? (parseFloat(String((body as any).ecommission_amount ?? 0)) || 0) : 0

    // Referral fees are FEES on the primary agent's commission row (they come
    // out of the agent's NET via the canonical other_fees term), not a
    // carve-out of the pool. Recipient records are created alongside:
    // internal -> a payout row for the selected CRC agent; external -> the
    // external-brokerage record (office completes W-9 at review).
    const REFERRAL_TAG = '[referral fees - compliance form]'
    const referralFeeParts: string[] = []
    if (internalFeeNum > 0) referralFeeParts.push(`Internal Referral Fee $${internalFeeNum.toFixed(2)}`)
    if (externalFeeNum > 0) referralFeeParts.push(`External Referral Fee $${externalFeeNum.toFixed(2)}`)
    if (brokerageFeeNum > 0) referralFeeParts.push(`Brokerage Referral Fee $${brokerageFeeNum.toFixed(2)}`)
    const referralFeesTotal = Math.round((internalFeeNum + externalFeeNum + brokerageFeeNum) * 100) / 100
    const referralFeesDescription = referralFeeParts.length ? `${referralFeeParts.join('; ')} ${REFERRAL_TAG}` : null
    const internalReferralAgentId = String((body as any).internal_referral_agent_id || '')

    // Write the referral fees onto the primary agent's row. Only overwrite
    // other_fees when it is empty or was previously written by this form (the
    // tag), so office-entered custom fees are never clobbered.
    const applyReferralFeesToPrimaryTia = async (txnId: string) => {
      if (referralFeesTotal <= 0) return
      const { data: primaryRow } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('id, other_fees, other_fees_description, payment_status')
        .eq('transaction_id', txnId)
        .eq('agent_id', agentId)
        .eq('agent_role', 'primary_agent')
        .limit(1)
        .maybeSingle()
      if (!primaryRow || primaryRow.payment_status === 'paid') return
      const existingFees = parseFloat(String(primaryRow.other_fees ?? 0)) || 0
      const existingDesc = String(primaryRow.other_fees_description || '')
      const formWritten = existingDesc.includes(REFERRAL_TAG)
      if (existingFees > 0 && !formWritten) return // office-entered fees: hands off
      await supabaseAdmin
        .from('transaction_internal_agents')
        .update({ other_fees: referralFeesTotal, other_fees_description: referralFeesDescription, updated_at: now })
        .eq('id', primaryRow.id)
    }

    // Internal referral: create the receiving CRC agent's payout row (their
    // fee, their 1099). Duplicate-guarded; does not touch the pool split.
    const createInternalReferralRow = async (txnId: string) => {
      if (!(internal_referral && internalFeeNum > 0 && internalReferralAgentId)) return
      if (internalReferralAgentId === agentId) return
      const { data: existing } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('id')
        .eq('transaction_id', txnId)
        .eq('agent_id', internalReferralAgentId)
        .eq('agent_role', 'referral_agent')
        .limit(1)
        .maybeSingle()
      if (existing) return
      await supabaseAdmin.from('transaction_internal_agents').insert({
        transaction_id: txnId,
        agent_id: internalReferralAgentId,
        agent_role: 'referral_agent',
        side: tiaSideFromRep,
        agent_basis: null,
        agent_gross: internalFeeNum,
        agent_net: internalFeeNum,
        amount_1099_reportable: internalFeeNum,
        sales_volume: 0,
        units: 0,
        counts_toward_progress: false,
        payment_status: 'pending',
        funding_source: 'crc',
        lead_source: 'own',
        adjustment_notes: 'Internal referral fee reported on the compliance form; paid out of the referring deal agent\'s net.',
        updated_at: now,
      })
    }

    // Auto-create money records the office used to add by hand. Both are
    // guarded so a resubmission can never create duplicates.
    const createEcommissionDebtAndTeb = async (txnId: string) => {
      if (ecommissionNum > 0) {
        // The advance is money owed to the eCommission COMPANY, so every
        // eCommission deal gets an external payout record: it appears as a
        // payee on the CDA and the office_net math subtracts it - CRC never
        // counts pass-through repayment money as brokerage income.
        const { data: existingEcTeb } = await supabaseAdmin
          .from('transaction_external_brokerages')
          .select('id')
          .eq('transaction_id', txnId)
          .eq('brokerage_role', 'other')
          .ilike('brokerage_name', 'eCommission%')
          .limit(1)
          .maybeSingle()
        if (!existingEcTeb) {
          await supabaseAdmin.from('transaction_external_brokerages').insert({
            transaction_id: txnId,
            brokerage_role: 'other',
            brokerage_role_other: 'ecommission_repayment',
            brokerage_name: 'eCommission (Advance Repayment)',
            commission_amount: ecommissionNum,
            amount_1099_reportable: ecommissionNum,
            payment_status: 'pending',
            side: tiaSideFromRep,
            notes: isBrokerPlan
              ? 'Broker plan deal: eCommission advance repaid from brokerage net. Auto-created from the agent compliance form.'
              : 'eCommission advance repayment. Collected from the agent payout (see the matching eCommission debt) and paid out here. Auto-created from the agent compliance form.',
          })
        }
        // Regular plans also get the repayment debt on the agent (its own
        // debt type), staged at payout so the withheld amount funds the
        // external payout above. Broker plans skip it - the broker keeps no
        // commission to withhold from.
        if (!isBrokerPlan) {
          const tag = `auto:compliance-ecommission:${txnId}`
          const { data: existingDebt } = await supabaseAdmin
            .from('agent_debts')
            .select('id')
            .eq('agent_id', agentId)
            .ilike('notes', `%${tag}%`)
            .limit(1)
            .maybeSingle()
          if (!existingDebt) {
            await supabaseAdmin.from('agent_debts').insert({
              agent_id: agentId,
              debt_type: 'ecommission',
              description: `eCommission Repayment - ${resolvedAddress || 'compliance submission'}`,
              amount_owed: ecommissionNum,
              amount_paid: 0,
              date_incurred: now.slice(0, 10),
              status: 'outstanding',
              record_type: 'debt',
              notes: `Reported by agent on the compliance form. ${tag}`,
            })
          }
        }
      }
      // The external referral fee is charged to the agent's net via other_fees,
      // which recomputeOfficeNet counts as brokerage income. Without a matching
      // payout row that money stays with CRC and nobody pays the outside
      // brokerage. The form requires the name now, but never skip the row if it
      // somehow arrives empty -- fall back to a placeholder the office renames.
      const tebName = String((body as any).external_referral_brokerage_name || '').trim()
        || 'External referral brokerage (name pending)'
      if (external_referral && externalFeeNum > 0) {
        const { data: existingTeb } = await supabaseAdmin
          .from('transaction_external_brokerages')
          .select('id')
          .eq('transaction_id', txnId)
          .eq('brokerage_role', 'referral')
          .ilike('brokerage_name', tebName)
          .limit(1)
          .maybeSingle()
        if (!existingTeb) {
          await supabaseAdmin.from('transaction_external_brokerages').insert({
            transaction_id: txnId,
            brokerage_role: 'referral',
            brokerage_name: tebName,
            commission_amount: externalFeeNum,
            amount_1099_reportable: externalFeeNum,
            payment_status: 'pending',
            side: tiaSideFromRep,
            notes: 'Auto-created from the agent compliance form. Office: complete W-9 / EIN / address at review.',
          })
        }
      }
    }
    // Same rule as isLease above, so the flyer and the data can never disagree.
    const flyerIsLease = isLease
    const flyerType = flyerIsLease ? 'just_leased' : 'just_sold'
    let flyerDisplayLine: string | null = null
    if (flyer_display_type === 'office') flyerDisplayLine = agentProfile?.office || null
    else if (flyer_display_type === 'team') flyerDisplayLine = flyer_team_name || null
    else if (flyer_display_type === 'division') flyerDisplayLine = flyer_division || null

    // Server side required fields. The browser hints on the form are easily
    // bypassed; this is the gate that actually holds. Address parts are only
    // required when no transaction was found, because that is the only case
    // where we create one.
    const missing = checkRequired(body, complianceRules(!!txn))
    if (missing.length > 0) {
      return NextResponse.json({ error: requiredFieldsError(missing) }, { status: 400 })
    }

    // Before creating a fresh transaction, look for a retainer prospect this
    // agent already has for the same client. Without this, the deal a retainer
    // was collected for gets a brand new transaction and the prospect (and its
    // retainer payout row) is orphaned forever. Mirrors the retainer path's
    // duplicate check: same query, same response shape, and the form shows the
    // matches so the agent decides.
    if (!txn && !body.confirm_new_deal && client_name?.trim()) {
      const prospectTxns = await findRetainerProspects(agentId, client_name)
      if (prospectTxns.length) {
        return NextResponse.json({ success: false, duplicate_check: true, matches: prospectTxns })
      }
    }

    // Address, normalized once and used for both the transaction and the
    // submission record, so they can never disagree. A prospect's
    // property_address is a placeholder (the client's name from the retainer),
    // so when attaching to one, the address the agent just entered wins.
    const addrParts = normalizeAddressComponents({
      street_address: body.street_address,
      unit: body.unit || unit,
      city: body.city,
      state: body.state,
      zip: body.zip,
    })
    const resolvedAddress =
      (txn && txn.status !== 'prospect' ? txn.property_address : null) ||
      buildDisplayAddress(addrParts) ||
      normalizeAddressForStorage(property_address || '') ||
      txn?.property_address

    // The retainer-prospect check above only looks at this agent's own retainer
    // rows, matched on client name. It cannot see a deal already created for
    // this property by the Under Contract form, by the Payload commission
    // webhook, or by another agent, so an address that already exists still got
    // a second transaction. This checks the resolved address brokerage-wide.
    // It runs only when no transaction was found, which is the sole branch that
    // creates one, and only before the agent has confirmed.
    if (!txn && !body.confirm_new_deal) {
      const addressMatches = await findDuplicateTransactions(resolvedAddress)
      if (addressMatches.length) {
        // The matches are annotated, never auto-picked.
        //
        // 409 S 12th St Unit B carries four deals across six months: a March
        // lease, a July listing and an August lease, all with the identical
        // address key. Courtney was on the March one and the August one, both
        // as landlord. Tested against all 18 historical duplicates, a rule that
        // narrows on side + open + not-already-filed resolves to exactly one
        // deal in only 3 to 5 of them, and on THIS one the single survivor is
        // the March lease - the wrong deal. So the app annotates and the person
        // chooses; it never chooses for them.
        //
        // What was missing was not a decision, it was the information to make
        // one: three rows reading "409 S 12th St, Unit B" with a status, and
        // create-new as the easiest button on the screen.
        const ids = addressMatches.map(m => m.id)
        const { data: myRows } = await supabaseAdmin
          .from('transaction_internal_agents')
          .select('transaction_id, side, agent_role')
          .eq('agent_id', agentId)
          .in('transaction_id', ids)
        const mineByTxn = new Map<string, any>()
        for (const r of myRows || []) {
          if (r.transaction_id && !mineByTxn.has(r.transaction_id)) mineByTxn.set(r.transaction_id, r)
        }
        // Which sides have already filed compliance, and who filed them, so a
        // deal can say "tenant side filed by Dashi Jenkins" instead of only a
        // status. This is what tells the two leases at one unit apart.
        const { data: filedRows } = await supabaseAdmin
          .from('agent_form_submissions')
          .select('transaction_id, agent_id, data')
          .in('transaction_id', ids)
          .filter('data->>submission_mode', 'eq', 'compliance')
        const filerIds = Array.from(new Set((filedRows || []).map((r: any) => r.agent_id).filter(Boolean)))
        const { data: filerUsers } = filerIds.length
          ? await supabaseAdmin
              .from('users')
              .select('id, first_name, last_name, preferred_first_name, preferred_last_name')
              .in('id', filerIds)
          : { data: [] as any[] }
        const filerName = new Map<string, string>()
        for (const u of filerUsers || []) {
          filerName.set(
            u.id,
            `${(u as any).preferred_first_name || u.first_name || ''} ${(u as any).preferred_last_name || u.last_name || ''}`.trim()
          )
        }
        const filedByTxn = new Map<string, { side: string; agent_name: string }[]>()
        for (const r of filedRows || []) {
          const side = String((r as any)?.data?.representing || '').toLowerCase().trim()
          if (!r.transaction_id || !side) continue
          const list = filedByTxn.get(r.transaction_id) || []
          if (!list.some(x => x.side === side)) {
            list.push({ side, agent_name: filerName.get(r.agent_id as string) || 'another agent' })
          }
          filedByTxn.set(r.transaction_id, list)
        }
        const annotated = addressMatches.map(m => {
          const mine = mineByTxn.get(m.id) || null
          return {
            ...m,
            is_yours: !!mine,
            your_side: mine?.side || null,
            your_role: mine?.agent_role || null,
            sides_filed: filedByTxn.get(m.id) || [],
          }
        })
        // The agent's own deals first. Ordering is a display aid, not an answer.
        annotated.sort((a, b) => (a.is_yours === b.is_yours ? 0 : a.is_yours ? -1 : 1))
        return NextResponse.json({ success: false, duplicate_check: true, matches: annotated })
      }
    }

    const submissionData = {
      submission_mode: 'compliance', property_address: resolvedAddress,
      team_or_office, unit: unit || null, in_matrix, mls_link, client_name, client_email, client_phone: client_phone || null,
      lead_source, closing_or_movein_date, acceptance_date: acceptance_date || null, representing,
      tenant_transaction_type: tenant_transaction_type || null, lease_term_months: lease_term_months || null,
      referred_client_type: referred_client_type || null, commission_basis_price, commission_rate,
      commission_rate_type, total_sales_rent_price, bonus_btsa_amount: bonus_btsa_amount || 0,
      additional_compensation: additional_compensation || [], rebate_amount: rebate_amount || 0,
      internal_referral: internal_referral || false, internal_referral_fee: internal_referral_fee || null,
      external_referral: external_referral || false, external_referral_fee: external_referral_fee || null,
      brokerage_referral: brokerage_referral || false, brokerage_referral_fee: brokerage_referral_fee || null,
      title_officer_name, title_company, title_company_email, loan_type,
      bedrooms: bedrooms || null, bathrooms: bathrooms || null, garage: garage || null, sqft: sqft || null,
      flyer_display_type, flyer_display_line: flyerDisplayLine, additional_notes: additional_notes || null,
    }

    let transactionId: string
    const txnStats = normalizePropertyStats({ bedrooms, bathrooms, garage, sqft })
    const txnFields = {
      representing, tenant_transaction_type: tenant_transaction_type || null,
      bedrooms: txnStats.bedrooms,
      bathrooms: txnStats.bathrooms,
      garage: txnStats.garage,
      building_sqft: txnStats.building_sqft,
      lease_term: lease_term_months ? parseInt(lease_term_months) : null,
      closing_date: isLease ? null : closing_or_movein_date || null,
      move_in_date: isLease ? closing_or_movein_date || null : null,
      acceptance_date: acceptance_date || null,
      mls_link: mls_link || null, client_name: client_name ? formatNameToTitleCase(String(client_name).trim()) : null, client_email: client_email || null,
      lead_source: lead_source || null, loan_type: loan_type || null,
      sales_price: basisPriceNum > 0 ? basisPriceNum : null,
      monthly_rent: isLease && basisPriceNum > 0 ? basisPriceNum : null,
      sales_volume: volumeNum > 0 ? volumeNum : null,
      gross_commission: computedGross,
      ...sideCommissionFields,
      bonus_amount: btsaNum,
      has_btsa: btsaNum > 0,
      btsa_amount: btsaNum,
      rebate_amount: rebateNum,
      has_ecommission: ecommissionNum > 0,
      ecommission_amount: ecommissionNum > 0 ? ecommissionNum : null,
      internal_referral_fee_type: (body as any).internal_referral_fee_type || 'flat',
      external_referral_fee_type: (body as any).external_referral_fee_type || 'flat',
      brokerage_referral_fee_type: (body as any).brokerage_referral_fee_type || 'flat',
      internal_referral: internal_referral || false, internal_referral_fee: internalFeeNum,
      external_referral: external_referral || false, external_referral_fee: externalFeeNum,
      brokerage_referral: brokerage_referral || false, brokerage_referral_fee: brokerageFeeNum,
      title_officer_name: title_officer_name ? formatNameToTitleCase(String(title_officer_name).trim()) : null,
      title_company: title_company ? toTitleCase(String(title_company).trim()) : null,
      title_company_email: title_company_email || null, flyer_division: flyerDisplayLine,
      client_phone: client_phone || null,
      title_officer_phone: title_phone || null,
      unit: addrParts.unit || null,
      expedite_requested: !!expedite_acknowledged,
      compliance_status: 'submitted', compliance_submitted_at: now, compliance_submitted_by: agentId, updated_at: now,
    }

    // Sides on this deal the office has already signed off. Read before any
    // write, because both of the guards below depend on it.
    //
    // A side is locked by its own COMPLETE submission rather than by a column:
    // agent_form_submissions.status is what the tracker and the status
    // derivation already read, so a lock derived from it can never disagree
    // with what the office sees on screen, and there is no new column to keep
    // in step.
    const completedSides = new Set<string>()
    if (txn) {
      const { data: completedRows } = await supabaseAdmin
        .from('agent_form_submissions')
        .select('data')
        .eq('transaction_id', txn.id)
        .eq('status', 'complete')
        .filter('data->>submission_mode', 'eq', 'compliance')
      for (const r of completedRows || []) {
        const rep = String((r as any)?.data?.representing || '').toLowerCase().trim()
        if (rep) completedSides.add(rep)
      }
    }
    const thisSide = String(representing || '').toLowerCase().trim()
    // Locked when THIS side is signed off. Another side being complete does not
    // lock this one: on an intermediary deal the second agent still has to be
    // able to file.
    const sideLocked = !!thisSide && completedSides.has(thisSide)

    if (!txn) {
      const { data: newTxn, error: createErr } = await supabaseAdmin.from('transactions')
        .insert({
          property_address: resolvedAddress,
          street_address: addrParts.street_address || null,
          city: addrParts.city || null,
          state: addrParts.state || null,
          zip: addrParts.zip || null,
          status: 'pending', submitted_by: agentId, transaction_type: feeCodeFromRepresenting(representing, tenant_transaction_type) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'),
          // On a NEW deal the answer is written either way: there is no office
          // value to protect yet, and a deal created as "we hold both sides"
          // must expect two sides from the start.
          is_intermediary: crc_both_sides === true,
          ...txnFields,
        })
        .select('id').single()
      if (createErr || !newTxn) { console.error('Failed to create transaction:', createErr); return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 }) }
      transactionId = newTxn.id
      await supabaseAdmin.from('transaction_internal_agents').insert({ transaction_id: transactionId, agent_id: agentId, agent_role: 'primary_agent', side: tiaSideFromRep, btsa_amount: btsaNum, rebate_amount: rebateNum, sales_volume: volumeNum > 0 ? volumeNum : null, units: 1, lead_source: lead_source || 'own', updated_at: now })
      // New deal from a compliance submission: cascade immediately so the
      // commission tab is populated without waiting for a manual Recalculate.
      // Money records first, cascade last: the cascade's office_net recompute
      // must see the referral fees, the eCommission records, and the internal
      // referral payout row, or office_net is stale until the next recalc.
      await applyReferralFeesToPrimaryTia(transactionId)
      await createEcommissionDebtAndTeb(transactionId)
      await createInternalReferralRow(transactionId)
      await autoCascadeTransaction(transactionId)
    } else {
      transactionId = txn.id
      // A signed-off side is treated exactly as a locked transaction always
      // has been: the submission is recorded, the office is told, and NOTHING
      // on the deal is rewritten. Before this, a resubmission on an approved
      // side overwrote the deal's price, gross commission, that side's
      // commission, client details, dates, the agent's BTSA and rebate, and
      // stamped compliance_status back to 'submitted' - all without anyone in
      // the office touching it. On 3006 Brooks Ct that happened three times.
      if (txn.is_locked || sideLocked) {
        const lockReason = txn.is_locked
          ? `transaction is locked`
          : `the ${representing} side is already signed off`
        await supabaseAdmin.from('agent_form_submissions').insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: { ...submissionData, locked_transaction: true, locked_reason: txn.is_locked ? 'transaction' : 'side_complete' }, updated_at: now })
        const notifyHtml = getEmailLayout(`<p style="font-size:14px;color:#555;">Compliance submission for <strong>${txn.property_address}</strong> - ${lockReason}. Manual review required.</p>${buildFormAnswersHtml(submissionData)}`, { title: 'Locked Transaction - Compliance Submission', preheader: `Locked: ${txn.property_address}` })
        await sendNotifications(notificationEmails, 'Compliance Submission (Locked)', notifyHtml, txn.property_address)
        return NextResponse.json({ success: true, transaction_id: transactionId, locked: true, message: 'Your compliance request has been received. Because this transaction has been reviewed by the office, any updates will be applied manually. No action is needed from you.' })
      }
      // Attaching to a retainer prospect: give it the real property address the
      // agent just entered, the deal's actual type, and move it out of prospect
      // status so it shows up as a live deal. A regular existing transaction
      // keeps its address and status untouched, exactly as before.
      const attachAddress = txn.status === 'prospect' ? buildDisplayAddress(addrParts) : null
      const attachFields = txn.status === 'prospect'
        ? {
            ...(attachAddress
              ? {
                  property_address: attachAddress,
                  street_address: addrParts.street_address || null,
                  city: addrParts.city || null,
                  state: addrParts.state || null,
                  zip: addrParts.zip || null,
                }
              : {}),
            status: 'pending',
            transaction_type: feeCodeFromRepresenting(representing, tenant_transaction_type) || (isLease ? 'tenant_non_apt_v2' : 'buyer_v2'),
          }
        : {}
      // An already-approved side elsewhere on the deal means this deal's
      // compliance status is no longer this submission's to set. txnFields
      // carries compliance_status: 'submitted', so on an intermediary deal the
      // second side filing would knock the first side's sign-off back to
      // submitted. The status derivation is the single source of truth for the
      // deal's column (lib/compliance/derive.ts says so in its header); the
      // set-status route writes it. So drop the stamp here and leave the column
      // where the office's last sign-off put it.
      const statusStamp: Record<string, any> =
        completedSides.size > 0
          ? {}
          : {
              compliance_status: txnFields.compliance_status,
              compliance_submitted_at: txnFields.compliance_submitted_at,
              compliance_submitted_by: txnFields.compliance_submitted_by,
            }
      const { compliance_status: _cs, compliance_submitted_at: _csa, compliance_submitted_by: _csb, ...txnFieldsNoStatus } = txnFields
      // Only ever set intermediary ON from the form. The agent knows whether
      // CRC has both sides; they do not get to clear a flag the office set,
      // so an unchecked box leaves the column alone rather than writing false.
      const intermediaryField = crc_both_sides === true ? { is_intermediary: true } : {}
      await supabaseAdmin
        .from('transactions')
        .update({ ...txnFieldsNoStatus, ...statusStamp, ...intermediaryField, ...attachFields })
        .eq('id', transactionId)
      // BTSA and rebate live on the agent's commission row - the payout math
      // reads them there. Never touch a row that has already been paid.
      await supabaseAdmin
        .from('transaction_internal_agents')
        .update({ btsa_amount: btsaNum, rebate_amount: rebateNum, updated_at: now })
        .eq('transaction_id', transactionId)
        .eq('agent_id', agentId)
        .eq('agent_role', 'primary_agent')
        .neq('payment_status', 'paid')
      // Attaching a compliance submission to an existing deal: make sure the
      // submitting agent has a primary tia row (NULL commission fields until
      // a basis exists), then cascade with the freshly written inputs.
      await ensurePrimaryTia(transactionId, agentId)
      // Keep the agent row's volume/units/lead source current on attach too.
      await supabaseAdmin
        .from('transaction_internal_agents')
        .update({ sales_volume: volumeNum > 0 ? volumeNum : null, units: 1, lead_source: lead_source || 'own', side: tiaSideFromRep, updated_at: now })
        .eq('transaction_id', transactionId)
        .eq('agent_id', agentId)
        .eq('agent_role', 'primary_agent')
        .neq('payment_status', 'paid')
      // Money records first, cascade last: the cascade's office_net recompute
      // must see the referral fees, the eCommission records, and the internal
      // referral payout row, or office_net is stale until the next recalc.
      await applyReferralFeesToPrimaryTia(transactionId)
      await createEcommissionDebtAndTeb(transactionId)
      await createInternalReferralRow(transactionId)
      await autoCascadeTransaction(transactionId)
    }

    // ── Contacts: upsert client + title for both new and existing transactions ─
    // Client type derives from representation; title from the title fields.
    const clientContactType =
      representing === 'seller' ? 'seller'
      : representing === 'commercial_seller' ? 'seller'
      : representing === 'business_seller' ? 'seller'
      : representing === 'landlord' ? 'landlord'
      : representing === 'tenant' ? 'tenant'
      : representing === 'referred_out' ? null
      : 'buyer'
    async function upsertContact(contactType: string, fields: { name: string | null; company: string | null; email: string | null; phone: string | null }) {
      if (!fields.name && !fields.company && !fields.email && !fields.phone) return
      const { data: existing } = await supabaseAdmin
        .from('transaction_contacts')
        .select('id')
        .eq('transaction_id', transactionId)
        .eq('contact_type', contactType)
        .maybeSingle()
      if (existing) {
        await supabaseAdmin.from('transaction_contacts')
          .update({ name: fields.name, company: fields.company, email: fields.email, phone: fields.phone, updated_at: now })
          .eq('id', existing.id)
      } else {
        await supabaseAdmin.from('transaction_contacts')
          .insert({ transaction_id: transactionId, contact_type: contactType, name: fields.name, company: fields.company, email: fields.email, phone: fields.phone })
      }
    }
    if (clientContactType) {
      await upsertContact(clientContactType, { name: client_name || null, company: null, email: client_email || null, phone: client_phone || null })
    }
    await upsertContact('title_company', { name: title_officer_name || null, company: title_company || null, email: title_company_email || null, phone: title_phone || null })

    const { data: submission } = await supabaseAdmin.from('agent_form_submissions')
      .insert({ form_id: formRecord?.id || null, agent_id: agentId, submitted_at: now, status: 'submitted', transaction_id: transactionId, data: submissionData, updated_at: now })
      .select('id').single()
    // Flyer: triggers_flyer on the forms row decides WHETHER a flyer is made.
    // This form is the one case with a dynamic type (just_sold vs just_leased
    // depending on the deal), so it passes the type as an override and its
    // forms.flyer_type stays null.
    await createFlyerFromForm({
      form: formRecord as any,
      transactionId,
      agentId,
      flyerDivision: flyerDisplayLine,
      typeOverride: flyerType,
    })

    const notifyHtml = getEmailLayout(
      `<p style="margin:0 0 16px;font-size:14px;color:#555555;">New compliance request for <strong style="color:#1a1a1a;">${submissionData.property_address}</strong>.</p>
       <div style="background-color:#f9f9f9;padding:16px 20px;margin:0 0 20px;border-left:3px solid #C5A278;">
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Agent:</strong> ${agentName}</p>
         <p style="margin:0 0 6px;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Closing/Move-in:</strong> ${closing_or_movein_date || 'N/A'}</p>
         <p style="margin:0;font-size:13px;color:#555555;"><strong style="color:#1a1a1a;">Representing:</strong> ${representing || 'N/A'}</p>
       </div>
       <p style="text-align:center;margin:24px 0 0;"><a href="${appUrl}/admin/compliance" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">View in Compliance Dashboard</a></p>`,
      { title: 'New Compliance Request', preheader: `Compliance for ${submissionData.property_address}` }
    )
    await sendNotifications(notificationEmails, 'Compliance & CDA Request', notifyHtml, submissionData.property_address || '')
    // Deep link to this form's own flyer tab (just_sold or just_leased). Only
    // when the form actually creates a flyer; otherwise the email and the
    // success screen would promise one that never exists.
    const flyerUrl = formRecord?.triggers_flyer ? `${appUrl}/agent/flyer/${transactionId}?type=${flyerType}` : null
    try {
      const ccList = notificationEmails.filter(e => e?.trim()).map(e => e.trim())
      const flyerParagraphs = flyerUrl
        ? `<p style="margin:0 0 16px;font-size:14px;color:#555555;">To receive your Just ${flyerIsLease ? 'Leased' : 'Sold'} flyer, please upload a property photo.</p>
           <p style="text-align:center;margin:24px 0 0;"><a href="${flyerUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">Upload Photo &amp; Get Your Flyer</a></p>`
        : ''
      await resend.emails.send({ from: FROM_EMAIL, to: [agentEmail], ...(ccList.length ? { cc: ccList } : {}), subject: `Compliance Request Received - ${submissionData.property_address}`,
        html: getEmailLayout(
          `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Your compliance review and CDA request for <strong style="color:#1a1a1a;">${submissionData.property_address}</strong> has been received. Our team will review your documents and follow up shortly.</p>
           ${flyerParagraphs}
           ${buildFormAnswersHtml(submissionData, 'What You Submitted')}`,
          { title: 'Compliance Request Received', preheader: `Request received for ${submissionData.property_address}` }
        ),
      })
    } catch (err) { console.error('Failed to send agent confirmation:', err) }

    return NextResponse.json({ success: true, transaction_id: transactionId, submission_id: submission?.id || null, flyer_url: flyerUrl, message: 'Compliance request submitted successfully.' })
  } catch (err: any) {
    console.error('compliance-cda POST error:', err)
    return NextResponse.json({ error: err.message || 'Failed to submit' }, { status: 500 })
  }
}
