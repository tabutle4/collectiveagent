import { supabaseAdmin } from '@/lib/supabase'
import {
  ECOMMISSION_DEBT_TYPE,
  ECOMMISSION_PAYEE_NAME,
} from '@/lib/transactions/ecommission'

/**
 * Shared CDA data loader + computation.
 *
 * This is the SINGLE source of truth for every number and label that appears
 * on a Commission Disbursement Authorization. Both the web CDA (the HTML route
 * at /api/admin/transactions/[id]/cda/[tia_id]) and the CDA PDF that gets
 * emailed to title render from the object this returns, so the two can never
 * drift. All the fetching and math here was lifted verbatim from the HTML
 * route; the route now destructures this model and keeps its HTML template
 * unchanged.
 */

/**
 * Re-exported so existing importers of this module keep working. The constant
 * now lives in lib/transactions/ecommission.ts alongside the display helpers
 * the approval screens use, so there is exactly one definition of it.
 */
export { ECOMMISSION_DEBT_TYPE }

function fmtDate(d: string | null | undefined): string {
  if (!d) return '--'
  const ds = d.includes('T') ? d : `${d}T12:00:00`
  const dt = new Date(ds)
  if (isNaN(dt.getTime())) return '--'
  return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatRole(role: string | null | undefined): string {
  if (!role) return '--'
  const map: Record<string, string> = {
    primary_agent: 'Primary Agent',
    listing_agent: 'Listing Agent',
    co_agent: 'Co-Agent',
    team_lead: 'Team Lead',
    referral_agent: 'Referral Agent',
    momentum_partner: 'Momentum Partner',
  }
  return map[role] || role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export interface CdaContact {
  contact_type: string
  name: string | null
  email: any
  phone: string | null
  company: string | null
}

/** The title officer and the title business, told apart. */
export interface TitleParty {
  /** The person to address. Null when only a business name is known. */
  repName: string | null
  /** The business. Null when only a person is known. */
  companyName: string | null
}

/**
 * Words that mark a string as a business name rather than a person's.
 * Matched on whole words so a surname like Cole or Marco is never caught.
 */
const COMPANY_NAME_HINT =
  /\b(title|escrow|closing|closings|abstract|agency|company|co|corp|corporation|inc|llc|llp|ltd|group|services|national|partners|holdings|bank|trust)\b\.?/i

function cleanName(s: string | null | undefined): string | null {
  const t = (s || '').trim()
  return t || null
}

function looksLikeCompany(s: string | null): boolean {
  return !!s && COMPANY_NAME_HINT.test(s)
}

/**
 * Split a deal's title contact into the person and the business.
 *
 * transaction_contacts is written by several flows and they do not agree on
 * what `name` holds. The compliance and under-contract forms put the title
 * OFFICER in `name` and the business in `company`, which is what we want.
 * The AI document reader is instructed "name: full name or company name" and
 * only fills `company` when it differs, so an AI-sourced or hand-entered
 * title_company row often carries the BUSINESS in `name` with `company` empty.
 * Greeting off that field produces "Hello Stewart," to Stewart Title.
 *
 * A separate title_officer contact, when one exists, is always the person, so
 * it wins. Otherwise the title_company row's name is accepted as the person
 * only when it is neither the business repeated nor business-sounding. When no
 * person can be established the rep is null and callers fall back to a neutral
 * greeting -- addressing nobody beats addressing a company as a human.
 */
export function resolveTitleParty(
  titleCompanyContact: CdaContact | undefined,
  titleOfficerContact?: CdaContact | undefined
): TitleParty {
  const officer = cleanName(titleOfficerContact?.name)
  const rowName = cleanName(titleCompanyContact?.name)
  const rowCompany = cleanName(titleCompanyContact?.company)

  const companyName = rowCompany || (looksLikeCompany(rowName) ? rowName : null)

  let repName: string | null = officer
  if (!repName && rowName) {
    const sameAsCompany = !!rowCompany && rowName.toLowerCase() === rowCompany.toLowerCase()
    if (!sameAsCompany && !looksLikeCompany(rowName)) repName = rowName
  }

  return { repName, companyName }
}

export interface CdaModel {
  agentName: string
  agencyName: string
  propertyAddr: string
  role: string
  logoUrl: string
  generatedDate: string
  // Commission figures
  listingSide: number
  buyingSide: number
  btsaTotal: number
  officeGross: number
  totalGrossCommission: number
  officeNet: number
  officeLineLabel: string
  // One line per producing agent, all of that agent's rows already combined.
  agentPayees: { name: string; amount: number }[]
  // Everyone named on the deal, including a producing agent with no payout.
  agentRoster: { name: string; role: string; license_number: string | null }[]
  // One entry per rebate on the deal, each paid to its own client.
  rebatePayees: { label: string; side: 'buyer' | 'seller' | null; amount: number }[]
  priceForDisplay: number
  priceLabel: string
  salesPricePct: string | null
  // External payouts (referral brokerages, eCommission repayments). These
  // were always subtracted from officeNet; listing them as payee lines makes
  // the CDA's payee table sum to the total gross commission.
  externalPayees: { name: string; amount: number }[]
  extraRows: { side: string; label: string; amount: number }[]
  notes: string | null
  brokerageLines: string[]
  // Related records used by the renderers
  titleContact: CdaContact | undefined
  /** Title officer vs title business, resolved once for every renderer. */
  titleParty: TitleParty
  buyerContact: CdaContact | undefined
  sellerContact: CdaContact | undefined
  agent: any
  txn: any
  settings: any
}

export type LoadCdaResult =
  | { ok: true; model: CdaModel; tia: any; agent: any; txn: any }
  | { ok: false; status: number; error: string }

/**
 * Loads every record a CDA needs and computes the disbursement figures.
 * Does NOT enforce auth — callers must have already authorized the request
 * (the HTML route checks can_view_all_transactions / TIA ownership; the
 * title send route requires an admin permission). Returns the raw tia so the
 * caller can run its own ownership check.
 */
export async function loadCdaData(id: string, tia_id: string): Promise<LoadCdaResult> {
  // Fetch TIA
  const { data: tia } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select(`
      id, agent_id, agent_role, agent_basis, split_percentage,
      agent_gross, processing_fee, brokerage_split,
      btsa_amount, rebate_amount, rebate_type, adjustment_notes
    `)
    .eq('id', tia_id)
    .eq('transaction_id', id)
    .single()

  if (!tia) return { ok: false, status: 404, error: 'Agent row not found' }

  // Fetch agent
  const { data: agent } = await supabaseAdmin
    .from('users')
    .select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office_email, license_number')
    .eq('id', tia.agent_id)
    .single()

  if (!agent) return { ok: false, status: 404, error: 'Agent not found' }

  // Fetch transaction
  const { data: txn } = await supabaseAdmin
    .from('transactions')
    .select(`
      id, property_address, transaction_type, sales_price, monthly_rent,
      closing_date, closed_date, office_gross,
      listing_side_commission, buying_side_commission,
      listing_base_commission, buying_base_commission,
      gross_commission, broker_approved_at, cda_status
    `)
    .eq('id', id)
    .single()

  if (!txn) return { ok: false, status: 404, error: 'Transaction not found' }

  // Fetch contacts -- title company, buyer/seller
  const { data: contacts } = await supabaseAdmin
    .from('transaction_contacts')
    .select('contact_type, name, email, phone, company')
    .eq('transaction_id', id)

  const titleContact = (contacts || []).find(c => c.contact_type === 'title_company')
  // A deal may also carry a dedicated title_officer contact. It is always the
  // person, so resolveTitleParty prefers it over the title_company row's name.
  const titleOfficerContact = (contacts || []).find(c => c.contact_type === 'title_officer')
  const titleParty = resolveTitleParty(titleContact, titleOfficerContact)
  const buyerContact = (contacts || []).find(c => c.contact_type === 'buyer' || c.contact_type === 'tenant')
  const sellerContact = (contacts || []).find(c => c.contact_type === 'seller' || c.contact_type === 'landlord')

  // Fetch additional income rows
  const { data: additionalIncomeRows } = await supabaseAdmin
    .from('transaction_additional_income')
    .select('side, label, amount')
    .eq('transaction_id', id)
    .order('created_at', { ascending: true })

  // Fetch company settings
  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('agency_name, brokerage_address_line1, brokerage_address_line2, brokerage_city, brokerage_state, brokerage_zip, brokerage_main_email')
    .limit(1)
    .maybeSingle()

  const agentName = `${agent.preferred_first_name || agent.first_name || ''} ${agent.preferred_last_name || agent.last_name || ''}`.trim()
  const agencyName = settings?.agency_name || 'Collective Realty Co.'
  const propertyAddr = txn.property_address || '--'

  // A CDA must show the total we pay each party on the deal, not just the
  // clicked card. The additional-comp flow creates extra co_agent rows (same
  // agent_id) that carry agent_net only. Gather every row for this agent,
  // anchor role/BTSA/rebate on the primary row, and total the agent payout.
  const CDA_ROLE_PRIORITY: Record<string, number> = { primary_agent: 0, listing_agent: 1, co_agent: 2 }
  const PRODUCING_ROLES = ['primary_agent', 'listing_agent', 'co_agent']
  const { data: allTiaRowsRaw } = await supabaseAdmin
    .from('transaction_internal_agents')
    .select('id, agent_id, agent_role, agent_gross, agent_net, amount_1099_reportable, btsa_amount, rebate_amount, rebate_type, brokerage_split')
    .eq('transaction_id', id)
  const allTiaRows = (allTiaRowsRaw && allTiaRowsRaw.length > 0) ? allTiaRowsRaw : [tia]
  const agentTiaRows = allTiaRows.filter(r => r.agent_id === tia.agent_id)
  const primaryTiaRow = [...agentTiaRows].sort(
    (a, b) => (CDA_ROLE_PRIORITY[a.agent_role] ?? 9) - (CDA_ROLE_PRIORITY[b.agent_role] ?? 9)
  )[0]
  // What the agent is actually disbursed. Base rows pay amount_1099 (the split
  // AFTER processing/coaching/other fees, BTSA and rebate) - NOT agent_gross,
  // which is the raw split before fees. Debts are subtracted separately below
  // and moved to the office line, so we use the pre-debt 1099 here (1099 minus
  // debts = agent_net). Additional co_agent rows carry their net amount
  // directly. Fall back to agent_net only if 1099 wasn't stored.
  const rowAgentDisburse = (r: any): number => {
    const g = Number(r.agent_gross || 0)
    if (g <= 0) return Number(r.agent_net || 0)
    return r.amount_1099_reportable != null ? Number(r.amount_1099_reportable) : Number(r.agent_net || 0)
  }
  // Office net = the office side commission minus every producing agent's
  // payout minus anything paid to outside brokerages. Because additional
  // income is already folded into the side commissions, this figure includes
  // the office's share of it automatically.
  const producingRows = allTiaRows.filter(r => PRODUCING_ROLES.includes(r.agent_role))
  const allAgentsDisburseTotal = producingRows.reduce((s, r) => s + rowAgentDisburse(r), 0)
  const { data: externalBrokerages } = await supabaseAdmin
    .from('transaction_external_brokerages')
    .select('brokerage_name, amount_1099_reportable')
    .eq('transaction_id', id)
  const externalTotal = (externalBrokerages || []).reduce(
    (s, e) => s + Number(e.amount_1099_reportable || 0), 0
  )
  const externalPayees = (externalBrokerages || [])
    .filter(e => Number(e.amount_1099_reportable || 0) > 0)
    .map(e => ({ name: e.brokerage_name || 'External brokerage', amount: Number(e.amount_1099_reportable || 0) }))
  // Amounts withheld from agents on this deal (e.g. a monthly brokerage fee
  // recovered from the check). These reduce the agent's disbursement and are
  // kept by the brokerage, so they move from the agent line to the office
  // line on the CDA.
  const producingTiaIds = producingRows.map(r => r.id)
  const { data: appliedDebtRows } = producingTiaIds.length > 0
    ? await supabaseAdmin
        .from('agent_debts')
        .select('amount_paid, offset_transaction_agent_id, debt_type, record_type')
        .in('offset_transaction_agent_id', producingTiaIds)
    : { data: [] as any[] }
  // A credit is money the brokerage owes the AGENT, so it moves the opposite
  // way from a debt: it increases the agent's disbursement and comes out of the
  // office line. Signing it like a debt sends it to the wrong party in both
  // directions. Same convention as recomputeOfficeNet in
  // lib/transactions/cascade.ts, which nets staged credits out of office_net.
  const signedApplied = (d: any): number =>
    (d.record_type === 'credit' ? -1 : 1) * Number(d.amount_paid || 0)
  const allAgentsDebts = (appliedDebtRows || []).reduce(
    (s, d) => s + signedApplied(d), 0
  )
  // Every producing agent on the deal gets exactly ONE payee line carrying all
  // of their money. An agent can hold several TIA rows on a single deal --
  // additional compensation creates extra co_agent rows against the same
  // agent_id -- and they are paid once, not once per row. Linked roles are
  // deliberately absent: they are paid inside the Collective Realty Co. line.
  const producingAgentIds = Array.from(
    new Set(producingRows.map(r => r.agent_id).filter(Boolean))
  )
  const { data: producingUsers } = producingAgentIds.length > 0
    ? await supabaseAdmin
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, license_number')
        .in('id', producingAgentIds)
    : { data: [] as any[] }
  const nameForAgent = (aid: string): string => {
    if (aid === tia.agent_id) return agentName
    const u = (producingUsers || []).find((x: any) => x.id === aid)
    if (!u) return 'Agent'
    return `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() || 'Agent'
  }
  const agentPayees = producingAgentIds
    .map(aid => {
      const rows = producingRows.filter(r => r.agent_id === aid)
      const rowIds = new Set(rows.map(r => r.id))
      const disburse = rows.reduce((s, r) => s + rowAgentDisburse(r), 0)
      const withheld = (appliedDebtRows || []).reduce(
        (s, d) => rowIds.has(d.offset_transaction_agent_id) ? s + signedApplied(d) : s, 0
      )
      return {
        name: nameForAgent(aid),
        amount: Math.max(0, Math.round((disburse - withheld) * 100) / 100),
      }
    })
    .filter(p => p.amount > 0)
  // Everyone named on the deal, for the Agent Information block. Separate from
  // agentPayees because a producing agent with a zero payout still belongs on
  // the document. Role is the agent's highest-priority row.
  const agentRoster = producingAgentIds.map(aid => {
    const rows = producingRows.filter(r => r.agent_id === aid)
    const top = [...rows].sort(
      (a, b) => (CDA_ROLE_PRIORITY[a.agent_role] ?? 9) - (CDA_ROLE_PRIORITY[b.agent_role] ?? 9)
    )[0]
    const u = (producingUsers || []).find((x: any) => x.id === aid)
    return {
      name: nameForAgent(aid),
      role: formatRole(top?.agent_role),
      license_number: (aid === tia.agent_id ? agent.license_number : u?.license_number) || null,
    }
  })
  // An eCommission advance is withheld from the agent like any other staged
  // debt, but it is owed to eCommission, not kept by the brokerage, so it must
  // not sit in the office line. When the compliance form reported it there is
  // already a matching external payout row (subtracted via externalTotal) and
  // the two cancel -- only the portion with no external row behind it needs
  // correcting here, and that portion also needs its own payee line so
  // eCommission actually gets paid on the document.
  const ecommissionDebtsTotal = (appliedDebtRows || []).reduce(
    (s, d) => d.debt_type === ECOMMISSION_DEBT_TYPE && d.record_type !== 'credit'
      ? s + Number(d.amount_paid || 0) : s, 0
  )
  const ecommissionExternalTotal = (externalBrokerages || []).reduce(
    (s, e) => /^ecommission/i.test(String(e.brokerage_name ?? ''))
      ? s + Number(e.amount_1099_reportable || 0) : s, 0
  )
  const ecommissionUncovered = Math.max(
    0,
    Math.round((ecommissionDebtsTotal - ecommissionExternalTotal) * 100) / 100
  )
  if (ecommissionUncovered > 0) {
    // Fold the shortfall into the eCommission payee line already on the deal
    // instead of pushing a second line. When the advance amount is corrected on
    // the debt but not on the payout row, the two disagree by the difference,
    // and two payee rows with the same name for one advance reads as an error
    // on a document going to title. One line, correct total either way.
    const existingEcPayee = externalPayees.find(p => /^ecommission/i.test(p.name))
    if (existingEcPayee) {
      existingEcPayee.amount = Math.round((existingEcPayee.amount + ecommissionUncovered) * 100) / 100
    } else {
      externalPayees.push({ name: ECOMMISSION_PAYEE_NAME, amount: ecommissionUncovered })
    }
  }
  // A client rebate is the AGENT's money going to the client, not the
  // brokerage's. It is already subtracted inside amount_1099_reportable, so the
  // residual office calculation below would otherwise leave it sitting on the
  // Collective Realty Co. line and title would cut that money to the brokerage.
  // Total it across the deal (base rows only -- additional-comp co_agent rows
  // carry agent_net with no gross and no rebate of their own) so it can be
  // subtracted from the office line and paid to the client directly.
  const rebateRows = producingRows.filter(r => Number(r.agent_gross || 0) > 0 && Number(r.rebate_amount || 0) > 0)
  const rebateTotal = Math.round(
    rebateRows.reduce((s, r) => s + Number(r.rebate_amount || 0), 0) * 100
  ) / 100


  const role = formatRole(primaryTiaRow.agent_role)
  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'}/logo.png`
  const generatedDate = fmtDate(new Date().toISOString())

  // Commission breakdown
  const listingSide = Number(txn.listing_side_commission || 0)
  const buyingSide = Number(txn.buying_side_commission || 0)
  const btsaTotal = Number(primaryTiaRow.btsa_amount || 0)
  const officeGross = Number(txn.office_gross || 0)
  const totalGrossCommission = Number(txn.gross_commission || officeGross + btsaTotal)
  const extraRows = (additionalIncomeRows || []) as { side: string; label: string; amount: number }[]
  // Office net for the payees table: office side minus all agents (net of
  // their withholdings) minus outside brokerages. Withholdings kept by the
  // brokerage stay on the office line. Never negative.
  const officeNet = Math.max(
    0,
    // BTSA passes through to the agent (it's inside each agent's amount_1099),
    // so it must be added into the office pool too, or it gets subtracted from
    // the brokerage line without ever being added -- zeroing the office row.
    Math.round((officeGross + btsaTotal - (allAgentsDisburseTotal - allAgentsDebts) - externalTotal - ecommissionUncovered - rebateTotal) * 100) / 100
  )
  const officeSideLabel = buyingSide > 0 && listingSide === 0
    ? 'Buying'
    : listingSide > 0 && buyingSide === 0
      ? 'Listing'
      : 'Office'
  const officeLineLabel = officeSideLabel === 'Office' ? 'Office commission' : `${officeSideLabel} office commission`
  // Sale price for display; leases use monthly rent.
  const priceForDisplay = Number(txn.sales_price || 0) || Number(txn.monthly_rent || 0)
  const priceLabel = Number(txn.sales_price || 0) > 0 ? 'Sales price' : 'Monthly rent'
  const salesPricePct = priceForDisplay && officeGross
    ? ((officeGross / priceForDisplay) * 100).toFixed(2) + '%'
    : null

  // Rebate paid to the client. Deal-level, like every other line on the CDA,
  // and labelled from whichever row carries it rather than only the clicked
  // agent's row -- the money leaves the deal either way.
  // One payee line per rebate. A deal can carry a rebate on more than one side,
  // and merging them into a single line would hide who is owed what.
  const rebateLabelFor = (t: string | null | undefined, amt: number): string =>
    t === 'buyer' ? 'Buyer Rebate' : t === 'seller' ? 'Seller Rebate' : 'Client Rebate'
  const rebatePayees = rebateRows.map(r => ({
    label: rebateLabelFor(r.rebate_type, Number(r.rebate_amount || 0)),
    side: (r.rebate_type === 'buyer' || r.rebate_type === 'seller') ? r.rebate_type as 'buyer' | 'seller' : null,
    amount: Number(r.rebate_amount || 0),
  }))

  // Notes
  const notes: string | null = null

  // Brokerage address
  const brokerageLines = [
    settings?.brokerage_address_line1,
    settings?.brokerage_address_line2,
    settings?.brokerage_city && settings?.brokerage_state
      ? `${settings.brokerage_city}, ${settings.brokerage_state} ${settings.brokerage_zip || ''}`.trim()
      : null,
  ].filter(Boolean) as string[]

  const model: CdaModel = {
    agentName, agencyName, propertyAddr, role, logoUrl, generatedDate,
    listingSide, buyingSide, btsaTotal, officeGross, totalGrossCommission,
    officeNet, officeLineLabel, agentPayees, agentRoster, rebatePayees,
    priceForDisplay, priceLabel, salesPricePct, externalPayees, extraRows, notes, brokerageLines,
    titleContact, titleParty, buyerContact, sellerContact, agent, txn, settings,
  }

  return { ok: true, model, tia, agent, txn }
}

/** Resolve the title officer's email address from a title_company contact. */
export function titleContactEmail(c: CdaContact | undefined): string | null {
  if (!c || !c.email) return null
  if (Array.isArray(c.email)) {
    const first = c.email[0]
    if (!first) return null
    return typeof first === 'string' ? first : (first.value || null)
  }
  return typeof c.email === 'string' ? c.email : null
}
