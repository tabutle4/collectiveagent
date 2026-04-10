import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Helper to extract IP from request headers
function getClientIP(request: NextRequest): string {
  // Check various headers for the real client IP
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = request.headers.get('x-real-ip')
  if (realIP) {
    return realIP
  }
  return 'unknown'
}

// POST - Log a document audit event
export async function POST(request: NextRequest) {
  try {
    const { token, documentType, eventType } = await request.json()

    if (!token || !documentType || !eventType) {
      return NextResponse.json(
        { error: 'token, documentType, and eventType are required' },
        { status: 400 }
      )
    }

    if (!['viewed', 'signed', 'completed'].includes(eventType)) {
      return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 })
    }

    // Look up user by campaign_token
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('campaign_token', token)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    // Get client info
    const ipAddress = getClientIP(request)
    const userAgent = request.headers.get('user-agent') || 'unknown'

    // Insert audit log
    const { error: insertError } = await supabaseAdmin
      .from('document_audit_log')
      .insert({
        user_id: user.id,
        document_type: documentType,
        event_type: eventType,
        ip_address: ipAddress,
        user_agent: userAgent,
      })

    if (insertError) {
      console.error('Failed to insert audit log:', insertError)
      // Don't fail the request, just log it
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Audit log error:', error)
    return NextResponse.json({ error: error.message || 'Failed to log audit event' }, { status: 500 })
  }
}

// GET - Get audit trail for a user (admin only)
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    // Note: In production, verify the requesting user has admin/broker role
    // For now, this endpoint is protected by the admin layout auth check

    // Get user info
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, first_name, last_name, email, mls_choice')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get audit logs
    const { data: auditLogs, error: auditError } = await supabaseAdmin
      .from('document_audit_log')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (auditError) {
      return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 })
    }

    const isReferralAgent = user.mls_choice === 'Referral Collective (No MLS)'

    return NextResponse.json({
      success: true,
      user: {
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        isReferralAgent,
      },
      auditLogs: auditLogs || [],
    })
  } catch (error: any) {
    console.error('Audit trail error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch audit trail' }, { status: 500 })
  }
}
