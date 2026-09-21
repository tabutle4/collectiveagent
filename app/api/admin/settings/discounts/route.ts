import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { REFERRAL_DISCOUNT_COLUMNS } from '@/lib/referralDiscounts'

export const dynamic = 'force-dynamic'

const AUDIENCES = ['all', 'crc_conversion', 'outside_only']
const DISCOUNT_TYPES = ['amount', 'percent']
const SCHEDULES = ['once', 'monthly', 'yearly']

/**
 * Discounts are company pricing configuration, so they are gated on the same
 * permission as the rest of the settings page rather than a new code. A
 * requirePermission call naming a permission with no permissions row silently
 * blocks everyone, including operations and broker, and can_manage_company_settings
 * is already wired end to end.
 */
async function authorize(request: NextRequest) {
  const authResult = await requirePermission(request, 'can_manage_company_settings')
  if ('error' in authResult) {
    const brokerCheck = await requirePermission(request, 'can_manage_agents')
    if ('error' in brokerCheck) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  return null
}

function optionalInt(value: any, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.min(Math.max(Math.round(parsed), min), max)
}

function optionalDate(value: any): string | null {
  if (!value) return null
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value))
  return match ? match[1] : null
}

/**
 * Only these fields are ever written. Anything else in the body is dropped,
 * and every enum and range is checked here rather than trusted from the client.
 */
function buildRow(discount: any) {
  const audience = AUDIENCES.includes(discount.audience) ? discount.audience : 'all'
  const discountType = DISCOUNT_TYPES.includes(discount.discount_type)
    ? discount.discount_type
    : 'amount'
  const scheduleType = SCHEDULES.includes(discount.schedule_type)
    ? discount.schedule_type
    : 'once'

  const rawAmount = Number(discount.amount)
  const ceiling = discountType === 'percent' ? 100 : Number.MAX_SAFE_INTEGER
  const amount = Number.isFinite(rawAmount)
    ? Math.min(Math.max(Math.round(rawAmount * 100) / 100, 0), ceiling)
    : 0

  return {
    name: String(discount.name || '').trim(),
    description: discount.description ? String(discount.description).trim() : null,
    audience,
    discount_type: discountType,
    amount,
    schedule_type: scheduleType,
    starts_on: optionalDate(discount.starts_on),
    ends_on: scheduleType === 'once' ? optionalDate(discount.ends_on) : null,
    start_month: scheduleType === 'yearly' ? optionalInt(discount.start_month, 1, 12) : null,
    start_day: scheduleType === 'once' ? null : optionalInt(discount.start_day, 1, 31),
    end_month: scheduleType === 'yearly' ? optionalInt(discount.end_month, 1, 12) : null,
    end_day: scheduleType === 'once' ? null : optionalInt(discount.end_day, 1, 31),
    repeat_until: scheduleType === 'once' ? null : optionalDate(discount.repeat_until),
    is_active: discount.is_active !== false,
  }
}

/** A schedule missing the fields it needs would never match any day. */
function scheduleProblem(row: ReturnType<typeof buildRow>): string | null {
  if (row.schedule_type === 'monthly' && (row.start_day === null || row.end_day === null)) {
    return 'A monthly discount needs a start day and an end day'
  }
  if (
    row.schedule_type === 'yearly' &&
    (row.start_month === null || row.start_day === null ||
      row.end_month === null || row.end_day === null)
  ) {
    return 'A yearly discount needs a start month and day and an end month and day'
  }
  return null
}

// GET - List all discounts
export async function GET(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  try {
    const { data, error } = await supabaseAdmin
      .from('referral_discounts')
      .select(REFERRAL_DISCOUNT_COLUMNS)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, discounts: data || [] })
  } catch (error: any) {
    console.error('Referral discount GET error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load discounts' },
      { status: 500 }
    )
  }
}

// POST - Create a discount
export async function POST(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  try {
    const { discount } = await request.json()

    if (!discount || !String(discount.name || '').trim()) {
      return NextResponse.json({ error: 'A discount name is required' }, { status: 400 })
    }

    const row = buildRow(discount)
    const problem = scheduleProblem(row)
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('referral_discounts')
      .insert({
        ...row,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Referral discount POST error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create discount' },
      { status: 500 }
    )
  }
}

// PUT - Update a discount, including switching it on and off
export async function PUT(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  try {
    const { discount } = await request.json()

    if (!discount || !discount.id) {
      return NextResponse.json({ error: 'Discount id is required' }, { status: 400 })
    }
    if (!String(discount.name || '').trim()) {
      return NextResponse.json({ error: 'A discount name is required' }, { status: 400 })
    }

    const row = buildRow(discount)
    const problem = scheduleProblem(row)
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('referral_discounts')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', discount.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Referral discount PUT error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update discount' },
      { status: 500 }
    )
  }
}

// DELETE - Remove a discount
export async function DELETE(request: NextRequest) {
  const denied = await authorize(request)
  if (denied) return denied

  try {
    const discountId = request.nextUrl.searchParams.get('id')

    if (!discountId) {
      return NextResponse.json({ error: 'Discount id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('referral_discounts')
      .delete()
      .eq('id', discountId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Referral discount DELETE error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to delete discount' },
      { status: 500 }
    )
  }
}
