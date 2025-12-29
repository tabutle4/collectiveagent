import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendProspectWelcomeEmail, sendAdminProspectNotification } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.json()

    const requiredFields = [
      'first_name',
      'last_name',
      'preferred_first_name',
      'preferred_last_name',
      'email',
      'phone',
      'location',
      'mls_choice',
      'association_status',
      'expectations',
      'accountability',
      'lead_generation',
      'additional_info',
      'how_heard',
    ]

    for (const field of requiredFields) {
      if (!formData[field]) {
        return NextResponse.json(
          { error: `${field} is required` },
          { status: 400 }
        )
      }
    }

    // Validate phone number: must be exactly 10 digits
    const phoneDigits = formData.phone.replace(/\D/g, '')
    if (phoneDigits.length !== 10) {
      return NextResponse.json(
        { error: 'Phone number must be exactly 10 digits' },
        { status: 400 }
      )
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', formData.email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: 'This email is already registered in our system' },
        { status: 409 }
      )
    }

    const { data: prospect, error: insertError } = await supabase
      .from('users')
      .insert({
        email: formData.email.toLowerCase(),
        password_hash: '',
        first_name: formData.first_name,
        last_name: formData.last_name,
        preferred_first_name: formData.preferred_first_name,
        preferred_last_name: formData.preferred_last_name,
        status: 'prospect',
        is_active: false,
        roles: [],
        phone: phoneDigits,
        location: formData.location,
        instagram_handle: formData.instagram_handle || null,
        mls_choice: formData.mls_choice,
        association_status_on_join: formData.association_status,
        previous_brokerage: formData.previous_brokerage || null,
        expectations: formData.expectations,
        accountability: formData.accountability,
        lead_generation: formData.lead_generation,
        additional_info: formData.additional_info,
        how_heard: formData.how_heard,
        how_heard_other: formData.how_heard_other || null,
        referring_agent: formData.referring_agent || null,
        joining_team: formData.joining_team || null,
        prospect_status: 'new',
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      throw insertError
    }

    try {
      await sendProspectWelcomeEmail({
        preferred_first_name: prospect.preferred_first_name,
        email: prospect.email,
      })
    } catch (emailError) {
      console.error('Error sending prospect email:', emailError)
    }

    const { data: adminUsers } = await supabase
      .from('users')
      .select('email')
      .contains('roles', ['admin'])
      .eq('is_active', true)

    const adminEmails = adminUsers?.map(u => u.email) || []

    try {
      await sendAdminProspectNotification(adminEmails, prospect)
    } catch (emailError) {
      console.error('Error sending admin notification:', emailError)
    }

    return NextResponse.json({
      message: 'Prospect submitted successfully',
      prospect: {
        id: prospect.id,
        preferred_first_name: prospect.preferred_first_name,
        email: prospect.email,
      },
    })
  } catch (error) {
    console.error('Prospect submission error:', error)
    return NextResponse.json(
      { error: 'An error occurred while submitting your information' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { data: prospects, error } = await supabase
      .from('users')
      .select('*')
      .eq('status', 'prospect')
      .order('created_at', { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json({ prospects })
  } catch (error) {
    console.error('Get prospects error:', error)
    return NextResponse.json(
      { error: 'An error occurred while fetching prospects' },
      { status: 500 }
    )
  }
}