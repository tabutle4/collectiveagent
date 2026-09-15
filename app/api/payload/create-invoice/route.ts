import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { createAgentInvoice } from '@/lib/payload/agentInvoice'

type InvoiceType = 'onboarding' | 'monthly' | 'custom'

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_agent_billing')
  if (auth.error) return auth.error

  try {
    const {
      user_id,
      type,
      amount,
      description,
      month,
      year: invoiceYear,
      due_date: dueDateInput,
    }: {
      user_id: string
      type: InvoiceType
      amount?: number
      description?: string
      month?: string
      year?: number
      due_date?: string
    } = await request.json()

    if (!user_id || !type) {
      return NextResponse.json({ error: 'user_id and type are required' }, { status: 400 })
    }
    if (type === 'custom' && (!amount || !description)) {
      return NextResponse.json(
        { error: 'amount and description are required for custom invoices' },
        { status: 400 }
      )
    }
    // Custom invoices require an admin-chosen due date. Monthly and onboarding
    // invoices keep their existing same-day default, which is what the cron and
    // onboarding flow rely on.
    if (type === 'custom') {
      if (!dueDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)) {
        return NextResponse.json(
          { error: 'due_date (YYYY-MM-DD) is required for custom invoices' },
          { status: 400 }
        )
      }
    }

    // Fetch fee settings
    const { data: companySettings } = await supabaseAdmin
      .from('company_settings')
      .select('standard_onboarding_fee, standard_monthly_fee')
      .single()
    
    const onboardingFee = companySettings?.standard_onboarding_fee ?? 399
    const monthlyFee = companySettings?.standard_monthly_fee ?? 50

    const supabase = createClient()
    const { data: user } = await supabase
      .from('users')
      .select('payload_payee_id')
      .eq('id', user_id)
      .single()

    if (!user?.payload_payee_id) {
      return NextResponse.json(
        { error: 'Agent does not have a Payload customer ID.' },
        { status: 400 }
      )
    }

    const today = new Date().toISOString().split('T')[0]
    // For custom invoices, use the admin-chosen due date. Everything else keeps
    // the existing same-day default.
    const invoiceDueDate = type === 'custom' ? dueDateInput! : today
    const params = new URLSearchParams({
      type: 'bill',
      due_date: invoiceDueDate,
      processing_id: process.env.PAYLOAD_PROCESSING_ID!,
      customer_id: user.payload_payee_id,
    })

    if (type === 'onboarding') {
      const now = new Date()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const remainingDays = daysInMonth - now.getDate() + 1
      const proratedFee = Math.round((monthlyFee / daysInMonth) * remainingDays * 100) / 100
      const monthName = now.toLocaleString('default', { month: 'long' })

      params.append('items[0][type]', 'Onboarding Fee')
      params.append('items[0][description]', 'One-time onboarding fee')
      params.append('items[0][amount]', onboardingFee.toString())
      params.append('items[0][entry_type]', 'charge')

      if (proratedFee > 0) {
        params.append('items[1][type]', 'Monthly Fee (Prorated)')
        params.append(
          'items[1][description]',
          `Prorated monthly fee, ${remainingDays} days remaining in ${monthName}`
        )
        params.append('items[1][amount]', proratedFee.toString())
        params.append('items[1][entry_type]', 'charge')
      }
    } else if (type === 'monthly') {
      const now = new Date()
      const monthName = month || now.toLocaleString('default', { month: 'long' })
      const year = invoiceYear || now.getFullYear()
      params.append('description', `${monthName} ${year} Monthly Brokerage Fee`)
      params.append('items[0][type]', 'Monthly Fee')
      params.append('items[0][description]', `${monthName} ${year} Monthly Brokerage Fee`)
      params.append('items[0][amount]', monthlyFee.toString())
      params.append('items[0][entry_type]', 'charge')
    } else {
      // Custom invoice
      params.append('items[0][type]', description!)
      params.append('items[0][description]', description!)
      params.append('items[0][amount]', amount!.toString())
      params.append('items[0][entry_type]', 'charge')
    }

    // The monthly brokerage fee is the only agent invoice autopay may collect.
    // An onboarding fee or a custom invoice the office typed (an MLS input fee,
    // an eCommission balance) has to be looked at before it is paid.
    const created = await createAgentInvoice(params, {
      autopayAllowed: type === 'monthly',
    })

    if (!created.ok) {
      console.error('Payload invoice creation failed:', created.error)
      return NextResponse.json(
        { error: created.error?.message || 'Failed to create invoice' },
        { status: 500 }
      )
    }

    const data = created.invoice
    if (!created.autopayConfirmed) {
      console.error(
        'Invoice created but its autopay setting could not be confirmed:',
        data?.id
      )
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
        due_date: invoiceDueDate,
        status: 'outstanding',
        notes: `Payload invoice ID: ${data.id}`,
      })
    }

    return NextResponse.json({ success: true, invoice_id: data.id })
  } catch (error: any) {
    console.error('Error creating invoice:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create invoice' },
      { status: 500 }
    )
  }
}
