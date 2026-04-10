'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { CheckCircle2 } from 'lucide-react'
import LuxuryHeader from '@/components/shared/LuxuryHeader'
import AuthFooter from '@/components/shared/AuthFooter'
import CornerLines from '@/components/shared/CornerLines'

function SuccessContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name') || 'there'
  const email = searchParams.get('email') || ''
  const isReferral = searchParams.get('type') === 'referral'

  return (
    <div className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#F9F9F9' }}>
      <CornerLines thickness="thick" className="z-0" />
      <div className="relative z-10 flex flex-col flex-1">
        <div style={{ height: '3px', backgroundColor: '#C5A278' }} />
        <LuxuryHeader showTrainingCenter={false} />

        <div
          className="flex-1 flex items-center justify-center px-6"
          style={{ paddingTop: '120px', paddingBottom: '60px' }}
        >
          <div className="w-full max-w-lg">
            <div className="text-center mb-8">
              <CheckCircle2 size={48} className="text-luxury-accent mx-auto mb-4" />
              <h1 className="text-2xl font-semibold text-luxury-gray-1 mb-2">
                Thank You, {name}!
              </h1>
              <p className="text-sm text-luxury-gray-3 max-w-md mx-auto">
                {isReferral
                  ? "We have received your information. You are one step closer to keeping your license active with Referral Collective."
                  : "We have received your information and are excited to connect with you."}
              </p>
            </div>

            <div className="container-card mb-5">
              <h2 className="text-xs font-semibold text-luxury-gray-3 uppercase tracking-widest mb-4">
                What Happens Next
              </h2>
              <p className="text-sm text-luxury-gray-2 mb-4">
                Check your email{email && ` (${email})`} for your next steps.
              </p>
              <div className="space-y-3">
                {isReferral ? (
                  <>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">01</span>
                      <p className="text-sm text-luxury-gray-2">Click the link in your email to start onboarding</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">02</span>
                      <p className="text-sm text-luxury-gray-2">Pay your $299 annual membership fee</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">03</span>
                      <p className="text-sm text-luxury-gray-2">Sign your Referral Agent Agreement and complete W-9</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">01</span>
                      <p className="text-sm text-luxury-gray-2">Review our commission plans and company offerings</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">02</span>
                      <p className="text-sm text-luxury-gray-2">Start your onboarding using the personalized link in your email</p>
                    </div>
                    <div className="inner-card flex items-start gap-3">
                      <span className="text-luxury-accent font-semibold text-sm flex-shrink-0">03</span>
                      <p className="text-sm text-luxury-gray-2">Or schedule a call with our broker to talk through your goals</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="container-card text-center">
              <p className="text-sm text-luxury-gray-3 mb-1">Questions in the meantime?</p>
              <a
                href="mailto:office@collectiverealtyco.com"
                className="text-sm text-luxury-accent hover:underline"
              >
                office@collectiverealtyco.com
              </a>
            </div>
          </div>
        </div>

        <AuthFooter />
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-luxury-gray-3">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}