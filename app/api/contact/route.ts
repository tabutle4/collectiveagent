import { NextRequest, NextResponse } from 'next/server'
import { sendContactEmail } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message,
      subject, userName, userEmail, subject } = body

    if (!message || !userName || !userEmail) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    await sendContactEmail({
      message,
      subject,
      userName,
      userEmail,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Contact form error:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
