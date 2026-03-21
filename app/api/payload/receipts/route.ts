import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', userId)
      .single()

    if (!user?.payload_payee_id) return NextResponse.json({ receipts: [] })

    const res = await fetch(
      `https://api.payload.com/invoices/?customer_id=${user.payload_payee_id}&status=paid&limit=20`,
      { headers: { Authorization: authHeader() } }
    )

    if (!res.ok) return NextResponse.json({ receipts: [] })

    const data = await res.json()

    const receipts = await Promise.all(
      (data.values || []).map(async (inv: any) => {
        const { data: pl } = await supabase
          .from('payment_links')
          .select('url')
          .eq('invoice_id', inv.id)
          .single()

        return {
          id: inv.id,
          amount: parseFloat(inv.total_paid) || 0,
          paid_at: inv.paid_timestamp || inv.modified_at || null,
          description: inv.items?.[0]?.type || 'Payment',
          url: pl?.url || null,
        }
      })
    )

    return NextResponse.json({ receipts })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
