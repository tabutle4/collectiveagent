import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()
    const { id: txnId } = await params

    const [txnRes, typesRes, agentsRes, teamsRes, contactsRes, intAgentsRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('id', txnId).single(),
      supabase.from('processing_fee_types').select('*').eq('is_active', true).order('display_order', { ascending: true }),
      supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, team_name, commission_plan, is_active').eq('is_active', true).order('preferred_first_name', { ascending: true }),
      supabase.from('users').select('team_name').not('team_name', 'is', null).not('team_name', 'eq', ''),
      supabase.from('transaction_contacts').select('*').eq('transaction_id', txnId),
      supabase.from('transaction_internal_agents').select('*').eq('transaction_id', txnId),
    ])

    if (txnRes.error || !txnRes.data) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    const matchedType = txnRes.data.processing_fee_type_id
      ? (typesRes.data || []).find((t: any) => t.id === txnRes.data.processing_fee_type_id)
      : (typesRes.data || []).find((t: any) => t.name === txnRes.data.transaction_type)

    let requiredDocs: any[] = []
    if (matchedType) {
      const { data: docs } = await supabase
        .from('required_documents')
        .select('*')
        .eq('processing_fee_type_id', matchedType.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      requiredDocs = docs || []
    }

    const uniqueTeams = Array.from(new Set((teamsRes.data || []).map((u: any) => u.team_name).filter(Boolean))) as string[]

    return NextResponse.json({
      transaction: txnRes.data,
      processingFeeTypes: typesRes.data || [],  // matches what page expects
      agents: agentsRes.data || [],
      teams: uniqueTeams.sort(),
      contacts: contactsRes.data || [],
      internalAgents: intAgentsRes.data || [],
      requiredDocs,
      matchedType: matchedType || null,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const supabase = createClient()
    const { id: txnId } = await params
    const body = await request.json()

    // Page sends: { transaction: payload, contacts: contactsPayload }
    const { transaction, contacts } = body

    if (transaction) {
      const { error } = await supabase.from('transactions').update(transaction).eq('id', txnId)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        await supabase.from('transaction_contacts').upsert(contact, { onConflict: 'transaction_id,contact_type,name' }).select()
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}