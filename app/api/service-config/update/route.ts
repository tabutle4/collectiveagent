import { NextRequest, NextResponse } from 'next/server'
import { updateServiceConfig } from '@/lib/db/service-config'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }
    
    const { data: userData } = await supabase
      .from('users')
      .select('roles')
      .eq('id', user.id)
      .single()
    
    if (!userData?.roles?.includes('admin')) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }
    
    const body = await request.json()
    const { service_type, updates } = body
    
    const success = await updateServiceConfig(service_type, updates)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to update service configuration' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Service configuration updated successfully'
    })
    
  } catch (error: any) {
    console.error('Error updating service config:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update service configuration' },
      { status: 500 }
    )
  }
}

