import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { pmLandlordInviteEmail } from '@/lib/email/pm-layout'

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

    // Get landlord
    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .single()

    if (landlordError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    // Send invite email
    const html = pmLandlordInviteEmail(landlord.first_name)

    const { error: emailError } = await resend.emails.send({
      from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
      to: landlord.email,
      subject: 'Access Your Landlord Portal',
      html,
    })

    if (emailError) {
      console.error('Email error:', emailError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `Invite sent to ${landlord.email}` 
    })
  } catch (err) {
    console.error('Send landlord invite error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}