// Shared Claude vision helper for compliance document extraction.
// Used by:
//   - app/api/admin/transactions/ai-doc-read/route.ts (browser upload)
//   - app/api/transactions/email-inbound/route.ts (emailed doc)
//
// Takes pre-loaded bytes (base64 + sniffed media type) and optional transaction
// context for slot matching. Returns the same shape the page expects from ai-doc-read.

import { supabaseAdmin as supabase } from '@/lib/supabase'
import { sniffMediaType } from '@/lib/check-extract'

export interface DocExtractResult {
  summary: string | null
  suggested_slots: string[]
  transaction_fields: Record<string, any> | null
  contacts: any[] | null
  page_contents: any[]
  verification_checklist: any[]
  commission_details: any[]
}

const VALID_CONTACT_TYPES = new Set([
  'buyer', 'seller', 'tenant', 'landlord', 'title_company', 'title_officer',
  'lender', 'loan_officer', 'attorney', 'inspector', 'appraiser',
  'cooperating_agent', 'property_manager', 'hoa', 'other',
])
const VALID_CATEGORIES = new Set([
  'empty_field', 'wrong_info', 'missing_signature', 'missing_initial', 'commission',
])

export async function extractDocWithClaude(
  fileBase64: string,
  mediaType: string,
  transactionId: string | null
): Promise<DocExtractResult> {
  // Load required doc slots for slot matching
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

  const isPdf = mediaType === 'application/pdf'
  const slotListText = requiredDocsList.length > 0
    ? `\n\nRequired document slots for this transaction:\n${requiredDocsList.map((r, i) => `${i + 1}. [${r.id}] ${r.name}`).join('\n')}`
    : ''

  const prompt = `You are a compliance reviewer assistant for a real estate brokerage. Read this document and respond with valid JSON only (no markdown, no extra text):

{
  "summary": "<3-5 sentence plain-English summary: what type of document, parties involved, key dates, dollar amounts or compensation terms, whether signatures are present>",
  "matched_slot_ids": ["<id from the slot list that this document satisfies>"],
  "transaction_fields": {
    "property_address": "<full property address including unit if visible, else null>",
    "sales_price": <number or null>,
    "closing_date": "<YYYY-MM-DD or null>",
    "monthly_rent": <number or null>,
    "lease_term": <number or null>,
    "move_in_date": "<YYYY-MM-DD or null>",
    "title_company": "<title company name if visible, else null>",
    "commission_amount": <number or null>,
    "tenant_name": "<tenant full name if visible, else null>",
    "payer_name": "<name or company paying the commission, else null>",
    "payer_email": "<payer email if visible, else null>",
    "agent_name": "<agent name listed on the document if visible, else null>",
    "seller_name": "<seller or landlord full name(s) if visible, else null>",
    "seller_email": "<seller or landlord email if visible, else null>",
    "listing_price": <number or null>
  },
  "contacts": [
    {
      "contact_type": "<one of: buyer, seller, tenant, landlord, title_company, title_officer, lender, loan_officer, attorney, inspector, appraiser, cooperating_agent, property_manager, hoa, other>",
      "name": "<full name or company name>",
      "email": "<email address if visible, else null>",
      "phone": "<phone number if visible, else null>",
      "company": "<company name if different from name, else null>"
    }
  ],
  "page_contents": [
    {
      "page": <page number 1-indexed>,
      "document_name": "<name of the document or form on this page>",
      "notes": "<1 sentence key detail>"
    }
  ],
  "verification_checklist": [
    {
      "page": <page number>,
      "category": "<one of: empty_field, wrong_info, missing_signature, missing_initial, commission>",
      "item": "<what to verify>",
      "finding": "<what you observed>",
      "needs_review": <true | false>
    }
  ],
  "commission_details": [
    {
      "page": <page number>,
      "label": "<what this dollar figure is>",
      "amount": <number>,
      "source_doc": "<which form/document>"
    }
  ]
}

Rules:
- summary must be specific and factual.
- matched_slot_ids: list IDs of ALL slots this document satisfies. Only include IDs from the provided slot list.
- transaction_fields: extract only values clearly visible. Use null for anything not present or unclear.
- contacts: list every non-agent party visible. Do NOT include the CRC agent.
- page_contents: list every distinct document/form found.
- verification_checklist: for each page, list items Leah should check. Cover: empty fields, wrong info, missing signatures/initials, commission figures. Set needs_review=true for anything blank, inconsistent, unsigned, or unclear.
- commission_details: extract EVERY dollar figure related to commission across all pages.
- Return ONLY the JSON object, no markdown.${slotListText}`

  const messageContent: any[] = []
  if (isPdf) {
    messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } })
  } else {
    messageContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } })
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
    console.error('Claude API error in extractDocWithClaude:', response.status)
    return { summary: null, suggested_slots: [], transaction_fields: null, contacts: null, page_contents: [], verification_checklist: [], commission_details: [] }
  }

  const data = await response.json()
  const text = data.content?.[0]?.text?.trim() || '{}'
  const clean = text.replace(/```json|```/g, '').trim()

  let parsed: any = {}
  try { parsed = JSON.parse(clean) } catch { /* best-effort */ }

  const validIds = new Set(requiredDocsList.map(r => r.id))
  const suggested_slots = (parsed.matched_slot_ids || []).filter((sid: string) => validIds.has(sid))

  const page_contents = Array.isArray(parsed.page_contents)
    ? parsed.page_contents
        .filter((p: any) => p && typeof p.page === 'number' && p.document_name)
        .map((p: any) => ({ page: p.page, document_name: String(p.document_name), notes: p.notes || null }))
    : []

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

  return {
    summary: parsed.summary || null,
    suggested_slots,
    transaction_fields: Object.keys(transaction_fields).length > 0 ? transaction_fields : null,
    contacts: contacts.length > 0 ? contacts : null,
    page_contents,
    verification_checklist,
    commission_details,
  }
}

export { sniffMediaType }
