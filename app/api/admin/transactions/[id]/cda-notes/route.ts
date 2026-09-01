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

  // Wrapped like every other admin route in this tree. Without it an
  // unexpected throw returns Next's default 500 HTML, and the client parses
  // the response with res.json(), which then throws on the HTML and surfaces
  // as an unrelated error message.
  try {
    const { id } = await params
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('id, cda_notes')
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    return NextResponse.json({ cda_notes: data.cda_notes || null })
  } catch (err: any) {
    console.error('cda-notes GET error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to load the note' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, 'can_generate_cda')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // The field must be a string or absent. String() on an object would store
    // "[object Object]" on the document going to a title company, which is not
    // a thing anyone meant to write.
    const incoming = body.cda_notes
    if (incoming !== undefined && incoming !== null && typeof incoming !== 'string') {
      return NextResponse.json({ error: 'The note must be text.' }, { status: 400 })
    }
    // Absent is not the same as empty. Sending {} used to clear the note
    // silently; only an explicit empty string clears it now.
    if (incoming === undefined) {
      return NextResponse.json({ error: 'No note supplied.' }, { status: 400 })
    }

    const raw = String(incoming ?? '').trim()
    if (raw.length > MAX_LEN) {
      return NextResponse.json(
        { error: `That note is too long for the document. Keep it under ${MAX_LEN} characters.` },
        { status: 400 }
      )
    }
    // Empty clears it. The CDA then renders no Notes block at all, which is the
    // state every deal is in today.
    const value = raw.length > 0 ? raw : null

    // .select().maybeSingle() so a write against an id that does not exist is a
    // 404 rather than a cheerful 200. PostgREST reports no error when an UPDATE
    // matches zero rows, so without this the client is told the note saved when
    // nothing was written, and GET on the same id already 404s - the two
    // disagreed.
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update({ cda_notes: value, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, cda_notes')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    return NextResponse.json({ success: true, cda_notes: data.cda_notes ?? null })
  } catch (err: any) {
    console.error('cda-notes PUT error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to save the note' }, { status: 500 })
  }
}
