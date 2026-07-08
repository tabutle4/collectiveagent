import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// Recompute a tenant invoice's other_charges total and total_amount from the
// sum of its line-item charges. Keeps the invoice's billable total in sync
// so Payload bills the correct amount. Never touches paid invoices.
async function syncInvoiceTotal(supabase: any, invoiceId: string) {
  const { data: charges } = await supabase
    .from('tenant_invoice_charges')
    .select('amount, label, description')
    .eq('tenant_invoice_id', invoiceId)

  const total = (charges || []).reduce(
    (sum: number, c: any) => sum + Number(c.amount || 0), 0
  )
  const desc = (charges || []).map((c: any) => c.label).join('; ') || null

  const { data: inv } = await supabase
    .from('tenant_invoices')
    .select('rent_amount, late_fee, deposit_amount, status')
    .eq('id', invoiceId)
    .single()

  if (!inv || inv.status === 'paid') return

  const newTotal =
    Number(inv.rent_amount || 0) +
    Number(inv.late_fee || 0) +
    total +
    Number(inv.deposit_amount || 0)

  await supabase
    .from('tenant_invoices')
    .update({
      other_charges: Math.round(total * 100) / 100,
      other_charges_description: desc,
      total_amount: Math.round(newTotal * 100) / 100,
      updated_at: new Date().toISOString(),
    })
    .eq('id', invoiceId)
}

// GET /api/pm/invoice-charges?tenant_invoice_id=X
// Lists line-item charges for an invoice.
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const invoiceId = searchParams.get('tenant_invoice_id')

    if (!invoiceId) {
      return NextResponse.json({ error: 'tenant_invoice_id is required' }, { status: 400 })
    }

    const { data: charges, error } = await supabase
      .from('tenant_invoice_charges')
      .select('*')
      .eq('tenant_invoice_id', invoiceId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json({ charges: charges || [] })
  } catch (error: any) {
    console.error('Error listing invoice charges:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/pm/invoice-charges
// Adds a line-item charge to a tenant invoice and re-syncs the invoice total.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()
    const {
      tenant_invoice_id,
      label,
      amount,
      description,
      destination,
    } = body

    if (!tenant_invoice_id || !label || amount == null) {
      return NextResponse.json(
        { error: 'tenant_invoice_id, label, and amount are required' },
        { status: 400 }
      )
    }
    if (Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be greater than 0' }, { status: 400 })
    }
    const dest = destination === 'crc' ? 'crc' : 'owner'

    // Fetch the invoice to resolve property_id + landlord_id and block paid invoices.
    const { data: invoice } = await supabase
      .from('tenant_invoices')
      .select('id, property_id, landlord_id, status')
      .eq('id', tenant_invoice_id)
      .single()

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }
    if (invoice.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot add charges to a paid invoice' },
        { status: 400 }
      )
    }

    const { data: charge, error } = await supabase
      .from('tenant_invoice_charges')
      .insert({
        tenant_invoice_id,
        property_id: invoice.property_id,
        landlord_id: invoice.landlord_id,
        label: String(label).trim(),
        amount: Number(amount),
        description: description?.trim() || null,
        destination: dest,
        created_by: auth.user.id,
      })
      .select()
      .single()

    if (error) throw error

    await syncInvoiceTotal(supabase, tenant_invoice_id)

    return NextResponse.json({ success: true, charge })
  } catch (error: any) {
    console.error('Error creating invoice charge:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
