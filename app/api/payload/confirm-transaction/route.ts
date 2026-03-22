import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'

const authHeader = () =>
  'Basic ' + Buffer.from(process.env.PAYLOAD_SECRET_KEY + ':').toString('base64')

// After the embedded checkout fires its success event, the client sends
// pl_transaction_id here. We confirm it by updating status to 'processed'.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const { transaction_id }: { transaction_id: string } = await request.json()

    if (!transaction_id) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    const res = await fetch(`https://api.payload.com/transactions/${transaction_id}`, {
      method: 'PUT',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ status: 'processed' }),
    })

    const data = await res.json()
    if (!res.ok) {
      console.error('Payload transaction confirm failed:', data)
      return NextResponse.json(
        { error: data.message || 'Failed to confirm transaction' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error confirming transaction:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to confirm transaction' },
      { status: 500 }
    )
  }
}
