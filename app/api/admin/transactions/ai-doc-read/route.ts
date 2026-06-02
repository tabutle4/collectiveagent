import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// Claude reads a compliance document and returns a plain-English summary
// so Leah can verify without opening every file individually.
export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI reading not configured' }, { status: 503 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'application/pdf',
    ]

    if (!allowedTypes.includes(file.type)) {
      // Non-image/PDF — skip AI extraction gracefully
      return NextResponse.json({ summary: null })
    }

    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ summary: null })
    }

    const arrayBuffer = await file.arrayBuffer()
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64')

    const prompt = `You are a compliance reviewer assistant for a real estate brokerage. Read this document and give a brief plain-English summary (3-5 sentences max) covering:
- What type of document this is
- Who the parties are (names, roles)
- Key dates visible (effective date, expiration, execution date)
- Key dollar amounts or compensation terms if visible
- Whether signatures are present

Be specific and factual. If you cannot read something clearly, say so. Do not invent information. Keep the summary short — it is for a TC to quickly verify the document is correct.`

    const messageContent: any[] = []

    if (file.type === 'application/pdf') {
      messageContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
      })
    } else {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: file.type, data: fileBase64 },
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
      console.error('Claude API error in ai-doc-read:', response.status, err)
      return NextResponse.json({ summary: null })
    }

    const data = await response.json()
    const summary = data.content?.[0]?.text?.trim() || null

    return NextResponse.json({ summary })
  } catch (err: any) {
    console.error('ai-doc-read error:', err)
    return NextResponse.json({ summary: null }) // best-effort — never block the upload
  }
}
