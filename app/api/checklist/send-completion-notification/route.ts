import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { user_id, user_name, user_email } = await request.json()

    if (!user_id || !user_name || !user_email) {
      return NextResponse.json({ error: 'user_id, user_name, and user_email are required' }, { status: 400 })
    }

    // Send email to office
    await resend.emails.send({
      from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
      to: 'office@collectiverealtyco.com',
      subject: `🎉 Onboarding Complete: ${user_name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #000000 0%, #1a1a1a 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0; font-size: 28px;">🎉 Onboarding Checklist Completed!</h1>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
              <strong>${user_name}</strong> has completed their onboarding checklist!
            </p>
            
            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Agent Name:</td>
                  <td style="padding: 8px 0; color: #333;">${user_name}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Email:</td>
                  <td style="padding: 8px 0; color: #333;">${user_email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #666; font-weight: bold;">Completion Date:</td>
                  <td style="padding: 8px 0; color: #333;">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              </table>
            </div>
            
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #4caf50;">
              <p style="margin: 0; color: #2e7d32; font-weight: bold;">✓ All checklist items completed</p>
              <p style="margin: 5px 0 0 0; color: #666; font-size: 14px;">The agent is now fully onboarded and ready to go!</p>
            </div>
          </div>
          
          <div style="background: #f0f0f0; padding: 20px; text-align: center; color: #666; font-size: 12px;">
            <p style="margin: 0;">This is an automated notification from the Collective Realty Co. Agent Portal</p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({
      success: true,
      message: 'Completion notification sent',
    })
  } catch (error: any) {
    console.error('Error sending completion notification:', error)
    return NextResponse.json({ error: error?.message || 'Failed to send notification' }, { status: 500 })
  }
}




