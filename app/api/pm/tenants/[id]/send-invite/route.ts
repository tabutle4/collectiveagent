import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { pmTenantInviteEmail } from '@/lib/email/pm-layout'

const FROM_UPN = 'tarab@collectiverealtyco.com'
const BCC_OFFICE = 'office@collectiverealtyco.com'
const REPLY_TO = 'pm@collectiverealtyco.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, 'can_manage_pm')
    if (auth.error) return auth.error

    const { id } = await params
    const supabase = await createClient()

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const { data: lease } = await supabase
      .from('pm_leases')
      .select('managed_properties(property_address, city, state)')
      .eq('tenant_id', id)
      .eq('status', 'active')
      .single()

    const rawProperty = lease?.managed_properties
    const property = Array.isArray(rawProperty) ? rawProperty[0] : rawProperty
    const propertyAddress = property
      ? `${property.property_address}, ${property.city}, ${property.state}`
      : 'your rental property'

    const html = pmTenantInviteEmail(tenant.first_name, propertyAddress)

    await sendMailAs({
      fromUpn: FROM_UPN,
      to: tenant.email,
      bcc: BCC_OFFICE,
      replyTo: REPLY_TO,
      subject: 'Access Your Tenant Portal',
      html,
    })

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${tenant.email}`,
    })
  } catch (err: any) {
    console.error('Send tenant invite error:', err)
    return NextResponse.json({ error: err.userMessage || err.message || 'Internal server error' }, { status: 500 })
  }
}
