import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

// Recompute a tenant invoice's other_charges total and total_amount from the
// sum of its line-item charges. Mirrors the helper in the collection route.
async function syncInvoiceTotal(supabase: any, invoiceId: string) {
  const { data: charges } = await supabase
    .from('tenant_invoice_charges')
    .select('amount, label')
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

// DELETE /api/pm/invoice-charges/[id]
// Removes a line-item charge and re-syncs the parent invoice total.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm_invoices')
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const supabase = createClient()

    const { data: charge } = await supabase
      .from('tenant_invoice_charges')
      .select('id, tenant_invoice_id')
      .eq('id', resolvedParams.id)
      .single()

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found' }, { status: 404 })
    }

    // Block deletion if the parent invoice is already paid.
    const { data: inv } = await supabase
      .from('tenant_invoices')
      .select('status')
      .eq('id', charge.tenant_invoice_id)
      .single()

    if (inv?.status === 'paid') {
      return NextResponse.json(
        { error: 'Cannot remove a charge from a paid invoice' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('tenant_invoice_charges')
      .delete()
      .eq('id', resolvedParams.id)

    if (error) throw error

    await syncInvoiceTotal(supabase, charge.tenant_invoice_id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error deleting invoice charge:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
