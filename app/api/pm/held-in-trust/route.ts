import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { computeHeldInTrust } from '@/lib/pm-calculations'

// GET - Compute held-in-trust balance for a landlord (and optionally a
// specific property).
//
// Query params:
//   landlord_id (required) - the landlord whose trust balance to compute
//   property_id (optional) - narrow to one property
//
// Response:
//   { depositsPaidIn, returnedToLandlord, returnedToTenant, heldInTrust }
//   All values are dollars (numbers). Pending disbursements are NOT
//   counted - only completed/paid (matches trust account reality).
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_pm')
  if (auth.error) return auth.error

  try {
    const supabase = createClient()
    const { searchParams } = new URL(request.url)
    const landlordId = searchParams.get('landlord_id')
    const propertyId = searchParams.get('property_id') || undefined

    if (!landlordId) {
      return NextResponse.json(
        { error: 'landlord_id is required' },
        { status: 400 }
      )
    }

    const result = await computeHeldInTrust(supabase, {
      landlordId,
      propertyId,
    })

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error computing held-in-trust:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
