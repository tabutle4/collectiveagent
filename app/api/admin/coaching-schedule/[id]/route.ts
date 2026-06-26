import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getGraphToken } from '@/lib/microsoft-graph'
import { buildEventBody, buildGraphRecurrence, nextDateForDay } from '@/lib/schedule-utils'

const GROUP_ID = process.env.MICROSOFT_GROUP_ID!

// ── PUT /api/admin/coaching-schedule/[id] ─────────────────────────────────
// Updates a session in DB and patches the linked Outlook event if one exists.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const body = await request.json()
    const {
      section,
      display_title,
      outlook_event_id,
      recurrence_type,
      recurrence_day,
      start_time,
      end_time,
      description,
      platform,
      audience,
      host,
      highlight,
      image_url,
      active,
    } = body

    // SELECT current row first — all fields needed as fallbacks for Outlook PATCH
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,outlook_event_id,recurrence_type,recurrence_day,start_time,end_time,display_title,active,description,platform,audience,host,image_url')
      .eq('id', id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    const row = current as any

    // Update DB
    const { error: updateErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .update({
        ...(section !== undefined && { section }),
        ...(display_title !== undefined && { display_title }),
        ...(outlook_event_id !== undefined && { outlook_event_id }),
        ...(recurrence_type !== undefined && { recurrence_type }),
        ...(recurrence_day !== undefined && { recurrence_day }),
        ...(start_time !== undefined && { start_time }),
        ...(end_time !== undefined && { end_time }),
        ...(description !== undefined && { description }),
        ...(platform !== undefined && { platform }),
        ...(audience !== undefined && { audience }),
        ...(host !== undefined && { host: host || null }),
        ...(highlight !== undefined && { highlight }),
        ...(image_url !== undefined && { image_url: image_url || null }),
        ...(active !== undefined && { active }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) {
      console.error('coaching-schedule PUT - DB update error:', updateErr)
      const isDuplicate = updateErr.code === '23505'
      return NextResponse.json(
        { error: isDuplicate ? 'A session with that title already exists.' : 'Failed to update session' },
        { status: isDuplicate ? 409 : 500 }
      )
    }
    const effectiveOutlookId = outlook_event_id ?? row.outlook_event_id
    // Only sync to Outlook if at least one Outlook-relevant field is in the request body
    const outlookFieldsChanged = [
      'display_title', 'start_time', 'end_time', 'recurrence_type',
      'recurrence_day', 'description', 'platform', 'audience', 'host', 'image_url',
    ].some(f => body[f] !== undefined)

    let outlookSynced = false
    let outlookError: string | null = null

    if (effectiveOutlookId && outlookFieldsChanged) {
      try {
        const token = await getGraphToken()
        const newTitle       = display_title    ?? row.display_title
        const newStart       = start_time       ?? row.start_time
        const newEnd         = end_time         ?? row.end_time
        const newRecType     = recurrence_type  ?? row.recurrence_type
        const newRecDay      = recurrence_day   ?? row.recurrence_day
        const newDescription = description      ?? row.description
        const newAudience    = audience         ?? row.audience
        const newHost        = host !== undefined ? (host || null) : row.host
        const newPlatform    = platform         ?? row.platform
        const newImageUrl    = image_url !== undefined ? (image_url || null) : row.image_url

        const eventBody = buildEventBody({
          description: newDescription,
          audience:    newAudience,
          host:        newHost,
          imageUrl:    newImageUrl,
        })

        // Only rebuild recurrence if day/type changed
        const recurrenceChanged =
          (recurrence_type !== undefined && recurrence_type !== row.recurrence_type) ||
          (recurrence_day  !== undefined && recurrence_day  !== row.recurrence_day)

        const patchPayload: any = {
          subject:  newTitle,
          body:     { contentType: 'html', content: eventBody },
          location: { displayName: newPlatform },
        }

        // Time change — use a fixed date for start/end on the series master
        const startDate = nextDateForDay(newRecDay)
        patchPayload.start = {
          dateTime: `${startDate}T${newStart}:00`,
          timeZone: 'America/Chicago',
        }
        patchPayload.end = {
          dateTime: `${startDate}T${newEnd}:00`,
          timeZone: 'America/Chicago',
        }

        if (recurrenceChanged) {
          patchPayload.recurrence = buildGraphRecurrence(newRecType, newRecDay, startDate)
        }

        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${effectiveOutlookId}`,
          {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(patchPayload),
          }
        )
        if (res.ok) {
          outlookSynced = true
        } else {
          const err = await res.json().catch(() => ({}))
          outlookError = err?.error?.message || `Graph responded ${res.status}`
          console.error('coaching-schedule PUT - Outlook PATCH failed:', outlookError)
        }
      } catch (graphErr: any) {
        outlookError = graphErr.message
        console.error('coaching-schedule PUT - Outlook PATCH exception:', graphErr)
      }
    }

    const dayChanged =
      recurrence_type !== undefined && recurrence_type !== row.recurrence_type ||
      recurrence_day  !== undefined && recurrence_day  !== row.recurrence_day

    return NextResponse.json({
      success:        true,
      outlook_synced: outlookSynced,
      outlook_error:  outlookError,
      day_changed:    dayChanged && !!effectiveOutlookId,
    })
  } catch (err: any) {
    console.error('coaching-schedule PUT - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// ── DELETE /api/admin/coaching-schedule/[id] ──────────────────────────────
// Deactivates a session. Pass ?cancel=true to also cancel the Outlook event
// (always sends with sendCancellations=false to avoid agent notification flood).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_calendar')
  if (auth.error) return auth.error

  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const cancelOutlook = searchParams.get('cancel') === 'true'

    // SELECT before UPDATE
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .select('id,outlook_event_id,display_title,active')
      .eq('id', id)
      .single()

    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    const deleteRow = current as any

    // Deactivate in DB
    const { error: updateErr } = await supabaseAdmin
      .from('coaching_schedule_sessions' as any)
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (updateErr) {
      console.error('coaching-schedule DELETE - DB update error:', updateErr)
      return NextResponse.json({ error: 'Failed to deactivate session' }, { status: 500 })
    }

    // Optionally cancel the Outlook event (no cancellation emails sent)
    let outlookCancelled = false
    let outlookError: string | null = null

    if (cancelOutlook && deleteRow.outlook_event_id) {
      try {
        const token = await getGraphToken()
        const res = await fetch(
          `https://graph.microsoft.com/v1.0/groups/${GROUP_ID}/calendar/events/${deleteRow.outlook_event_id}?sendCancellations=false`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }
        )
        if (res.ok || res.status === 204) {
          outlookCancelled = true
          // Clear the outlook_event_id now that the event is gone
          await supabaseAdmin
            .from('coaching_schedule_sessions' as any)
            .update({ outlook_event_id: null })
            .eq('id', id)
        } else {
          const err = await res.json().catch(() => ({}))
          outlookError = err?.error?.message || `Graph responded ${res.status}`
          console.error('coaching-schedule DELETE - Outlook cancel failed:', outlookError)
        }
      } catch (graphErr: any) {
        outlookError = graphErr.message
        console.error('coaching-schedule DELETE - Outlook cancel exception:', graphErr)
      }
    }

    return NextResponse.json({
      success:           true,
      outlook_cancelled: outlookCancelled,
      outlook_error:     outlookError,
    })
  } catch (err: any) {
    console.error('coaching-schedule DELETE - exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
