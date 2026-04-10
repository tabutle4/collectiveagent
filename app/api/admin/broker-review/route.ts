import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requirePermission } from '@/lib/api-auth'
import { getICAContent } from '@/lib/documents/ica-content'
import { getReferralICAContent } from '@/lib/documents/referral-ica-content'
import { getCommissionPlanContent, getCommissionPlanKey } from '@/lib/documents/commission-plan-content'
import { getReferralSettings } from '@/lib/documents/settings-helpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, 'can_manage_prospects')
  if (auth.error) return auth.error

  try {
    const userId = request.nextUrl.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const { data: agent, error } = await supabaseAdmin
      .from('users')
      .select(
        'id, first_name, last_name, preferred_first_name, preferred_last_name, email, commission_plan, mls_choice, onboarding_fee_paid, onboarding_fee_paid_date, ica_signed_at, commission_plan_agreement_signed_at, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, onedrive_folder_url'
      )
      .eq('id', userId)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const isReferralAgent = agent.mls_choice === 'Referral Collective (No MLS)'

    const { data: session } = await supabaseAdmin
      .from('onboarding_sessions')
      .select('step_2_completed_at, step_3_completed_at, step_4_completed_at, agent_signature_url')
      .eq('user_id', userId)
      .single()

    const today = new Date()
    const effectiveDate = `${String(today.getMonth() + 1).padStart(2, '0')} / ${String(today.getDate()).padStart(2, '0')} / ${today.getFullYear()}`
    const agentName = `${agent.first_name} ${agent.last_name}`
    const mailingAddress = [
      agent.shipping_address_line1,
      agent.shipping_address_line2,
      agent.shipping_city,
      agent.shipping_state,
      agent.shipping_zip,
    ].filter(Boolean).join(', ')

    // Get correct ICA content based on agent type
    let icaContent
    if (isReferralAgent) {
      const settings = await getReferralSettings()
      icaContent = getReferralICAContent({
        agentFirstName: agent.first_name,
        agentLastName: agent.last_name,
        effectiveDate,
        mailingAddress,
        email: agent.email,
      }, settings)
    } else {
      icaContent = getICAContent({
        agentFirstName: agent.first_name,
        agentLastName: agent.last_name,
        effectiveDate,
        mailingAddress,
        email: agent.email,
      })
    }

    // Only generate commission plan for standard agents
    let commissionPlanContent = null
    if (!isReferralAgent) {
      const planKey = getCommissionPlanKey(agent.commission_plan || '')
      commissionPlanContent = getCommissionPlanContent({
        agentName,
        effectiveDate,
        plan: planKey,
      })
    }

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agentName,
        preferredName: `${agent.preferred_first_name || agent.first_name} ${agent.preferred_last_name || agent.last_name}`,
        email: agent.email,
        commissionPlan: agent.commission_plan,
        isReferralAgent,
        onboardingFeePaid: agent.onboarding_fee_paid,
        onboardingFeePaidDate: agent.onboarding_fee_paid_date,
        icaSignedAt: agent.ica_signed_at,
        commissionPlanSignedAt: agent.commission_plan_agreement_signed_at,
        onedriveUrl: agent.onedrive_folder_url,
      },
      session: {
        ...session,
        agentSignatureUrl: session?.agent_signature_url ?? null,
      },
      documents: {
        ica: icaContent,
        commission_plan: commissionPlanContent,
      },
    })
  } catch (error: any) {
    console.error('Broker review error:', error)
    return NextResponse.json({ error: error.message || 'Failed to load' }, { status: 500 })
  }
}