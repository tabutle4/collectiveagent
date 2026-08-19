'use client'

import { useEffect, useState } from 'react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { Check, AlertTriangle, ArrowRight } from 'lucide-react'

interface PublishedPlan {
  code: string
  name: string
  description: string
  applies_to: string
  agent_split: number
  firm_split: number
  has_cap: boolean
  cap_amount: number | null
  post_cap_agent_split: number | null
  post_cap_firm_split: number | null
  training_fee: number | null
  qualifying_transactions: number | null
}

const money = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function CollectiveRealtyInformationPage() {
  const [standardSettings, setStandardSettings] = useState({
    agency_name: 'Collective Realty Co.',
    onboarding_fee: 399,
    monthly_fee: 50,
    board_requirement_days: 30,
  })
  const [plans, setPlans] = useState<PublishedPlan[]>([])

  // Fetch firm fee settings
  useEffect(() => {
    fetch('/api/settings/standard')
      .then(r => r.json())
      .then(data => {
        if (data.settings) {
          setStandardSettings(prev => ({
            ...prev,
            agency_name: data.settings.agency_name ?? prev.agency_name,
            onboarding_fee: data.settings.onboarding_fee ?? prev.onboarding_fee,
            monthly_fee: data.settings.monthly_fee ?? prev.monthly_fee,
            board_requirement_days:
              data.settings.board_requirement_days ?? prev.board_requirement_days,
          }))
        }
      })
      .catch(() => {})
  }, [])

  // Fetch the published commission plans
  useEffect(() => {
    fetch('/api/settings/plans')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.plans)) setPlans(data.plans)
      })
      .catch(() => {})
  }, [])

  const newAgentPlan = plans.find(p => p.code === 'new_agent')

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: '#F9F9F9', position: 'relative', overflow: 'hidden' }}
    >
      {/* Corner lines background */}
      <CornerLines thickness="normal" />

      {/* Top accent bar */}
      <div
        style={{
          height: '3px',
          backgroundColor: '#C5A278',
          width: '100%',
          position: 'relative',
          zIndex: 10,
        }}
      />

      {/* Header */}
      <LuxuryHeader showTrainingCenter={false} />

      {/* Spacer for fixed header */}
      <div style={{ height: '80px' }} />

      {/* Main Content */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1, padding: '24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Page Header */}
          <div className="text-center mb-8">
            <h1 className="page-title mb-1">{standardSettings.agency_name}</h1>
            <p className="text-xs font-semibold text-luxury-accent uppercase tracking-widest mb-3">
              Full-Service Brokerage · Texas
            </p>
            <p className="text-sm text-luxury-gray-2 max-w-xl mx-auto">
              A full-service brokerage for agents who want to practice without the overhead.
              List, sell, lease, and represent clients with the systems, training, and support
              already built for you.
            </p>
          </div>

          {/* What's Included */}
          <div className="container-card mb-4">
            <p className="section-title">What&apos;s Included</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Transaction Management</p>
                <p className="text-xs text-luxury-gray-3">Submit deals, track compliance, and manage your checklist in one place.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Commission Statements</p>
                <p className="text-xs text-luxury-gray-3">See every split, fee, and payout on a statement you can open any time.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Training Center</p>
                <p className="text-xs text-luxury-gray-3">On-demand training covering contracts, systems, and brokerage process.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Coaching Calendar</p>
                <p className="text-xs text-luxury-gray-3">Group and one-on-one coaching sessions you can book directly.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Marketing Tools</p>
                <p className="text-xs text-luxury-gray-3">Branded listing flyers and a firm email signature generated for you.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Agent Profile Listing</p>
                <p className="text-xs text-luxury-gray-3">Featured on the public roster so clients can find and verify you.</p>
              </div>
            </div>
          </div>

          {/* Commission Plans */}
          <div className="container-card mb-4">
            <p className="section-title">Commission Plans</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {plans.map(plan => (
                <div key={plan.code} className="inner-card">
                  <p className="text-xs text-luxury-gray-3 uppercase tracking-wider text-center mb-2 mt-2">{plan.name}</p>
                  <p className="text-4xl font-bold text-luxury-gray-1 text-center">{plan.agent_split}%</p>
                  <p className="text-xs text-luxury-gray-3 text-center mb-1">to you</p>
                  <p className="text-xs text-luxury-gray-3 text-center">{plan.firm_split}% brokerage split</p>
                  {plan.has_cap && plan.cap_amount !== null && (
                    <p className="text-xs text-luxury-gray-3 text-center mt-2">
                      {money(plan.cap_amount)} cap, then {plan.post_cap_agent_split}/{plan.post_cap_firm_split}
                    </p>
                  )}
                  {plan.training_fee !== null && (
                    <p className="text-xs text-luxury-gray-3 text-center mt-2">
                      {money(plan.training_fee)} training fee per transaction
                    </p>
                  )}
                  {!plan.has_cap && plan.training_fee === null && (
                    <p className="text-xs text-luxury-gray-3 text-center mt-2">No cap</p>
                  )}
                  <p className="text-xs text-luxury-gray-3 text-center mt-2">{plan.description}</p>
                </div>
              ))}
            </div>

            {/* Fees */}
            <div className="inner-card bg-chart-gold-1 border border-chart-gold-4 p-5">
              <div className="flex flex-col md:flex-row items-center gap-4">
                <span className="text-3xl font-bold text-chart-gold-9 whitespace-nowrap">
                  ${standardSettings.monthly_fee} / month
                </span>
                <p className="text-sm text-luxury-gray-2">
                  <strong className="text-luxury-gray-1">
                    Plus a one-time ${standardSettings.onboarding_fee} onboarding fee.
                  </strong>{' '}
                  No desk fees and no franchise fees. Brokerage processing fees apply per
                  transaction based on transaction type.
                </p>
              </div>
            </div>
          </div>

          {/* Board and MLS requirement */}
          <div className="container-card mb-4 border-2 border-yellow-500">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-2">
                  Board and MLS Membership Required
                </p>
                <p className="text-sm text-luxury-gray-1">
                  Agents practicing under {standardSettings.agency_name} must join a local board
                  and MLS within {standardSettings.board_requirement_days} days of sponsorship.
                  Board dues, MLS fees, and association dues are paid by the agent directly to
                  those organizations and are separate from brokerage fees. If you want to keep
                  your license active without board and MLS costs, look at Referral Collective
                  instead.
                </p>
              </div>
            </div>
          </div>

          {/* What You Can Do / What's Required */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* What You Can Do */}
            <div className="container-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-green-600" />
                </div>
                <p className="text-sm font-semibold text-luxury-gray-1">What You Can Do</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Represent buyers, sellers, tenants, and landlords</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Take listings, show property, and write contracts</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Work commercial, residential, and apartment locating deals</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Join or build a team registered with the firm</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Refer clients out and earn on referrals you send</p>
                </div>
              </div>
            </div>

            {/* What's Required */}
            <div className="container-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-luxury-gray-5 flex items-center justify-center">
                  <Check className="w-3 h-3 text-luxury-gray-3" />
                </div>
                <p className="text-sm font-semibold text-luxury-gray-1">What&apos;s Required</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">An active Texas real estate license</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Accept the TREC sponsorship invitation</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">
                    Board and MLS membership within {standardSettings.board_requirement_days} days
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Submit every deal through brokerage compliance</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Keep the monthly agent fee current</p>
                </div>
              </div>
            </div>
          </div>

          {/* Growth Pathway */}
          <div className="container-card mb-4">
            <p className="section-title">Your Path at the Firm</p>
            <p className="text-sm text-luxury-gray-2 mb-4">
              Agents new to the firm start on the New Agent Plan and graduate into the plan that
              fits how they work.
            </p>
            <div className="flex flex-col md:flex-row items-stretch gap-0">
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Join and Onboard</p>
                <p className="text-xs text-luxury-gray-3">Agreements, sponsorship, systems access</p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">New Agent Plan</p>
                <p className="text-xs text-luxury-gray-3">
                  {newAgentPlan?.qualifying_transactions
                    ? `Training program plus your first ${newAgentPlan.qualifying_transactions} sales`
                    : 'Training program plus your first sales'}
                </p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Graduate</p>
                <p className="text-xs text-luxury-gray-3">Choose the No Cap Plan or the Cap Plan</p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Build Your Business</p>
                <p className="text-xs text-luxury-gray-3">Grow production or start a team</p>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="container-card mb-4">
            <p className="section-title text-center">Ready to Join?</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-4">
              <a
                href="/prospective-agent-form"
                className="btn btn-primary flex items-center gap-2"
              >
                Start Your Application
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Footer Brand */}
          <div className="flex items-center justify-between pt-4 border-t border-luxury-gray-5">
            <span className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider">
              {standardSettings.agency_name}
            </span>
            <span className="text-xs text-luxury-gray-3">
              TREC Licensed Brokerage · Texas
            </span>
          </div>

        </div>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <AuthFooter />
      </div>
    </div>
  )
}
