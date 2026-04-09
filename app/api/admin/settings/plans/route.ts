import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST - Create new plan
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'can_manage_settings')
    if ('error' in authResult) {
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { plan } = await request.json()

    if (!plan || !plan.code || !plan.name) {
      return NextResponse.json({ error: 'code and name are required' }, { status: 400 })
    }

    // Remove id if empty (new plan)
    const { id, ...planData } = plan
    
    const { error } = await supabaseAdmin
      .from('commission_plans')
      .insert({
        ...planData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A plan with this code already exists' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Plan POST error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create plan' }, { status: 500 })
  }
}

// PUT - Update existing plan
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'can_manage_settings')
    if ('error' in authResult) {
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { plan } = await request.json()

    if (!plan || !plan.id) {
      return NextResponse.json({ error: 'Plan id is required' }, { status: 400 })
    }

    const { id, created_at, ...updateData } = plan

    const { error } = await supabaseAdmin
      .from('commission_plans')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Plan PUT error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update plan' }, { status: 500 })
  }
}

// DELETE - Delete plan
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'can_manage_settings')
    if ('error' in authResult) {
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const planId = request.nextUrl.searchParams.get('id')

    if (!planId) {
      return NextResponse.json({ error: 'Plan id is required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('commission_plans')
      .delete()
      .eq('id', planId)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Plan DELETE error:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete plan' }, { status: 500 })
  }
}
