import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { pmLoginEmail } from '@/lib/email/pm-layout'

const resend = new Resend(process.env.RESEND_API_KEY)

// Email config
const FROM_EMAIL = 'pm@coachingbrokeragetools.com'
const FROM_NAME = 'CRC Property Management'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const supabase = createClient()

    // Check if email exists as landlord or tenant
    const [landlordResult, tenantResult] = await Promise.all([
      supabase.from('landlords').select('id, first_name, email').eq('email', normalizedEmail).single(),
      supabase.from('tenants').select('id, first_name, email').eq('email', normalizedEmail).single(),
    ])

    const landlord = landlordResult.data
    const tenant = tenantResult.data

    if (!landlord && !tenant) {
      // Don't reveal whether email exists - always show success
      console.log(`PM login attempted for unknown email: ${normalizedEmail}`)
      return NextResponse.json({
        success: true,
        message: 'If an account exists, a login link has been sent.',
      })
    }

    // Determine user type and details
    const userType = landlord ? 'landlord' : 'tenant'
    const userId = landlord?.id || tenant?.id
    const firstName = landlord?.first_name || tenant?.first_name || 'there'

    // Get IP and user agent for security logging
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Create auth token (15 min expiry)
    const { data: tokenData, error: tokenError } = await supabase
      .from('pm_auth_tokens')
      .insert({
        user_type: userType,
        user_id: userId,
        email: normalizedEmail,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('token')
      .single()

    if (tokenError) {
      console.error('Failed to create auth token:', tokenError)
      return NextResponse.json({ error: 'Failed to create login link' }, { status: 500 })
    }

    // Build login URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    const loginUrl = `${baseUrl}/api/pm/auth/verify?token=${tokenData.token}`

    // Send email using standardized template
    const { error: emailError } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: normalizedEmail,
      subject: 'Your Login Link - CRC Property Management',
      html: pmLoginEmail(firstName, userType, loginUrl),
    })

    if (emailError) {
      console.error('Failed to send login email:', emailError)
      return NextResponse.json({ error: 'Failed to send login email' }, { status: 500 })
    }

    // Log the access attempt
    await supabase.from('pm_access_log').insert({
      user_type: userType,
      user_id: userId,
      email: normalizedEmail,
      action: 'login_requested',
      ip_address: ip,
      user_agent: userAgent,
    })

    console.log(`PM login link sent to ${normalizedEmail} (${userType})`)

    return NextResponse.json({
      success: true,
      message: 'If an account exists, a login link has been sent.',
    })
  } catch (error: any) {
    console.error('Error in PM auth request-link:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
