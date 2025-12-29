'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import LuxuryHeader from '@/components/LuxuryHeader'

function SuccessContent() {
  const searchParams = useSearchParams()
  const name = searchParams.get('name') || 'there'
  const email = searchParams.get('email') || ''

  return (
    <div className="min-h-screen bg-white">
      <LuxuryHeader />
      
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <div className="text-5xl mb-6 text-luxury-black">✓</div>
          <h2 className="text-3xl font-light mb-4 tracking-luxury">
            Thank You, {name}!
          </h2>
          <p className="text-luxury-gray-2">
            We've received your information and are excited to connect with you.
          </p>
        </div>
        
        <div className="card-section mb-12">
          <h3 className="text-xl font-light mb-4 tracking-luxury uppercase text-center">
            What's Next?
          </h3>
          
          <p className="text-center text-luxury-gray-2 mb-6">
            Check your email{email && ` (sent to: ${email})`} for detailed information about our commission plans and company offerings.
          </p>
          
          <div className="space-y-4 text-luxury-gray-1">
            <p>In that email, you'll find:</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>Access to our Commission Plans & Offerings page</li>
              <li>Option to submit your request to join</li>
              <li>Option to schedule a call with our broker</li>
            </ul>
          </div>
        </div>
        
        <div className="bg-luxury-light p-8 border-l-[3px] border-luxury-black">
          <p className="text-center text-luxury-gray-2 mb-2">
            Questions in the meantime?
          </p>
          <p className="text-center">
            Reach out to us at{' '}
            <a
              href="mailto:office@collectiverealtyco.com"
              className="text-luxury-black hover:underline"
            >
              office@collectiverealtyco.com
            </a>
          </p>
        </div>
        
        <div className="text-center mt-12">
          <a
            href="https://coachingbrokerage.com"
            className="btn btn-outline"
          >
            Return to Home
          </a>
        </div>
      </div>
      
      <div className="bg-gradient-to-br from-luxury-dark-3 to-luxury-dark-2 py-12 mt-16">
        <p className="text-center text-white text-sm italic tracking-luxury">
          Welcome to Collective Realty Co. - Where Excellence Meets Opportunity
        </p>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SuccessContent />
    </Suspense>
  )
}
