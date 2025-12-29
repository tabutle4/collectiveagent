'use client'

import { Suspense } from 'react'
import ProfilePage from '@/app/profile/page'

export default function AgentProfilePage() {
  // The agent layout already provides the header and side menu; we just render the profile content.
  return (
    <Suspense
      fallback={
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="card-section text-center py-12">
            <p className="text-luxury-gray-2">Loading your profile...</p>
          </div>
        </div>
      }
    >
      <ProfilePage />
    </Suspense>
  )
}


