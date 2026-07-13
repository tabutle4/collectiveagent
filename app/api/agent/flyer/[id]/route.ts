import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── GET: load flyer record + transaction + agent info ────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { id: transactionId } = await params

  try {
    // Load ALL flyer records for this transaction. Each form that creates a
    // flyer (Just Listed, Under Contract, Compliance/CDA) inserts its own row on
    // the same transaction, so a transaction can have several. The detail page
    // renders one tab per flyer that exists. `flyer` (newest) is kept for any
    // caller that still expects a single object.
    const { data: flyerRows, error: flyerErr } = await supabaseAdmin
      .from('transaction_flyers')
      .select('id, flyer_type, status, photo_url, bedrooms, bathrooms, garage, sqft, flyer_division, city, downloaded_at, created_at')
      .eq('transaction_id', transactionId)
      .order('created_at', { ascending: false })

    if (flyerErr) throw flyerErr

    const flyers = flyerRows || []
    const flyer = flyers[0] || null

    // Load transaction for address and property info
    const { data: txn, error: txnErr } = await supabaseAdmin
      .from('transactions')
      .select('id, property_address, transaction_type, status, compliance_status')
      .eq('id', transactionId)
      .single()

    if (txnErr || !txn) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Verify this agent is on the transaction or is admin
    const canViewAll = auth.permissions.has('can_view_all_transactions')
    if (!canViewAll) {
      const { data: tia } = await supabaseAdmin
        .from('transaction_internal_agents')
        .select('id')
        .eq('transaction_id', transactionId)
        .eq('agent_id', auth.user.id)
        .maybeSingle()

      if (!tia) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Load primary agent info for flyer
    const { data: tiaRows } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select(`
        agent_role,
        user:users!transaction_internal_agents_agent_id_fkey(
          id, first_name, last_name, preferred_first_name, preferred_last_name,
          email, office_email, office
        )
      `)
      .eq('transaction_id', transactionId)
      .in('agent_role', ['primary_agent', 'listing_agent', 'buyer_agent'])
      .limit(3)

    const primaryAgent = tiaRows?.find((r: any) => r.agent_role === 'primary_agent') || tiaRows?.[0]
    const agentUser = primaryAgent?.user as any

    const agentName = agentUser
      ? `${agentUser.preferred_first_name || agentUser.first_name || ''} ${agentUser.preferred_last_name || agentUser.last_name || ''}`.trim()
      : ''
    const agentEmail = agentUser?.office_email || agentUser?.email || ''

    return NextResponse.json({
      flyer: flyer || null,
      flyers,
      transaction: txn,
      agent: { name: agentName, email: agentEmail, office: agentUser?.office || '' },
    })
  } catch (err: any) {
    console.error('flyer GET error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── POST: upload photo to storage, update transaction_flyers ────────────────
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { id: transactionId } = await params

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const flyerId = formData.get('flyer_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate type
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPG, PNG, or WebP images are allowed' }, { status: 400 })
    }

    // Validate size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 10MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const filePath = `flyers/${transactionId}-${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabaseAdmin.storage
      .from('headshots') // reuse existing public bucket
      .upload(filePath, buffer, { contentType: file.type, upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from('headshots').getPublicUrl(filePath)
    const photoUrl = urlData.publicUrl

    const now = new Date().toISOString()

    // Update or insert flyer record
    if (flyerId) {
      await supabaseAdmin
        .from('transaction_flyers')
        .update({ photo_url: photoUrl, photo_uploaded_at: now, photo_uploaded_by: auth.user.id, updated_at: now })
        .eq('id', flyerId)
    } else {
      await supabaseAdmin
        .from('transaction_flyers')
        .update({ photo_url: photoUrl, photo_uploaded_at: now, photo_uploaded_by: auth.user.id, updated_at: now })
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(1)
    }

    return NextResponse.json({ success: true, photo_url: photoUrl })
  } catch (err: any) {
    console.error('flyer POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PATCH: record download timestamp ────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const { id: transactionId } = await params

  try {
    const { flyer_id } = await request.json()
    const now = new Date().toISOString()

    const query = supabaseAdmin
      .from('transaction_flyers')
      .update({ downloaded_at: now, downloaded_by: auth.user.id, updated_at: now })

    if (flyer_id) {
      await query.eq('id', flyer_id)
    } else {
      await query.eq('transaction_id', transactionId)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('flyer PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── PUT: admin-only edit of flyer display fields ────────────────────────────
// Only users with can_view_all_transactions (operations/broker/admin) may edit.
// Agents cannot reach this branch even though the route lives under /api/agent.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  const canEdit = auth.permissions.has('can_view_all_transactions')
  if (!canEdit) {
    return NextResponse.json({ error: 'Not authorized to edit flyer fields' }, { status: 403 })
  }

  const { id: transactionId } = await params

  try {
    const body = await request.json()
    const flyerId: string | null = body.flyer_id || null

    // Whitelist of editable columns. Anything not listed is ignored.
    const allowedTypes = ['just_listed', 'just_sold', 'just_leased', 'under_contract']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (typeof body.flyer_type === 'string' && allowedTypes.includes(body.flyer_type)) {
      updates.flyer_type = body.flyer_type
    }
    if (typeof body.city === 'string') {
      updates.city = body.city.trim() || null
    }
    if (typeof body.flyer_division === 'string') {
      updates.flyer_division = body.flyer_division.trim() || null
    }
    for (const numField of ['bedrooms', 'bathrooms', 'garage', 'sqft']) {
      if (body[numField] === '' || body[numField] === null || body[numField] === undefined) {
        updates[numField] = null
      } else {
        const n = Number(body[numField])
        if (!Number.isNaN(n) && n >= 0) updates[numField] = n
      }
    }

    const query = supabaseAdmin.from('transaction_flyers').update(updates)
    if (flyerId) {
      await query.eq('id', flyerId)
    } else {
      await query.eq('transaction_id', transactionId)
    }

    return NextResponse.json({ success: true, updates })
  } catch (err: any) {
    console.error('flyer PUT error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
