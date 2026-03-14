'use client'

import { Suspense } from 'react'
import PageContainer from '@/components/PageContainer'
import { AgentOnboardingPageContent } from '@/app/onboarding-checklist/page'

export default function AgentChecklistPage() {
  return (
    <Suspense
      fallback={
        <PageContainer className="max-w-5xl mx-auto px-3 sm:px-4 pb-8">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading your onboarding checklist...</p>
          </div>
        </PageContainer>
      }
    >
      <AgentOnboardingPageContent insideAgentLayout />
    </Suspense>
  )
}


