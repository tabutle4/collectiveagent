import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { FEE_TYPES, FeeType } from '@/lib/referralDiscounts'

export const dynamic = 'force-dynamic'

/**
 * One-time credits against an agent's fees.
 *
 * A credit is money already collected or owed back - a refund the office is
 * working off, a payment that landed on the wrong entity, a goodwill gesture -
 * so it is spent against the next invoice for that fee and then gone. A
 * standing rate is the other lever and lives on the agent's own record; use
 * that for "she pays $25 a month from now on".
 *
 * Credits are voided rather than deleted. What the office promised somebody is
 * worth keeping even after it is withdrawn.
 */

const CREDIT_COLUMNS =
  'id, created_at, user_id, fee_type, amount, remaining, note, created_by, consumed_at, consumed_reference, is_void'

function money(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('agent_fee_credits')
      .select(CREDIT_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ success: true, credits: data || [] })
  } catch (error: any) {
    console.error('Agent credits GET error:', error)
    return NextResponse.json({ error: 'Failed to load credits' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const userId = String(body.user_id || '')
    const feeType = String(body.fee_type || '') as FeeType
    const amount = money(body.amount)
    const note = body.note ? String(body.note).trim().slice(0, 500) : null

    if (!userId) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 })
    }
    if (!FEE_TYPES.includes(feeType)) {
      return NextResponse.json({ error: 'Pick which fee the credit is against' }, { status: 400 })
    }
    if (amount === null || amount <= 0) {
      return NextResponse.json({ error: 'Credit amount must be more than zero' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('agent_fee_credits')
      .insert({
        user_id: userId,
        fee_type: feeType,
        amount,
        remaining: amount,
        note,
        created_by: auth.user.id,
      })
      .select(CREDIT_COLUMNS)
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, credit: data })
  } catch (error: any) {
    console.error('Agent credits POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add the credit' },
      { status: 500 }
    )
  }
}

/** Void a credit. Spent credits stay on the record; only what is left stops. */
export async function DELETE(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const creditId = request.nextUrl.searchParams.get('id')
    if (!creditId) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('agent_fee_credits')
      .update({ is_void: true, remaining: 0 })
      .eq('id', creditId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Agent credits DELETE error:', error)
    return NextResponse.json({ error: 'Failed to void the credit' }, { status: 500 })
  }
}
