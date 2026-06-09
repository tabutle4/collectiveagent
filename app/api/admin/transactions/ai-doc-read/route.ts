import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { extractDocWithClaude, sniffMediaType } from '@/lib/doc-extract'

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

    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    const fileBase64 = Buffer.from(arrayBuffer).toString('base64')
    const realMediaType = sniffMediaType(bytes, file.type)

    const result = await extractDocWithClaude(fileBase64, realMediaType, transactionId)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('ai-doc-read error:', err)
    return NextResponse.json({ summary: null, suggested_slots: [] })
  }
}
