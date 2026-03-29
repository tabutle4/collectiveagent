import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifySessionToken } from '@/lib/session'
import { getUserPermissions, PermissionCode } from '@/lib/permissions'

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const supabase = createClient()
    const userId = session.user.id

    // Get user's permissions from database
    const permissions = await getUserPermissions(userId)
    const canViewAll = permissions.has('can_view_all_transactions')

    // Build transactions query
    let txnQuery = supabase
      .from('transactions')
      .select(
        `
        id,
        created_at,
        updated_at,
        property_address,
        status,
        compliance_status,
        client_name,
        sales_price,
        monthly_rent,
        closing_date,
        move_in_date,
        transaction_type,
        submitted_by,
        office_location
      `
      )
      .order('closing_date', { ascending: false })

    // Filter by user if they don't have can_view_all_transactions
    if (!canViewAll) {
      txnQuery = txnQuery.eq('submitted_by', userId)
    }

    const { data: transactions, error: txnError } = await txnQuery

    if (txnError) {
      return NextResponse.json({ error: txnError.message }, { status: 400 })
    }

    // Get agents list for users who can view all
    let agents: any[] = []
    if (canViewAll) {
      const { data: agentData } = await supabase
        .from('users')
        .select('id, first_name, last_name, preferred_first_name, preferred_last_name, is_active')
        .eq('is_active', true)
        .order('preferred_first_name', { ascending: true })

      agents = agentData || []
    }

    // Convert permissions Set to object for client
    const permissionsObject: Record<string, boolean> = {}
    for (const code of permissions) {
      permissionsObject[code] = true
    }

    return NextResponse.json({
      transactions: transactions || [],
      agents,
      permissions: permissionsObject,
      canViewAll,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get('ca_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const session = await verifySessionToken(sessionToken)
    if (!session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const supabase = createClient()
    const userId = session.user.id
    const body = await request.json()

    // Check permission to create transactions
    const permissions = await getUserPermissions(userId)
    if (!permissions.has('can_create_transactions')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    // Determine submitted_by
    // Users with can_view_all_transactions can assign to another agent
    let submittedBy = userId
    if (permissions.has('can_view_all_transactions') && body.submitted_by) {
      submittedBy = body.submitted_by
    }

    const transactionData = {
      ...body,
      submitted_by: submittedBy,
      status: body.status || 'prospect',
      compliance_status: body.compliance_status || 'not_requested',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Remove fields that shouldn't be inserted directly
    delete transactionData.id

    const { data: newTransaction, error } = await supabase
      .from('transactions')
      .insert(transactionData)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ transaction: newTransaction })
  } catch (error) {
    return NextResponse.json({ error: 'Server error', details: String(error) }, { status: 500 })
  }
}
