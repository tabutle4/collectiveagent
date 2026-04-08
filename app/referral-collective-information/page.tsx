'use client'

import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'
import { Check, X, AlertTriangle, ArrowRight } from 'lucide-react'

export default function ReferralCollectiveInformationPage() {
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
            <h1 className="page-title mb-1">The Referral Collective</h1>
            <p className="text-xs font-semibold text-luxury-accent uppercase tracking-widest mb-3">
              Referral-Only Brokerage · Texas
            </p>
            <p className="text-sm text-luxury-gray-2 max-w-xl mx-auto">
              A referral-only brokerage. You refer clients. That's it. No showings, no contracts, no exceptions. 
              Keep your license active and earn referral income with zero overhead.
            </p>
          </div>

          {/* What's Included */}
          <div className="container-card mb-4">
            <p className="section-title">What's Included</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">No MLS Fees</p>
                <p className="text-xs text-luxury-gray-3">Referral agents don't need MLS access, so you don't pay for it.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">No Association Dues</p>
                <p className="text-xs text-luxury-gray-3">LFRO structure exempts agents from NAR, HAR, and local board dues.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">No Monthly Fees</p>
                <p className="text-xs text-luxury-gray-3">Just one annual payment. No recurring monthly charges.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">No Processing Fees</p>
                <p className="text-xs text-luxury-gray-3">No transaction fees, no desk fees, no hidden charges on your referrals.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">In-House Referral Network</p>
                <p className="text-xs text-luxury-gray-3">Referrals route to Collective Realty Co. agents and you earn the fee.</p>
              </div>
              <div className="inner-card">
                <p className="text-sm font-semibold text-luxury-gray-1 mb-1">Agent Profile Listing</p>
                <p className="text-xs text-luxury-gray-3">Featured on The Referral Collective roster for credibility.</p>
              </div>
            </div>
          </div>

          {/* Commission Splits */}
          <div className="container-card mb-4">
            <p className="section-title">Commission Splits</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              {/* Apartment Referrals */}
              <div className="inner-card">
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider text-center mb-2 mt-2">Apartment Referrals</p>
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider text-center mb-1">To CRC Agents</p>
                <p className="text-4xl font-bold text-luxury-gray-1 text-center">85%</p>
                <p className="text-xs text-luxury-gray-3 text-center mb-1">to you</p>
                <p className="text-xs text-luxury-gray-3 text-center">15% brokerage split</p>
              </div>
              
              {/* Buyer/Seller/Tenant/Landlord */}
              <div className="inner-card">
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider text-center mb-2 mt-2">Buyer / Seller / Tenant / Landlord</p>
                <p className="text-4xl font-bold text-luxury-gray-1 text-center">90%</p>
                <p className="text-xs text-luxury-gray-3 text-center mb-1">to you</p>
                <p className="text-xs text-luxury-gray-3 text-center">10% brokerage split</p>
              </div>
              
              {/* External Referrals */}
              <div className="inner-card">
                <p className="text-xs text-luxury-gray-3 uppercase tracking-wider text-center mb-2 mt-2">External Referrals</p>
                <p className="text-4xl font-bold text-luxury-gray-1 text-center">88%</p>
                <p className="text-xs text-luxury-gray-3 text-center mb-1">to you</p>
                <p className="text-xs text-luxury-gray-3 text-center">12% brokerage split</p>
                <p className="text-xs text-luxury-gray-3 text-center mt-2">Out-of-state or in-state to other brokerages</p>
              </div>
            </div>

            {/* Annual Fee */}
            <div className="inner-card bg-chart-gold-1 border border-chart-gold-4 flex flex-col md:flex-row items-center gap-4 p-5">
              <span className="text-3xl font-bold text-chart-gold-9 whitespace-nowrap">$299 / year</span>
              <p className="text-sm text-luxury-gray-2">
                <strong className="text-luxury-gray-1">Annual membership fee.</strong> No monthly fees. No contracts. No lock-in. Just one simple annual payment to keep your license active and earning.
              </p>
            </div>
          </div>

          {/* CRITICAL: Referral-Only Warning */}
          <div className="container-card mb-4 border-2 border-yellow-500 bg-yellow-50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-2">
                  Referral-Only: No Exceptions
                </p>
                <p className="text-sm text-luxury-gray-1">
                  Agents under The Referral Collective may <strong className="text-yellow-800">only</strong> refer clients to other agents. 
                  You cannot show properties, write contracts, negotiate deals, represent clients, or perform any other real estate activity. 
                  Violating these restrictions results in immediate termination and potential TREC action. 
                  If you want to do more than refer, this is not the right fit. Consider Collective Realty Co. instead.
                </p>
              </div>
            </div>
          </div>

          {/* What You Can / Cannot Do */}
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
                  <p className="text-xs text-luxury-gray-2">Refer buyers, sellers, tenants, and landlords to CRC agents</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Refer apartment seekers to CRC agents</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Send out-of-state or specialty referrals to other brokerages</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Earn referral fees on closed transactions</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-2.5 h-2.5 text-green-600" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Keep your license active with minimal overhead</p>
                </div>
              </div>
            </div>

            {/* What You Cannot Do */}
            <div className="container-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-full bg-luxury-gray-5 flex items-center justify-center">
                  <X className="w-3 h-3 text-luxury-gray-3" />
                </div>
                <p className="text-sm font-semibold text-luxury-gray-1">What You Cannot Do</p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Show properties to clients</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Write or negotiate contracts</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">List, sell, lease, or manage property</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Locate apartments directly (only refer)</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-4 h-4 rounded-full bg-luxury-gray-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <X className="w-2.5 h-2.5 text-luxury-gray-3" />
                  </div>
                  <p className="text-xs text-luxury-gray-2">Represent or counsel clients directly</p>
                </div>
              </div>
            </div>
          </div>

          {/* TREC Compliance */}
          <div className="container-card mb-4 bg-green-50 border border-green-200">
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-green-700 bg-white border border-green-200 px-3 py-1 rounded-full uppercase tracking-wider whitespace-nowrap">
                TREC Compliant
              </span>
              <p className="text-xs text-luxury-gray-2">
                The Referral Collective is a Limited Function Referral Office (LFRO) under TREC. 
                <strong className="text-luxury-gray-1"> Agents may only generate referrals.</strong> Any agent who shows properties, 
                writes contracts, or represents clients in any capacity will be terminated immediately and reported to TREC. 
                All referral fees are paid through the sponsoring broker per TREC Rule §535.3.
              </p>
            </div>
          </div>

          {/* Growth Pathway */}
          <div className="container-card mb-4">
            <p className="section-title">Growth Pathway</p>
            <p className="text-sm text-luxury-gray-2 mb-4">
              When you're ready to do more than refer, The Referral Collective is your bridge to full agent status at Collective Realty Co.
            </p>
            <div className="flex flex-col md:flex-row items-stretch gap-0">
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Join as Referral Agent</p>
                <p className="text-xs text-luxury-gray-3">Active license, minimal overhead</p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Build Your Network</p>
                <p className="text-xs text-luxury-gray-3">Generate referrals, earn income</p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Add Coaching</p>
                <p className="text-xs text-luxury-gray-3">1:1 or group training available</p>
              </div>
              <div className="flex items-center justify-center px-2 py-2 md:py-0">
                <ArrowRight className="w-4 h-4 text-luxury-accent rotate-90 md:rotate-0" />
              </div>
              <div className="inner-card flex-1 text-center p-4">
                <p className="text-xs font-semibold text-luxury-gray-1 mb-1">Transition to CRC</p>
                <p className="text-xs text-luxury-gray-3">Move to full agent status</p>
              </div>
            </div>
          </div>

          {/* Footer Brand */}
          <div className="flex items-center justify-between pt-4 border-t border-luxury-gray-5">
            <span className="text-xs font-semibold text-luxury-gray-1 uppercase tracking-wider">
              The Referral Collective
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