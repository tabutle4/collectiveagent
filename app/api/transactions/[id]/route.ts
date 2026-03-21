import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const { id } = await params
    const supabase = createClient()

    const [txnRes, typesRes, agentsRes, contactsRes, internalAgentsRes] = await Promise.all([
      supabase.from('transactions').select('*').eq('id', id).single(),
      supabase.from('processing_fee_types').select('*').eq('is_active', true).order('display_order', { ascending: true }),
      supabase.from('users').select('id, first_name, last_name, preferred_first_name, preferred_last_name, email, office, team_name, commission_plan, is_active').eq('is_active', true).order('preferred_first_name', { ascending: true }),
      supabase.from('transaction_contacts').select('*').eq('transaction_id', id),
      supabase.from('transaction_internal_agents').select('*').eq('transaction_id', id),
    ])

    if (txnRes.error) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })

    // Load required docs for the transaction type
    let requiredDocs: any[] = []
    if (txnRes.data?.transaction_type) {
      const matchedType = (typesRes.data || []).find((t: any) => t.name === txnRes.data.transaction_type)
      if (matchedType) {
        const { data: docs } = await supabase
          .from('required_documents')
          .select('*')
          .eq('processing_fee_type_id', matchedType.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
        requiredDocs = docs || []
      }
    }

    return NextResponse.json({
      transaction: txnRes.data,
      processingFeeTypes: typesRes.data || [],
      agents: agentsRes.data || [],
      contacts: contactsRes.data || [],
      internalAgents: internalAgentsRes.data || [],
      requiredDocs,
    })
  } catch (err: any) {
    console.error('Transaction detail API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const session = await verifySessionToken(sessionToken)
    if (!session) return NextResponse.json({ error: 'Invalid session' }, { status: 401 })

    const { id } = await params
    const body = await request.json()
    const { transaction, contacts } = body

    const supabase = createClient()

    // Update transaction
    if (transaction) {
      const { error } = await supabase
        .from('transactions')
        .update(transaction)
        .eq('id', id)
      if (error) throw error
    }

    // Upsert contacts
    if (contacts && Array.isArray(contacts)) {
      for (const contact of contacts) {
        await supabase
          .from('transaction_contacts')
          .upsert(contact, { onConflict: 'transaction_id,contact_type,name' })
      }
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Transaction PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}