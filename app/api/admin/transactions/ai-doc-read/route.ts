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
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64')

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
- page_contents: list every distinct document or form found in this file with its starting page number. For a single-page file return one entry. For a packet list each form separately. If page numbers cannot be determined return an empty array.${slotListText}`

    const messageContent: any[] = []
    if (file.type === 'application/pdf') {
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } })
    } else {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: file.type, data: fileBase64 } })
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
        max_tokens: 1024,
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

    let parsed: { summary?: string; matched_slot_ids?: string[]; transaction_fields?: Record<string, any>; contacts?: any[]; page_contents?: any[] } = {}
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

    return NextResponse.json({
      summary: parsed.summary || null,
      suggested_slots,
      transaction_fields: Object.keys(transaction_fields).length > 0 ? transaction_fields : null,
      contacts: contacts.length > 0 ? contacts : null,
      page_contents,
    })
  } catch (err: any) {
    console.error('ai-doc-read error:', err)
    return NextResponse.json({ summary: null, suggested_slots: [] })
  }
}
