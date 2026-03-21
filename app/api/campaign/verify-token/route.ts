import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get('token')

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 })
    }

    // Find user by campaign_token
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('campaign_token', token)
      .eq('is_active', true)
      .eq('is_licensed_agent', true)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid or expired campaign link' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Token verification error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
