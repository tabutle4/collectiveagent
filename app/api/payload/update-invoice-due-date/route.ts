import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// POST /api/payload/update-invoice-due-date
// Updates a Payload invoice's due_date. Used by the billing page edit form to
// keep the Payload invoice and the agent_debts row in sync when an admin
// changes the due date on an outstanding custom invoice.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { invoice_id, user_id, due_date } = await request.json()

    if (!invoice_id || !user_id || !due_date) {
      return NextResponse.json(
        { error: 'invoice_id, user_id, and due_date are required' },
        { status: 400 }
      )
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) {
      return NextResponse.json(
        { error: 'due_date must be YYYY-MM-DD' },
        { status: 400 }
      )
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

    const res = await fetch(`https://api.payload.com/invoices/${invoice_id}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ due_date }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload due_date update failed:', data)
      return NextResponse.json(
        { error: data.message || 'Failed to update invoice due date' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating invoice due date:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update invoice due date' },
      { status: 500 }
    )
  }
}
