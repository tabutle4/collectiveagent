'use client'

import { Suspense } from 'react'
import { AgentOnboardingPageContent } from '@/app/onboarding-checklist/page'

export default function AgentChecklistPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-8">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading your onboarding checklist...</p>
          </div>
        </div>
      }
    >
      <AgentOnboardingPageContent insideAgentLayout />
    </Suspense>
  )
}


