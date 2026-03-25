import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { pmTenantInviteEmail } from '@/lib/email/pm-layout'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check permissions using standard PM pattern
    const auth = await requirePermission(request, 'can_manage_pm')
    if (auth.error) return auth.error

    const { id } = await params
    const supabase = await createClient()

    // Get tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .single()

    if (tenantError || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    // Get property address from active lease
    const { data: lease } = await supabase
      .from('pm_leases')
      .select('managed_properties(property_address, city, state)')
      .eq('tenant_id', id)
      .eq('status', 'active')
      .single()

    // Handle Supabase join type (can be array or object depending on FK)
    const rawProperty = lease?.managed_properties
    const property = Array.isArray(rawProperty) ? rawProperty[0] : rawProperty
    const propertyAddress = property 
      ? `${property.property_address}, ${property.city}, ${property.state}`
      : 'your rental property'

    // Send invite email
    const html = pmTenantInviteEmail(tenant.first_name, propertyAddress)

    const { error: emailError } = await resend.emails.send({
      from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
      to: tenant.email,
      subject: 'Access Your Tenant Portal',
      html,
    })

    if (emailError) {
      console.error('Email error:', emailError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Invite sent to ${tenant.email}` 
    })
  } catch (err) {
    console.error('Send tenant invite error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}