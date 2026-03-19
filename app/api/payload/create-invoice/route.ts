import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

type InvoiceType = 'onboarding' | 'monthly' | 'custom'

export async function POST(request: NextRequest) {
  try {
    const { user_id, type, amount, description, month, year: invoiceYear }: {
      user_id: string
      type: InvoiceType
      amount?: number
      description?: string
      month?: string
      year?: number
    } = await request.json()

    if (!user_id || !type) {
      return NextResponse.json({ error: 'user_id and type are required' }, { status: 400 })
    }
    if (type === 'custom' && (!amount || !description)) {
      return NextResponse.json({ error: 'amount and description are required for custom invoices' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json({ error: 'Agent does not have a Payload customer ID.' }, { status: 400 })
    }

    const today = new Date().toISOString().split('T')[0]
    const params = new URLSearchParams({
      'type': 'bill',
      'due_date': today,
      'processing_id': process.env.PAYLOAD_PROCESSING_ID!,
      'customer_id': user.payload_payee_id,
    })

    if (type === 'onboarding') {
      const now = new Date()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const remainingDays = daysInMonth - now.getDate() + 1
      const proratedFee = Math.round((50 / daysInMonth) * remainingDays * 100) / 100
      const monthName = now.toLocaleString('default', { month: 'long' })

      params.append('items[0][type]', 'Onboarding Fee')
      params.append('items[0][description]', 'One-time onboarding fee')
      params.append('items[0][amount]', '399')
      params.append('items[0][entry_type]', 'charge')

      if (proratedFee > 0) {
        params.append('items[1][type]', 'Monthly Fee (Prorated)')
        params.append('items[1][description]', `Prorated monthly fee — ${remainingDays} days remaining in ${monthName}`)
        params.append('items[1][amount]', proratedFee.toString())
        params.append('items[1][entry_type]', 'charge')
      }
    } else if (type === 'monthly') {
      const now = new Date()
      const monthName = month || now.toLocaleString('default', { month: 'long' })
      const year = invoiceYear || now.getFullYear()
      params.append('items[0][type]', 'Monthly Fee')
      params.append('items[0][description]', `${monthName} ${year} Monthly Brokerage Fee`)
      params.append('items[0][amount]', '50')
      params.append('items[0][entry_type]', 'charge')
    } else {
      // Custom invoice
      params.append('items[0][type]', description!)
      params.append('items[0][description]', description!)
      params.append('items[0][amount]', amount!.toString())
      params.append('items[0][entry_type]', 'charge')
    }

    const res = await fetch('https://api.payload.com/invoices/', {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload invoice creation failed:', data)
      return NextResponse.json({ error: data.message || 'Failed to create invoice' }, { status: 500 })
    }

    // For custom invoices, record in agent_debts
    if (type === 'custom' && data.id) {
      await supabase.from('agent_debts').insert({
        agent_id: user_id,
        debt_type: 'custom_invoice',
        description: description,
        amount_owed: amount,
        amount_paid: 0,
        date_incurred: today,
        due_date: today,
        status: 'outstanding',
        notes: `Payload invoice ID: ${data.id}`,
      })
    }

    return NextResponse.json({ success: true, invoice_id: data.id })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json({ error: error.message || 'Failed to create invoice' }, { status: 500 })
  }
}