import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_edit_transactions')
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI review not configured' }, { status: 503 })
  }

  try {
    const { transaction, agents, checklist, checks, agent_billing, payout_brokerages, mode, existing_contacts: rawExistingContacts } = await request.json()

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction data required' }, { status: 400 })
    }

    // Build a plain-text summary of the transaction for Claude to reason about
    const isLease = (t: string | null) => {
      if (!t) return false
      const lower = t.toLowerCase()
      return lower.includes('lease') || lower.includes('tenant') || lower.includes('landlord') || lower.includes('apartment')
    }

    const txnIsLease = isLease(transaction.transaction_type)

    const agentSummaries = (agents || []).map((a: any) => {
      const u = a.user
      const name = u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : a.agent_id
      const plan = a.commission_plan_friendly || u?.commission_plan || 'Unknown plan'
      const billing = a.billing || {}
      const debts = (billing.debts || []).map((d: any) => `${d.description}: $${d.amount_remaining ?? d.amount_owed}`).join(', ')
      const credits = (billing.credits || []).map((c: any) => `${c.description}: $${c.amount_remaining ?? c.amount_owed}`).join(', ')
      const licenseExp = u?.license_expiration ? new Date(u.license_expiration).toLocaleDateString() : 'unknown'
      const today = new Date()
      const expDate = u?.license_expiration ? new Date(u.license_expiration) : null
      const licenseExpired = expDate ? expDate < today : false
      const licenseExpiringSoon = expDate ? (expDate.getTime() - today.getTime()) < 60 * 24 * 60 * 60 * 1000 : false // 60 days

      const basisPct = a.split_percentage || a.basis_percentage || null
      const brokerageSplitPct = a.brokerage_split_percentage != null ? a.brokerage_split_percentage : (basisPct != null ? 100 - basisPct : null)
      const teamLeadPct = a.team_lead_percentage || null
      const agentBasis = parseFloat(a.agent_basis || 0) || parseFloat(a.agent_gross || 0)
      const brokerageSplit = parseFloat(a.brokerage_split || 0)
      const teamMembership = a.team_membership
      const teamName = teamMembership?.team?.team_name || null
      return `
Agent: ${name} (role: ${a.agent_role}, side: ${a.side || 'N/A'})${teamName ? ` [Team: ${teamName}]` : ''}
  Commission Plan: ${plan}
  Agent Basis (commission earned): $${agentBasis}
  Split: Agent ${basisPct != null ? basisPct + '%' : '?'}${teamLeadPct != null ? ` | Team Lead ${teamLeadPct}%` : ''} | Brokerage ${brokerageSplitPct != null ? brokerageSplitPct + '%' : '?'}
  Agent Gross: $${a.agent_gross || 0} | Brokerage Split $: $${brokerageSplit} | Agent Net: $${a.agent_net || 0} | Payment: ${a.payment_status || 'pending'}
  Debts Deducted: $${a.debts_deducted || 0} (reduces agent_net, NOT part of the split)
  Processing Fee: $${a.processing_fee || 0} | Coaching Fee: $${a.coaching_fee || 0}
  BTSA: $${a.btsa_amount || 0}
  Team Lead Commission: $${a.team_lead_commission || 0}
  License Expiration: ${licenseExp}${licenseExpired ? ' [EXPIRED]' : licenseExpiringSoon ? ' [EXPIRING WITHIN 60 DAYS]' : ''}
  Outstanding Debts: ${debts || 'none'}
  Credits: ${credits || 'none'}
  Referring Agent: ${a.user?.referring_agent || 'none'}
  Lead Source: ${a.lead_source || 'unknown'}`
    }).join('\n')

    const checkSummary = (checks || []).map((c: any, i: number) => {
      return `Check ${i + 1}: $${c.check_amount || 0} from "${c.check_from || 'unknown'}" | Status: ${c.status || 'received'} | Received: ${c.received_date || 'not set'} | Cleared: ${c.cleared_date || 'not set'} | Compliance complete: ${c.compliance_complete_date || 'not set'}`
    }).join('\n')

    const checklistItems = (checklist || []).map((item: any) => {
      return `- [${item.completion ? 'DONE' : 'PENDING'}] ${item.label}${item.description ? ': ' + item.description : ''}`
    }).join('\n')

    const externalAgentSummary = (payout_brokerages || []).map((b: any) =>
      `${b.brokerage_name} (${(b.brokerage_role || '').replace(/_/g, ' ')}): $${b.commission_amount || 0} - ${b.payment_status || 'pending'}`
    ).join('\n') || 'None'

    // Fetch required docs from DB and match against uploaded docs for this transaction
    let docStatusSection = ''
    try {
      if (transaction.id && transaction.transaction_type) {
        const { data: pft } = await supabase
          .from('processing_fee_types')
          .select('id, name')
          .eq('code', transaction.transaction_type)
          .maybeSingle()

        if (pft) {
          const { data: requiredDocs } = await supabase
            .from('required_documents')
            .select('id, name, is_required')
            .eq('processing_fee_type_id', pft.id)
            .eq('is_active', true)
            .order('display_order', { ascending: true })

          const { data: uploadedDocs } = await supabase
            .from('transaction_documents')
            .select('required_document_id, compliance_status')
            .eq('transaction_id', transaction.id)
            .neq('compliance_status', 'superseded')

          if (requiredDocs && requiredDocs.length > 0) {
            const lines = requiredDocs.map((rd: any) => {
              const uploads = (uploadedDocs || []).filter((u: any) => u.required_document_id === rd.id)
              let status: string
              if (uploads.length === 0) {
                status = rd.is_required ? 'MISSING (required)' : 'not uploaded (optional)'
              } else if (uploads.every((u: any) => u.compliance_status === 'approved')) {
                status = 'approved'
              } else if (uploads.some((u: any) => u.compliance_status === 'rejected')) {
                status = 'rejected'
              } else {
                status = 'pending review'
              }
              return `  - ${rd.name}: ${status}`
            })
            docStatusSection = `\nREQUIRED DOCUMENTS STATUS (live from DB - ${pft.name})\n${lines.join('\n')}`
          }
        }
      }
    } catch { /* best-effort - don't block review if this fails */ }

    const context = `
TRANSACTION SUMMARY
-------------------
Address: ${transaction.property_address || 'N/A'}
Type: ${transaction.transaction_type || 'N/A'}
Status: ${transaction.status || 'N/A'}
Compliance Status: ${transaction.compliance_status || 'not submitted'}
${txnIsLease ? `Monthly Rent: $${transaction.monthly_rent || 0} | Lease Term: ${transaction.lease_term || 'N/A'} months | Move-In: ${transaction.move_in_date || 'not set'}` : `Sales Price: $${transaction.sales_price || 0} | Closing Date: ${transaction.closing_date || 'not set'}`}
Office Gross: $${transaction.office_gross || 0}
Office Net: $${transaction.office_net || 0}
Has Internal Referral: ${transaction.internal_referral ? 'YES - $' + transaction.internal_referral_fee : 'No'}
Has External Referral: ${transaction.external_referral ? 'YES - $' + transaction.external_referral_fee : 'No'}

AGENTS ON TRANSACTION
---------------------
${agentSummaries || 'No agents'}

EXTERNAL AGENTS TO PAY (co-op brokerages or referral agents on the other side)
-----------------------------------------------------
${externalAgentSummary}
Note: "Pay Other Agent" means paying a co-op brokerage or referral agent on the OPPOSITE side of this deal (not one of CRC's own agents). If there are external agents listed above, their commission must be paid before or at closing.

CHECKS RECEIVED
---------------
${checkSummary || 'No checks recorded'}

CHECKLIST ITEMS
---------------
${checklistItems || 'No checklist'}${docStatusSection}
`

    // Contact extraction mode — identify parties from transaction data
    if (mode === 'extract_contacts') {
      const existing_contacts: any[] = rawExistingContacts || []
      const existingNames = existing_contacts.map((c: any) => c.name).filter(Boolean)

      // Fetch uploaded doc summaries so Claude can extract contacts from them
      const { data: uploadedDocs } = await supabase
        .from('transaction_documents')
        .select('file_name, compliance_notes')
        .eq('transaction_id', transaction.id)
        .not('compliance_notes', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10)

      const docSummaries = (uploadedDocs || [])
        .map((d: any) => {
          let text = ''
          try { text = JSON.parse(d.compliance_notes)?.summary || d.compliance_notes } catch { text = d.compliance_notes || '' }
          return `${d.file_name}: ${text}`
        })
        .filter(Boolean)
        .join('\n---\n')

      const contactPrompt = `You are reviewing a real estate transaction for Collective Realty Co. Extract all contact information visible in this data.

TRANSACTION: ${transaction.property_address || 'N/A'} | Type: ${transaction.transaction_type || 'N/A'}
AGENTS: ${(agents || []).map((a: any) => {
  const u = a.user
  const name = u ? `${u.preferred_first_name || u.first_name || ''} ${u.preferred_last_name || u.last_name || ''}`.trim() : ''
  return `${name} (${a.agent_role}, ${a.side || ''})`
}).join(', ')}
CHECKS FROM: ${(checks || []).map((c: any) => c.check_from).filter(Boolean).join(', ')}
PROPERTY ADDRESS: ${transaction.property_address || 'N/A'}
SALES PRICE / RENT: ${transaction.sales_price || transaction.monthly_rent || 'N/A'}
TITLE COMPANY: ${transaction.title_company || 'N/A'}
SELLER/LANDLORD NAME: ${(transaction as any).seller_name || (transaction as any).landlord_name || 'N/A'}
SELLER/LANDLORD EMAIL: ${(transaction as any).seller_email || (transaction as any).landlord_email || 'N/A'}
BUYER/TENANT NAME: ${(transaction as any).buyer_name || (transaction as any).tenant_name || 'N/A'}
BUYER/TENANT EMAIL: ${(transaction as any).buyer_email || (transaction as any).tenant_email || 'N/A'}
${docSummaries ? `\nDOCUMENT SUMMARIES (AI-extracted from uploaded files):\n${docSummaries}` : ''}
EXISTING CONTACTS ALREADY SAVED (do not duplicate): ${existingNames.length > 0 ? existingNames.join(', ') : 'none'}

Extract all non-agent parties you can identify. Return ONLY valid JSON, no markdown:
{
  "contacts": [
    {
      "contact_type": "<one of: buyer, seller, tenant, landlord, title_company, title_officer, lender, loan_officer, attorney, inspector, appraiser, cooperating_agent, property_manager, hoa, other>",
      "name": "<full name or company name>",
      "email": "<email if visible, else null>",
      "phone": "<phone if visible, else null>",
      "company": "<company name if different from name, else null>",
      "notes": "<any relevant notes, else null>"
    }
  ]
}

Rules:
- Do not include CRC agents — only the other parties (buyers, sellers, tenants, landlords, title, lender, etc.)
- Do not duplicate contacts already in EXISTING CONTACTS
- The check payer is often the title company or the buyer — include them
- If seller/landlord name or email is provided above, include them as a contact
- If buyer/tenant name or email is provided above, include them as a contact
- Use null for any field not clearly visible
- Return ONLY the JSON, no explanation`

      const contactRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          messages: [{ role: 'user', content: contactPrompt }],
        }),
      })
      const contactData = await contactRes.json()
      const contactText = contactData.content?.[0]?.text?.trim() || '{}'
      const contactClean = contactText.replace(/```json|```/g, '').trim()
      try {
        const parsed = JSON.parse(contactClean)
        return NextResponse.json({ contacts: parsed.contacts || [] })
      } catch {
        return NextResponse.json({ contacts: [] })
      }
    }

    const prompt = `You are a transaction review assistant for Collective Realty Co., a real estate brokerage. You are helping the operations officer review this transaction before paying agents.

${context}

Checklist item definitions for context:

COMMISSION MATH FORMULA (use this exactly - do not invent your own reconciliation):
- The split reconciles at the GROSS level: agent_gross + brokerage_split = office_gross. Check this. Debts, fees, and deductions are NOT part of this equation.
- amount_1099 = agent_gross + btsa_amount - processing_fee - coaching_fee - other_fees
- agent_net = amount_1099 - debts_deducted
- debts_deducted (monthly brokerage fees, owed balances, etc.) reduce what the agent is PAID. They are NOT part of the split and must NOT be added back when checking that the split reconciles to office gross. A monthly brokerage fee deduction is expected and correct, never an error.
- team_lead_commission on a primary agent row is informational only - never a deduction from that agent.
- Only flag a commission discrepancy if agent_gross + brokerage_split does not equal office_gross (allowing a few cents of rounding). Do not flag just because agent_net is lower than agent_gross - that is the deductions working as intended.

- "Pay Other Agent" = pay a co-op brokerage or external referral agent on the other side of the deal (NOT CRC agents). Check if any external agents/brokerages are listed under EXTERNAL AGENTS TO PAY.
- TEAM SPLIT NOTE: An agent with role "team_lead" receives a carved-out portion of the deal but does NOT pay another team lead fee. The "Team Lead Commission" shown on a primary agent row is informational only - it tracks what the team lead earns from that deal, not an additional deduction from the team lead themselves. Do not flag a team lead agent for "paying a team lead" - that is expected behavior, not an error.
- "Deposit Check" = verify a check has been received and deposited from the client/title company. Amount should match Office Gross.
- "Update Transaction" = ensure all transaction fields (status, dates, amounts) are accurate.
- "Commission Plan" = verify the commission plan and split % are correct for each agent.
- "Review Agent Account" = check for outstanding debts or credits that should be applied.
- "Transfer Brokerage Split" = confirm the CRC brokerage portion was transferred to the CRC account.

COLLECTIVE REALTY CO. REQUIRED DOCUMENTS BY TRANSACTION TYPE
(These are CRC's exact compliance requirements. Use this to evaluate what has been uploaded.)

BUYER (buyer_v2): Required: IABS Form, Buyer Rep Agreement, Information About Special Flood Hazard Areas, Copy of Home Inspection, For Your Protection Get A Home Inspection, Inspection Information Form, General Information & Notice to Buyer, Wire Fraud Warning, Notice To Prospective Buyers, Disclosure Of Relationship, Sales Contract, Third-Party Financing Addendum, All Applicable Amendments, Seller Disclosures, Title Commitment, Earnest & Option Funds Receipt, Buyer Walk Through & Acceptance, Post Closing: Survey, Post Closing: Final Settlement Statement | Optional: HOA Addendum, MUD District Addendum, Lead Base Paint Disclosures, Compensation Agreement TXR 2402, Referral Agreement & W9

SELLER (seller_v2): Required: IABS Form, Listing Agreement, General Notice to Seller, Wire Fraud Warning, Disclosure Of Relationship, Sales Contract, Third-Party Financing Addendum, All Applicable Amendments, Seller Disclosures, Title Commitment, Earnest & Option Funds Receipt, Post Closing: Survey, Post Closing: Final Settlement Statement | Optional: Copy of Home Inspection from other broker, HOA Addendum, MUD District Addendum, Lead Base Paint Disclosures, Compensation Agreement TXR 2402, Referral Agreement & W9, Buyer Walk Through & Acceptance

NEW CONSTRUCTION BUYER (nc_buyer_v2): Required: IABS Form, Buyer Rep Agreement, Information About Special Flood Hazard Areas, Copy of Home Inspection, For Your Protection Get A Home Inspection, Inspector Information Form, General Information & Notice to Buyer, Wire Fraud Warning, Disclosure Of Relationship, Sales Contract, All Applicable Amendments, Title Commitment, Post Closing: Survey, Post Closing: Buyer Walk Through & Acceptance, Post Closing: Final Settlement Statement | Optional: Earnest & Option Funds Receipt, Compensation Agreement TXR 2402, Referral Agreement & W9

LAND/LOT BUYER (land_buyer_v2): Required: IABS Form, Buyer Rep Agreement, Information About Special Flood Hazard Areas, General Information & Notice to Buyer, Wire Fraud Warning, Notice To Prospective Buyers, Disclosure Of Relationship, Sales Contract, All Applicable Amendments, Title Commitment, Earnest & Option Funds Receipt, Post Closing: Final Settlement Statement, Post Closing: Survey | Optional: Third-Party Financing Addendum, HOA Addendum, MUD District Addendum, Compensation Agreement TXR 2402, Referral Agreement & W9

LAND/LOT SELLER (land_seller_v2): Required: IABS Form, Buyer Rep Agreement, Information About Special Flood Hazard Areas, General Information & Notice to Buyer, Wire Fraud Warning, Notice To Prospective Buyers, Disclosure Of Relationship, Sales Contract, All Applicable Amendments, Title Commitment, Earnest & Option Funds Receipt, Compensation Agreement TXR 2402, Post Closing: Survey | Optional: Third-Party Financing Addendum, HOA Addendum, MUD District Addendum, Referral Agreement

COMMERCIAL BUYER (commercial_buyer_v2): Required: IABS Form, Commercial Buyer Rep Agreement, Commercial Property Condition Statement, General Information & Notice To Buyer/Seller, Wiring Fraud Warning, Broker Notice To Tenant/Buyer, Commercial Contract, Commercial Financing Addendum, Title Commitment, Earnest Money & Option Fee Receipt, Survey | Optional: Referral Agreement & W9

TENANT - APARTMENT (tenant_apt_v2): Required: Invoice only. IMPORTANT: Apartment transactions do NOT require a lease in the file. The PM company or apartment complex holds the lease. The invoice is the commission invoice from the complex or PM company to CRC.

TENANT - NON-APARTMENT (tenant_non_apt_v2): Required: IABS Form, Tenant Rep Agreement, Broker Notice to Tenant, Agreement Between Brokers, Final Lease Agreement | Optional: Final Pet Agreement, Confirmation of payments issued, Referral Agreement & W9

TENANT - SIMPLYHOME (tenant_simplyhome_v2): Required: IABS Form, Tenant Rep Agreement, Agreement Between Brokers | Optional: Referral Agreement & W9

TENANT - COMMERCIAL (tenant_commercial_v2): Required: IABS Form, Commercial Tenant Rep Agreement, Commission Agreement, Commercial Lease Agreement, Confirmation Of Payments Issued | Optional: Referral Agreement & W9

LANDLORD (landlord_v2): Required: IABS Form, Listing Agreement, Landlord Floodplain & Flood Notice, Addendum Regarding Rental Flood Disclosure, Final Lease Agreement, Confirmation of payments issued, Tenant Screening Confirmations or landlord waiver in writing, Lease Application from Tenant signed by Landlord, Paystubs from Tenant, Agreement Between Brokers, Other Broker W-9 | Optional: Final Pet Agreement, Referral Agreement & W9

REFERRED OUT (referred_out_v2): Required: Referral Agreement

DOCUMENT IDENTIFICATION GUIDE:
- "Final Lease Agreement" = ANY signed lease: TAA (Texas Apartment Association), TAR Residential Lease (TAR 2001), SimplyHome lease, commercial lease, or any PM company lease. They look completely different from each other. Accept any of them.
- "Sales Contract" = any TREC purchase contract (One to Four Family, New Construction, Commercial, Land). Often has addenda attached in the same PDF.
- "IABS Form" = Information About Brokerage Services (TREC OP-K), typically 1 page.
- "Seller Disclosures" = Seller's Disclosure Notice (TREC OP-H).
- "Agreement Between Brokers" and "Compensation Agreement Between Brokers TXR 2402" = same type - co-op compensation agreement.
- Post Closing documents (survey, final settlement statement, buyer walk-through) are submitted AFTER closing. Do not flag them as missing on transactions that have not closed yet.
- "Invoice" for apartment tenant = commission invoice from the apartment complex or PM company, not the lease.

Document cross-checks to perform (flag anything that does not match):
- REQUIRED DOCUMENTS: Use the REQUIRED DOCUMENTS STATUS section above. Flag any required slot that is MISSING. Note pending docs that need review. Do not flag optional docs as missing.
- CONTRACT (sales or lease): The sales_price or monthly_rent in the transaction must match what the contract says. If a check was received, the check amount should match or be explained.
- LEASE AGREEMENT: monthly_rent x lease_term should equal sales_volume. If they differ, flag it. Accept any lease form (TAA, TAR, SimplyHome, commercial, PM company) as a valid Final Lease Agreement.
- APARTMENT TENANT: Only an invoice is required - not a lease. Do not flag a missing lease for tenant_apt_v2 transactions.
- ABB (Buyer Representation Agreement): The agent's commission basis % (Agent Split %) represents what was agreed in the ABB. If an agent's agent_gross is less than expected given the sales price and their split %, flag the discrepancy.
- LISTING AGREEMENT: For listing-side agents, verify brokerage_split is consistent with the listing agreement commission rate (typically a % of sales price). If office_gross seems low relative to sales price, flag it.
- REP AGREEMENT: Any agent marked as buyer or listing agent should have a commission plan that is consistent with their representation agreement. Flag if commission plan is missing or set to an unexpected value.
- All documents: If the transaction has no checks and is marked compliance-complete, flag it as unusual.

Review each PENDING checklist item based on the transaction data above. For each item, tell me:
1. What you can confirm looks good (based on the data)
2. What is missing or needs attention
3. Any red flags or mismatches between the numbers

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{
  "overall": "<1-2 sentence overall status summary>",
  "ready_to_pay": <true | false - is everything in order to pay agents>,
  "items": [
    {
      "label": "<exact checklist item label>",
      "status": "ok" | "needs_attention" | "missing" | "flagged",
      "note": "<1-2 sentences explaining what you found or what to check>"
    }
  ],
  "flags": [
    "<any critical issues not tied to a specific checklist item - e.g. license expired, large outstanding debt>"
  ]
}

Be specific and practical. Reference actual values from the data (dollar amounts, names, dates). Do not invent information not in the data. If you cannot confirm something from the data provided, say "Cannot verify from available data - check manually."`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(`Claude API error: ${response.status} ${JSON.stringify(err)}`)
    }

    const data = await response.json()
    const text = data.content?.[0]?.text || '{}'
    const clean = text.replace(/```json|```/g, '').trim()
    const review = JSON.parse(clean)

    return NextResponse.json({ review })
  } catch (err: any) {
    console.error('AI checklist review error:', err)
    return NextResponse.json({ error: err.message || 'Review failed' }, { status: 500 })
  }
}
