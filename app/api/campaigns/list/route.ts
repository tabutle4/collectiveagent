import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .order('year', { ascending: false })

    if (error) throw error

    // Get completion counts for each campaign
    const campaignsWithCounts = await Promise.all(
      (campaigns || []).map(async campaign => {
        const { count } = await supabase
          .from('campaign_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('campaign_id', campaign.id)
          .not('fully_completed_at', 'is', null)

        return { ...campaign, completed_count: count || 0 }
      })
    )

    return NextResponse.json({ campaigns: campaignsWithCounts })
  } catch (error: any) {
    console.error('Error fetching campaigns:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_campaigns')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const body = await request.json()

    // Validate required fields
    if (!body.name || !body.slug || !body.deadline) {
      return NextResponse.json(
        { error: 'Campaign name, slug, and deadline are required' },
        { status: 400 }
      )
    }

    // Check slug uniqueness and find a unique one
    let uniqueSlug = body.slug.trim()
    let attempt = 1

    while (attempt <= 10) {
      const { data: existing } = await supabase
        .from('campaigns')
        .select('id')
        .eq('slug', uniqueSlug)
        .maybeSingle()

      if (!existing) break
      attempt++
      uniqueSlug = `${body.slug.trim()}-${attempt}`
    }

    if (attempt > 10) {
      return NextResponse.json(
        { error: 'Unable to generate a unique slug. Please try a different name.' },
        { status: 400 }
      )
    }

    const insertData = {
      name: body.name.trim(),
      slug: uniqueSlug,
      year: body.year || null,
      deadline: body.deadline,
      event_staff_email: body.event_staff_email?.trim() || null,
      is_active: body.is_active ?? true,
      email_subject: body.email_subject?.trim() || null,
      email_body: body.email_body?.trim() || null,
      steps_config: body.steps_config || null,
    }

    const { data, error } = await supabase
      .from('campaigns')
      .insert([insertData])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ campaign: data })
  } catch (error: any) {
    console.error('Error creating campaign:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}