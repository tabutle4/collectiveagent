import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()

    const { data: invoice, error } = await supabase
      .from('pm_landlord_invoices')
      .select(`
        *,
        landlords(id, first_name, last_name, email, phone, payload_payee_id),
        managed_properties(id, property_address, unit, city, pm_agreement_id,
          pm_agreements(id, management_fee_pct, management_fee_flat, referring_agent_id, agent_fee_pct,
            referring_agent:users!pm_agreements_referring_agent_id_fkey(id, preferred_first_name, first_name, preferred_last_name, last_name)
          )
        )
      `)
      .eq('id', resolvedParams.id)
      .single()

    if (error) throw error
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    return NextResponse.json({ invoice })
  } catch (error: any) {
    console.error('Error fetching landlord invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()
    const updates = await request.json()

    const { data: current } = await supabase
      .from('pm_landlord_invoices')
      .select('status')
      .eq('id', resolvedParams.id)
      .single()

    if (!current) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    const allowedFields = current.status === 'paid'
      ? ['notes', 'payment_notes']
      : ['amount', 'description', 'due_date', 'status', 'notes', 'payment_notes']

    const filteredUpdates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key]
      }
    }

    const { error } = await supabase
      .from('pm_landlord_invoices')
      .update(filteredUpdates)
      .eq('id', resolvedParams.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating landlord invoice:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
