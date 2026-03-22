import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', userId)
      .single()

    if (!user?.payload_payee_id) return NextResponse.json({ invoices: [] })

    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&status=unpaid&limit=20`,
      { headers: { Authorization: authHeader() } }
    )

    if (!res.ok) return NextResponse.json({ invoices: [] })

    const data = await res.json()
    const invoices = (data.values || []).map((inv: any) => ({
      id: inv.id,
      amount: inv.amount,
      amount_due: inv.amount_due,
      due_date: inv.due_date,
      status: inv.status,
      description: inv.items?.[0]?.type || 'Invoice',
      items: inv.items || [],
    }))

    return NextResponse.json({ invoices })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
