import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

export async function POST(request: NextRequest) {
  try {
    const { user_id, first_name, last_name, email } = await request.json()

    if (!user_id || !email) {
      return NextResponse.json({ error: 'user_id and email are required' }, { status: 400 })
    }

    const res = await fetch('https://api.payload.com/customers/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: `${first_name ?? ''} ${last_name ?? ''}`.trim(),
        email,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload customer creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to create customer' }, { status: 500 })
    }

    const supabase = createClient()
    await supabase.from('users').update({ payload_payee_id: data.id }).eq('id', user_id)

    return NextResponse.json({ success: true, customer_id: data.id })
  } catch (error: any) {
    console.error('Error creating Payload customer:', error)
    return NextResponse.json({ error: error.message || 'Failed to create customer' }, { status: 500 })
  }
}