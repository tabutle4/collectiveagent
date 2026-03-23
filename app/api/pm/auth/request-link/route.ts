import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Email config
const FROM_EMAIL = 'pm@coachingbrokeragetools.com'
const FROM_NAME = 'Collective Realty Co. Property Management'

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
      // But log it for debugging
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

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: normalizedEmail,
      subject: 'Your Login Link - Collective Realty Co.',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="${baseUrl}/CRC-Luxury-Logo.png" alt="Collective Realty Co." style="height: 50px;">
          </div>
          
          <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 20px;">Hi ${firstName},</h1>
          
          <p style="margin-bottom: 20px;">Click the button below to sign in to your ${userType === 'landlord' ? 'Landlord' : 'Tenant'} Portal:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="display: inline-block; background-color: #B8860B; color: white; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 500;">
              Sign In to Portal
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666; margin-bottom: 10px;">This link will expire in 15 minutes.</p>
          
          <p style="font-size: 14px; color: #666;">If you didn't request this link, you can safely ignore this email.</p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #999; text-align: center;">
            Collective Realty Co. Property Management<br>
            <a href="mailto:pm@collectiverealtyco.com" style="color: #B8860B;">pm@collectiverealtyco.com</a>
          </p>
        </body>
        </html>
      `,
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
