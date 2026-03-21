import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizeSocialUrl } from '@/lib/socialLinks'

/**
 * Migration endpoint to push profile_updates from campaign_responses to users table
 * This fixes cases where the users table update failed but profile_updates was saved
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const campaign_id = body.campaign_id

    // Build query - filter by campaign_id if provided
    let query = supabase
      .from('campaign_responses')
      .select('id, user_id, profile_updates, commission_plan_2026, commission_plan_2026_other')
      .not('profile_updates', 'is', null)

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id)
    }

    const { data: responses, error: fetchError } = await query

    if (fetchError) {
      console.error('Error fetching campaign responses:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch campaign responses', details: fetchError.message },
        { status: 500 }
      )
    }

    if (!responses || responses.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No profile updates found to migrate',
        updated: 0,
      })
    }

    const results = {
      total: responses.length,
      updated: 0,
      skipped: 0,
      errors: [] as Array<{ user_id: string; error: string }>,
    }

    // Process each response
    for (const response of responses) {
      try {
        const profileUpdates = response.profile_updates as any

        if (!profileUpdates || typeof profileUpdates !== 'object') {
          results.skipped++
          continue
        }

        // Build update payload matching the update-profile route
        const updatePayload: Record<string, any> = {}

        // Map all fields from profile_updates to users table
        if (profileUpdates.first_name !== undefined) {
          updatePayload.first_name = profileUpdates.first_name || null
        }
        if (profileUpdates.last_name !== undefined) {
          updatePayload.last_name = profileUpdates.last_name || null
        }
        if (profileUpdates.preferred_first_name !== undefined) {
          updatePayload.preferred_first_name = profileUpdates.preferred_first_name || null
        }
        if (profileUpdates.preferred_last_name !== undefined) {
          updatePayload.preferred_last_name = profileUpdates.preferred_last_name || null
        }
        if (profileUpdates.personal_email !== undefined) {
          updatePayload.personal_email = profileUpdates.personal_email || null
        }
        if (profileUpdates.personal_phone !== undefined) {
          updatePayload.personal_phone = profileUpdates.personal_phone || null
        }
        if (profileUpdates.business_phone !== undefined) {
          updatePayload.business_phone = profileUpdates.business_phone || null
        }
        if (profileUpdates.date_of_birth !== undefined) {
          updatePayload.date_of_birth = profileUpdates.date_of_birth || null
        }
        if (profileUpdates.birth_month !== undefined) {
          updatePayload.birth_month = profileUpdates.birth_month || null
        }
        if (profileUpdates.shirt_type !== undefined) {
          updatePayload.shirt_type = profileUpdates.shirt_type || null
        }
        if (profileUpdates.shirt_size !== undefined) {
          updatePayload.shirt_size = profileUpdates.shirt_size || null
        }
        if (profileUpdates.shipping_address_line1 !== undefined) {
          updatePayload.shipping_address_line1 = profileUpdates.shipping_address_line1 || null
        }
        if (profileUpdates.shipping_address_line2 !== undefined) {
          updatePayload.shipping_address_line2 = profileUpdates.shipping_address_line2 || null
        }
        if (profileUpdates.shipping_city !== undefined) {
          updatePayload.shipping_city = profileUpdates.shipping_city || null
        }
        if (profileUpdates.shipping_state !== undefined) {
          updatePayload.shipping_state = profileUpdates.shipping_state || null
        }
        if (profileUpdates.shipping_zip !== undefined) {
          updatePayload.shipping_zip = profileUpdates.shipping_zip || null
        }

        // Social media links with normalization
        if (profileUpdates.instagram_handle !== undefined) {
          updatePayload.instagram_handle = profileUpdates.instagram_handle
            ? normalizeSocialUrl(profileUpdates.instagram_handle, 'instagram')
            : null
        }
        if (profileUpdates.tiktok_handle !== undefined) {
          updatePayload.tiktok_handle = profileUpdates.tiktok_handle
            ? normalizeSocialUrl(profileUpdates.tiktok_handle, 'tiktok')
            : null
        }
        if (profileUpdates.threads_handle !== undefined) {
          updatePayload.threads_handle = profileUpdates.threads_handle
            ? normalizeSocialUrl(profileUpdates.threads_handle, 'threads')
            : null
        }
        if (profileUpdates.youtube_url !== undefined) {
          updatePayload.youtube_url = profileUpdates.youtube_url
            ? normalizeSocialUrl(profileUpdates.youtube_url, 'youtube')
            : null
        }
        if (profileUpdates.linkedin_url !== undefined) {
          updatePayload.linkedin_url = profileUpdates.linkedin_url
            ? normalizeSocialUrl(profileUpdates.linkedin_url, 'linkedin')
            : null
        }
        if (profileUpdates.facebook_url !== undefined) {
          updatePayload.facebook_url = profileUpdates.facebook_url
            ? normalizeSocialUrl(profileUpdates.facebook_url, 'facebook')
            : null
        }

        // Commission plan (if available)
        if (response.commission_plan_2026 !== undefined) {
          updatePayload.commission_plan = response.commission_plan_2026 || null
        }
        if (response.commission_plan_2026_other !== undefined) {
          updatePayload.commission_plan_other = response.commission_plan_2026_other || null
        }

        // Only update if there's something to update
        if (Object.keys(updatePayload).length === 0) {
          results.skipped++
          continue
        }

        // Update the user record
        const { error: updateError } = await supabase
          .from('users')
          .update(updatePayload)
          .eq('id', response.user_id)

        if (updateError) {
          console.error(`Error updating user ${response.user_id}:`, updateError)
          results.errors.push({
            user_id: response.user_id,
            error: updateError.message,
          })
          results.skipped++
        } else {
          results.updated++
        }
      } catch (err: any) {
        console.error(`Error processing response ${response.id}:`, err)
        results.errors.push({
          user_id: response.user_id || 'unknown',
          error: err.message || 'Unknown error',
        })
        results.skipped++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Migration complete: ${results.updated} updated, ${results.skipped} skipped`,
      results,
    })
  } catch (error: any) {
    console.error('Migration error:', error)
    return NextResponse.json({ error: 'Migration failed', details: error.message }, { status: 500 })
  }
}
