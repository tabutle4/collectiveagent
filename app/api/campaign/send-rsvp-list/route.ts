import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  throw new Error('Missing env.RESEND_API_KEY')
}

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(request: NextRequest) {
  try {
    const { campaign_id, event_staff_email } = await request.json()

    // Fetch campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Fetch all RSVPs
    const { data: rsvps } = await supabase
      .from('campaign_responses')
      .select(
        `
        *,
        users!inner(
          first_name,
          last_name,
          preferred_first_name,
          preferred_last_name,
          email,
          personal_phone
        )
      `
      )
      .eq('campaign_id', campaign_id)
      .not('attending_luncheon', 'is', null)

    const attending = rsvps?.filter(r => r.attending_luncheon === true) || []
    const notAttending = rsvps?.filter(r => r.attending_luncheon === false) || []

    // Build email HTML
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { background: #2d2d2d; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; background: #fff; }
    .stats { display: flex; gap: 20px; margin: 20px 0; }
    .stat-box { flex: 1; padding: 15px; background: #f8f8f8; border-left: 3px solid #C9A961; }
    .attendee { padding: 12px; margin: 8px 0; border-left: 3px solid #C9A961; background: #f8f8f8; }
    .attendee-name { font-weight: bold; margin-bottom: 4px; }
    .comment { font-size: 14px; color: #666; font-style: italic; }
    h2 { color: #2d2d2d; border-bottom: 2px solid #C9A961; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Collective Realty Co. Luncheon RSVP List</h1>
      <p>${campaign.name}</p>
    </div>
    
    <div class="content">
      <div class="stats">
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold; color: #C9A961;">${attending.length}</div>
          <div style="font-size: 14px; color: #666;">Attending</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold; color: #999;">${notAttending.length}</div>
          <div style="font-size: 14px; color: #666;">Not Attending</div>
        </div>
        <div class="stat-box">
          <div style="font-size: 32px; font-weight: bold;">${attending.length + notAttending.length}</div>
          <div style="font-size: 14px; color: #666;">Total Responses</div>
        </div>
      </div>

      <h2>Attending (${attending.length})</h2>
      ${
        attending.length === 0
          ? '<p style="color: #999;">No attendees yet</p>'
          : attending
              .map(
                rsvp => `
        <div class="attendee">
          <div class="attendee-name">${rsvp.users.preferred_first_name} ${rsvp.users.preferred_last_name}</div>
          ${rsvp.users.email ? `<div style="font-size: 13px; color: #666;">${rsvp.users.email}</div>` : ''}
          ${rsvp.users.personal_phone ? `<div style="font-size: 13px; color: #666;">${rsvp.users.personal_phone}</div>` : ''}
          ${rsvp.luncheon_comments ? `<div class="comment">"${rsvp.luncheon_comments}"</div>` : ''}
        </div>
      `
              )
              .join('')
      }

      <h2 style="margin-top: 40px;">Not Attending (${notAttending.length})</h2>
      ${
        notAttending.length === 0
          ? '<p style="color: #999;">Everyone is attending!</p>'
          : notAttending
              .map(
                rsvp => `
        <div class="attendee">
          <div class="attendee-name">${rsvp.users.preferred_first_name} ${rsvp.users.preferred_last_name}</div>
          ${rsvp.luncheon_comments ? `<div class="comment">"${rsvp.luncheon_comments}"</div>` : ''}
        </div>
      `
              )
              .join('')
      }

      <div style="margin-top: 40px; padding: 20px; background: #f8f8f8; border-left: 3px solid #2d2d2d;">
        <p style="margin: 0; font-size: 13px; color: #666;">
          <strong>Generated:</strong> ${new Date().toLocaleString()}<br>
          <strong>Event:</strong> Tuesday, December 16 at 12:00 PM<br>
          <strong>Venue:</strong> Rhay's Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077<br>
          <strong>Dress Code:</strong> Black Tie
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `

    // Send email
    try {
      await resend.emails.send({
        from: 'Collective Realty Co. <notifications@coachingbrokeragetools.com>',
        to: event_staff_email,
        cc: 'office@collectiverealtyco.com',
        subject: `Luncheon RSVP List - ${attending.length} Attending`,
        html: emailHtml,
      })
    } catch (emailError: any) {
      console.error('Resend email error:', emailError)
      return NextResponse.json(
        { error: emailError?.message || 'Failed to send email via Resend' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Send RSVP list error:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to send RSVP list' },
      { status: 500 }
    )
  }
}
