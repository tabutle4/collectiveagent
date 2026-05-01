'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import WebSignatureGenerator from '@/components/email-signature/WebSignatureGenerator'

export default function EmailSignaturePage() {
  const router = useRouter()
  const pathname = usePathname()
  const [authChecked, setAuthChecked] = useState(false)

  // Determine where the back button should send the user — admin context vs agent context
  const backHref = pathname?.startsWith('/admin') ? '/admin/dashboard' : '/agent/profile'
  const backLabel = pathname?.startsWith('/admin') ? '← Back to Dashboard' : '← Back to Profile'

  useEffect(() => {
    // Light auth check — layouts also do this but if someone hits /email-signature directly we still guard it
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
      <div className="text-center py-12">
        <p className="text-luxury-gray-2">Loading...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-4">
        <button
          onClick={() => router.push(backHref)}
          className="text-sm text-luxury-gray-2 hover:text-luxury-black mb-3 inline-flex items-center gap-1"
        >
          {backLabel}
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
