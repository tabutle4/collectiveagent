import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { invoice_id, user_id } = await request.json()
    if (!invoice_id || !user_id) {
      return NextResponse.json({ error: 'invoice_id and user_id are required' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json(
        { error: 'Agent does not have a Payload customer ID.' },
        { status: 400 }
      )
    }

    // Void the invoice in Payload by updating status to voided
    const res = await fetch(`https://api.payload.com/invoices/${invoice_id}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ status: 'voided' }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload void invoice failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to void invoice' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error voiding invoice:', error)
    return NextResponse.json({ error: error.message || 'Failed to void invoice' }, { status: 500 })
  }
}
