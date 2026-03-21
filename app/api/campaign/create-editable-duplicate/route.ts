import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Helper function to convert hardcoded campaign to editable steps_config
function convertHardcodedToStepsConfig(currentYear: number, newYear: number) {
  return [
    {
      stepNumber: 1,
      type: 'info',
      title: `${newYear} Commission Plan Selection`,
      content: {
        greeting: 'Hi, {first_name}',
        sections: [
          {
            heading: `${currentYear} Production Period`,
            items: [
              `Your ${currentYear} numbers will reflect closings from **November 23, ${currentYear - 1} through November 22, ${currentYear}**.`,
            ],
          },
          {
            heading: 'Important Information',
            items: [
              'There will be **NO fee, split, or cap increases for ' + newYear + '!**',
              'Your Independent Contractor Agreement remains in effect for an indefinite term. It continues unless you terminate following the [firm exit process](https://collectiverealtyco.sharepoint.com/sites/agenttrainingcenter/SitePages/Firm-Exit-Process.aspx).',
              'You may change your commission plan annually when eligible.',
              'If you select a new commission plan, you will receive a new agreement to sign reflecting your updated plan.',
            ],
          },
          {
            heading: 'Make Your Deals Count!',
            items: [
              "If you've already been paid for your deal by November 22nd, it's counted because it's closed out in Brokermint.",
              'For unpaid leases/apartments, ensure by November 28th:',
              '  • Transaction is created in Brokermint',
              '  • Transaction is in **Pending** status',
              `  • Closing date is entered (between November 23, ${currentYear - 1} and November 22, ${currentYear})`,
              '  • Sales price is calculated as: Rent × Months in Lease Term',
              '  • 💡 Example: $1,000 rent × 12 months = $12,000 sales price',
            ],
          },
        ],
        buttonText: 'Next: Update My Profile →',
      },
    },
    {
      stepNumber: 2,
      type: 'profile',
      title: 'Update Your Profile',
      content: {
        fields: [
          'first_name',
          'last_name',
          'preferred_first_name',
          'preferred_last_name',
          'personal_email',
          'personal_phone',
          'business_phone',
          'date_of_birth',
          'shirt_type',
          'shirt_size',
          'shipping_address_line1',
          'shipping_address_line2',
          'shipping_city',
          'shipping_state',
          'shipping_zip',
          'commission_plan',
          'commission_plan_other',
        ],
      },
    },
    {
      stepNumber: 3,
      type: 'rsvp',
      title: 'Annual Award Ceremony Luncheon',
      content: {
        eventTitle: 'Annual Award Ceremony Luncheon',
        eventSubtitle: 'We Made It!',
        eventDescription: "Join us to celebrate our entire firm's success this year.",
        hostedBy: 'CJE Media',
        when: 'Tuesday, December 16 at 12:00 PM',
        where: "Rhay's Restaurant & Lounge, 11920 Westheimer Rd #J, Houston, TX 77077",
        rsvpBy: 'December 9, ' + newYear,
        dressCode: 'Black Tie',
        eventFlyerUrl: '',
        commentsPrompt: 'Any dietary restrictions or special requests?',
        closingText: "Let's Celebrate!",
      },
    },
    {
      stepNumber: 4,
      type: 'survey',
      title: 'Quick Feedback Survey',
      content: {
        questions: [
          {
            id: 'q1',
            type: 'slider',
            label: 'On a scale of 1-10, how supported do you feel by Collective Realty Co.?',
            required: true,
            min: 1,
            max: 10,
            minLabel: 'Not supported',
            maxLabel: 'Very supported',
          },
          {
            id: 'q2',
            type: 'textarea',
            label: 'What are two specific ways we could better support you in ' + newYear + '?',
            required: false,
          },
          {
            id: 'q3',
            type: 'radio',
            label: 'In ' + newYear + ', do you see yourself working best:',
            required: true,
            options: ['On a team', 'Independently', 'Not sure yet'],
          },
        ],
      },
    },
  ]
}

export async function POST(request: NextRequest) {
  try {
    const { campaign_id } = await request.json()

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    }

    // Fetch the original campaign
    const { data: originalCampaign, error: fetchError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (fetchError || !originalCampaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Calculate new year and dates
    const currentYear = originalCampaign.year || new Date().getFullYear()
    const newYear = currentYear + 1

    // Update deadline to next year (same month/day)
    const oldDeadline = new Date(originalCampaign.deadline)
    const newDeadline = new Date(oldDeadline.setFullYear(oldDeadline.getFullYear() + 1))
      .toISOString()
      .split('T')[0]

    // Create new campaign name and slug
    const newName = originalCampaign.name.replace(String(currentYear), String(newYear))
    const newSlug = originalCampaign.slug.replace(String(currentYear), String(newYear))

    // Convert hardcoded campaign to editable steps_config format
    const stepsConfig = convertHardcodedToStepsConfig(currentYear, newYear)

    // Check if slug already exists and find a unique one
    let uniqueSlug = newSlug
    let attempt = 1
    while (attempt <= 10) {
      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('slug', uniqueSlug)
        .maybeSingle()

      if (!existing) break
      attempt++
      uniqueSlug = `${newSlug}-${attempt}`
    }

    // Create the duplicate campaign with editable steps_config
    const { data: newCampaign, error: insertError } = await supabase
      .from('campaigns')
      .insert([
        {
          name: newName,
          slug: uniqueSlug,
          year: newYear,
          deadline: newDeadline,
          event_staff_email: originalCampaign.event_staff_email,
          is_active: false, // Start as inactive
          email_subject:
            originalCampaign.email_subject?.replace(String(currentYear), String(newYear)) || null,
          email_body:
            originalCampaign.email_body?.replace(String(currentYear), String(newYear)) || null,
          steps_config: stepsConfig, // Converted hardcoded content to editable format
        },
      ])
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json(
          { error: 'A campaign with this slug already exists' },
          { status: 400 }
        )
      }
      throw insertError
    }

    return NextResponse.json({
      success: true,
      campaign: newCampaign,
      message: `Created editable duplicate "${newName}" successfully! This campaign has all the hardcoded content converted to editable steps_config format.`,
    })
  } catch (error) {
    console.error('Create editable duplicate error:', error)
    return NextResponse.json({ error: 'Failed to create editable duplicate' }, { status: 500 })
  }
}
