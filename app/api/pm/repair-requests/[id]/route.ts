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

    // Auto-create a pending deduction the FIRST time a repair gets marked
    // payment_status='deducted_from_rent' with actual_cost > 0.
    //
    // Idempotent: the deductions table has a source_repair_id FK that links
    // back here. Subsequent edits never create duplicates - if a deduction
    // already exists for this repair, we leave it alone (admin manages it
    // manually via the Pending Deductions panel).
    //
    // If the repair status is later reverted (no longer deducted_from_rent),
    // the deduction row stays in place. It is up to admin to delete it or
    // change its assignment via the deductions UI.
    if (
      repair.payment_status === 'deducted_from_rent' &&
      repair.actual_cost &&
      Number(repair.actual_cost) > 0
    ) {
      const { data: existingDeduction } = await supabase
        .from('landlord_disbursement_deductions')
        .select('id')
        .eq('source_repair_id', repair.id)
        .maybeSingle()

      if (!existingDeduction) {
        const repairTitle = repair.title || 'Repair'
        const { error: dedError } = await supabase
          .from('landlord_disbursement_deductions')
          .insert({
            landlord_id: repair.landlord_id,
            property_id: repair.property_id,
            label: `Repair: ${repairTitle}`,
            description: repair.description || null,
            amount: Number(repair.actual_cost),
            incurred_date: repair.completed_at
              ? repair.completed_at.split('T')[0]
              : null,
            source_repair_id: repair.id,
            created_by: auth.user.id,
          })

        if (dedError) {
          console.error(
            'Failed to auto-create deduction for repair',
            repair.id,
            dedError
          )
          // Do NOT roll back the repair update. The deduction can be added
          // manually via the Pending Deductions panel if this fails.
        }
      }
    }

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