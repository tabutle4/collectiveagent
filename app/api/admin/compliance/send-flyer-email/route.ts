import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/api-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getEmailLayout } from '@/lib/email/layout'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM_EMAIL = 'Collective Realty Co. <transactions@coachingbrokeragetools.com>'

// POST /api/admin/compliance/send-flyer-email
// Body: { transaction_id }
// Sends the agent the "upload a photo to get your flyer" email on demand. This
// is the manual counterpart to generate-flyer, which stays silent. Used when the
// office decides the agent should supply the photo (e.g. after seeding a
// historical submission and creating its flyer). Nothing is sent automatically.
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, 'can_review_compliance')
  if (auth.error) return auth.error

  try {
    const body = await request.json()
    const transactionId = body?.transaction_id
    if (!transactionId) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 })
    }

    // Confirm a flyer exists for this transaction, and figure out sold vs leased.
    // A deal can now have several flyers (Just Listed, Under Contract, Just Sold),
    // so the caller says which one to send. When no flyer_id is given we fall back
    // to the newest, which keeps older callers working.
    const requestedFlyerId = typeof body.flyer_id === 'string' ? body.flyer_id : null

    let flyerQuery = supabaseAdmin
      .from('transaction_flyers')
      .select('id, flyer_type, photo_url')
      .eq('transaction_id', transactionId)

    if (requestedFlyerId) {
      flyerQuery = flyerQuery.eq('id', requestedFlyerId)
    }

    const { data: flyer } = await flyerQuery
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!flyer) {
      return NextResponse.json({ error: 'No flyer exists for this deal yet. Generate the flyer first.' }, { status: 400 })
    }

    // Two message modes:
    //   'request_photo' - ask the agent to upload a property photo (no photo yet)
    //   'flyer_ready'   - the photo is in, the flyer is ready to view/download
    // Default is inferred from photo state, but the caller may pass mode explicitly.
    const hasPhoto = !!flyer.photo_url
    const mode = body?.mode === 'request_photo' || body?.mode === 'flyer_ready'
      ? body.mode
      : (hasPhoto ? 'flyer_ready' : 'request_photo')

    // Find the deal + its primary agent's email.
    const { data: txn } = await supabaseAdmin
      .from('transactions')
      .select('id, property_address')
      .eq('id', transactionId)
      .maybeSingle()

    const { data: tia } = await supabaseAdmin
      .from('transaction_internal_agents')
      .select('agent_id, agent_role')
      .eq('transaction_id', transactionId)

    const primary = (tia || []).find((t: any) => t.agent_role === 'primary_agent' || t.agent_role === 'listing_agent') || (tia || [])[0]
    if (!primary?.agent_id) {
      return NextResponse.json({ error: 'No agent is attached to this deal.' }, { status: 400 })
    }

    const { data: agent } = await supabaseAdmin
      .from('users')
      .select('email, office_email, first_name, preferred_first_name')
      .eq('id', primary.agent_id)
      .maybeSingle()

    const agentEmail = agent?.office_email || agent?.email
    if (!agentEmail) {
      return NextResponse.json({ error: 'The agent has no email on file.' }, { status: 400 })
    }

    const agentName = agent?.preferred_first_name || agent?.first_name || 'there'
    const address = txn?.property_address || 'your recent deal'
    const isLease = flyer.flyer_type === 'just_leased'
    const soldLeased = isLease ? 'Leased' : 'Sold'
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://agent.collectiverealtyco.com'
    // Deep link to the exact flyer being sent, so the agent lands on the right
    // tab rather than whichever flyer happens to be newest.
    const flyerUrl = `${appUrl}/agent/flyer/${transactionId}?type=${flyer.flyer_type}`

    const subject = mode === 'flyer_ready'
      ? `Your Just ${soldLeased} flyer is ready - ${address}`
      : `Your Just ${soldLeased} flyer - ${address}`

    const bodyLine = mode === 'flyer_ready'
      ? `Your Just ${soldLeased} flyer for <strong style="color:#1a1a1a;">${address}</strong> is ready. Click below to view and download it.`
      : `To receive your Just ${soldLeased} flyer for <strong style="color:#1a1a1a;">${address}</strong>, please upload a property photo.`

    const buttonLabel = mode === 'flyer_ready' ? 'View &amp; Download Your Flyer' : 'Upload Photo &amp; Get Your Flyer'
    const title = mode === 'flyer_ready' ? 'Your Flyer Is Ready' : 'Get Your Flyer'

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [agentEmail],
      subject,
      html: getEmailLayout(
        `<p style="margin:0 0 16px;font-size:14px;color:#555555;">Hi ${agentName},</p>
         <p style="margin:0 0 16px;font-size:14px;color:#555555;">${bodyLine}</p>
         <p style="text-align:center;margin:24px 0 0;"><a href="${flyerUrl}" style="display:inline-block;padding:12px 28px;background-color:#C5A278;color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:600;">${buttonLabel}</a></p>`,
        { title, preheader: mode === 'flyer_ready' ? `Your flyer for ${address} is ready` : `Upload a photo to get your flyer for ${address}` }
      ),
    })

    if (error) {
      console.error('send-flyer-email failed:', error.message)
      return NextResponse.json({ error: 'Failed to send the email. Please try again.' }, { status: 500 })
    }

    // Record the send on the flyer itself. sent_date is the last time the ready
    // email went out; nudge_sent_at is the last photo chase. Without this there
    // is no way to tell which flyer was emailed, or when.
    const nowIso = new Date().toISOString()
    await supabaseAdmin
      .from('transaction_flyers')
      .update(
        mode === 'flyer_ready'
          ? { sent_date: nowIso, updated_at: nowIso }
          : { nudge_sent_at: nowIso, updated_at: nowIso }
      )
      .eq('id', flyer.id)

    return NextResponse.json({
      success: true,
      sent_to: agentEmail,
      flyer_id: flyer.id,
      flyer_type: flyer.flyer_type,
    })
  } catch (err: any) {
    console.error('send-flyer-email error:', err)
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 })
  }
}
