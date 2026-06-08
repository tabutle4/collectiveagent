import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Claude reads a compliance document and returns:
//   summary       — plain-English description for Leah to verify
//   suggested_slots — array of required_document IDs this file likely covers
//
// A single file may cover multiple slots (e.g. a combined IABS + Disclosure form).
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ summary: null, suggested_slots: [] })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const transactionId = formData.get('transaction_id') as string | null

    if (!file) return NextResponse.json({ summary: null, suggested_slots: [] })

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowedTypes.includes(file.type) || file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ summary: null, suggested_slots: [] })
    }

    // Load the required docs list for this transaction type so Claude can match against it
    let requiredDocsList: { id: string; name: string }[] = []
    if (transactionId) {
      const { data: txn } = await supabase
        .from('transactions')
        .select('transaction_type')
        .eq('id', transactionId)
        .single()

      if (txn?.transaction_type) {
        const { data: pft } = await supabase
          .from('processing_fee_types')
          .select('id')
          .eq('code', txn.transaction_type)
          .maybeSingle()

        if (pft) {
          const { data: rds } = await supabase
            .from('required_documents')
            .select('id, name')
            .eq('processing_fee_type_id', pft.id)
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          requiredDocsList = rds || []
        }
      }
    }

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64')

    // Detect the true media type from magic bytes. Browsers/OneDrive sometimes report
    // the wrong file.type (e.g. a JPEG labeled image/png), which the Claude API rejects
    // with a 400. Sniffing the bytes is authoritative.
    const sniffMediaType = (b: Uint8Array, fallback: string): string => {
      if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
      if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
      if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
      if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
        && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
      if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf'
      return fallback
    }
    const realMediaType = sniffMediaType(bytes, file.type)
    const isPdfReal = realMediaType === 'application/pdf'

    const slotListText = requiredDocsList.length > 0
      ? `\n\nRequired document slots for this transaction:\n${requiredDocsList.map((r, i) => `${i + 1}. [${r.id}] ${r.name}`).join('\n')}`
      : ''

    const prompt = `You are a compliance reviewer assistant for a real estate brokerage. Read this document and respond with valid JSON only (no markdown, no extra text):

{
  "summary": "<3-5 sentence plain-English summary: what type of document, parties involved, key dates, dollar amounts or compensation terms, whether signatures are present>",
  "matched_slot_ids": ["<id from the slot list that this document satisfies>"],
  "transaction_fields": {
    "property_address": "<full property address including unit if visible, else null>",
    "sales_price": <number or null - contract/purchase price for sales transactions>,
    "closing_date": "<YYYY-MM-DD or null - scheduled closing date>",
    "monthly_rent": <number or null - monthly rent amount for lease transactions>,
    "lease_term": <number or null - lease term in months>,
    "move_in_date": "<YYYY-MM-DD or null - move-in or lease start date>",
    "title_company": "<title company name if visible, else null>",
    "commission_amount": <number or null - total commission or invoice amount due to CRC>,
    "tenant_name": "<tenant full name if visible, else null>",
    "payer_name": "<name or company paying the commission (title company, property management co, etc), else null>",
    "payer_email": "<payer email if visible, else null>",
    "agent_name": "<agent name listed on the document if visible, else null>",
    "seller_name": "<seller or landlord full name(s) if visible, else null>",
    "seller_email": "<seller or landlord email if visible, else null>",
    "listing_price": <number or null - asking price or monthly rent from a listing agreement>
  },
  "contacts": [
    {
      "contact_type": "<one of: buyer, seller, tenant, landlord, title_company, title_officer, lender, loan_officer, attorney, inspector, appraiser, cooperating_agent, property_manager, hoa, other>",
      "name": "<full name or company name>",
      "email": "<email address if visible, else null>",
      "phone": "<phone number if visible, else null>",
      "company": "<company name if person belongs to one and it differs from name, else null>"
    }
  ],
  "page_contents": [
    {
      "page": <page number 1-indexed>,
      "document_name": "<name of the document or form on this page, e.g. 'One to Four Family Residential Contract', 'IABS Notice', 'Third Party Financing Addendum', 'Seller Disclosure Notice'>",
      "notes": "<1 sentence key detail, e.g. 'Signature page', 'Contains buyer financing terms', 'Unsigned'>"
    }
  ],
  "verification_checklist": [
    {
      "page": <page number this item is on>,
      "category": "<one of: empty_field, wrong_info, missing_signature, missing_initial, commission>",
      "item": "<what to verify, e.g. 'Buyer signature line', 'Effective date', 'Option fee amount'>",
      "finding": "<what you observed: 'blank', 'present', 'appears unsigned', 'value is $X', 'does not match property address elsewhere'>",
      "needs_review": <true | false - true if Leah should manually verify this>
    }
  ],
  "commission_details": [
    {
      "page": <page number>,
      "label": "<what this dollar figure is, e.g. 'Total sales commission', 'Listing side', 'Buyer side', 'CRC portion', 'Co-op brokerage', 'Referral fee', 'Invoice total'>",
      "amount": <number>,
      "source_doc": "<which form/document on that page this came from>"
    }
  ]
}

Rules:
- summary must be specific and factual. If something is unclear, say so. Do not invent information.
- matched_slot_ids: list the IDs of ALL slots this document satisfies. A single file may cover multiple slots.
- Only include IDs from the provided slot list. If no slot matches, return an empty array.
- Common patterns: a sales contract PDF often also contains the Third-Party Financing Addendum; an IABS form may be combined with Disclosure of Relationship.
- transaction_fields: extract only values clearly visible in the document. Use null for anything not present or unclear. Do not guess.
- For transaction_fields numbers (sales_price, monthly_rent, lease_term, commission_amount): return as a number, not a string.
- commission_amount: use the total balance due or invoice total — this is the amount CRC will receive.
- payer_name: the "TO" or bill-to party on invoices; the title company on HUD/settlement statements.
- Common document types: purchase contract (has sales_price, closing_date), lease agreement (has monthly_rent, lease_term, move_in_date), commission invoice (has commission_amount, payer_name, tenant_name), settlement statement (has sales_price, commission_amount, closing_date), listing agreement (has listing_price as the asking price/rent, seller_name as the landlord/seller, seller_email, property_address, agent_name).
- For listing agreements: seller_name = the landlord or seller party, listing_price = the asking monthly rent or sales price listed in the agreement.
- Lease forms accepted as 'Final Lease Agreement': TAA (Texas Apartment Association), TAR Residential Lease (TAR 2001), SimplyHome Lease, commercial lease, any PM company lease. They look completely different from each other - all are valid. Identify what type it is in your summary.
- For apartment tenant (tenant_apt_v2) transactions: the required file is an Invoice from the apartment/PM company, NOT a lease. Do not look for a lease.
- 'Agreement Between Brokers' and 'Compensation Agreement Between Brokers TXR 2402' are the same document type.
- IABS Form = Information About Brokerage Services (TREC OP-K), usually 1 page with brokerage relationship disclosures.
- Seller Disclosures = Seller's Disclosure Notice (TREC OP-H), seller's known property condition disclosures.
- Post Closing documents (survey, settlement statement, buyer walk-through) are submitted after closing - normal to be missing on active transactions.
- contacts: list every non-agent party visible in this document (buyers, sellers, tenants, landlords, title company, title officer, lenders, loan officers, attorneys, inspectors, appraisers, cooperating agents, property managers, HOA contacts). Do NOT include the CRC listing/buyer agent - only the other parties. Use null for any field not clearly visible. Return an empty array if no contacts are found.
- contacts contact_type: use "title_company" for the company (e.g. "First American Title"), "title_officer" for the individual officer. Use "loan_officer" for the individual lender contact, "lender" for the lending institution. Use "cooperating_agent" for the agent on the other side of the deal. Use "landlord" when the seller is a landlord on a lease.
- page_contents: list every distinct document or form found in this file with its starting page number. For a single-page file return one entry. For a packet list each form separately. If page numbers cannot be determined return an empty array.
- verification_checklist: this is the most important output. Leah manually verifies every document. For EACH page, list specific items she should check, with the page number so she can jump straight to it. Cover four things: (1) empty_field - any required field that is blank or incomplete; (2) wrong_info - any value that looks inconsistent with other parts of the document or with the property/parties (e.g. a name spelled differently, a date out of order, an address mismatch); (3) missing_signature and missing_initial - every signature and initial line, noting whether it appears signed/initialed or blank; (4) commission - every commission, fee, or dollar figure that affects what CRC is paid. Set needs_review=true for anything blank, inconsistent, unsigned, or that you cannot read with confidence. Set needs_review=false for items that are clearly complete and correct. Be thorough - it is better to flag an item for human review than to miss it. Always cite the exact page number.
- commission_details: extract EVERY dollar figure related to commission, fees, splits, or payouts across all pages, each with its page number and a label, so Leah can compare figures across documents (e.g. the commission on the contract vs the CDA vs the settlement statement). Include the total sales/lease commission, each side, the CRC portion, any co-op or referral amounts, and invoice totals. If a figure is a percentage, convert to the dollar amount only if the base is clearly stated, otherwise note it in the label. Return an empty array if no dollar figures are present.${slotListText}`

    const messageContent: any[] = []
    if (isPdfReal) {
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } })
    } else {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: realMediaType, data: fileBase64 } })
    }
    messageContent.push({ type: 'text', text: prompt })

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: messageContent }],
      }),
    })

    if (!response.ok) {
      console.error('Claude API error in ai-doc-read:', response.status)
      return NextResponse.json({ summary: null, suggested_slots: [] })
    }

    const data = await response.json()
    const text = data.content?.[0]?.text?.trim() || '{}'
    const clean = text.replace(/```json|```/g, '').trim()

    let parsed: { summary?: string; matched_slot_ids?: string[]; transaction_fields?: Record<string, any>; contacts?: any[]; page_contents?: any[]; verification_checklist?: any[]; commission_details?: any[] } = {}
    try { parsed = JSON.parse(clean) } catch { /* best-effort */ }

    // Validate suggested IDs against the real list to prevent hallucination
    const validIds = new Set(requiredDocsList.map(r => r.id))
    const suggested_slots = (parsed.matched_slot_ids || []).filter((sid: string) => validIds.has(sid))

    // Validate page_contents
    const page_contents = Array.isArray(parsed.page_contents)
      ? parsed.page_contents
          .filter((p: any) => p && typeof p.page === 'number' && p.document_name)
          .map((p: any) => ({ page: p.page, document_name: String(p.document_name), notes: p.notes || null }))
      : []

    // Validate transaction_fields — only pass through fields that have values
    const rawFields = parsed.transaction_fields || {}
    const transaction_fields: Record<string, any> = {}
    const stringFields = ['property_address', 'closing_date', 'move_in_date', 'title_company', 'tenant_name', 'payer_name', 'payer_email', 'agent_name', 'seller_name', 'seller_email']
    const numberFields = ['sales_price', 'monthly_rent', 'lease_term', 'commission_amount', 'listing_price']
    for (const f of stringFields) {
      if (rawFields[f] && typeof rawFields[f] === 'string') transaction_fields[f] = rawFields[f]
    }
    for (const f of numberFields) {
      if (rawFields[f] != null && typeof rawFields[f] === 'number' && rawFields[f] > 0) transaction_fields[f] = rawFields[f]
    }

    // Validate contacts
    const VALID_CONTACT_TYPES = new Set(['buyer', 'seller', 'tenant', 'landlord', 'title_company', 'title_officer', 'lender', 'loan_officer', 'attorney', 'inspector', 'appraiser', 'cooperating_agent', 'property_manager', 'hoa', 'other'])
    const contacts = Array.isArray(parsed.contacts)
      ? parsed.contacts
          .filter((c: any) => c && c.name && typeof c.name === 'string')
          .map((c: any) => ({
            contact_type: VALID_CONTACT_TYPES.has(c.contact_type) ? c.contact_type : 'other',
            name: String(c.name).trim(),
            email: c.email && typeof c.email === 'string' ? c.email.trim() : null,
            phone: c.phone && typeof c.phone === 'string' ? c.phone.trim() : null,
            company: c.company && typeof c.company === 'string' ? c.company.trim() : null,
          }))
      : []

    // Validate verification_checklist
    const VALID_CATEGORIES = new Set(['empty_field', 'wrong_info', 'missing_signature', 'missing_initial', 'commission'])
    const verification_checklist = Array.isArray(parsed.verification_checklist)
      ? parsed.verification_checklist
          .filter((v: any) => v && v.item && typeof v.item === 'string')
          .map((v: any) => ({
            page: typeof v.page === 'number' ? v.page : null,
            category: VALID_CATEGORIES.has(v.category) ? v.category : 'wrong_info',
            item: String(v.item).trim(),
            finding: v.finding && typeof v.finding === 'string' ? String(v.finding).trim() : null,
            needs_review: v.needs_review === true,
          }))
      : []

    // Validate commission_details
    const commission_details = Array.isArray(parsed.commission_details)
      ? parsed.commission_details
          .filter((cd: any) => cd && cd.label && typeof cd.label === 'string' && typeof cd.amount === 'number')
          .map((cd: any) => ({
            page: typeof cd.page === 'number' ? cd.page : null,
            label: String(cd.label).trim(),
            amount: cd.amount,
            source_doc: cd.source_doc && typeof cd.source_doc === 'string' ? String(cd.source_doc).trim() : null,
          }))
      : []

    return NextResponse.json({
      summary: parsed.summary || null,
      suggested_slots,
      transaction_fields: Object.keys(transaction_fields).length > 0 ? transaction_fields : null,
      contacts: contacts.length > 0 ? contacts : null,
      page_contents,
      verification_checklist,
      commission_details,
    })
  } catch (err: any) {
    console.error('ai-doc-read error:', err)
    return NextResponse.json({ summary: null, suggested_slots: [] })
  }
}
