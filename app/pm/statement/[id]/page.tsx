'use client'

// Public statement view - no login required.
// The token in the URL is validated server-side by the API route.
// Used for emailed statement links so landlords can view without a portal session.

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'

function StatementContent({ id }: { id: string }) {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setError('Invalid link. Please contact pm@collectiverealtyco.com for assistance.')
      setChecked(true)
      return
    }
    // Quick check the token is valid before embedding iframe
    fetch(`/api/pm/statements/${id}?format=json&token=${token}`)
      .then(res => {
        if (res.ok) {
          setChecked(true)
        } else if (res.status === 401 || res.status === 403) {
          setError('Invalid or expired link. Please contact pm@collectiverealtyco.com for assistance.')
          setChecked(true)
        } else {
          setError('Statement not found.')
          setChecked(true)
        }
      })
      .catch(() => {
        setError('Failed to load statement. Please try again.')
        setChecked(true)
      })
  }, [id, token])

  if (!checked) {
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
        <div className="bg-white rounded-lg shadow p-8 max-w-md text-center">
          <p className="text-gray-700 mb-2">{error}</p>
          <p className="text-sm text-gray-500">(281) 638-9407</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-luxury-light">
      <iframe
        src={`/api/pm/statements/${id}?token=${token}`}
        className="w-full"
        style={{ height: '100vh', border: 'none' }}
        title="Property Management Statement"
      />
    </div>
  )
}

export default function PublicStatementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-luxury-light">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <StatementContent id={id} />
    </Suspense>
  )
}
