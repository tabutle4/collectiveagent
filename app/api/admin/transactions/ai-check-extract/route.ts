import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Claude vision call - sends the file and returns extracted check fields
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
  notes: string | null
  confidence: 'high' | 'medium' | 'low'
}> {
  const isImage = mediaType.startsWith('image/')
  const isPdf = mediaType === 'application/pdf'

  const prompt = `You are reviewing a payment document from a real estate transaction. This could be a physical check, an eCheck, a Zelle screenshot, a bank deposit screenshot, or a Payload/ACH confirmation PDF.

Extract the following fields and return ONLY valid JSON with no extra text:
{
  "check_amount": <number or null - the dollar amount paid>,
  "check_from": <string or null - who sent/wrote the payment: person name, company name, or bank name>,
  "check_number": <string or null - check number if present, or transaction/reference number for Zelle/ACH>,
  "check_date": <string or null - YYYY-MM-DD - the date printed on the check (when the check was written)>,
  "cleared_date": <string or null - YYYY-MM-DD - the date the check cleared or was deposited per the bank; use null if not visible>,
  "payment_method": <"check" | "zelle" | "payload" | "ecommission" | "wire" - your best guess at what type of payment this is>,
  "notes": <string or null - any other relevant info such as memo line, property address mentioned, or bank name>,
  "confidence": <"high" | "medium" | "low" - how confident you are in the extracted data>
}

Rules:
- check_amount must be a number (e.g. 4250.00), not a string
- For Zelle screenshots: check_from is the sender name shown
- For bank deposit screenshots: check_amount is the deposit total
- For Payload PDFs: use "payload" as payment_method and the transaction ID as check_number
- If a field is not visible or not applicable, use null
- check_date is the date printed on the face of the check (when it was written)
- cleared_date is the date the bank processed/cleared the check, if visible (e.g. on a deposit receipt or bank statement)
- received_date is derived automatically from cleared_date by the app (day before cleared); do not return it
- For Zelle/ACH/Payload: check_date is the transaction date shown
- Return ONLY the JSON object, no markdown, no explanation`

  const messageContent: any[] = []

  if (isImage) {
    messageContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: fileBase64,
      },
    })
  } else if (isPdf) {
    messageContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: fileBase64,
      },
    })
  }

  messageContent.push({
    type: 'text',
    text: prompt,
  })

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

  // Strip any markdown code fences just in case
  const clean = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)

  return {
    check_amount: typeof parsed.check_amount === 'number' ? parsed.check_amount : null,
    check_from: parsed.check_from || null,
    check_number: parsed.check_number ? String(parsed.check_number) : null,
    check_date: parsed.check_date || null,
    cleared_date: parsed.cleared_date || null,
    payment_method: parsed.payment_method || 'check',
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

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Accept images and PDFs
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
    ]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Upload a JPG, PNG, WEBP, GIF, or PDF.` },
        { status: 400 }
      )
    }

    // 10MB limit (same as upload route)
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
