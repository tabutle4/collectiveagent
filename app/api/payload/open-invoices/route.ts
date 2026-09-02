import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    // Agents can only view their own invoices
    if (userId !== auth.user.id && !auth.permissions.has('can_manage_agent_billing')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', userId)
      .single()

    if (!user?.payload_payee_id) return NextResponse.json({ invoices: [] })

    // fields[]=* keeps every default attribute and fields[]=items adds the
    // nested line items. Payload documents fields[] on list endpoints as well
    // as on single objects: https://docs.payload.com/apis/api-design/
    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&status=unpaid&limit=20&fields[]=*&fields[]=items`,
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
      // The invoice's own description, which is what the office actually typed
      // (e.g. "MLS Input Listing - 818 Heather Park Ct, Sugar Land, TX 77479").
      // This used to send the first line item's `type` instead, so the Billing
      // page could only ever show a generic label like "Monthly Fee" and the
      // description the office wrote was never visible anywhere in the app.
      description: inv.description || inv.items?.[0]?.description || inv.items?.[0]?.type || 'Invoice',
      items: (inv.items || []).map((i: any) => ({
        id: i.id,
        type: i.type,
        description: i.description,
        amount: i.amount,
        entry_type: i.entry_type,
      })),
    }))

    return NextResponse.json({ invoices })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}