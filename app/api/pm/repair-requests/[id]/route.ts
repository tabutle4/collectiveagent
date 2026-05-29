import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { Resend } from 'resend'
import { pmAdminMessageEmail } from '@/lib/email/pm-layout'

const resend = new Resend(process.env.RESEND_API_KEY)

// GET - Single repair request
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  const supabase = createClient()
  const { id } = await params

  const { data: repair, error } = await supabase
    .from('repair_requests')
    .select(`
      *,
      managed_properties (
        id,
        property_address,
        unit,
        city,
        state,
        zip
      ),
      tenants (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      landlords (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      pm_leases (
        id,
        lease_start,
        lease_end,
        monthly_rent
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching repair request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!repair) {
    return NextResponse.json({ error: 'Repair request not found' }, { status: 404 })
  }

  return NextResponse.json({ repair })
}

// PATCH - Update repair request
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { id } = await params
    const body = await request.json()

    const allowedFields = [
      'category',
      'urgency',
      'title',
      'description',
      'photos',
      'status',
      'vendor_name',
      'vendor_phone',
      'vendor_email',
      'estimated_cost',
      'actual_cost',
      'invoice_url',
      'payment_status',
      'payment_date',
      'deducted_from_disbursement_id',
      'completed_at',
      'admin_notes'
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    // Handle numeric fields
    if (updates.estimated_cost !== undefined && updates.estimated_cost !== null) {
      updates.estimated_cost = parseFloat(updates.estimated_cost)
    }
    if (updates.actual_cost !== undefined && updates.actual_cost !== null) {
      updates.actual_cost = parseFloat(updates.actual_cost)
    }

    // Auto-set completed_at when status changes to completed
    if (updates.status === 'completed' && !updates.completed_at) {
      updates.completed_at = new Date().toISOString()
    }

    // Handle adding a message
    let newMessage = null
    if (body.add_message) {
      // Fetch current repair to get existing messages
      const { data: currentRepair } = await supabase
        .from('repair_requests')
        .select('messages, tenants(first_name, last_name, email), managed_properties(property_address)')
        .eq('id', id)
        .single()

      const existingMessages = currentRepair?.messages || []
      newMessage = {
        id: crypto.randomUUID(),
        sender_type: body.add_message.sender_type || 'admin',
        sender_name: body.add_message.sender_name || 'CRC Property Management',
        message: body.add_message.message,
        created_at: new Date().toISOString()
      }
      updates.messages = [...existingMessages, newMessage]

      // Type assertions: .single() returns objects but TS types joined tables as arrays
      const tenantData = currentRepair?.tenants as unknown as { first_name: string; last_name: string; email: string } | null
      const propertyData = currentRepair?.managed_properties as unknown as { property_address: string } | null

      // Send email notification to tenant if message is from admin
      if (newMessage.sender_type === 'admin' && tenantData?.email) {
        const propertyAddress = propertyData?.property_address || 'your property'
        
        try {
          await resend.emails.send({
            from: 'CRC Property Management <pm@coachingbrokeragetools.com>',
            to: tenantData.email,
            replyTo: `repair+${id}@coachingbrokeragetools.com`,
            subject: `Update on Your Repair Request - ${propertyAddress}`,
            html: pmAdminMessageEmail(tenantData.first_name, propertyAddress, newMessage.message)
          })
        } catch (emailErr) {
          console.error('Failed to send message notification:', emailErr)
        }
      }
    }

    updates.updated_at = new Date().toISOString()

    const { data: repair, error } = await supabase
      .from('repair_requests')
      .update(updates)
      .eq('id', id)
      .select(`
        *,
        managed_properties (
          id,
          property_address,
          unit,
          city,
          state
        ),
        tenants (
          id,
          first_name,
          last_name,
          email
        ),
        landlords (
          id,
          first_name,
          last_name
        )
      `)
      .single()

    if (error) {
      console.error('Error updating repair request:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // pm_ledger has been deprecated as part of the deposits-on-invoices
    // refactor. Repair expenses live on the repair_requests row itself
    // (actual_cost + deducted_from_disbursement_id).
    //
    // KNOWN GAP: marking a repair as 'deducted_from_rent' no longer creates
    // any row that the disbursement form surfaces - the form only shows
    // landlord_disbursement_deductions. Admin must currently create a
    // matching deduction row by hand. Followup: auto-create a pending
    // landlord_disbursement_deductions row here.

    return NextResponse.json({ repair, success: true })
  } catch (error: any) {
    console.error('Error in repair request update:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete repair request
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  const supabase = createClient()
  const { id } = await params

  const { error } = await supabase
    .from('repair_requests')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting repair request:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}