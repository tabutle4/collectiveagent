import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { buildRecordingContext } from '@/lib/zoom/recording-context'

export async function GET(req: NextRequest) {
  const auth = await requirePermission(req, 'can_manage_recordings')
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // YYYY-MM-DD
  const recordingStartTime = searchParams.get('startTime') || undefined

  if (!date) {
    return NextResponse.json({ error: 'date is required' }, { status: 400 })
  }

  const context = await buildRecordingContext(date, recordingStartTime)

  return NextResponse.json({
    calendarEvents: context.calendarEvents,
    fathomMeetings: context.fathomMeetings.map((m: any) => ({
      shareUrl: m.share_url,
      durationMinutes: m.duration_minutes,
      speakers: m.speakers,
      transcriptExcerpt: m.transcript_text?.slice(0, 500),
    })),
    systemPrompt: context.systemPrompt,
    transcriptExcerpt: context.transcriptExcerpt,
    speakers: context.speakers,
  })
}
