import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getCentralDateString } from '@/lib/timezone'
import { DEFAULT_LEDGER_ACCOUNT, entryTypeForCategory } from '@/lib/payouts/ledger'
import { syncPayoutsLedger } from '@/lib/payouts/posting'

export const dynamic = 'force-dynamic'
// The first sync runs inside this request, and an early start date makes it
// large. Same ceiling as /api/admin/ledger/sync for the same reason.
export const maxDuration = 300

// Start the payouts ledger.
//
// Two things happen together and neither is useful without the other: the
// opening balance line is written, and `ledger_start_date` is set so
// auto-posting knows where to begin.
//
// The opening balance is the bank's balance at the START of the start date,
// i.e. the previous day's closing figure. Not the balance at the moment you
// press the button.
//
// That distinction is the whole boundary. Auto-posting takes everything dated
// ON or after the start date, so if the opening figure were read mid-morning
// it would already contain the items that cleared earlier that day, and those
// items would then post again on top of it. Asking for the start-of-day figure
// means every item dated that day posts exactly once, and none can be missed
// by falling into the gap between "already in the balance" and "after the
// start date".
//
// Deliberately one-way. There is no "restart": once the ledger is open, moving
// its start date would reopen a closed period and change a balance people have
// already read. Correcting a wrong opening figure is an adjustment entry, which
// leaves a trail, rather than a silent edit that does not.

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_ledger')
  if (auth.error) return auth.error

  try {
    const body = await request.json().catch(() => ({}))
    const openingBalance = Number(body?.opening_balance)
    const startDate: string =
      typeof body?.start_date === 'string' && body.start_date
        ? body.start_date.slice(0, 10)
        : getCentralDateString()

    if (!Number.isFinite(openingBalance) || openingBalance < 0) {
      return NextResponse.json(
        { error: 'Enter the balance the bank shows, as a number that is not negative' },
        { status: 400 }
      )
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('company_settings')
      .select('id, ledger_start_date')
      .limit(1)
      .maybeSingle()
    if (settingsError) throw settingsError
    if (!settings?.id) {
      return NextResponse.json({ error: 'Company settings row not found' }, { status: 500 })
    }
    // Two guards, not one. `ledger_start_date` is the intended flag, but rows
    // can exist without it: this ledger already held four entries written
    // before the start date existed as a concept. Opening on top of those
    // would state the same money twice, so an existing opening balance is
    // refused on its own terms.
    const { data: existingOpening, error: openingCheckError } = await supabaseAdmin
      .from('brokerage_ledger')
      .select('id, entry_date, amount')
      .eq('account', DEFAULT_LEDGER_ACCOUNT)
      .eq('category', 'opening_balance')
      .limit(1)
      .maybeSingle()
    if (openingCheckError) throw openingCheckError
    if (existingOpening) {
      return NextResponse.json(
        {
          error: `This account already has an opening balance, dated ${String(existingOpening.entry_date).slice(0, 10)}. Remove it before opening the ledger again, or correct the figure with an adjustment entry.`,
        },
        { status: 409 }
      )
    }

    if (settings.ledger_start_date) {
      return NextResponse.json(
        {
          error: `The ledger was already started on ${String(settings.ledger_start_date).slice(0, 10)}. Correct the opening figure with an adjustment entry rather than starting again.`,
        },
        { status: 409 }
      )
    }

    // The opening line first. If setting the date succeeded and this failed,
    // auto-posting would run against a ledger with no opening balance and
    // every screen would read the balance as short by the whole opening
    // figure. This order cannot do that: a line with no start date posts
    // nothing and is visible, which is a state a person can see and fix.
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('brokerage_ledger')
      .insert({
        entry_date: startDate,
        entry_type: entryTypeForCategory('opening_balance'),
        category: 'opening_balance',
        description: `Opening balance, reconciled ${startDate}`,
        amount: Math.round(openingBalance * 100) / 100,
        bank_date: startDate,
        external_source: 'auto',
        external_id: `opening_balance:${startDate}`,
        recorded_by: auth.user.id,
        account: DEFAULT_LEDGER_ACCOUNT,
      })
      .select('id')
      .single()
    if (entryError) throw entryError

    const { error: dateError } = await supabaseAdmin
      .from('company_settings')
      .update({ ledger_start_date: startDate })
      .eq('id', settings.id)
    if (dateError) {
      // Compensate, so a half-started ledger does not survive the request.
      await supabaseAdmin.from('brokerage_ledger').delete().eq('id', entry.id)
      throw dateError
    }

    // Catch up everything dated on or after the start date in the same call,
    // so the balance is right the moment the screen reloads rather than at the
    // next nightly run.
    const posted = await syncPayoutsLedger(auth.user.id)

    return NextResponse.json({
      success: true,
      start_date: startDate,
      opening_balance: Math.round(openingBalance * 100) / 100,
      posted,
    })
  } catch (error: any) {
    console.error('Ledger start error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
