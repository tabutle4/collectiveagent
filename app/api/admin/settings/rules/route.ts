import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'

export const dynamic = 'force-dynamic'

// POST - Create new rule
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'can_manage_company_settings')
    if ('error' in authResult) {
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { rule } = await request.json()

    if (!rule || !rule.rule_key || !rule.rule_name) {
      return NextResponse.json({ error: 'rule_key and rule_name are required' }, { status: 400 })
    }

    // Remove id if empty (new rule)
    const { id, ...ruleData } = rule
    
    const { error } = await supabaseAdmin
      .from('commission_rules')
      .insert({
        ...ruleData,
        created_at: new Date().toISOString(),
      })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A rule with this key already exists' }, { status: 400 })
      }
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Rule POST error:', error)
    return NextResponse.json({ error: error.message || 'Failed to create rule' }, { status: 500 })
  }
}

// PUT - Update existing rule
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'can_manage_company_settings')
    if ('error' in authResult) {
      const brokerCheck = await requirePermission(request, 'can_manage_agents')
      if ('error' in brokerCheck) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const { rule } = await request.json()

    if (!rule || !rule.id) {
      return NextResponse.json({ error: 'Rule id is required' }, { status: 400 })
    }

    const { id, created_at, ...updateData } = rule

    const { error } = await supabaseAdmin
      .from('commission_rules')
      .update(updateData)
      .eq('id', id)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Rule PUT error:', error)
    return NextResponse.json({ error: error.message || 'Failed to update rule' }, { status: 500 })
  }
}
