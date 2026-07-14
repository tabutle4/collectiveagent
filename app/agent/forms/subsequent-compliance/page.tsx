'use client'

// This page has been retired. Subsequent compliance now lives inside the
// Compliance & CDA form as its own mode, which has the same fields with
// richer prefill, and its submissions notify the office and group under the
// form in Form Responses. This stub exists so old bookmarks keep working.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SubsequentComplianceRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/agent/forms/compliance-cda?mode=subsequent')
  }, [router])

  return (
    <div>
      <h1 className="page-title mb-6">SUBSEQUENT COMPLIANCE</h1>
      <div className="container-card">
        <p className="text-sm text-luxury-gray-2">
          This form has moved. Taking you to the Compliance &amp; CDA form...
        </p>
      </div>
    </div>
  )
}
