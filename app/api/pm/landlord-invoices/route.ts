import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id')
    const search = searchParams.get('search')

    let query = supabase
      .from('pm_landlord_invoices')
      .select(`
        *,
        landlords(id, first_name, last_name, email),
        managed_properties(id, property_address, unit, city)
      `)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })

    if (status && status !== 'all') query = query.eq('status', status)
    if (landlordId) query = query.eq('landlord_id', landlordId)
    if (propertyId) query = query.eq('property_id', propertyId)

    const { data, error } = await query
    if (error) throw error

    let invoices = data || []

    if (search) {
      const s = search.toLowerCase()
      invoices = invoices.filter((inv: any) => {
        const ll = inv.landlords
        const prop = inv.managed_properties
        return (
          `${ll?.first_name} ${ll?.last_name}`.toLowerCase().includes(s) ||
          ll?.email?.toLowerCase().includes(s) ||
          prop?.property_address?.toLowerCase().includes(s)
        )
      })
    }

    // Stats
    const stats = {
      pending: invoices.filter((i: any) => i.status === 'pending').length,
      sent: invoices.filter((i: any) => i.status === 'sent').length,
      overdue: invoices.filter((i: any) => {
        if (i.status === 'paid' || i.status === 'cancelled') return false
        return new Date(i.due_date) < new Date()
      }).length,
      paid: invoices.filter((i: any) => i.status === 'paid').length,
      totalOutstanding: invoices
        .filter((i: any) => i.status !== 'paid' && i.status !== 'cancelled')
        .reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0),
    }

    return NextResponse.json({ invoices, stats })
  } catch (error: any) {
    console.error('Error fetching landlord invoices:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
