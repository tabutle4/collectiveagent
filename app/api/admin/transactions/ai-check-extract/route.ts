import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Date field meanings for CRC's process:
//   received_date  — when the check arrived at the office (entered manually, not extracted from doc)
//   deposited_date — when it was taken to the bank; for physical checks this is the date
//                    written ON the check by CRC staff when depositing
//   cleared_date   — same as deposited_date for physical checks (CRC writes the date on it
//                    when they deposit, and treats that as the clear date)
//   For Zelle/ACH/wire: all three dates = the transaction date shown (funds are instant)

async function extractCheckWithClaude(
  fileBase64: string,
  mediaType: string
): Promise<{
  check_amount: number | null
  check_from: string | null
  check_number: string | null
  check_date: string | null
  cleared_date: string | null
  payment_method: string
  funds_status: string | null
  notes: string | null
  confidence: 'high' | 'medium' | 'low'
}> {
  const isImage = mediaType.startsWith('image/')
  const isPdf = mediaType === 'application/pdf'

  const prompt = `You are reviewing a payment document for a real estate brokerage. Extract payment details and return ONLY valid JSON.

CRITICAL DATE RULE for physical checks:
The brokerage staff writes a date on the check by hand when they deposit it. That handwritten date is the CLEARED DATE.
The payer's pre-printed date (e.g. "05/06/2026" printed on the check itself by the check-issuer) is NOT the cleared date — ignore it for date extraction.
Look for a handwritten date that appears to have been added by someone different from the payer — it is often written in a different style/location from the printed date.

Document types:
- Physical check photo: extract handwritten date as cleared_date (ignore payer's printed date); for Zelle/ACH use transaction date
- Bank deposit receipt: use the deposit date shown
- Zelle screenshot: transaction date = cleared_date
- Payload/ACH PDF: transaction date = cleared_date

Return this exact JSON:
{
  "check_amount": <number or null>,
  "check_from": <string or null - who sent the payment>,
  "check_number": <string or null - check number or reference number>,
  "check_date": <string or null - YYYY-MM-DD - the payer's pre-printed date on the check (the date the payer wrote the check); null for Zelle/ACH/wire>,
  "cleared_date": <string or null - YYYY-MM-DD - the handwritten date on a physical check (added by brokerage staff); OR transaction/deposit date for Zelle/ACH/bank receipts>,
  "payment_method": <"check" | "zelle" | "payload" | "ach" | "wire" | "ecommission">,
  "funds_status": <string or null - e.g. "Completed", "Pending", "Processing", "Available", "Hold until [date]", "Failed" — only if clearly shown>,
  "notes": <string or null - memo line, property address, bank name, or anything else relevant>,
  "confidence": <"high" | "medium" | "low">
}

Rules:
- check_amount must be a number, not a string
- check_date: the payer's pre-printed date on the check (e.g. "05/06/2026" printed by the check-issuer); null for Zelle/ACH
- cleared_date: for physical checks, ONLY the handwritten date added by brokerage staff (not the payer's printed date)
- Return null for anything not clearly visible
- Return ONLY the JSON object, no markdown, no explanation`

  const messageContent: any[] = []

  if (isImage) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: fileBase64 },
    })
  } else if (isPdf) {
    messageContent.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
    })
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
      max_tokens: 512,
      messages: [{ role: 'user', content: messageContent }],
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Claude API error: ${response.status} ${JSON.stringify(err)}`)
  }

  const data = await response.json()
  const text = data.content?.[0]?.text || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  // Title-case helper: checks are often scanned and names come back ALL CAPS.
  // Preserves known acronyms (LLC, DFW, CRC, HAR, MLS, HOA, INC, LLP, etc.)
  const PRESERVE_UPPER = new Set([
    'LLC', 'LLP', 'INC', 'PLLC', 'LP', 'PC',
    'DFW', 'HOU', 'HAR', 'MLS', 'CRC', 'HOA',
    'NA', 'N/A', 'ACH', 'USA', 'US',
  ])
  const toTitleCase = (str: string | null): string | null => {
    if (!str) return null
    return str
      .toLowerCase()
      .replace(/\b\w+/g, word => {
        const upper = word.toUpperCase()
        return PRESERVE_UPPER.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1)
      })
      .trim()
  }

  return {
    check_amount: typeof parsed.check_amount === 'number' ? parsed.check_amount : null,
    check_from: toTitleCase(parsed.check_from),
    check_number: parsed.check_number ? String(parsed.check_number) : null,
    check_date: parsed.check_date || null,
    cleared_date: parsed.cleared_date || null,
    payment_method: parsed.payment_method || 'check',
    funds_status: parsed.funds_status || null,
    notes: parsed.notes || null,
    confidence: parsed.confidence || 'medium',
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_checks')
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI extraction not configured' }, { status: 503 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Upload a JPG, PNG, WEBP, GIF, or PDF.` },
        { status: 400 }
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64')
    const extracted = await extractCheckWithClaude(fileBase64, file.type)

    return NextResponse.json({ extracted })
  } catch (err: any) {
    console.error('AI check extraction error:', err)
    return NextResponse.json({ error: err.message || 'Extraction failed' }, { status: 500 })
  }
}
