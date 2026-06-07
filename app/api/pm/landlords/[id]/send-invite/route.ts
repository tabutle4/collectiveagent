import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/api-auth'
import { sendMailAs } from '@/lib/microsoft-graph-mail'
import { pmLandlordInviteEmail } from '@/lib/email/pm-layout'

const FROM_UPN = 'tarab@collectiverealtyco.com'
const BCC_OFFICE = 'office@collectiverealtyco.com'
const REPLY_TO = 'pm@collectiverealtyco.com'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission(request, 'can_manage_pm')
    if (auth.error) return auth.error

    const { id } = await params
    const supabase = await createClient()

    const { data: landlord, error: landlordError } = await supabase
      .from('landlords')
      .select('id, first_name, last_name, email')
      .eq('id', id)
      .single()

    if (landlordError || !landlord) {
      return NextResponse.json({ error: 'Landlord not found' }, { status: 404 })
    }

    const html = pmLandlordInviteEmail(landlord.first_name)

    await sendMailAs({
      fromUpn: FROM_UPN,
      to: landlord.email,
      bcc: BCC_OFFICE,
      replyTo: REPLY_TO,
      subject: 'Access Your Landlord Portal',
      html,
    })

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${landlord.email}`,
    })
  } catch (err: any) {
    console.error('Send landlord invite error:', err)
    return NextResponse.json({ error: err.userMessage || err.message || 'Internal server error' }, { status: 500 })
  }
}
