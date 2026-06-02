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
    "property_address": "<full property address if visible, else null>",
    "sales_price": <number or null - contract/purchase price for sales transactions>,
    "closing_date": "<YYYY-MM-DD or null - scheduled closing date>",
    "monthly_rent": <number or null - monthly rent amount for lease transactions>,
    "lease_term": <number or null - lease term in months>,
    "move_in_date": "<YYYY-MM-DD or null - move-in or lease start date>",
    "title_company": "<title company name if visible, else null>"
  }
}

Rules:
- summary must be specific and factual. If something is unclear, say so. Do not invent information.
- matched_slot_ids: list the IDs of ALL slots this document satisfies. A single file may cover multiple slots.
- Only include IDs from the provided slot list. If no slot matches, return an empty array.
- Common patterns: a sales contract PDF often also contains the Third-Party Financing Addendum; an IABS form may be combined with Disclosure of Relationship.
- transaction_fields: extract only values clearly visible in the document. Use null for anything not present or unclear. Do not guess.
- For transaction_fields numbers (sales_price, monthly_rent, lease_term): return as a number, not a string.${slotListText}`

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

    let parsed: { summary?: string; matched_slot_ids?: string[]; transaction_fields?: Record<string, any> } = {}
    try { parsed = JSON.parse(clean) } catch { /* best-effort */ }

    // Validate suggested IDs against the real list to prevent hallucination
    const validIds = new Set(requiredDocsList.map(r => r.id))
    const suggested_slots = (parsed.matched_slot_ids || []).filter((sid: string) => validIds.has(sid))

    // Validate transaction_fields — only pass through fields that have values
    const rawFields = parsed.transaction_fields || {}
    const transaction_fields: Record<string, any> = {}
    const stringFields = ['property_address', 'closing_date', 'move_in_date', 'title_company']
    const numberFields = ['sales_price', 'monthly_rent', 'lease_term']
    for (const f of stringFields) {
      if (rawFields[f] && typeof rawFields[f] === 'string') transaction_fields[f] = rawFields[f]
    }
    for (const f of numberFields) {
      if (rawFields[f] != null && typeof rawFields[f] === 'number' && rawFields[f] > 0) transaction_fields[f] = rawFields[f]
    }

    return NextResponse.json({
      summary: parsed.summary || null,
      suggested_slots,
      transaction_fields: Object.keys(transaction_fields).length > 0 ? transaction_fields : null,
    })
  } catch (err: any) {
    console.error('ai-doc-read error:', err)
    return NextResponse.json({ summary: null, suggested_slots: [] })
  }
}
