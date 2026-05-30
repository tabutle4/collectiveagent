'use client'

// Landlord-facing portal view of a PM statement.
//
// Loads the statement via /api/pm/statements/[id] which checks the
// authenticated pm_session matches the statement's landlord_id. Embeds
// the HTML statement in an iframe so the landlord sees the full
// printable view + the "Save as PDF" button right at the top.

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'

export default function LandlordStatementViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [sessionChecked, setSessionChecked] = useState(false)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    checkAccess()
  }, [id])

  const checkAccess = async () => {
    try {
      // Verify there's an active landlord session
      const sessionRes = await fetch('/api/pm/auth/session')
      if (!sessionRes.ok) {
        router.push('/pm/landlord/login')
        return
      }

      // The /api/pm/statements/[id] route does its own access check
      // (matches landlord_id via pm_session). We just need to confirm
      // here that calling it doesn't 401/403/404 before we embed the iframe.
      const stRes = await fetch(`/api/pm/statements/${id}?format=json`)
      if (stRes.status === 404) {
        setError('Statement not found')
      } else if (stRes.status === 401 || stRes.status === 403) {
        setError("You don't have access to this statement")
      } else if (!stRes.ok) {
        setError('Failed to load statement')
      } else {
        setAuthorized(true)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load statement')
    } finally {
      setSessionChecked(true)
    }
  }

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-light">
        <div className="flex items-center gap-2 text-luxury-gray-3">
          <Loader2 size={16} className="animate-spin" />
          Loading statement...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-light p-6">
        <div className="container-card max-w-md text-center">
          <p className="text-luxury-gray-1 mb-3">{error}</p>
          <Link href="/pm/landlord/dashboard" className="btn btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!authorized) return null

  return (
    <div className="min-h-screen bg-luxury-light">
      <div className="max-w-4xl mx-auto p-4">
        <Link
          href="/pm/landlord/dashboard"
          className="inline-flex items-center gap-2 text-luxury-gray-3 hover:text-luxury-gray-1 text-sm mb-4"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        {/* Statement iframe - the API route returns a complete HTML
            document with its own Save as PDF button at the top. */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <iframe
            src={`/api/pm/statements/${id}`}
            className="w-full"
            style={{ height: 'calc(100vh - 100px)', border: 'none' }}
            title="Property Management Statement"
          />
        </div>
      </div>
    </div>
  )
}
