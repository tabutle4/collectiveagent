import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('section') // 'on_hold' | 'active' | 'history' | 'dashboard'

    // Dashboard balance data
    if (section === 'dashboard') {
      const [
        { data: settings },
        { data: onHoldChecks },
        { data: processedPayouts },
        { data: pendingPayouts },
      ] = await Promise.all([
        supabase.from('company_settings').select('bank_balance, bank_balance_updated_at, funds_on_hold').single(),
        supabase.from('checks_received').select('check_amount').in('status', ['received', 'deposited']),
        supabase.from('check_payouts').select('amount').eq('payment_status', 'processed'),
        supabase.from('check_payouts').select('amount').eq('payment_status', 'pending'),
      ])

      const bankBalance = settings?.bank_balance || 0
      const bankBalanceUpdatedAt = settings?.bank_balance_updated_at || null
      const onHold = (onHoldChecks || []).reduce((sum, c) => sum + parseFloat(c.check_amount || '0'), 0)
      const processed = (processedPayouts || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0)
      const pending = (pendingPayouts || []).reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0)

      // CRC not transferred
      const { data: crcChecks } = await supabase
        .from('checks_received')
        .select('brokerage_amount')
        .eq('crc_transferred', false)
        .not('brokerage_amount', 'is', null)

      const crcNotTransferred = (crcChecks || []).reduce((sum, c) => sum + parseFloat(c.brokerage_amount || '0'), 0)

      return NextResponse.json({
        bank_balance: bankBalance,
        bank_balance_updated_at: bankBalanceUpdatedAt,
        funds_on_hold: settings?.funds_on_hold || 0,
        on_hold: onHold,
        processed_payouts: processed,
        pending_payouts: pending,
        crc_not_transferred: crcNotTransferred,
        // Q1: Can available balance cover what's already going out?
        coverage_check: bankBalance - processed,
        // Q2: Can total funds cover everything owed?
        total_exposure: (bankBalance + onHold) - (processed + pending),
      })
    }

    // On Hold — received or deposited, not cleared
    if (section === 'on_hold') {
      const { data, error } = await supabase
        .from('checks_received')
        .select(`
          id, property_address, check_from, check_amount, received_date,
          status, compliance_complete_date, crc_transferred, notes,
          transaction_id,
          check_payouts (
            id, payee_type, payee_name, user_id, amount, payment_status,
            payment_method, payment_date, payment_reference
          )
        `)
        .in('status', ['received', 'deposited'])
        .order('received_date', { ascending: false })

      if (error) throw error
      return NextResponse.json({ checks: data || [] })
    }

    // Active — cleared but not fully paid
    if (section === 'active') {
      const { data, error } = await supabase
        .from('checks_received')
        .select(`
          id, property_address, check_from, check_amount, received_date,
          deposited_date, cleared_date, compliance_complete_date,
          brokerage_amount, crc_transferred, status, notes, check_image_url,
          transaction_id,
          transactions!checks_received_transaction_id_fkey (
            onedrive_folder_url
          ),
          check_payouts (
            id, payee_type, payee_name, user_id, amount, payment_status,
            payment_method, payment_date, payment_reference
          )
        `)
        .in('status', ['cleared', 'pending_compliance', 'compliance_complete', 'payouts_in_progress'])
        .order('cleared_date', { ascending: false })

      if (error) throw error
      // Flatten the transaction join so onedrive_folder_url is directly on the check
      const checks = (data || []).map((c: any) => ({
        ...c,
        onedrive_folder_url: (c.transactions as any)?.onedrive_folder_url || null,
        transactions: undefined,
      }))
      return NextResponse.json({ checks })
    }

    // History — fully paid
    if (section === 'history') {
      const { data, error } = await supabase
        .from('checks_received')
        .select(`
          id, property_address, check_from, check_amount,
          cleared_date, crc_transferred, status,
          check_payouts (
            id, payee_type, payee_name, user_id, amount, payment_status, payment_date
          )
        `)
        .eq('status', 'paid')
        .order('updated_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return NextResponse.json({ checks: data || [] })
    }

    return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
  } catch (err: any) {
    console.error('Checks API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    // Update US Bank balance
    if (action === 'update_balance') {
      const { balance } = body

      // First try to update existing row
      const { data: existing } = await supabase
        .from('company_settings')
        .select('id')
        .limit(1)
        .single()

      if (existing?.id) {
        const { error } = await supabase
          .from('company_settings')
          .update({
            bank_balance: parseFloat(balance),
            bank_balance_updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({
            bank_balance: parseFloat(balance),
            bank_balance_updated_at: new Date().toISOString(),
          })
        if (error) throw error
      }

      return NextResponse.json({ success: true })
    }

    // Create a new check
    if (action === 'create_check') {
      const { check } = body
      const { data, error } = await supabase
        .from('checks_received')
        .insert([{
          check_amount: parseFloat(check.check_amount),
          received_date: check.received_date,
          check_from: check.check_from,
          check_number: check.check_number,
          property_address: check.property_address,
          transaction_id: check.transaction_id || null,
          deposited_date: check.deposited_date || null,
          cleared_date: check.cleared_date || null,
          compliance_complete_date: check.compliance_complete_date || null,
          brokerage_amount: check.brokerage_amount ? parseFloat(check.brokerage_amount) : null,
          notes: check.notes || null,
          status: 'received',
          crc_transferred: false,
        }])
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ check: data })
    }

    // Update a check
    if (action === 'update_check') {
      const { check_id, updates } = body
      const { data, error } = await supabase
        .from('checks_received')
        .update(updates)
        .eq('id', check_id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ check: data })
    }

    // Add a payout
    if (action === 'add_payout') {
      const { payout } = body
      const { data, error } = await supabase
        .from('check_payouts')
        .insert([{
          check_id: payout.check_id,
          payee_type: payout.payee_type,
          user_id: payout.user_id || null,
          payee_name: payout.payee_name || null,
          amount: parseFloat(payout.amount),
          payment_method: payout.payment_method || 'ach',
          payment_status: 'pending',
        }])
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ payout: data })
    }

    // Update a payout
    if (action === 'update_payout') {
      const { payout_id, updates } = body
      const { data, error } = await supabase
        .from('check_payouts')
        .update(updates)
        .eq('id', payout_id)
        .select()
        .single()

      if (error) throw error
      return NextResponse.json({ payout: data })
    }

    // Delete a payout
    if (action === 'delete_payout') {
      const { payout_id } = body
      const { error } = await supabase
        .from('check_payouts')
        .delete()
        .eq('id', payout_id)

      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: any) {
    console.error('Checks POST error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}