'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import WebSignatureGenerator from '@/components/email-signature/WebSignatureGenerator'

export default function EmailSignaturePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    // Auth check — redirect to login if not authenticated
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        if (!res.ok) {
          router.push('/auth/login')
          return
        }
        setAuthChecked(true)
      } catch {
        router.push('/auth/login')
      }
    })()
  }, [router])

  if (!authChecked) {
    return (
      <div className="container-card text-center py-12">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push('/profile')}
          className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-3 inline-flex items-center gap-1"
        >
          ← Back to Profile
        </button>
        <h1 className="page-title mb-2">Email Signature</h1>
        <p className="text-sm text-luxury-gray-2 mb-6">
          Build and save your email signature. Click Copy to paste into Outlook or another email client.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm">
        <WebSignatureGenerator />
      </div>
    </div>
  )
}
