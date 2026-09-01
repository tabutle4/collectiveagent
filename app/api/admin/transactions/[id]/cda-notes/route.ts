import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// The note printed on this deal's CDA.
//
// One note per DEAL. A deal has one CDA: cda_status, cda_url and
// cda_sent_manual_at all live on transactions in the singular, and the
// [tia_id] in the CDA route says whose figures the document is built from,
// not which of several CDAs it is.
//
// THIS PRINTS ON THE DOCUMENT THE TITLE COMPANY RECEIVES. It is not an
// internal remark. Internal commission notes are a different thread with
// different permissions that deliberately appears on no CDA, statement or
// email.
//
// Gated on can_generate_cda, the same permission the send-to-title route
// uses, so whoever can send the CDA can write what it says. No new
// permission and nothing to configure before this works.

const MAX_LEN = 4000

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_generate_cda')
  if (auth.error) return auth.error

  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id, cda_notes')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

  return NextResponse.json({ cda_notes: data.cda_notes || null })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_generate_cda')
  if (auth.error) return auth.error

  const { id } = await params
  let body: any = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const raw = String(body.cda_notes ?? '').trim()
  if (raw.length > MAX_LEN) {
    return NextResponse.json(
      { error: `That note is too long for the document. Keep it under ${MAX_LEN} characters.` },
      { status: 400 }
    )
  }
  // Empty clears it. The CDA then renders no Notes block at all, which is the
  // state every deal is in today.
  const value = raw.length > 0 ? raw : null

  const { error } = await supabaseAdmin
    .from('transactions')
    .update({ cda_notes: value, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, cda_notes: value })
}
