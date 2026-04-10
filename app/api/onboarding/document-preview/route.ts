import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getICAContent } from '@/lib/documents/ica-content'
import { getReferralICAContent } from '@/lib/documents/referral-ica-content'
import { getCommissionPlanContent, getCommissionPlanKey } from '@/lib/documents/commission-plan-content'
import { getPolicyAcknowledgmentContent } from '@/lib/documents/policy-acknowledgment-content'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const documentType = request.nextUrl.searchParams.get('type')

    if (!token || !documentType) {
      return NextResponse.json({ error: 'token and type are required' }, { status: 400 })
    }

    const { data: prospect, error } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name, email, commission_plan, mls_choice, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip')
      .eq('campaign_token', token)
      .eq('status', 'prospect')
      .single()

    if (error || !prospect) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
    }

    const today = new Date()
    const effectiveDate = `${String(today.getMonth() + 1).padStart(2, '0')} / ${String(today.getDate()).padStart(2, '0')} / ${today.getFullYear()}`
    const agentName = `${prospect.first_name} ${prospect.last_name}`
    const mailingAddress = [
      prospect.shipping_address_line1,
      prospect.shipping_address_line2,
      prospect.shipping_city,
      prospect.shipping_state,
      prospect.shipping_zip,
    ].filter(Boolean).join(', ')

    let content: any

    const isReferralAgent = prospect.mls_choice === 'Referral Collective (No MLS)'
    
    if (documentType === 'ica') {
      content = isReferralAgent
        ? getReferralICAContent({
            agentFirstName: prospect.first_name,
            agentLastName: prospect.last_name,
            effectiveDate,
            mailingAddress,
            email: prospect.email,
          })
        : getICAContent({
        agentFirstName: prospect.first_name,
        agentLastName: prospect.last_name,
        effectiveDate,
        mailingAddress,
        email: prospect.email,
      })
    } else if (documentType === 'commission_plan') {
      const planKey = getCommissionPlanKey(prospect.commission_plan || '')
      content = getCommissionPlanContent({
        agentName,
        effectiveDate,
        plan: planKey,
      })
    } else if (documentType === 'policy_manual') {
      content = getPolicyAcknowledgmentContent({ agentName, effectiveDate })
    } else {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }

    return NextResponse.json({ success: true, content })
  } catch (error: any) {
    console.error('Document preview error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load document' }, { status: 500 })
  }
}