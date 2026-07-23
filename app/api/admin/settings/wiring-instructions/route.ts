import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DOC_KEY = 'wiring_instructions'
const MAX_BYTES = 4 * 1024 * 1024 // 4 MB

// GET — current wiring-instructions status (no file bytes returned).
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_company_settings')
  if (auth.error) return auth.error

  try {
    const { data } = await supabaseAdmin
      .from('company_documents')
      .select('filename, updated_at')
      .eq('doc_key', DOC_KEY)
      .maybeSingle()
    return NextResponse.json({
      filename: data?.filename || null,
      updated_at: data?.updated_at || null,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — upload/replace the firm-wide commission wiring instructions (PDF).
// Stored as base64 in company_documents so it stays behind the authed API
// (it contains bank details and must not live in a public bucket).
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_company_settings')
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 })

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Wiring instructions must be a PDF.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File is ${Math.round(file.size / 1024)} KB. Max size is 4 MB.` },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const content = buffer.toString('base64')
    const now = new Date().toISOString()
    const filename = file.name || 'Commission Wiring Instructions.pdf'

    const { error } = await supabaseAdmin
      .from('company_documents')
      .upsert(
        { doc_key: DOC_KEY, filename, mime: 'application/pdf', content, updated_at: now },
        { onConflict: 'doc_key' }
      )
    if (error) throw error

    return NextResponse.json({ success: true, filename, updated_at: now })
  } catch (err: any) {
    console.error('wiring-instructions POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE — remove the stored wiring instructions.
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_company_settings')
  if (auth.error) return auth.error

  try {
    const { error } = await supabaseAdmin
      .from('company_documents')
      .delete()
      .eq('doc_key', DOC_KEY)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
